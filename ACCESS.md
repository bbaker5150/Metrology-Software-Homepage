# Home page access rollout

The Home page now checks each application page before displaying its card. It reads the current user's effective permissions instead of treating the Tracker's Viewer label or any group name as proof of access. The new Tracker Users group works through the actual permissions assigned to it in SharePoint.

## Deploy

1. Replace the existing Home page HTML with this repository's `index.html`, using the same approved hosting flow. Publish/check in the updated file and page as required by your site. The file remains self-contained, with embedded branding and thumbnails.
2. Give **Tracker Users** Read on the Home page itself and its specific HTML/assets location. Preserve the groups that already use the Home page and SharePoint-generated Limited Access. The Home page does not need to grant Tracker Users access to the entire site, Site Pages library, or other apps.
3. Keep Tracker Users Read on the published Modernization Tracker page and its required assets/data. Keep the other application pages and data restricted to their intended groups. Existing broad grants from another group, direct sharing, or inheritance still count as access.
4. Host the page in the SharePoint origin so requests use the signed-in user's existing session. Normal SharePoint pages and same-origin embedded `srcdoc` hosting are supported. The page detects context from its URL, parent SharePoint context, or referrer. An unrelated external host must not be used as a workaround for failed access checks; cross-origin authentication may not be supported. Unknown hosting contexts show a helpful empty state instead of all links.
5. Refresh the deployed Home page and complete the account checks below. Opening the HTML directly from disk or localhost is a labeled design preview and deliberately shows all four applications; that preview does not validate SharePoint access.

## Check with real accounts

| Account / situation | Expected Home page behavior |
| --- | --- |
| Tracker-only Viewer in Tracker Users, with no other app grants | Only Modernization Tracker appears, including in Favorites, Recent, search, and counts. |
| Tracker Manager or Project Engineer without other app grants | Only Modernization Tracker appears. An elevated Tracker role does not grant suite access. |
| Existing suite user | Cards appear for each application page that account can read. |
| metsoft owner without ISEAMETENG access | Available metsoft apps appear; METBASE stays hidden. |
| No readable app pages | A clear “No applications available” state appears. |
| A permission service/network failure | Confirmed apps remain available; unverified apps stay hidden with a retry message. No fallback reveals the complete directory. |
| Access changed while the Home page is open | Select Refresh, or return to the tab, to check again. Old favorites and recents never override the result. |

Check the actual destination pages and underlying data URLs as well. If a Tracker-only account still sees another card, use SharePoint **Check Permissions** on that destination page and review direct, inherited, and other-group grants. The Home page cannot revoke those grants. A card is evidence of page access only; data/list/asset permissions remain separately enforced by SharePoint. Anyone who can read the Home page HTML can inspect its static catalog and preview images regardless of visible cards; this is not intended to conceal application names or URLs.

## Request contract

For each configured app, the Home page derives the correct site collection from the app's published ASPX URL and sends one authenticated GET to:

```
<app-web>/_api/web/GetFileByServerRelativePath(decodedurl='<page-path>')/ListItemAllFields/EffectiveBasePermissions
```

It requires valid 32-bit High/Low permission words and both ViewListItems (1) and OpenItems (32), matching the Tracker's page-access requirement. Standard and verbose JSON responses are supported. A 403/404 response omits that app. Authentication failures, login HTML, redirects, malformed JSON/permission data, server errors, and a 15-second timeout produce an unverified result. No user IDs or group lists are required. No permission, membership, sharing, schema, or data writes occur.

The automated browser suite runs the actual HTML inside a SharePoint-shaped iframe with mocked responses. It verifies the request paths, per-site results, and UI behavior but cannot establish real Flank Speed endpoint availability or permissions.
