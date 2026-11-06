# Home page access rollout

The Home page checks each application's page permissions independently. Existing Metrology App User access is preserved even when the user also belongs to **METCAL Users**. The extra owner/METCAL membership check applies only to the portal. A failed membership lookup hides only that card; other readable applications remain visible. See [METCAL-ACCESS.md](METCAL-ACCESS.md) for the required SharePoint setup.

## Deploy

1. Replace the existing Home page HTML with this repository's `index.html`, using the same approved hosting flow. Publish/check in the updated file and page as required by your site. The file remains self-contained, with embedded branding and thumbnails.
2. Give **Tracker Users** Read on the Home page itself and its specific HTML/assets location. Preserve the groups that already use the Home page and SharePoint-generated Limited Access. The Home page does not need to grant Tracker Users access to the entire site, Site Pages library, or other apps.
3. Keep Tracker Users Read on the published Modernization Tracker page and its required assets/data. Keep the other application pages and data restricted to their intended groups. Existing broad grants from another group, direct sharing, or inheritance still count as access.
4. Host the page in the SharePoint origin so requests use the signed-in user's existing session. Normal SharePoint pages and same-origin embedded `srcdoc` hosting are supported. The page detects context from its URL, parent SharePoint context, or referrer. An unrelated external host must not be used as a workaround for failed access checks; cross-origin authentication may not be supported. Unknown hosting contexts show a helpful empty state instead of all links.
5. Refresh the deployed Home page and complete the account checks below. Opening the HTML directly from disk or localhost is a labeled design preview and deliberately shows all five applications; that preview does not validate SharePoint access.

## Check with real accounts

| Account / situation | Expected Home page behavior |
| --- | --- |
| User with only METCAL Users' scoped page grants | Only METCAL Quality & Training Portal appears, after its page access is verified. |
| Member of both METCAL Users and Metrology App User | All readable applications, including METCAL; memberships are additive. |
| Site Owner who is also in METCAL Users | All applications that owner can read remain available. |
| Tracker-only Viewer in Tracker Users, with no other app grants | Only Modernization Tracker appears, including in Favorites, Recent, search, and counts. |
| Tracker Manager or Project Engineer without other app grants | Only Modernization Tracker appears. An elevated Tracker role does not grant suite access. |
| Existing suite user outside METCAL Users and Site Owners | Existing non-METCAL cards appear for each application page that account can read. |
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

It requires valid 32-bit High/Low permission words and both ViewListItems (1) and OpenItems (32), matching the Tracker's page-access requirement. Standard and verbose JSON responses are supported. A 403/404 response omits that app. Authentication failures, login HTML, redirects, malformed JSON/permission data, server errors, and a 15-second timeout produce an unverified result.

Only after confirming Read on the METCAL page, authenticated GETs read `currentuser?$select=Id,IsSiteAdmin`, `currentuser/groups?$select=Id,Title&$top=5000`, and `associatedownergroup?$select=Id` on metsoft. Site collection admins need only the first request. Owner group IDs are matched to memberships, not guessed from a display name. Incomplete or failed audience responses hide the portal until retry; existing app page checks do not depend on these endpoints. No permission, membership, sharing, schema, or data writes occur. The embedded audience helper is also used in the METCAL repository's `src/data/portalAccess.js`; update both copies when changing this policy.

The automated browser suite runs the actual HTML inside a SharePoint-shaped iframe with mocked responses. It verifies the request paths, per-site results, and UI behavior but cannot establish real Flank Speed endpoint availability or permissions.
