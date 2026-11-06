import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const html = await fs.readFile('index.html', 'utf8');
const origin = 'https://flankspeed.sharepoint-mil.us';
const host = `${origin}/sites/metsoft/SitePages/Home-Page.aspx`;
const apps = [
  { id: 'modernization-tracker', name: 'Modernization Tracker', path: '/sites/metsoft/SitePages/Modernization-Tracker.aspx' },
  { id: 'uncertalytics', name: 'Uncertalytics', path: '/sites/metsoft/SitePages/Uncertalytics.aspx' },
  { id: 'metbase', name: 'METBASE', path: '/sites/ISEAMETENG/SitePages/Metrology%20DB.aspx' },
  { id: 'metrology-confluence', name: 'Metrology Confluence', path: '/sites/metsoft/SitePages/Metrology-Confluence.aspx' },
  { id: 'metcal-portal', name: 'METCAL Quality & Training Portal', path: '/sites/metsoft/SitePages/METCAL%20Quality%20&%20Training%20Portal.aspx' },
];
const previewFrames = '<iframe id="home" title="Metrology Software Home" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>';
const browser = await chromium.launch();
await fs.mkdir('test-artifacts', { recursive: true });

async function fixture(states, { audience = { role: 'other' }, seed = false, stall = false, viewport = { width: 1440, height: 1100 } } = {}) {
  const context = await browser.newContext({ viewport });
  const errors = [], requests = [], unexpected = [], waiting = [];
  if (seed) await context.addInitScript(ids => {
    try { for (const key of ['favorites', 'recent']) localStorage.setItem(`metsoft-${key}`, JSON.stringify(ids)); } catch {}
  }, apps.map(app => app.id));
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.href === host) return route.fulfill({ contentType: 'text/html', body: previewFrames });
    const api = url.pathname.includes('/_api/');
    if (!api) {
      const app = apps.find(app => url.href === origin + app.path);
      if (app) return route.fulfill({ contentType: 'text/html', body: `<h1>${app.name}</h1>` });
      unexpected.push(`${request.method()} ${url.href}`);
      return route.abort();
    }
    requests.push({ method: request.method(), path: decodeURIComponent(url.pathname), headers: request.headers() });
    if (url.pathname.endsWith('/currentuser') || url.pathname.endsWith('/currentuser/groups') || url.pathname.endsWith('/associatedownergroup')) {
      assert.equal(request.method(), 'GET');
      assert.ok(url.pathname.startsWith('/sites/metsoft/_api/web/'));
      if (audience.role === 'unknown') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      const groups = audience.role === 'owner' ? [{ Id: 7, Title: 'Metrology Software Owners' }, { Id: 19, Title: 'METCAL Users' }]
        : audience.role === 'mixed' ? [{ Id: 19, Title: 'METCAL Users' }, { Id: 22, Title: 'Metrology App User' }]
        : audience.role === 'metcal' ? [{ Id: 19, Title: 'METCAL Users' }] : [{ Id: 22, Title: 'Metrology App User' }];
      const body = url.pathname.endsWith('/currentuser/groups') ? { value: groups }
        : url.pathname.endsWith('/associatedownergroup') ? { Id: 7 } : { Id: 44, IsSiteAdmin: false };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (request.method() !== 'GET' || !url.pathname.endsWith('/ListItemAllFields/EffectiveBasePermissions')) unexpected.push(`${request.method()} ${url.pathname}`);
    const app = apps.find(app => decodeURIComponent(url.pathname).includes(`decodedurl='${decodeURIComponent(app.path)}'`));
    if (!app) { unexpected.push(url.href); return route.abort(); }
    const web = app.path.split('/SitePages/')[0];
    assert.ok(url.pathname.startsWith(`${web}/_api/`));
    if (stall) await new Promise(resolve => waiting.push(resolve));
    const state = states[app.id] ?? 'deny';
    if (state === 'network') return route.abort();
    if (state === 'login') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Sign in</html>' });
    const status = state === 'deny' ? 403 : state === 'missing' ? 404 : state === 'error' ? 503 : 200;
    const body = state === 'owner' ? { d: { EffectiveBasePermissions: { Low: '4294967295', High: '2147483647' } } }
      : state === 'allow' ? { Low: '33', High: '0' } : state === 'malformed' ? { Low: '33' } : { error: { message: 'Unavailable' } };
    return route.fulfill({ status, contentType: 'application/json;odata=nometadata', body: JSON.stringify(body) });
  });
  await page.goto(host);
  await page.locator('#home').evaluate((frame, content) => { frame.srcdoc = content; }, html);
  const home = page.frameLocator('#home');
  return {
    page, home, context, requests,
    async ready() { await home.locator('#grid[aria-busy="false"]').waitFor(); },
    async release() { stall = false; for (const resolve of waiting) resolve(); },
    async finish() {
      try { assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert.ok(requests.every(request => request.method === 'GET')); }
      finally { await context.close(); }
    },
  };
}

