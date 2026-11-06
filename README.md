# Metrology Software Homepage

A self-contained, responsive application directory for the Metrology Software SharePoint site. Deploy `index.html` through the existing SharePoint hosting flow; no runtime dependencies or build step are required. Opening the file locally shows a labeled design preview with all five apps.

## Applications

- **Modernization Tracker:** Track modernization projects, tasks, milestones, and progress.
- **Uncertalytics:** Build measurement uncertainty budgets and assess calibration decision risk.
- **METBASE:** Tracks SS and ISE data.
- **Metrology Confluence:** Share team knowledge, standard operating procedures, guides, and project documentation in one searchable workspace.
- **METCAL Quality & Training Portal:** Coordinate quality audits, proficiency testing, laboratory capability, and METCAL training.

The top-left back arrow returns to the SharePoint site’s `SitePages/` endpoint, navigating the full browser page when the homepage is embedded.

Each available card is a native link that opens the app in a new tab. Favorite controls remain separate. Search, favorites, recently opened apps, and light/dark themes are included. Browser preferences are stored locally when storage is available.

## Application visibility

In SharePoint, the directory starts without app links and verifies the signed-in user's audience on metsoft. Members of the associated Site Owners group (and site collection administrators) retain the complete set of application candidates, including when they also belong to **METCAL Users**. Other members of **METCAL Users** see only the METCAL portal. Everyone else retains the existing application candidates, excluding the portal. The group name is exactly **METCAL Users**, plural.

The directory then reads the signed-in user's **EffectiveBasePermissions on each candidate app page**. Only pages with View Items and Open Items are shown. A Tracker-only user still sees only Modernization Tracker. The code does not infer authorization from saved app roles or favorites. Failed audience checks hide all links until a successful retry; group membership does not replace the page permission check.

METBASE is checked on `/sites/ISEAMETENG`; the other pages are checked on `/sites/metsoft`. Ownership of metsoft does not automatically expose METBASE. The requests are authenticated, uncached GETs; the Home page does not create groups, enroll users, change permissions, or send invitations. Follow [METCAL-ACCESS.md](METCAL-ACCESS.md) to create the group and restrict the live SharePoint resources before rollout.

Favorites, Recent, search, and counts all use the verified directory. Permission results are never saved in browser storage. **Refresh** checks again, as does returning to the tab. Denied or missing pages stay hidden. Failed authentication, invalid responses, network errors, and timeouts keep unverified cards hidden and show a retry message; they never fall back to showing every app. With JavaScript disabled, the page explains that access checks need JavaScript instead of exposing unfiltered links.

This is directory filtering, not a replacement for SharePoint security. The HTML still contains the app catalog and preview images. SharePoint must secure the actual pages, HTML/assets, lists, documents, and uniquely permissioned records. A visible card confirms page access, not the permissions of every resource used inside that app. See [ACCESS.md](ACCESS.md) for deployment and tenant checks.

## Customize

Edit the `APPS` array in `index.html` to update application names, descriptions, and HTTPS links. Access checks support published `SitePages`/`Pages` ASPX pages on the configured SharePoint tenant, including different site collections. Changing tenants also requires updating `tenantOrigin` in the access script. Theme colors are defined in the stylesheet's `:root` and `:root[data-theme="light"]` variables.

The emblem and visual palette come from [Metrology Workbench](https://github.com/bbaker5150/Metrology-Workbench). The original emblem is embedded in the HTML and included separately as `emblem-preview.webp`.

## SharePoint

See [SETUP.txt](SETUP.txt) for hosting and embedding options. This is a standalone HTML homepage, not an SPFx package. Uploading files to GitHub does not deploy or change the live SharePoint site.

## Previews

[Dark desktop](preview-desktop.png) · [Light desktop](preview-light.png) · [Mobile](preview-mobile.png)

## Validation

```bash
npm ci
npm test
npx --no-install playwright install --with-deps chromium
npm run test:browser
```

Playwright and its core dependency are locked to the same version. CI runs on pull requests and main, checks dependencies, runs permission-contract and packaged-browser tests, then uploads the deployable HTML with a checksum and UI screenshots. Automated checks cover Tracker-only access across all views, per-site owner access, loading without link flashes, retry/revocation, failed authentication/network responses, native keyboard navigation, favorites/recents, both themes, and widths from 320 to 1920 pixels. They use mocked SharePoint responses; actual tenant access and embedding still require the checks in ACCESS.md.

## App thumbnails

Real local captures of Modernization Tracker and the Uncertalytics module in Metrology Workbench use illustrative sample data. Light and dark WebP previews are embedded in `index.html`; no image hosting is required. See `THUMBNAILS.txt` for capture details.

METBASE uses the supplied dark and light JPEG screenshots, embedded directly in the HTML and included in `thumbnails/`. The wider screenshots fit inside the preview frame without cropping. Its card uses the destination from the supplied homepage: `https://flankspeed.sharepoint-mil.us/sites/ISEAMETENG/SitePages/Metrology%20DB.aspx`.

Metrology Confluence uses real light and dark captures of its refreshed knowledge home from [its repository](https://github.com/bbaker5150/Metrology-Confluence), including the shared Metrology Software emblem. The WebP images are embedded directly in the HTML. Its card links to `https://flankspeed.sharepoint-mil.us/sites/metsoft/SitePages/Metrology-Confluence.aspx` after access is verified. If that destination changes, update its APPS entry. This repository update does not deploy the app or homepage to SharePoint.

METCAL uses real light and dark JPEG captures of the portal launcher from [metcal-quality-workbench](https://github.com/bbaker5150/metcal-quality-workbench). Both are embedded in the HTML. Its card uses the address supplied in the deployment screenshot: `https://flankspeed.sharepoint-mil.us/sites/metsoft/SitePages/METCAL%20Quality%20&%20Training%20Portal.aspx`.
