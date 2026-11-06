# METCAL portal access rollout

The portal's audience is **Site Owners and METCAL Users**. The shared homepage keeps its existing audience. Memberships are additive: a user with only METCAL Users' scoped grants sees the portal only; a user who also belongs to Metrology App User retains all other readable apps. Owners keep their existing access. These source changes do not create the live group or change SharePoint permissions.

Portal page confirmed from the user's screenshot:

`https://flankspeed.sharepoint-mil.us/sites/metsoft/SitePages/METCAL%20Quality%20&%20Training%20Portal.aspx`

## Apply as a Site Owner

1. In metsoft **Site permissions → Advanced permissions settings → Create Group**, create **METCAL Users** (plural). Set the group owner to the site's existing Owners group. Let only the group owner edit membership and turn off requests to join/leave. Do not give this group blanket Read access to the metsoft site. Add the intended people through this group after checking membership.
2. Grant METCAL Users **Read** on the shared Home page and its specific HTML file/folder. Preserve the homepage's other audiences. Keep SharePoint-generated Limited Access on ancestors; it permits navigation without granting access to unrelated apps.
3. In **Site Pages**, select **METCAL Quality & Training Portal.aspx → Manage access → Advanced**. Stop inheriting permissions for this page. Keep the site's Owners group at **Full Control** and grant METCAL Users **Read**. Remove other content-reading grants, including direct sharing and broad sharing links. Publish/check in the page so Readers can open it.
4. Inspect the page's embedding configuration to identify the actual `metcal-quality.html` location. The supplied screenshot identifies the ASPX page, not the HTML library/folder. Apply the same restricted audience to that HTML and any portal-owned asset/document folders. Do not restrict an entire shared library used by other apps. Audit uniquely permissioned child files and folders; restricting the parent alone does not remove their separate grants.
5. Apply the same audience to all of the portal's backing lists from `src/data/listSchema.js` in metcal-quality-workbench, using the configured `listPrefix` (default `METCAL`). Keep Owners Full Control and METCAL Users Read for viewing. Audit uniquely permissioned list items, attachments, and portal-owned training/quality documents. Do not grant broader editing rights as part of this viewing-only change. External shared resources retain their own access policies.
6. Deploy the updated homepage `index.html` and updated portal HTML through the established SharePoint hosting flow. The homepage remains a single file with both screenshots embedded. The portal's UI gate verifies membership before mounting its data provider; `useMockData` does not bypass that check in SharePoint.

SharePoint page/file/list permissions enforce the restriction on direct URLs and API requests. The JavaScript checks control the interface only. Site collection administrators retain SharePoint's built-in administrative access. The public source and demo screenshots contain no live portal records and are not made private by these changes.

## Account checks

| Account | Homepage | Direct portal/data access |
| --- | --- | --- |
| Site Owner, including an owner also in METCAL Users | All existing readable apps, including METCAL | Allowed |
| User with only METCAL Users' scoped grants | Portal only, including Favorites, Recent, and search; app total 1 | Allowed for resources granted Read |
| Member of METCAL Users and Metrology App User | Portal plus all existing readable apps; total counts only those apps | Allowed for resources granted Read |
| Tracker-only user | Tracker only | Denied |
| Existing suite user outside the two portal groups | Existing readable apps; no METCAL card | Denied |
| Removed METCAL member | Portal disappears on refresh/return | Denied unless still an Owner |

Use SharePoint **Check Permissions** on the page, HTML, and data with these accounts. Check direct URLs as well as the cards. METCAL Users should receive scoped Read only on the homepage and portal resources, not blanket site-wide Read. A person with additional direct, inherited, or other-group grants keeps that access; the homepage does not revoke it. Failed METCAL membership checks leave verified existing apps visible and hide the portal with a retry message.

Implementation reference: [Microsoft: customize permissions for a list or library](https://support.microsoft.com/en-us/sharepoint/lists/sharepoint-sharing-and-permissions/customize-permissions-for-a-sharepoint-list-or-library).
