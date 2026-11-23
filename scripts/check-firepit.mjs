import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Contract fixture: an opaque iframe, the public Firepit API, host-captured
// navigation and persistent preferences without foreign reads. No host implementation
// is bundled here. Live tenant permissions remain a deployment check.
const html = await fs.readFile('index.html', 'utf8');
const origin = 'https://flankspeed.sharepoint-mil.us';
const host = origin + '/sites/metsoft/SitePages/Home-Page.aspx';
const browser = await chromium.launch();
const page = await browser.newPage();
const requests = [], navigation = [], errors = [];
let navigationComplete;
const navigations = new Promise(resolve => { navigationComplete = resolve; });
page.on('pageerror', error => errors.push(error.message));
await page.exposeFunction('homepageBridgeRequest', ({ url, init }) => {
  requests.push({ url, init });
  assert.equal(init.method, 'GET');
  const request = new URL(url);
  if (request.pathname.endsWith('/ListItemAllFields')) {
    assert.equal(request.search, '?$select=EffectiveBasePermissions');
    const visible = /Modernization-Tracker|Metrology%20DB|METCAL%20Quality/.test(request.pathname);
    return { EffectiveBasePermissions: { Low: visible ? '33' : '0', High: '0' } };
  }
  if (request.pathname.endsWith('/currentuser/groups')) return { value: [{ Id: 19, Title: 'METCAL Users' }] };
  if (request.pathname.endsWith('/associatedownergroup')) return { Id: 7 };
  if (request.pathname.endsWith('/currentuser')) return { Id: 44, IsSiteAdmin: false };
  throw Error('Unexpected bridge endpoint: ' + url);
});
await page.exposeFunction('homepageBridgeNavigate', request => { navigation.push(request); if (navigation.length === 3) navigationComplete(); });
await page.route(host, route => route.fulfill({ contentType: 'text/html', body: '<iframe id="home" sandbox="allow-scripts allow-modals" style="width:1400px;height:1100px"></iframe>' }));
await page.goto(host);
async function load(siteUrl, savedPreferences = [['metsoft-favorites', '["metbase"]'], ['metsoft-recent', '["metbase"]']]) {
const loaded = page.waitForEvent('framenavigated', { predicate: frame => frame.parentFrame() === page.mainFrame() });
await page.evaluate(({ content, siteUrl, savedPreferences }) => {
  const iframe = document.getElementById('home');
  if (window.__homepageMessageHandler) window.removeEventListener('message', window.__homepageMessageHandler);
  window.__homepageMessageHandler = async event => {
    if (event.source !== iframe.contentWindow || event.origin !== 'null') return;
    const message = event.data;
    if (message.type === 'request') {
      try { event.source.postMessage({ type: 'response', id: message.id, body: await window.homepageBridgeRequest(message) }, '*'); }
      catch (error) { event.source.postMessage({ type: 'response', id: message.id, error: error.message }, '*'); }
    }
    if (message.type === 'navigate') await window.homepageBridgeNavigate(message);
  };
  window.addEventListener('message', window.__homepageMessageHandler);
  const bootstrap = `
    const pending = new Map(); let sequence = 0;
    window.__storageWrites = 0;
    const preferences = new Map(${JSON.stringify(savedPreferences)});
    window.__preferences = preferences;
    Object.defineProperty(window, 'localStorage', { value: {
      getItem(key) { return preferences.get(key) || null; }, setItem(key, value) { window.__storageWrites++; preferences.set(key, value); }
    } });
    window.addEventListener('message', event => {
      if (event.source !== parent || event.data?.type !== 'response') return;
      const call = pending.get(event.data.id); if (!call) return; pending.delete(event.data.id);
      event.data.error ? call.reject(Error(event.data.error)) : call.resolve(new Response(JSON.stringify(event.data.body), {headers:{'content-type':'application/json'}}));
    });
    window.firepit = {
      sharepoint: { siteUrl: ${JSON.stringify(siteUrl)}, fetch(url, init) {
        return new Promise((resolve, reject) => { const id=++sequence; pending.set(id,{resolve,reject}); parent.postMessage({type:'request',id,url,init:{method:init.method}},'*'); });
      } },
      openSharePoint(url,target) { parent.postMessage({type:'navigate',url,target},'*'); return Promise.resolve(); }
    };
    document.addEventListener('click', event => {
      const anchor = event.target.closest?.('a[data-original-href]'); if (!anchor) return;
      event.preventDefault(); event.stopImmediatePropagation();
      window.firepit.openSharePoint(anchor.dataset.originalHref, anchor.target === '_blank' ? '_blank' : '_self');
    }, true);
    new MutationObserver(() => {
      for (const anchor of document.querySelectorAll('a[href]:not([data-original-href])')) {
        anchor.dataset.originalHref=anchor.getAttribute('href'); anchor.setAttribute('href','#');
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  `;
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; script-src-attr 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'">`;
  const source = content.replace('<head>', '<head>' + policy + '<script>' + bootstrap + '</' + 'script>');
  iframe.src = URL.createObjectURL(new Blob([source], { type: 'text/html' }));
}, { content: html, siteUrl, savedPreferences });
await loaded;
}
await load('https://flankspeed.sharepoint-mil.us.mcas-gov.us/sites/metsoft');
try {
  const home = page.frameLocator('#home');
  await home.locator('#grid[aria-busy="false"]').waitFor();
  assert.deepEqual(await home.locator('[data-open]').evaluateAll(nodes => nodes.map(node => node.dataset.open)), ['modernization-tracker', 'metcal-portal']);
  assert.equal(await home.locator('body').evaluate(() => self.origin), 'null');
  assert.ok(requests.every(request => request.url.startsWith(origin + '/sites/metsoft/_api/')));
  assert.equal(await home.locator('[data-open="metbase"]').count(), 0);
  assert.equal(await home.locator('body').evaluate(() => window.__storageWrites), 0);
  assert.equal(await home.locator('body').evaluate(() => window.__preferences.get('metsoft-favorites')), '["metbase"]');
  assert.equal(await home.locator('#access-note').isVisible(), false);
  await home.getByRole('button', { name: 'Add Modernization Tracker to favorites', exact: true }).click();
  await home.getByText('Added to favorites', { exact: true }).waitFor();
  await home.getByRole('button', { name: 'Switch to light theme' }).click();
  await home.getByRole('link', { name: 'Open Modernization Tracker in a new tab' }).click();
  await home.getByRole('button', { name: 'Recent', exact: true }).click();
  assert.deepEqual(await home.locator('[data-open]').evaluateAll(nodes => nodes.map(node => node.dataset.open)), ['modernization-tracker']);
  await home.getByRole('button', { name: /All apps/ }).click();
  await home.getByRole('link', { name: 'Open METCAL Quality & Training Portal in a new tab' }).click({ button: 'middle' });
  await home.getByRole('button', { name: 'Recent', exact: true }).click();
  assert.deepEqual(await home.locator('[data-open]').evaluateAll(nodes => nodes.map(node => node.dataset.open)), ['metcal-portal', 'modernization-tracker']);
  await home.getByRole('link', { name: 'Back to Site Pages' }).click();
  await Promise.race([navigations, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Navigation bridge timed out')), 5000); timer.unref(); })]);
  const savedPreferences = await home.locator('body').evaluate(() => Array.from(window.__preferences));
  const persisted = new Map(savedPreferences);
  assert.deepEqual(JSON.parse(persisted.get('metsoft-favorites')), ['metbase', 'modernization-tracker']);
  assert.deepEqual(JSON.parse(persisted.get('metsoft-recent')), ['metcal-portal', 'modernization-tracker', 'metbase']);
  assert.equal(persisted.get('theme'), 'light');
  assert.deepEqual(navigation.map(({url,target})=>({url,target})), [
    { url: origin + '/sites/metsoft/SitePages/Modernization-Tracker.aspx', target: '_blank' },
    { url: origin + '/sites/metsoft/SitePages/METCAL%20Quality%20&%20Training%20Portal.aspx', target: '_blank' },
    { url: origin + '/sites/metsoft/SitePages', target: '_self' },
  ]);
  await load('https://flankspeed.sharepoint-mil.us.mcas-gov.us/sites/metsoft', savedPreferences);
  await home.locator('#grid[aria-busy="false"]').waitFor();
  assert.equal(await home.locator('html').getAttribute('data-theme'), 'light');
  await home.getByRole('button', { name: 'Favorites', exact: true }).click();
  assert.deepEqual(await home.locator('[data-open]').evaluateAll(nodes => nodes.map(node => node.dataset.open)), ['modernization-tracker']);
  await home.getByRole('button', { name: 'Recent', exact: true }).click();
  assert.deepEqual(await home.locator('[data-open]').evaluateAll(nodes => nodes.map(node => node.dataset.open)), ['metcal-portal', 'modernization-tracker']);
  assert.deepEqual(await home.locator('body').evaluate(() => Array.from(window.__preferences)), savedPreferences);
  assert.equal(await home.locator('body').evaluate(() => window.__storageWrites), 0, 'Reload must preserve saved hidden IDs without rewriting preferences.');
  assert.ok(requests.every(request => request.url.startsWith(origin + '/sites/metsoft/_api/')));
  const count = requests.length;
  await load(origin + '/sites/metsoft/subweb');
  await home.getByText('Open this Home page on the Metrology Software site (metsoft). Its applications cannot be checked from another Firepit hosting web.').waitFor();
  assert.equal(await home.locator('[data-open]').count(), 0);
  assert.equal(requests.length, count, 'Wrong hosting web must send no API requests.');
  assert.deepEqual(errors, []);
  console.log('Firepit contract checks passed: opaque frame; public bridge; page permissions; no foreign requests; persisted preferences with hidden IDs retained; captured clicks; middle-click and back navigation.');
} finally { await browser.close(); }
