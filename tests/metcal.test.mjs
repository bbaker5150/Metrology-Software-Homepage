import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script id="portal-audience">([\s\S]*?)<\/script>/)[1];
const scope = { window: {}, URL, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(source, scope);
vm.runInNewContext(html.match(/<script id="application-access">([\s\S]*?)<\/script>/)[1], scope);
const { readPortalAudience } = scope.window.MetcalAudience;
const { checkApp } = scope.window.MetrologyAccess;
const apps = [
  ['modernization-tracker', 'Modernization-Tracker'], ['uncertalytics', 'Uncertalytics'],
  ['metbase', 'Metrology DB'], ['metrology-confluence', 'Metrology-Confluence'],
  ['metcal-portal', 'METCAL Quality & Training Portal'],
].map(([id, page]) => ({ id, url: `https://flankspeed.sharepoint-mil.us/sites/${id === 'metbase' ? 'ISEAMETENG' : 'metsoft'}/SitePages/${encodeURIComponent(page)}.aspx` }));
const group = { Id: 19, Title: 'METCAL Users' };
const owner = { Id: 7, Title: 'Metrology Software Owners' };
const response = body => ({ ok: true, redirected: false, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
function fixture({ groups = [], admin = false, verbose = false, fail, pages = apps.map(app => app.id) } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (fail && url.includes(fail)) throw Error('Unavailable');
    if (url.endsWith('/EffectiveBasePermissions')) {
      const app = apps.find(app => decodeURIComponent(url).includes(decodeURIComponent(new URL(app.url).pathname)));
      return response({ Low: pages.includes(app?.id) ? '33' : '0', High: '0' });
    }
    const body = url.includes('currentuser/groups') ? (verbose ? { results: groups } : { value: groups })
      : url.includes('associatedownergroup') ? { Id: owner.Id } : { Id: 44, IsSiteAdmin: admin };
    return response(verbose ? { d: body } : body);
  } };
}

async function visibleApps(f) {
  const states = await Promise.all(apps.map(app => checkApp(app, f)));
  return apps.filter((app, index) => states[index] === 'allowed').map(app => app.id);
}

test('METCAL-only users see one app when only the portal page grants them Read', async () => {
  assert.deepEqual(await visibleApps(fixture({ groups: [group], pages: ['metcal-portal'] })), ['metcal-portal']);
});

test('Metrology App User members keep every readable existing app', async () => {
  const f = fixture({ groups: [{ Id: 22, Title: 'Metrology App User' }] });
  assert.deepEqual(await visibleApps(f), apps.filter(app => app.id !== 'metcal-portal').map(app => app.id));
});

test('adding METCAL membership never removes existing Metrology app access', async () => {
  assert.deepEqual(await visibleApps(fixture({ groups: [group, { Id: 22, Title: 'Metrology App User' }] })), apps.map(app => app.id));
});

test('existing app checks never request current user or group information', async () => {
  const f = fixture({ fail: 'currentuser' });
  for (const app of apps.filter(app => app.id !== 'metcal-portal')) assert.equal(await checkApp(app, f), 'allowed');
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls.every(call => call.url.endsWith('/EffectiveBasePermissions')));
});

test('a broken METCAL audience check hides only the portal, preserving verified app counts', async () => {
  for (const fail of ['currentuser?', 'currentuser/groups', 'associatedownergroup']) {
    const f = fixture({ groups: [{ Id: 22, Title: 'Metrology App User' }], fail });
    assert.deepEqual(await visibleApps(f), apps.filter(app => app.id !== 'metcal-portal').map(app => app.id));
  }
});

test('denied pages stay hidden even when a user belongs to multiple app groups', async () => {
  const f = fixture({ groups: [group, { Id: 22, Title: 'Metrology App User' }], pages: ['modernization-tracker', 'metcal-portal'] });
  assert.deepEqual(await visibleApps(f), ['modernization-tracker', 'metcal-portal']);
});

