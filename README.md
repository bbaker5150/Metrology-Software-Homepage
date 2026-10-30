# Metrology Software Homepage

A self-contained, responsive application directory for the Metrology Software SharePoint site. Open `index.html` locally to preview it. No dependencies or build step are required.

## Applications

- **Modernization Tracker:** Track modernization projects, tasks, milestones, and progress.
- **Uncertalytics:** Build measurement uncertainty budgets and assess calibration decision risk.
- **METBASE:** Tracks SS and ISE data.
- **Metrology Confluence:** Share team knowledge, standard operating procedures, guides, and project documentation in one searchable workspace.

The top-left back arrow returns to the SharePoint site’s `SitePages/` endpoint, navigating the full browser page when the homepage is embedded.

Each card is a native link that opens the app in a new tab. Favorite controls remain separate. Search, favorites, recently opened apps, and light/dark themes are included. Browser preferences are stored locally when storage is available.

## Customize

Edit the `APPS` array in `index.html` to update application names, descriptions, and HTTPS links. Theme colors are defined in the stylesheet's `:root` and `:root[data-theme="light"]` variables.

The emblem and visual palette come from [Metrology Workbench](https://github.com/bbaker5150/Metrology-Workbench). The original emblem is embedded in the HTML and included separately as `emblem-preview.webp`.

## SharePoint

See [SETUP.txt](SETUP.txt) for hosting and embedding options. This is a standalone HTML homepage, not an SPFx package. Uploading files to GitHub does not deploy or change the live SharePoint site.

## Previews

[Dark desktop](preview-desktop.png) · [Light desktop](preview-light.png) · [Mobile](preview-mobile.png)

## Validation

Checked in Chromium: all four configured URLs, whole-card pointer and keyboard navigation, full-card keyboard focus, independent favorites, recent-app ordering, keyword search, both themes, and widths from 320 to 1920 pixels. Navigation tests use local mock responses; target SharePoint availability and authentication have not been verified.

## App thumbnails

Real local captures of Modernization Tracker and the Uncertalytics module in Metrology Workbench use illustrative sample data. Light and dark WebP previews are embedded in `index.html`; no image hosting is required. See `THUMBNAILS.txt` for capture details.

METBASE uses the supplied dark and light JPEG screenshots, embedded directly in the HTML and included in `thumbnails/`. The wider screenshots fit inside the preview frame without cropping. Its card and no-JavaScript fallback both use the destination from the supplied homepage: `https://flankspeed.sharepoint-mil.us/sites/ISEAMETENG/SitePages/Metrology%20DB.aspx`.

Metrology Confluence uses real light and dark captures of its refreshed knowledge home from [its repository](https://github.com/bbaker5150/Metrology-Confluence), including the shared Metrology Software emblem. The WebP images are embedded directly in the HTML. Its card and no-JavaScript fallback link to the current suite page `https://flankspeed.sharepoint-mil.us/sites/metsoft/SitePages/Metrology-Confluence.aspx`. If that destination changes, update both links. This repository update does not deploy the app or homepage to SharePoint.
