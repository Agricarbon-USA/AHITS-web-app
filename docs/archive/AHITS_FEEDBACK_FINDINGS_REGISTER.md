# AHITS — Field Feedback: Root-Cause Findings Register

_Prepared 2026-06-25. Each item from Max's day-of-use feedback, root-caused against source by three parallel code-investigation agents (evidence = file:line). Severity + fix + regression-risk so we fix root causes without trading one bug for another. Live smoke-test confirmations get appended as a second pass._

## Severity legend
**P0** = regression / breaks a core flow now · **P1** = missing capability users are hitting · **P2** = UX/cleanup · **DESIGN** = needs a model/groundwork decision.

---

## P0 — Regression (fix first)

### F10 · "Launch Deployment is not populating on checkout" — **MH-1 regression**
**Root cause:** the kit-builder shows a consumable as available from the **legacy cross-hub `InventoryItem.quantity`** (`lib/inventory.ts:99`), but checkout now draws from **per-hub `inventory_stock`** via `drawFromHub` (`api/deployments/route.ts:250`). Any consumable with **no `inventory_stock` row at the chosen hub** — every consumable created *after* the backfill (`POST /api/inventory` writes no stock row, `inventory/route.ts:157-164`), or any item without a `hubId`, or any other hub — fails the guarded draw → hard `409 INSUFFICIENT_HUB_STOCK`. Secondary: if `/api/hubs` returns no active hubs (or the fetch fails), the required Source-hub `Select` has no options so Launch is **permanently disabled** with no message (`my-rig/page.tsx:468`).
**Fix (no new problem):** (1) `GET /api/inventory` returns **per-hub stock** (`listStockForItems`) and the kit-builder gates availability + qty cap on the **selected hub's** stock — so picker and checkout read the same source; (2) `POST /api/inventory` self-heals: on CONSUMABLE create with a hub, also `setStockAtHub` (this is the MH-2 create-gap fix — pull it forward); (3) optional lazy-create a stock row from the legacy total in `drawFromHub` so pre-existing inventory stays checkout-able; (4) inline message when no hubs exist.
**Regression risk:** keep the MH-1 dual-write discipline — don't double-decrement legacy `quantity` and the stock row. Effort **M**.

> Note: this is the one item that materially blocks operators *today*. The MH-2 script's create-gap step + a picker-source fix together resolve it; recommend hot-fixing ahead of MH-2's UI work.

---

## P1 — Missing capability users are hitting

### F5 + F6 · Forwarded request invisible to operator **and** operator can only Cancel — *same root defect*
**Root cause:** the forward path writes `fulfillerOperatorId` + a notification, but **no read query or auth rule ever references `fulfillerOperatorId`**. `listRequests` filters only `WHERE requestedById = me` (`deployment-requests.ts:98`), so a forwarded request (created by someone else) is excluded from the operator's list; and `complete` is blanket **admin-only** (`api/deployment-requests/[id]/route.ts:11`), so even if seen, the operator can't fulfill it — only `cancel`, which itself requires `requestedById = me`. Net: a forwarded operator can currently do **nothing**.
**Fix:** (1) widen the operator scope to `requestedById = me OR fulfillerOperatorId = me` in **both** `listRequests` and the `[id]` GET/PATCH ownership checks; (2) carve `complete` out of admin-only when `fulfillerOperatorId === session.userId && requestType === 'MATERIAL'`; (3) render a "Mark Fulfilled" button on the operator card for `FORWARDED` + me; (4) fire a requester notification on operator-complete (the PATCH route currently notifies on submit/forward only). **Matches the design's own §4/§6 actor list.** Effort **M**; do F5+F6 as one change.