test('a missing or denied portal does not require group discovery', async () => {
  const f = fixture({ pages: [], fail: 'currentuser' });
  assert.equal(await checkApp(apps.at(-1), f), 'denied');
  assert.equal(f.calls.length, 1);
});

test('Site Owners take precedence over METCAL membership and retain all candidates', async () => {
  for (const verbose of [false, true]) {
    const state = await readPortalAudience(fixture({ groups: [group, owner], verbose }));
    assert.equal(state, 'owner');
    assert.equal((await visibleApps(fixture({ groups: [group, owner], verbose }))).length, 5);
  }
  const admin = fixture({ admin: true });
  assert.equal(await readPortalAudience(admin), 'owner');
  assert.equal(admin.calls.length, 1);
});

test('other app users keep the existing directory candidates without the portal', async () => {
  const state = await readPortalAudience(fixture({ groups: [{ Id: 50, Title: 'Tracker Users' }] }));
  assert.equal(state, 'other');
  assert.deepEqual(await visibleApps(fixture({ groups: [{ Id: 50, Title: 'Tracker Users' }], pages: ['modernization-tracker'] })), ['modernization-tracker']);
});

test('access reads are uncached GETs and never enroll users or create permissions', async () => {
  const f = fixture({ groups: [group] });
  assert.equal(await readPortalAudience(f), 'metcal');
  assert.equal(f.calls.length, 3);
  for (const { url, options } of f.calls) {
    assert.ok(url.startsWith('https://flankspeed.sharepoint-mil.us/sites/metsoft/_api/web/'));
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
  }
});

test('failed audience verification never grants portal membership', async () => {
  for (const fail of ['currentuser?', 'currentuser/groups', 'associatedownergroup']) {
    const state = await readPortalAudience(fixture({ groups: [group], fail }));
    assert.equal(state, 'unknown');
  }
  for (const fetchImpl of [
    async () => ({ ...response({}), ok: false }),
    async () => ({ ...response({}), redirected: true }),
    async () => ({ ...response({}), headers: new Headers({ 'content-type': 'text/html' }) }),
    async () => response({ Id: 44, IsSiteAdmin: 'true' }),
  ]) assert.equal(await readPortalAudience({ fetchImpl }), 'unknown');
});

test('malformed or incomplete memberships do not unlock or widen the directory', async () => {
  for (const body of [{}, { value: [{}] }, { value: [group], '@odata.nextLink': 'next' }]) {
    const f = fixture();
    assert.equal(await readPortalAudience({ fetchImpl: (url, options) => url.includes('currentuser/groups') ? response(body) : f.fetchImpl(url, options) }), 'unknown');
  }
  assert.equal(await readPortalAudience(fixture({ groups: [{ Id: 20, Title: 'METCAL Users Extra' }] })), 'other');
});

test('a stalled audience check times out and aborts', async () => {
  let signal;
  assert.equal(await readPortalAudience({ timeoutMs: 5, fetchImpl: async (url, options) => { signal = options.signal; return new Promise(() => {}); } }), 'unknown');
  assert.equal(signal.aborted, true);
});

test('refresh observes changed memberships instead of persisting authorization', async () => {
  const groups = [group];
  const f = fixture({ groups });
  assert.equal(await readPortalAudience(f), 'metcal');
  groups.splice(0);
  assert.equal(await readPortalAudience(f), 'other');
});

test('portal catalog uses the supplied SharePoint address and embeds both real screenshots', () => {
  assert.match(html, /id:'metcal-portal',name:'METCAL Quality & Training Portal'/);
  assert.ok(html.includes('/SitePages/METCAL%20Quality%20&%20Training%20Portal.aspx'));
  const thumbnails = JSON.parse(html.match(/const THUMBNAILS=(.*);/)[1]);
  for (const theme of ['dark', 'light']) assert.ok(thumbnails['metcal-portal'][theme].startsWith('data:image/jpeg;base64,/9j/'));
  assert.notEqual(thumbnails['metcal-portal'].dark, thumbnails['metcal-portal'].light);
  assert.match(html, /APPS\.map\(app => MetrologyAccess\.checkApp\(app\)\)/);
});
