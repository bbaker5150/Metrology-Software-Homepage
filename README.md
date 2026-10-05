# Metrology Software Homepage

A self-contained, responsive application directory for the Metrology Software SharePoint site. Open `index.html` locally to preview it. No dependencies or build step are required.

## Applications

- **Modernization Tracker:** Track modernization projects, tasks, milestones, and progress.
- **Uncertalytics:** Build measurement uncertainty budgets and assess calibration decision risk.

Each card is a native link that opens the app in a new tab. Favorite controls remain separate. Search, favorites, recently opened apps, and light/dark themes are included. Browser preferences are stored locally when storage is available.

## Customize

Edit the `APPS` array in `index.html` to update application names, descriptions, and HTTPS links. Theme colors are defined in the stylesheet's `:root` and `:root[data-theme="light"]` variables.

The emblem and visual palette come from [Metrology Workbench](https://github.com/bbaker5150/Metrology-Workbench). The original emblem is embedded in the HTML and included separately as `emblem-preview.webp`.

## SharePoint

See [SETUP.txt](SETUP.txt) for hosting and embedding options. This is a standalone HTML homepage, not an SPFx package. Uploading files to GitHub does not deploy or change the live SharePoint site.

## Previews

[Dark desktop](preview-desktop.png) · [Light desktop](preview-light.png) · [Mobile](preview-mobile.png)

## Validation

Checked in Chromium: both configured URLs, whole-card pointer and keyboard navigation, full-card keyboard focus, independent favorites, recent-app ordering, keyword search, both themes, and widths from 320 to 1920 pixels. Navigation tests use local mock responses; target SharePoint availability and authentication have not been verified.
