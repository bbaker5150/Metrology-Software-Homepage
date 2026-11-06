import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script id="portal-audience">([\s\S]*?)<\/script>/)[1];
const scope = { window: {}, URL, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(source, scope);
const { readPortalAudience, directoryApps } = scope.window.MetcalAudience;
const apps = ['modernization-tracker', 'uncertalytics', 'metbase', 'metrology-confluence', 'metcal-portal'].map(id => ({ id }));
const group = { Id: 19, Title: 'METCAL Users' };
const owner = { Id: 7, Title: 'Metrology Software Owners' };
const response = body => ({ ok: true, redirected: false, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
function fixture({ groups = [], admin = false, verbose = false, fail } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (fail && url.includes(fail)) throw Error('Unavailable');
    const body = url.includes('currentuser/groups') ? (verbose ? { results: groups } : { value: groups })
      : url.includes('associatedownergroup') ? { Id: owner.Id } : { Id: 44, IsSiteAdmin: admin };
    return response(verbose ? { d: body } : body);
  } };
}

test('METCAL members see only the portal even when they belong to other app groups', async () => {
  const state = await readPortalAudience(fixture({ groups: [group, { Id: 22, Title: 'Tracker Managers' }] }));
  assert.equal(state, 'metcal');
  assert.deepEqual(Array.from(directoryApps(apps, state), app => app.id), ['metcal-portal']);
});

test('Site Owners take precedence over METCAL membership and retain all candidates', async () => {
  for (const verbose of [false, true]) {
    const state = await readPortalAudience(fixture({ groups: [group, owner], verbose }));
    assert.equal(state, 'owner');
    assert.equal(directoryApps(apps, state).length, 5);
  }
  const admin = fixture({ admin: true });
  assert.equal(await readPortalAudience(admin), 'owner');
  assert.equal(admin.calls.length, 1);
});

test('other app users keep the existing directory candidates without the portal', async () => {
  const state = await readPortalAudience(fixture({ groups: [{ Id: 50, Title: 'Tracker Users' }] }));
  assert.equal(state, 'other');
  assert.equal(directoryApps(apps, state).length, 4);
  assert.ok(directoryApps(apps, state).every(app => app.id !== 'metcal-portal'));
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

test('failed audience verification reveals no directory candidates', async () => {
  for (const fail of ['currentuser?', 'currentuser/groups', 'associatedownergroup']) {
    const state = await readPortalAudience(fixture({ groups: [group], fail }));
    assert.equal(state, 'unknown');
    assert.equal(directoryApps(apps, state).length, 0);
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
  assert.match(html, /candidates\.map\(app => MetrologyAccess\.check\(app\.url\)\)/);
});