### F3 · Hub fulfillment should be an item-by-item loading checklist
**Root cause:** the hub portal (`/s/[token]` RESERVATION) is **whole-request only** — lines render read-only (`s/[token]/page.tsx:124-134`), the three buttons (`CONFIRMED/PREPARED/DECLINED`) flip the entire request. The per-line columns `resolvedUnitId`/`resolvedVehicleId`/`stagedCondition` **exist but are never written**.
**Fix:** extend the portal context to include line ids + available serialized units; add a per-line transition (confirm/deny, assign/change unit, edit qty) writing the existing columns; gate the final "STAGE" on all lines resolved. **No schema change** (columns exist). Effort **L** — it's the only unauthenticated write path, so keep it token-scoped/idempotent/rate-limited; design alongside R4 (reservedQty) to avoid double-counting.

### F1 · Project dropdown on the Material Request form
**Root cause:** model/API/data-layer all carry `projectId`; the Project select was placed only in the **RESERVATION** branch of the operator form, never duplicated into **MATERIAL** (`operator/requests/page.tsx:514-527`). Also a latent bug: the mode toggle resets lines/hub but not `projectId`. **Fix:** add the existing select to the MATERIAL branch + reset projectId on toggle. Effort **S**.

### F4 · "Consumables" request line type reusing the inventory type
**Root cause:** representable today via a generic `KIT_ITEM` line, but there's no fast "Consumables" affordance. Data path is ready: `?itemType=CONSUMABLE` already filters `/api/inventory`. **Fix (lightweight, no migration):** add a "Consumables" option that maps to `KIT_ITEM` but filters the picker to `itemType==='CONSUMABLE'` and always shows qty. Effort **S** (or **M** for a real enum value).

---

## P2 — UX cleanup

### F7 · Requests page is busy on admin and operator
**Root cause:** both render a flat list of every status; operator has no filter at all, admin filters default to ALL. **Fix:** add an **Active / Closed** segmented tab (default Active) on both, partitioning on the existing `TERMINAL` set — pure presentation, no capability lost. Effort **S+S**.

### F9 · My Rig (and admin Inventory/Vehicles) — category-organized checklist, not a flat list
**Root cause:** the kit/vehicle pickers were **never** grouped (category is only a chip/column/filter). Not a regression. Category data is already present (`item.category`, `vehicle.type`). **Fix:** group the operator pickers by category/type with subheaders, keeping the selection Maps/Sets keyed by id unchanged; optional "group by" toggle on the admin tables. Effort **S** (operator) / **M** (admin too).

---

## DESIGN — model groundwork / decisions

### F8 · Project filter on vehicles, personnel, rigs/kit, inventory
- **Inventory:** filter **already ships** (via legacy `rig.projectId`). **Deployments:** API supports `?projectId`, **UI control missing**. Both must be **rewired off legacy `Rig.projectId` onto `deployment_projects`** before #29's contract slice drops that column.
- **Vehicles & Personnel: NO project association exists** (data-model gaps). A vehicle/person's project is only derivable *while* on an active deployment (`rig_vehicles`/`deployment_assignments` → `deployment_projects`). Decision needed: **derive-from-active-deployment** (no migration, recommended) vs a **direct FK / membership table** (needed only if assignment must exist independent of a live deployment). Effort **S–M** per surface.