async function screenshot(f, name) {
  await f.home.locator('body').evaluate(async body => {
    await Promise.all(Array.from(body.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
    await Promise.all(body.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
  });
  await f.page.screenshot({ path: `test-artifacts/${name}.png`, fullPage: true });
}

try {
  // Production srcdoc must never flash the complete directory before checks finish.
  let f = await fixture({ 'modernization-tracker': 'allow' }, { seed: true, stall: true });
  await f.home.getByRole('heading', { name: 'Loading your applications' }).waitFor();
  await f.page.waitForFunction(() => document.querySelector('#home').contentDocument.querySelector('#grid').getAttribute('aria-busy') === 'true');
  assert.equal(await f.home.locator('[data-open]').count(), 0);
  assert.equal(await f.home.locator('#nav-count').textContent(), '…');
  // All app-page requests are issued independently before responses are released.
  await f.page.waitForTimeout(100);
  await f.release();
  await f.ready();
  assert.equal(f.requests.filter(request => request.path.endsWith('/EffectiveBasePermissions')).length, apps.length);
  assert.deepEqual(await f.home.locator('[data-open]').evaluateAll(links => links.map(link => link.dataset.open)), ['modernization-tracker']);
  assert.equal(await f.home.locator('#nav-count').textContent(), '1');
  await screenshot(f, 'tracker-only-desktop');
  for (const name of ['Favorites', 'Recent']) {
    await f.home.getByRole('button', { name, exact: true }).click();
    assert.deepEqual(await f.home.locator('[data-open]').evaluateAll(links => links.map(link => link.dataset.open)), ['modernization-tracker']);
  }
  await f.home.getByRole('button', { name: /All apps/ }).click();
  await f.home.getByRole('searchbox', { name: 'Search applications' }).fill('Uncertalytics');
  await f.home.getByRole('heading', { name: 'No matching applications' }).waitFor();
  assert.equal(await f.home.locator('[data-open]').count(), 0);
  await f.home.getByRole('button', { name: 'View all applications' }).click();
  await f.page.setViewportSize({ width: 390, height: 844 });
  await f.home.getByRole('button', { name: 'Switch to light theme' }).click();
  assert.equal(await f.home.locator('body').evaluate(body => body.scrollWidth <= innerWidth), true);
  await screenshot(f, 'tracker-only-mobile-light');
  await f.finish();

  // Owners are evaluated per app page too: metsoft ownership does not imply METBASE access.
  f = await fixture({ 'modernization-tracker': 'owner', uncertalytics: 'owner', 'metrology-confluence': 'owner', 'metcal-portal': 'owner', metbase: 'deny' }, { audience: { role: 'owner' } });
  await f.ready();
  assert.equal(await f.home.locator('[data-open]').count(), apps.length - 1);
  assert.equal(await f.home.getByRole('link', { name: 'Open METBASE in a new tab' }).count(), 0);
  await f.finish();

  // Existing suite access keeps the native links, preferences, keyboard and responsive layout.
  f = await fixture(Object.fromEntries(apps.map(app => [app.id, 'allow'])), { audience: { role: 'owner' } });
  await f.ready();
  assert.equal(await f.home.locator('[data-open]').count(), apps.length);
  assert.equal(await f.home.locator('#nav-count').textContent(), String(apps.length));
  await screenshot(f, 'suite-desktop-dark');
  for (const app of apps) {
    const link = f.home.getByRole('link', { name: `Open ${app.name} in a new tab` });
    assert.equal(await link.getAttribute('href'), origin + app.path);
    assert.equal(await link.getAttribute('target'), '_blank');
    await link.focus();
    const popupWait = f.page.waitForEvent('popup');
    await f.page.keyboard.press('Enter');
    const popup = await popupWait;
    await popup.waitForLoadState('domcontentloaded');
    assert.equal(popup.url(), origin + app.path);
    await popup.close();
    await f.ready();
  }
  const pageCount = f.context.pages().length;
  await f.home.getByRole('button', { name: 'Add Modernization Tracker to favorites', exact: true }).click();
  assert.equal(f.context.pages().length, pageCount);
  await f.home.getByRole('button', { name: 'Favorites', exact: true }).click();
  assert.deepEqual(await f.home.locator('[data-open]').evaluateAll(links => links.map(link => link.dataset.open)), ['modernization-tracker']);
  await f.home.getByRole('button', { name: 'Recent', exact: true }).click();
  assert.deepEqual(await f.home.locator('[data-open]').evaluateAll(links => links.map(link => link.dataset.open)), apps.map(app => app.id).reverse());
  await f.home.getByRole('button', { name: /All apps/ }).click();
  await f.page.keyboard.press('Control+k');
  assert.equal(await f.home.getByRole('searchbox').evaluate(input => input === document.activeElement), true);
  await f.home.getByRole('searchbox').fill('uncertainty');
  assert.equal(await f.home.locator('[data-open]').count(), 1);
  await f.page.keyboard.press('Escape');
  assert.equal(await f.home.locator('[data-open]').count(), apps.length);
  for (const width of [320, 390, 800, 1440, 1920]) {
    await f.page.setViewportSize({ width, height: 1000 });
    assert.equal(await f.home.locator('body').evaluate(body => body.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
  }
  await f.page.setViewportSize({ width: 1440, height: 1100 });
  await f.home.getByRole('button', { name: 'Switch to light theme' }).click();
  await screenshot(f, 'suite-desktop-light');
  await f.finish();

  // An unknown result remains hidden, and refreshing rereads live access in both directions.
  const states = { 'modernization-tracker': 'allow', uncertalytics: 'error', metbase: 'missing', 'metrology-confluence': 'deny' };
  f = await fixture(states, { seed: true });
  await f.ready();
  assert.equal(await f.home.locator('[data-open]').count(), 1);
  await f.home.getByText('Some applications couldn’t be checked. Select Refresh to try again.').waitFor();
  await screenshot(f, 'partial-access-check');
  states['modernization-tracker'] = 'deny'; states.uncertalytics = 'allow';
  await f.home.getByRole('button', { name: 'Refresh application access' }).click();
  await f.ready();
  assert.equal(f.requests.filter(request => request.path.endsWith('/EffectiveBasePermissions')).length, 2 * apps.length);
  assert.deepEqual(await f.home.locator('[data-open]').evaluateAll(links => links.map(link => link.dataset.open)), ['uncertalytics']);
  assert.equal(await f.home.locator('#access-note').isHidden(), true);
  await f.home.getByRole('button', { name: 'Favorites', exact: true }).click();
  assert.deepEqual(await f.home.locator('[data-open]').evaluateAll(links => links.map(link => link.dataset.open)), ['uncertalytics']);
  await f.finish();

  for (const state of ['deny', 'missing', 'login', 'malformed', 'network']) {
    f = await fixture(Object.fromEntries(apps.map(app => [app.id, state])), { seed: true });
    await f.ready();
    assert.equal(await f.home.locator('[data-open]').count(), 0);
    assert.equal(await f.home.locator('#nav-count').textContent(), '0');
    await f.home.getByRole('heading', { name: ['deny', 'missing'].includes(state) ? 'No applications available' : 'We couldn’t load your applications' }).waitFor();
    if (state === 'deny') await screenshot(f, 'no-app-access');
    if (state === 'network') await screenshot(f, 'access-check-unavailable');
    await f.finish();
  }

  // A METCAL-only user has scoped Read on the portal, with no other app grants.
  const audience = { role: 'metcal' };
  f = await fixture({ 'metcal-portal': 'allow' }, { seed: true, audience });
  await f.ready();
  assert.equal(await f.home.locator('#nav-count').textContent(), '1');
  assert.equal(await f.home.locator('#result-count').textContent(), '1 application');
  for (const view of [/All apps/, 'Favorites', 'Recent']) {
    await f.home.getByRole('button', { name: view, exact: typeof view === 'string' }).click();
    assert.deepEqual(await f.home.locator('[data-open]').evaluateAll(links => links.map(link => link.dataset.open)), ['metcal-portal']);
    assert.equal(await f.home.locator('#nav-count').textContent(), '1');
    assert.equal(await f.home.locator('#result-count').textContent(), '1 application');
  }
  assert.equal(f.requests.filter(request => request.path.endsWith('/EffectiveBasePermissions')).length, apps.length);
  await screenshot(f, 'metcal-only');
  audience.role = 'unknown';
  await f.home.getByRole('button', { name: 'Refresh application access' }).click();
  await f.ready();
  assert.equal(await f.home.locator('[data-open]').count(), 0);
  assert.equal(await f.home.locator('#nav-count').textContent(), '0');
  await f.finish();

  // Portal group failures do not remove the existing Metrology applications.
  f = await fixture(Object.fromEntries(apps.map(app => [app.id, 'allow'])), { seed: true, audience: { role: 'unknown' } });
  await f.ready();
  for (const view of [/All apps/, 'Favorites', 'Recent']) {
    await f.home.getByRole('button', { name: view, exact: typeof view === 'string' }).click();
    assert.deepEqual(await f.home.locator('[data-open]').evaluateAll(links => links.map(link => link.dataset.open)), apps.filter(app => app.id !== 'metcal-portal').map(app => app.id));
    assert.equal(await f.home.locator('#nav-count').textContent(), '4');
    assert.equal(await f.home.locator('#result-count').textContent(), '4 applications');
  }
  await f.finish();

  // Metrology App User plus METCAL Users is additive, including all counts.
  f = await fixture(Object.fromEntries(apps.map(app => [app.id, 'allow'])), { seed: true, audience: { role: 'mixed' } });
  await f.ready();
  assert.equal(await f.home.locator('[data-open]').count(), apps.length);
  assert.equal(await f.home.locator('#nav-count').textContent(), String(apps.length));
  assert.equal(await f.home.locator('#result-count').textContent(), '5 applications');
  await f.finish();

  // Opening the file locally remains a clearly labeled design preview with no API calls.
  const local = await browser.newPage();
  const localRequests = [];
  local.on('request', request => { if (/^https?:/.test(request.url())) localRequests.push(request.url()); });
  await local.goto(pathToFileURL(`${process.cwd()}/index.html`).href);
  await local.getByText('Local preview · Application access is checked when hosted in SharePoint.').waitFor();
  assert.equal(await local.locator('[data-open]').count(), apps.length);
  assert.deepEqual(localRequests, []);
  await local.close();
  const noJs = await browser.newPage({ javaScriptEnabled: false });
  await noJs.goto(pathToFileURL(`${process.cwd()}/index.html`).href);
  await noJs.getByRole('heading', { name: 'JavaScript is needed to load your applications' }).waitFor();
  assert.equal(await noJs.locator('a[target="_blank"]').count(), 0);
  await noJs.close();
  console.log('Homepage browser checks passed: no link flash; Tracker-only filtering across all views; per-site owner access; live refresh/revocation; partial errors, denial and failed authentication; native navigation; favorites/recent; keyboard; 320–1920px layouts; both themes; local preview and safe no-JavaScript behavior.');
} finally { await browser.close(); }
