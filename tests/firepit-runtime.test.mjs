import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Optional integration check against an independently supplied Firepit review
// bundle. Host implementation is never copied into this public repository.
const root = process.env.FIREPIT_REVIEW_DIR;
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const web = 'https://flankspeed.sharepoint-mil.us/sites/metsoft';
const catalog = vm.runInNewContext(html.match(/const APPS=([^;]+);/)[1]);
const source = html.match(/<script id="application-access">([\s\S]*?)<\/script>/)[1];

async function fixture() {
  const bundle = await readFile(path.join(root, 'src/package/ClientSideAssets/bundle.js'), 'utf8');
  const scopeStart = bundle.indexOf('var FirepitSiteScope=');
  const scopeEnd = bundle.indexOf('var FirepitBridgeApiAllowlist=', scopeStart);
  const marker = '/* FIREPIT_SESSION_GUARDS_START */';
  const guardMarker = bundle.indexOf(marker);
  const guardStart = guardMarker + marker.length;
  const guardEnd = bundle.indexOf('/* FIREPIT_SESSION_GUARDS_END */', guardStart);
  assert.ok(scopeStart >= 0 && scopeEnd > scopeStart && guardMarker >= 0 && guardEnd > guardStart);
  const warnings = [], storageWrites = [], requests = [];
  const frame = { contentWindow: { postMessage() {} } };
  const siteId = '11111111-1111-4111-8111-111111111111';
  const host = {
    _sharePointBridgeToken: 'document1',
    context: {
      pageContext: { web: { absoluteUrl: web }, site: { id: siteId } },
      spHttpClient: { async fetch(url) {
        const body = url.includes('/lists?')
          ? { value: [{ RootFolder: { ServerRelativeUrl: '/sites/metsoft/SitePages' } }] }
          : { Id: siteId };
        return new Response(JSON.stringify(body));
      } },
    },
    domElement: { querySelector() { return frame; } },
    _getHostCspNonce() { return ''; },
    _handleLocalStorageMessage(event) {
      if (event.data.type === 'firepit:local-storage-mutation') storageWrites.push(event.data);
    },
    _handleSessionStorageMessage(event) {
      if (event.data.type === 'firepit:session-storage-mutation') storageWrites.push(event.data);
    },
    _handleIndexedDbMessage() {}, _handleFileSystemMessage() {}, _handleFilePickerMessage() {},
  };
  const context = vm.createContext({ URL, URLSearchParams, Response, AbortController, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, console: { warn() {} }, e: host,
    FirepitBlockHelp: { show(category, message) { warnings.push({ category, message }); } },
  });
  vm.runInContext(bundle.slice(scopeStart, scopeEnd) + bundle.slice(guardStart, guardEnd), context);
  const scope = context.FirepitSiteScope;
  function deliver(data) {
    const event = { source: frame.contentWindow, data: { bridgeToken: 'document1', ...data } };
    // Firepit registers both wrapped handlers as global message listeners.
    host._handleLocalStorageMessage(event);
    host._handleSessionStorageMessage(event);
  }
  const fetchImpl = async (url, init) => {
    requests.push(url);
    deliver({ type: 'firepit:sharepoint-request', url, init });
    await scope.ensure(host, {}, [{ url, method: init.method, init }], () => true);
    return new Response(JSON.stringify({ EffectiveBasePermissions: { Low: '33', High: '0' } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { scope, host, deliver, warnings, storageWrites, requests, fetchImpl };
}

test('supplied 9.2 guards reproduce an App storage warning for a GET after a foreign read', { skip: !root }, async () => {
  const f = await fixture();
  await f.fetchImpl('https://flankspeed.sharepoint-mil.us/sites/ISEAMETENG/_api/web/currentuser', { method: 'GET' });
  assert.equal(f.scope.readOnly(f.host), true);
  assert.equal(f.warnings.length, 0, 'The foreign read itself does not emit the warning.');
  f.deliver({ type: 'firepit:sharepoint-request', url: web + '/_api/web/currentuser', init: { method: 'GET' } });
  assert.equal(f.storageWrites.length, 0);
  assert.equal(f.warnings.length, 2);
  assert.ok(f.warnings.every(warning => warning.category === 'App storage' &&
    warning.message === 'This app session is read-only after accessing another SharePoint site. Reopen the app to write again.'));
});

test('active homepage checks keep actual Firepit session guards writable across refreshes', { skip: !root }, async () => {
  const f = await fixture();
  const window = { firepit: { sharepoint: { siteUrl: web, fetch: f.fetchImpl } },
    MetcalAudience: { async readPortalAudience() {
      await f.fetchImpl(web + '/_api/web/currentuser?$select=Id,IsSiteAdmin', { method: 'GET' });
      return 'owner';
    } },
  };
  vm.runInNewContext(source, { window, URL, AbortController, setTimeout, clearTimeout });
  const active = catalog.filter(app => !app.hidden);
  assert.equal(window.MetrologyAccess.hostingWebMatches(active), true);
  for (let refresh = 0; refresh < 2; refresh++) {
    const states = await Promise.all(active.map(app => window.MetrologyAccess.checkApp(app)));
    assert.ok(states.every(state => state === 'allowed'));
  }
  assert.equal(f.requests.length, 10);
  assert.ok(f.requests.every(url => url.startsWith(web + '/_api/')));
  assert.equal(f.scope.readOnly(f.host), false);
  f.deliver({ type: 'firepit:local-storage-mutation', operation: 'set', key: 'metsoft-favorites', value: '[]' });
  assert.equal(f.storageWrites.length, 1);
  assert.equal(f.warnings.length, 0);
});
