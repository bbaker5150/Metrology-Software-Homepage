import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script id="application-access">([\s\S]*?)<\/script>/)[1];
const scope = { window: {}, URL, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(source, scope);
const access = scope.window.MetrologyAccess;
const page = 'https://flankspeed.sharepoint-mil.us/sites/metsoft/SitePages/Modernization-Tracker.aspx';
const response = (body, status = 200, type = 'application/json;odata=nometadata') => ({
  ok: status >= 200 && status < 300, status, redirected: false,
  headers: new Headers({ 'content-type': type }), json: async () => body,
});

test('checks METBASE permissions on its own SharePoint site and encodes its page path', () => {
  const url = new URL(access.permissionUrl('https://flankspeed.sharepoint-mil.us/sites/ISEAMETENG/SitePages/Metrology%20DB.aspx'));
  assert.ok(url.pathname.startsWith('/sites/ISEAMETENG/_api/web/'));
  assert.equal(decodeURIComponent(url.pathname), "/sites/ISEAMETENG/_api/web/GetFileByServerRelativePath(decodedurl='/sites/ISEAMETENG/SitePages/Metrology DB.aspx')/ListItemAllFields/EffectiveBasePermissions");
  assert.match(decodeURIComponent(access.permissionUrl(page.replace('Modernization-Tracker', "Engineer%27s%20Tracker"))), /Engineer''s Tracker/);
});

test('refuses external, insecure, credential-bearing and non-page app URLs', async () => {
  for (const url of ['https://example.com/SitePages/app.aspx', page.replace('https:', 'http:'), page.replace('https://', 'https://user:pass@'), page.replace('/SitePages/Modernization-Tracker.aspx', '/_layouts/15/viewlsts.aspx')]) {
    let fetched = false;
    assert.equal(await access.check(url, { fetchImpl: async () => { fetched = true; } }), 'unknown');
    assert.equal(fetched, false);
  }
});

test('understands SharePoint JSON permission envelopes and owner permissions', () => {
  for (const bits of [{ Low: '33', High: '0' }, { Low: 33, High: 0 }, { Low: '4294967295', High: '2147483647' }]) {
    for (const body of [bits, { d: bits }, { EffectiveBasePermissions: bits }, { d: { EffectiveBasePermissions: bits } }]) assert.equal(access.mayOpen(body), true);
  }
  for (const low of ['0', '1', '32', '33554432']) assert.equal(access.mayOpen({ Low: low, High: '0' }), false);
});

test('rejects missing or malformed permission data instead of treating it as access', () => {
  for (const body of [null, {}, { Low: '33' }, { Low: true, High: 0 }, { Low: -1, High: 0 }, { Low: '4294967296', High: 0 }, { Low: '3e1', High: 0 }, { Low: 33, High: null }, { Low: 33, High: 'invalid' }]) assert.throws(() => access.mayOpen(body));
});

test('uses one uncached, authenticated GET with no group, sharing or permission writes', async () => {
  const calls = [];
  assert.equal(await access.check(page, { fetchImpl: async (...args) => { calls.push(args); return response({ Low: '33', High: '0' }); } }), 'allowed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], access.permissionUrl(page));
  const options = calls[0][1];
  assert.equal(options.method, 'GET');
  assert.equal(options.credentials, 'include');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Accept, 'application/json;odata=nometadata');
  assert.equal(options.body, undefined);
});

test('denied and missing pages are hidden; authentication and server failures remain retryable', async () => {
  for (const status of [403, 404]) assert.equal(await access.check(page, { fetchImpl: async () => response({}, status) }), 'denied');
  for (const status of [401, 429, 500, 503]) assert.equal(await access.check(page, { fetchImpl: async () => response({}, status) }), 'unknown');
  assert.equal(await access.check(page, { fetchImpl: async () => response({ Low: '1', High: '0' }) }), 'denied');
  assert.equal(await access.check(page, { fetchImpl: async () => response({ Low: '33' }) }), 'unknown');
});

test('login HTML, redirects, invalid JSON and network failures never unlock cards', async () => {
  for (const fetchImpl of [
    async () => response('<html>Sign in</html>', 200, 'text/html'),
    async () => ({ ...response({ Low: '33', High: '0' }), redirected: true }),
    async () => ({ ...response({}), json: async () => { throw new Error('Bad JSON'); } }),
    async () => { throw new Error('Network unavailable'); },
  ]) assert.equal(await access.check(page, { fetchImpl }), 'unknown');
});

test('a stalled host or response body times out even if fetch ignores abort', async () => {
  for (const stallBody of [false, true]) {
    let signal;
    const result = await access.check(page, { timeoutMs: 5, fetchImpl: async (url, options) => {
      signal = options.signal;
      const stalled = new Promise(() => {});
      return stallBody ? { ...response({}), json: () => stalled } : stalled;
    } });
    assert.equal(result, 'unknown');
    assert.equal(signal.aborted, true);
  }
});

test('embedded SharePoint context wins over preview and failed detection never previews all apps', () => {
  const win = (href, parentHref, referrer = '') => ({ location: { href }, parent: { location: { href: parentHref } }, document: { referrer } });
  assert.equal(access.environment(win(page, page)), 'sharepoint');
  assert.equal(access.environment(win('about:srcdoc', page)), 'sharepoint');
  const restricted = win('about:srcdoc', '', page);
  Object.defineProperty(restricted.parent, 'location', { get() { throw new Error('Cross-origin frame'); } });
  assert.equal(access.environment(restricted), 'sharepoint');
  assert.equal(access.environment(win('about:srcdoc', 'about:blank')), 'unavailable');
  assert.equal(access.environment(win('https://other.example/home', 'https://other.example')), 'unavailable');
  assert.equal(access.environment(win('file:///tmp/index.html', 'file:///tmp/index.html')), 'preview');
  assert.equal(access.environment(win('http://localhost:4173', 'http://localhost:4173')), 'preview');
  assert.equal(access.environment(win('http://localhost:4173', page)), 'sharepoint');
});

test('no-JavaScript markup cannot bypass access filtering', () => {
  const fallback = html.match(/<noscript>([\s\S]*?)<\/noscript>/)[1];
  assert.doesNotMatch(fallback, /<a\b|SitePages\//);
  assert.match(fallback, /Enable JavaScript/);
  assert.match(html, /id="nav-count">…<\/span>/);
  assert.doesNotMatch(html, /id="result-count">4 applications/);
});
