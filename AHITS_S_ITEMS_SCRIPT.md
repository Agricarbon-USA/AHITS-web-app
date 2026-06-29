# AHITS — S-items bundle CC Script (S2 + S5 + S6)

_Prepared 2026-06-25. Three small smoke-test findings bundled into one PR. Verified from source: `User.homeHubId` already exists and the admin Users form already has a Home Hub editor (S5 is mostly done — only the checkout default + me-payload remain); hub CRUD lives under Settings → Hub Locations while the "Hubs" nav opens an inbound-only view (S2); the operator dashboard has 3 static cards and no requests feed (S6)._

```
Build the S-items bundle (S2 + S5 + S6) on AHITS. Specs: AHITS_FEEDBACK_FINDINGS_REGISTER.md (S2/S5/S6). tsc/lint clean. No migration (all columns already exist).

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-s-items-s2-s5-s6"

=== S2 — surface hub management (Hubs nav is inbound-only; CRUD buried in Settings) ===
- src/app/(admin)/admin/hubs/page.tsx: make it a Hubs page with two tabs — "Hubs" (management) and "Inbound" (the existing awaiting-receipt view, keep as-is). The "Hubs" tab is the hub list with Add / Edit / Deactivate, reusing the existing hubs API (GET/POST /api/hubs, PATCH/DELETE /api/hubs/[id]) and the hub form currently in Settings (name, city, state, email). Default to the Hubs tab.
- src/app/(admin)/admin/settings/page.tsx: remove the "Hub Locations" section (or replace it with a one-line link "Manage hubs →" to /admin/hubs) so hub management has ONE home. Keep the other Settings sections (notifications, checklists, categories) untouched.
- AdminNav "Hubs" already points at /admin/hubs — no nav change. (Address fields are F2's job — do NOT add them here.)

=== S5 — default the checkout source hub to the operator's home hub ===
(The admin Home Hub editor already exists on the Users page, and User.homeHubId is in the schema + users API — DO NOT rebuild those.)
- src/app/api/auth/me/route.ts: include homeHubId in the response (DB lookup or extend getSession) so the client knows the operator's home hub.
- src/app/(operator)/operator/my-rig/page.tsx: in NewDeploymentDialog (and the Add-Items dialog), default sourceHubId to the operator's homeHubId when set, else the first hub (current behavior). Read homeHubId from useAuth().user. Keep all the HOTFIX-1 per-hub availability + the "no hubs" message exactly as-is.

=== S6 — operator dashboard "assigned to me / my requests" feed ===
- src/app/(operator)/operator/dashboard/page.tsx: add a card/section "My Requests" above or below the 3 action cards, listing the operator's OPEN requests — both ones they requested AND ones forwarded to them (GET /api/deployment-requests is already operator-scoped to requestedById OR fulfillerOperatorId after the Requests cluster). Show count + the few most recent (label, type, status chip), each deep-linking to /operator/requests; a "View all" link to /operator/requests. Hide the card if there are none. Keep it mount-gated / SWR like the rest (no hydration #418 regressions — render the list client-side after mount).

Verify: tsc 0, eslint 0. Manually on staging: (S2) the Hubs nav opens a Hubs tab where you can add/edit a hub, plus an Inbound tab; Settings no longer duplicates hub CRUD. (S5) set an operator's home hub in Users → that operator's Start Deployment source-hub defaults to it. (S6) an operator with open/forwarded requests sees a "My Requests" card on their dashboard linking to /operator/requests. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number. (No migration.)
```

## Notes
- **S5 is small by design** — the admin editor + schema already exist; this only adds the *default* (home hub → checkout source hub) and exposes `homeHubId` to the client. The actual home-hub assignments are data entry (your hands) once the default is wired.
- **S2 keeps F2 separate** — this consolidates hub *management* into one place; the *address fields* for shipping labels come in the F2/Shippo groundwork slice, which will extend the same hub form.
- **S6 reuses the Requests cluster** — the operator-scoped query already returns forwarded requests, so this is pure presentation, mount-gated to avoid reintroducing the hydration error.
