import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Contract fixture: an opaque iframe, the public Firepit API, host-captured
// navigation and read-only storage after foreign reads. No host implementation
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
await page.evaluate(content => {
  const iframe = document.getElementById('home');
  window.addEventListener('message', async event => {
    if (event.source !== iframe.contentWindow || event.origin !== 'null') return;
    const message = event.data;
    if (message.type === 'request') {
      try { event.source.postMessage({ type: 'response', id: message.id, body: await window.homepageBridgeRequest(message) }, '*'); }
      catch (error) { event.source.postMessage({ type: 'response', id: message.id, error: error.message }, '*'); }
    }
    if (message.type === 'navigate') await window.homepageBridgeNavigate(message);
  });
  const bootstrap = `
    const pending = new Map(); let sequence = 0;
    window.__storageWrites = 0;
    Object.defineProperty(window, 'localStorage', { value: {
      getItem() { return null; }, setItem() { window.__storageWrites++; throw new DOMException('Session read-only', 'SecurityError'); }
    } });
    window.addEventListener('message', event => {
      if (event.source !== parent || event.data?.type !== 'response') return;
      const call = pending.get(event.data.id); if (!call) return; pending.delete(event.data.id);
      event.data.error ? call.reject(Error(event.data.error)) : call.resolve(new Response(JSON.stringify(event.data.body), {headers:{'content-type':'application/json'}}));
    });
    window.firepit = {
      sharepoint: { siteUrl: 'https://flankspeed.sharepoint-mil.us.mcas-gov.us/sites/metsoft', fetch(url, init) {
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
}, html);
try {
  const home = page.frameLocator('#home');
  await home.locator('#grid[aria-busy="false"]').waitFor();
  assert.deepEqual(await home.locator('[data-open]').evaluateAll(nodes => nodes.map(node => node.dataset.open)), ['modernization-tracker', 'metbase', 'metcal-portal']);
  assert.equal(await home.locator('body').evaluate(() => self.origin), 'null');
  assert.ok(requests.some(request => request.url.includes('/sites/ISEAMETENG/_api/')));
  await home.getByText('Favorites, recent apps, and theme changes apply for this visit.').waitFor();
  await home.getByRole('button', { name: 'Add Modernization Tracker to favorites', exact: true }).click();
  await home.getByText('Added to favorites · For this visit only').waitFor();
  await home.getByRole('button', { name: 'Switch to light theme' }).click();
  await home.getByRole('link', { name: 'Open Modernization Tracker in a new tab' }).click();
  await home.getByRole('button', { name: 'Recent', exact: true }).click();
  assert.deepEqual(await home.locator('[data-open]').evaluateAll(nodes => nodes.map(node => node.dataset.open)), ['modernization-tracker']);
  await home.getByRole('button', { name: /All apps/ }).click();
  await home.getByRole('link', { name: 'Open METBASE in a new tab' }).click({ button: 'middle' });
  await home.getByRole('button', { name: 'Recent', exact: true }).click();
  assert.deepEqual(await home.locator('[data-open]').evaluateAll(nodes => nodes.map(node => node.dataset.open)), ['metbase', 'modernization-tracker']);
  await home.getByRole('link', { name: 'Back to Site Pages' }).click();
  await Promise.race([navigations, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Navigation bridge timed out')), 5000); timer.unref(); })]);
  assert.equal(await home.locator('body').evaluate(() => window.__storageWrites), 0);
  assert.deepEqual(navigation.map(({url,target})=>({url,target})), [
    { url: origin + '/sites/metsoft/SitePages/Modernization-Tracker.aspx', target: '_blank' },
    { url: origin + '/sites/ISEAMETENG/SitePages/Metrology%20DB.aspx', target: '_blank' },
    { url: origin + '/sites/metsoft/SitePages', target: '_self' },
  ]);
  assert.deepEqual(errors, []);
  console.log('Firepit contract checks passed: opaque frame; public bridge; page permissions; original foreign destination; in-memory preferences; captured clicks; middle-click and back navigation.');
} finally { await browser.close(); }