### F2 · Shipping Labels: qty + "Ship To" (default Hub) + Shippo — **Hub addresses are the blocker**
**Root cause:** `SHIPPING_LABEL` captures only free-text; no qty/destination on the line. **`Hub` has only city/state — no street/zip**, so "Ship To = Hub" cannot resolve a real address. Shippo is entirely unbuilt. (The Session 10 §5 Shippo design **incorrectly assumes Hubs already have addresses** — they don't; this is the load-bearing prerequisite.)
**Groundwork to lay now (Shippo-ready, additive, deploy-safe):** (1) add nullable `street1/street2/zip/country` to `Hub` (raw-SQL pattern like `Hub.email`) + admin form; (2) add `shipToHubId`/`shipToAddress` + use existing `requestedQty` on the SHIPPING_LABEL line; (3) land the additive `Shipment` model + `ShipmentStatus` stub (no live reader, like the #29 foundation); (4) reserve `AHITS_SHIPPO_*` secrets + Makefile mapping **before** any deploy that mounts them. Full Shippo integration stays **track-only Phase-3** (label-buy deferred). Effort **M** groundwork / **L** integration.

---

## Structural takeaways
1. **F10 is the MH-1 regression** you were worried about — picker and checkout read different stock sources. Fix the source mismatch + the create-gap together; nothing else should ship on top until it's closed.
2. **F5/F6 are one defect** — `fulfillerOperatorId` is written but never read by any query or auth rule. One change closes both and matches the existing design.
3. **F3 and R4 share substrate** (`resolved*` columns, `reservedQty`) — sequence them together so per-line resolution and hard-reserve don't double-count.
4. **F8 (Vehicles/Personnel) and F2 (Hub addresses) are real model gaps**, not UI tweaks — they need the derive-vs-FK and address-columns decisions before build.
5. Legacy `Rig.projectId` underpins the inventory/deployment project filters — **rewire to `deployment_projects` before #29 contract** or those filters silently break.

---

## Live smoke — additional issues found (not in the original feedback)

Full admin-surface sweep on staging (2026-06-25), admin account. New issues, severity-tagged:

| Ref | Issue | Evidence | Severity | Fix |
|---|---|---|---|---|
| **S1** | **Admin Inventory shows consumables as 0 available / 0 total while the operator kit-builder shows the same item as "75 avail."** Same MH-1 read-divergence as F10, now visible on the admin list: admin reads per-hub `inventory_stock` (≈0, rows never seeded for most items); operator picker + legacy total read `InventoryItem.quantity`. | Cardboard Box: admin "0/0/0 · Piedmont SC", operator picker "75 avail." | **P0 (with F10)** | Same fix as HOTFIX-1 — unify both surfaces on per-hub stock + seed/resync stock rows. Admin Available/Total must read the same source as checkout. |
| **S2** | **"Hubs" nav opens an inbound-only view; actual hub management (Add/Edit hub) is buried under Settings → Hub Locations.** Hub form has only name/city/state — no street address or email field. | `/admin/hubs` = "Hub Inbound"; Settings → "Hub Locations" has Add Hub (Home Lab, YS Shop). | P2 (IA) + DESIGN (F2 prereq) | Point/relabel the Hubs nav to hub management (or merge), and add address/email fields (the F2 Hub-address work). |
| **S3** | Reports/inventory show **raw cuids ("cmqsl4zb") and "UNKNOWN-1/2"** as unit identifiers for unserialized units. | Reports: Manual Corer Collar "Unit cmqsl4zb", "Unit UNKNOWN-2". | P3 (cosmetic) | Use the `withPositions` "Unit N" fallback instead of cuid/UNKNOWN. |
| **S4** | Naming/consistency: admin page titled **"Deployment Requests"**, operator says **"Requests"**; dashboard alert reads **"User: 18 labels"** (requester name resolving to "User"/odd prefix). | Admin requests header; dashboard Active Alerts. | P3 | Align titles to "Requests"; fix the alert subject/name resolution. |
| **S5** | **Operators have no Home Hub set** (Users page Home Hub = "—" for both). A sensible source-hub default for checkout (and the F10 selector) has nothing to default to. | `/admin/users` Home Hub column empty. | P2 | Set home hubs (data) + default the checkout source-hub to the operator's home hub. |
| **S6** | **Operator dashboard has no requests / "assigned to me" feed** — corroborates F5 (forwarded requests are invisible to the fulfiller). | `/operator/dashboard` shows only 3 static cards. | P1 (with F5/F6) | Add an "Assigned to me / open requests" card to the operator dashboard. |

**Worked-well (no issues):** admin Dashboard feeds + alerts, Deployments, Maintenance (inoperable review + damage tracking), Projects, **Vehicles (the build-out — Type/Status/Hub filters, 14/14)**, Users, **Reports (79 assets, util%/downtime)**, Settings (notifications, checklists, categories, hub locations), the rebuilt admin **Requests** with filters + admin "Mark Fulfilled", and the read-only "Browse → Vehicles" operator nav entry. Two hubs exist (Home Lab, YS Shop), so multi-hub data is present — which makes S1/F10 more clearly a code bug than a data gap.

**Not yet covered (owed):** operator-authenticated views (read-only Vehicles as a true operator; Op2 seeing/not-seeing the forwarded request — F5 invisibility); the hub tokenized portal (needs a live token); real-device **offline/A6**. The code root-causes cover these; live confirmation remains.

## Live smoke — operator-authenticated pass (logged in as Field Op 1)

| Ref | Result | Severity |
|---|---|---|
| **Read-only Vehicles** | ✅ **Works as designed.** As an operator: "Vehicles" with a **"View only"** chip, **no "Add Vehicle"**, **no Actions/edit/delete column**, nav filtered to just Vehicles + a "← My Dashboard" back link, header reads "AHITS" (not "AHITS Admin"), filters still usable. The read-only build (task #4) is validated live. | ✅ pass |
| **F7 (operator)** | ✅ Confirmed — operator Requests lists Forwarded/Fulfilled/Cancelled intermixed, no Active/Closed split. | P2 |
| F5 context | Op1 (the **requester**) correctly sees the forwarded "18 labels" with a Cancel button. The fulfiller-side invisibility (Op2) couldn't be live-tested — see S8. | — |
| **S7** | **Dashboard greeting showed "Good afternoon, Ops"** while logged in as Field Op 1 (the nav footer correctly read "Field Op 1"). The greeting rendered the *previous* user's name — stale identity (likely an un-revalidated `/api/auth/me` SWR cache after account switch). | P3 |
| **S8** | **Could not sign out of Op1 / switch to Op2.** After clicking Sign out (twice, incl. by element ref) and submitting a fresh Op2 login, `/api/auth/me` still returned Field Op 1. Either a real logout/session-switch reliability bug (**important for shared field tablets**) or a click-targeting artifact at the viewport's bottom edge — **flag for manual verification.** The first sign-out of the session did work, so it's intermittent. | P1 if real |

> F10 was not re-run as an operator (the wizard code path is identical to the admin run that reproduced it). F5's fulfiller-side invisibility remains **code-confirmed** (`listRequests` filters `requestedById` only) but live-unconfirmed due to S8.

### S7 + S8 root cause (confirmed via console) — React hydration mismatch (#418)
Clicking Sign Out on the operator **dashboard** throws **`Minified React error #418`** (server-rendered HTML ≠ client HTML — a hydration mismatch) in the console, and the session is left intact (`/api/auth/me` still returns the user). **When hydration fails, React doesn't reliably attach client event handlers**, so the Sign Out `onClick` never fires — that is S8. The almost-certain source is the dashboard's **`"Good afternoon, {firstName}" · "Thursday, June 25"` greeting**: a time-of-day/name/date derived differently on server vs client is the canonical #418 trigger, and it also explains **S7** (the greeting briefly showing the previous user's name). The logout API itself is correct (`clearSession()` deletes the `ahits_session` cookie) — the bug is purely the client interactivity break from the hydration error. Sign Out worked once from `/operator/daily-check` (no greeting → no mismatch), consistent with this.

**Severity: P1.** Logout is broken from the operator's landing page, and hydration errors can silently break interactivity elsewhere. **Fix:** render the greeting/date client-only (after mount) or `suppressHydrationWarning`, and source the name from one place (`useAuth`), not a server prop. Small fix; high value. Bundle it adjacent to HOTFIX-1 (it's a reliability P1) or as its own tiny PR. This also resolves S7.

**Note for Max:** my MCP browser shares the cookie jar with your open tabs, so your tabs are now on the **Field Op 1** session — you may need to re-log-in your Admin/Op2 tabs.

## Headline: F10 + S1 are the same P0 and the top priority
The MH-1 read-divergence breaks **both** operator checkout (F10, can't launch with a consumable) **and** the admin inventory numbers (S1, shows 0 vs 75). One hotfix that unifies every surface on per-hub `inventory_stock` (and seeds/resyncs stock rows) closes both. Nothing should promote to prod until it lands.
