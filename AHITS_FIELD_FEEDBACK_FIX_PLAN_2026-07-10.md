# AHITS — Field Feedback → Fix Plan (2026-07-10)

Each note below was **investigated against the live code on `development`** (not guessed) by a read-only agent, so the "current state" is what the app actually does today. Verdicts: **BUG** (broken), **GAP** (not built / partial), **FEATURE** (new capability), **UX/PERF** (cross-cutting polish). Effort is rough: S (<½ day), M (½–2 days), L (multi-day / new model).

> Sequencing recommendation is in §Z at the bottom. All of this sits **behind the in-flight W0-10 work** on `development`/staging and is independent of the paused prod cutover.

---

## 1. Operator/Admin Dashboard shows "—" in every field — **BUG · S · HIGH**
**Finding (root cause):** the KPI cards live on the **admin** dashboard (`src/app/(admin)/admin/dashboard/page.tsx`), which operators are allowed to view read-only. It fetches `/api/dashboard`, but that route is gated by `requireAdmin()` (`src/app/api/dashboard/route.ts:6`) → returns **403** to an operator → the page has **no `res.ok` guard** (`page.tsx:73-77`) → `stats` is `undefined` → every `StatCard` falls back to `{value ?? '—'}`. The sibling `/api/dashboard/feeds` already uses `requireAuth` (that's why the feed panels DO populate for operators); the stats endpoint was just never given the same treatment. **Not** the #418 class.
**Fix:** change `requireAdmin()` → `requireAuth()` in `src/app/api/dashboard/route.ts` (read-only counts, mirrors `/feeds`), and add an `res.ok` guard on the page fetch so a real failure toasts instead of silently rendering "—".
**Note:** you were right that it's not live for operators; the "—" is a silent 403, not missing data.

## 2. Request "Fulfill" → operator "Deployment (Awaiting Pickup)" → pickup → checkout → active — **GAP (partial) · M · HIGH**
**Finding:** you are **not** misunderstanding the intent — the backend was deliberately built so a fulfilled reservation *holds* stock for the operator (UR-010 "hold-through-claim"): fulfilling a RESERVATION snapshots the held lines (`snapshotHeldLines`, `src/lib/deployment-requests.ts:857`) and keeps the hub reserve, and the checkout flow *already* claims that hold (`claimHeldStock`, `src/app/api/deployments/route.ts:295`). **But** today that hold is **invisible** — `FULFILLED` is a terminal status, it creates no deployment object and no "awaiting pickup" surface, and the operator's checkout (`/operator/scan`) is built from scratch with **no link back to the fulfilled request**. So the plumbing exists; the visible thread does not.
**Fix (smallest path to your vision — no heavy schema work):**
  1. **Operator "Awaiting Pickup" list** — surface FULFILLED reservations with unclaimed holds (query already exists in `claimHeldStock`/the cron sweep: `deployment_request_lines` where `heldQty > claimedQty AND releasedAt IS NULL AND status='FULFILLED' AND operator matches`). Render as "Deployment — Awaiting Pickup" cards on the operator dashboard/my-deployment.
  2. **"Pick up / Check Out" entry** that seeds the existing scan/checkout flow with the held lines (`heldHubId` → `sourceHubId`, pre-fill held consumables + serialized units), lets the operator add/edit/remove, and submits to `POST /api/deployments` — which already claims the hold. Closes the loop with essentially no new state machine.
  3. *(Optional, traceability)* add a nullable `requestId` to `Rig` so the deployment records which fulfilled reservation it came from.
**⚠️ Two landmines (this is NOT purely a UI thread — there IS new state logic):**
  - **72h hold-TTL race.** The cron already releases unclaimed holds after `HOLD_TTL_HOURS` (default 72h) past `fulfilledAt` (`cron/dispatch/route.ts`), using the *same* predicate the "Awaiting Pickup" card renders from. Fulfilled Friday, picked up Monday (>72h) → cron sets `releasedAt`, the card **vanishes**, reserved stock silently returns to the pool, and checkout claims zero — a promised deployment evaporates with no signal. **A visible awaiting-pickup hold must pause/extend the TTL** (or the sweep must skip holds that have an active pickup surface).
  - **Partial-remove zombie.** If the operator removes a held line at checkout, that line keeps `heldQty > claimedQty, releasedAt IS NULL` → the card **persists forever** (phantom pickup). The residual-hold release helper exists (`releaseHold`, `deployment-requests.ts`) but must be **wired into checkout-complete** for removed/leftover lines. Budget this as real state logic, not just a list + a button.
**Language:** "Deployment — Awaiting Pickup" + operator badge "Ready to pick up." **Lock ONE glossary term per state** across every surface (button/badge/header/toast) — today the flow overloads "Fulfill/Pick up/Check Out/scan/claim," which is exactly the inconsistency to kill.

## 3. Log fixed-in-field issues on a vehicle ("performed oil change", "overheated, fixed", "flat, replaced") — **GAP (mostly not built) · M · HIGH**
**Finding:** the data model is ~90% ready — a `MaintenanceTask` already has `isDamageReport`, `resolutionPath` with an `IN_FIELD` value the admin UI even labels **"Fixed in field"**, free-text `notes`, and a `COMPLETED` status. **But no surface lets a field user create one:** `POST /api/maintenance` is admin-only and only makes *scheduled recurring* tasks; the only operator-reachable damage path (during check-in/end) always opens an **IN_PROGRESS** task + flips the unit to `IN_MAINTENANCE` + fires a `DAMAGE_REPORTED` alert + **requires an admin to close it** — and it's **equipment-only, no vehicle path at all**. There is no operator vehicle page and no unified per-vehicle issue log.
**Fix:** add one operator-accessible endpoint (`POST /api/maintenance/log-fixed` or a `mode:'FIELD_FIX'` branch) that writes a `MaintenanceTask{ isDamageReport:true, resolutionPath:'IN_FIELD', status:'COMPLETED', completedAt:now, notes, vehicleId OR itemId }` and **skips** the `IN_MAINTENANCE` flip and the `DAMAGE_REPORTED` alert. Add a small "Log a fixed issue" button/dialog on the vehicle drawer and the maintenance page (reuse the existing notes + IN_FIELD inputs), and surface these `COMPLETED` records in the per-vehicle maintenance list already rendered at `admin/vehicles/page.tsx:467`. Result: the clean "record of all issues" you want, no admin action required.
**Note:** you were right — this specific "easy field log of a fixed issue" is not built; today's damage flow is the heavyweight open-a-task path.

## 4. Admin needs to hold a rig / accept transfers as an operator — **GAP (partial) · S · MED**
**Finding:** an admin **can already own a rig** (Rig.operatorId is a plain User FK with no role constraint; `deployments/route.ts:174` defaults the operator to the caller, and admins are admitted into `/operator/*`). What's **blocked**: an admin cannot be a **transfer/handoff recipient** — `role === 'OPERATOR'` gates at transfer-init (`.../transfer/route.ts:84`) and handoff-target (`.../handoff/route.ts:47`), and `/api/operators` (the destination roster) excludes admins.
**Fix:** relax those two role checks to allow ADMIN, include admins in `/api/operators` (`role: { in: ['OPERATOR','ADMIN'] }` — the inventory page already does this), and — **not optional** — add admins to the admin deployment-builder dropdowns (if an admin can hold a rig they *must* be selectable, or the feature is half-built).
**⚠️ Two caveats the "small" label hides (both stem from W0-10, now live):**
  - **Post-W0-10, target the assignment, not the column.** The finding's "Rig.operatorId is a plain FK" is pre-W0-10 framing; after PR-4a the read path is the `deployment_assignments` PRIMARY. An admin holding a rig writes a **PRIMARY assignment** — implement against that.
  - **FND-23 index A = one open PRIMARY per person, globally.** An admin who already owns a rig and then accepts a transfer would create a **second open PRIMARY → 23505/409 on accept** (the intended invariant, but a confusing dead-end — surface a clear message). And an admin holding a PRIMARY assignment now appears in cron missed-check scans, dashboards, and **payroll attribution** as an operator — decide deliberately whether admin-held rigs should count toward the money loop W0-10 was built to keep clean.

## 5. Hubs — Discrepancy is a near-dead-end; Dismissed is a black hole; no bulk verify — **GAP · M · MED-HIGH**
**Finding:** the Inbound tab (`admin/hubs/page.tsx`) shows non-terminal `HUB_RETURN` links with three per-row actions: **Received** (unit → AVAILABLE, link COMPLETED), **Copy link** (reissue), **Dismiss** (revoke). Key facts:
  - **"Discrepancy" is set by the HUB** from the login-less portal (`s/[token]/page.tsx`), not the admin. The admin only sees a red "Discrepancy" chip + **one inline caption line** (actor + note). There is **no discrepancy detail/history view** — `StatusLinkEvent` (the audit trail) is never queried in the admin UI. The moment the admin clicks Received/Dismiss, the row **and the only view of the note disappear**. → real dead-end.
  - **"Dismiss" = revoke** (`state=REVOKED`), which (a) is filtered out of `/api/hubs/inbound` with **no REVOKED list anywhere**, and (b) does **not reset the unit's `IN_TRANSIT` status**, so a dismissed discrepancy item can be **stranded IN_TRANSIT with no visible trace**. → black hole.
  - **No bulk actions** — strictly one row at a time.
**⚠️ Split severity:** the "Dismiss leaves the unit stranded `IN_TRANSIT`" part is a **HIGH data-integrity bug**, not just UX — inventory shows a unit in-transit forever with no trace, quietly eroding stock-count trust. Fix that first, separately from the bulk/view UX.
**Fix:** (a) a **Discrepancy review view** (query `StatusLinkEvent` for `DISCREPANCY`, with note/actor/timestamp + the unit) that includes a **resolution verb** — opening a discrepancy must let the admin close the loop (accept the hub's count / override / adjust inventory), not just read it; (b) make **Dismiss** deliberate — **reset the unit status** (fix the IN_TRANSIT strand) and keep it viewable (a "Dismissed/Resolved" filter) with a resolution note; (c) **bulk select-many** verify (Receive/Dismiss) on Inbound — the first slice of the broader bulk-editing ask (#7).

## 6. Vehicle type fields + **mounted collection units** (Giddings on Bobcat, Wintex on Can-Am) — **FEATURE · L · MED**
**Finding:** `VehicleType` enum today = `TRUCK, TRAILER, POLARIS_UTV, CAN_AM_UTV, CHRISTIE_DRILL, ATV, OTHER`. There is **no "Bobcat" type** and **no mounted-unit/attachment concept** — the Giddings/Wintex data-collection rigs don't exist in the model.
**Fix (two parts):**
  - **(a) Type edit — S:** reconcile the enum with the real fleet (add `BOBCAT`; confirm UTV/ATV/Can-Am labels), and make it editable on the vehicle form. (Enum add = additive migration.)
  - **(b) Mounted collection units — L (high field value; deferred for effort, not importance — Giddings/Wintex ARE the revenue-generating sampling equipment, so don't let this drift):** an **independent maintainable + daily-checkable asset** (name, kind [GIDDINGS|WINTEX|…], the `vehicleId` it's mounted on, own status/parts) with its own daily check + maintenance, separate from the carrier vehicle. **Decide reuse-vs-new-model BEFORE building:** it does *not* collide with W0-10 (a mounted unit inherits operator responsibility via vehicle→RigVehicle→rig-PRIMARY exactly like vehicles do), but a brand-new asset class re-plumbs FOUR subsystems (daily-check, maintenance, QR, alerts, all keyed to `Vehicle`/`InventoryUnit`). Evaluate a **non-motorized `Vehicle` subtype** or an `Equipment` reuse against a new `MountedUnit` table first — reuse may save the re-plumbing. **Also design the combined operator flow:** the operator now runs TWO checks per deployment (rig + collection unit) — these must be ONE guided sequence ("check rig → check collection unit"), dead-simple on mobile, or operators skip one.

## 7. Bulk editing across the board — **UX · M (incremental) · MED**
**Finding:** confirmed no bulk actions in Hubs (and generally per-row mutations elsewhere).
**Fix:** introduce a reusable multi-select + bulk-action pattern (checkbox column + a bulk action bar), starting with the **Hubs Inbound** verify (#5c), then extend to the highest-friction lists (inventory receive, requests, maintenance). Do it as a shared component so it's consistent — not one-off per page.

## 8. Mobile optimization — freezes, glitches, resizing — **UX/PERF · M-L · HIGH**
**Fix approach:** a dedicated mobile pass — audit the heavy admin pages on a real device, fix layout/resize jank (MUI responsive breakpoints, virtualized long tables, avoid full re-renders on filter change now that filters are URL-driven), and profile the freezes (likely large un-virtualized lists + synchronous work on the main thread). Pair with #9.

## 9. Full app optimization pass — "jittery and clunky" — **UX/PERF · L · HIGH**
**Fix approach:** a systematic performance pass — React profiler on the worst offenders; memoize/virtualize large lists; cut redundant fetches (SWR/query-cache — this is also what **Batch 6b, the freshness substrate**, is for); debounce filter/search; ensure the service-worker/chunk strategy isn't causing the stalls we saw earlier (#418 family). Fold this together with #8 and Batch 6b into one **"Performance & Feel" workstream** rather than scattering it.

---

## Z. Recommended sequencing (fast wins → structural)

> **Split the perf work — don't defer ALL of it.** "Jittery/clunky" + mobile freezes is the user's #1 *felt* pain (every interaction, every day) AND a **precondition** for the Wave-B field features (the field-fix log and the pickup flow only succeed if a gloved operator can use them fast on a phone). So: a **mobile quick-win triage** comes up front; the **deep systematic pass** (needs Batch 6b) stays in Wave C. **Build every Wave A/B feature mobile-first, spot-checked on a real device**, so you stop accumulating jank you'll pay to remove later. The stranded-`IN_TRANSIT` half of #5 is re-tagged **HIGH data-integrity** and pulled forward.

**Wave A — quick wins + feel (mostly S; land alongside the W0-10 soak):**
1. Dashboard "—" bug (#1) — S, one route + a guard. (Broken first impression on every login.)
2. **Mobile quick-win triage** (#8 slice) — responsive breakpoints, resize jank, virtualize the 2–3 worst lists, debounce filters, kill obvious redundant fetches. No Batch-6b substrate needed; directly kills the "feels broken" sensation.
3. Admin-as-operator (#4) — S, relax role gates + roster (mind the index-A/payroll caveat).
4. Vehicle type enum reconcile + editable (#6a) — S.
5. Hubs **stranded-IN_TRANSIT data-integrity fix** (#5, the HIGH half) — S–M.

**Wave B — flow completeness (M; build mobile-first):**
6. Fulfillment → Awaiting Pickup thread (#2) — incl. the TTL-race + residual-hold-release state logic.
7. Field-fixed issue logging (#3) — dead-simple on mobile; reconcile with the existing damage flow into ONE mental model (which path when) and one per-vehicle log.
8. Hubs discrepancy review view (+ resolution verb) + dismiss viewability + bulk-verify slice (#5, the UX half).

**Wave C — structural / larger:**
9. Bulk-editing shared pattern rollout (#7).
10. Mounted collection units (#6b) — after the reuse-vs-new-model decision; high field value, don't let it drift.
11. **Deep Performance & Feel pass** — profiler-driven optimization (#9) + Batch 6b freshness substrate (SWR/query-cache, monolith split), run together.

Waves A–B are independent of the paused prod cutover and can proceed on `development`/staging immediately next session. Each ships through the same build → four-agent review → verified-patch flow used all session.
