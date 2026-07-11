# AHITS — F3 + R4 CC Script (hub loading checklist + hub-stock hard-reserve)

_Prepared 2026-06-25. Sequenced together because F3's per-line resolved quantity is what R4 reserves — splitting them risks double-counting. Specs: AHITS_FEEDBACK_FINDINGS_REGISTER.md (F3), AHITS_REQUESTS_REDESIGN_DESIGN.md §4/§8 (R4), AHITS_MULTIHUB_MIGRATE_DESIGN.md §3 (reservedQty). Ship after the Requests cluster._

## Why together
- **F3:** the hub portal (`/s/[token]` RESERVATION) is whole-request only; the per-line columns `resolvedUnitId`/`resolvedVehicleId`/`stagedCondition` (deployment_request_lines) exist but are never written. The hub needs to work line-by-line: confirm/deny each, assign/change a serialized unit, adjust quantity.
- **R4:** staging a reservation must **hard-reserve** the confirmed consumable quantity at the fulfiller hub (`InventoryStock.reservedQty` exists; `availableAtHub`/`drawFromHub` already net it) so the stock can't be checked out by someone else. The reserved amount = the per-line resolved quantity from F3.

> The portal is the only unauthenticated write path — keep every new write token-scoped, idempotent (`withIdempotency`), and rate-limited (existing `/s/` limiter).

---

```
Build F3 + R4 on AHITS (hub loading checklist + hub-stock hard-reserve). Specs: AHITS_FEEDBACK_FINDINGS_REGISTER.md (F3) + AHITS_REQUESTS_REDESIGN_DESIGN.md §4/§8 + AHITS_MULTIHUB_MIGRATE_DESIGN.md §3. tsc/lint/vitest clean. Reads requireAuth; admin writes requireAdmin; hub writes only via the token.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-requests-r4-f3-hub-fulfillment"

=== R4 backend: reserve helpers + idempotency ===
1. lib/inventory-stock.ts: add reserveAtHub(itemId, hubId, qty) — guarded UPDATE that only reserves if GREATEST(quantity - reservedQty, 0) >= qty: `UPDATE inventory_stock SET reservedQty = reservedQty + qty WHERE itemId=.. AND hubId=.. AND quantity - reservedQty >= qty`; return true/false. And releaseAtHub(itemId, hubId, qty): `SET reservedQty = GREATEST(reservedQty - qty, 0)`. (availableAtHub/drawFromHub already net reservedQty — verified.)
2. Additive migration + schema: DeploymentRequest.stockReservedAt DateTime? (so reserve/release can't double-apply). Raw-SQL access, no client coupling.

=== F3: per-line resolution on the hub portal ===
3. api/s/[token]/route.ts — RESERVATION context: include per-line {id, lineType, itemType, requestedQty, resolvedUnitId, resolvedVehicleId, stagedCondition, resolved:boolean} via getRequest(link.deploymentRequestId); for each SERIALIZED kit line include the available units (id + serial/position) for assignment. Least-privilege: no costs/emails.
4. status-links.ts: extend ALLOWED_ACTIONS / applyReservationTransition (or add a per-line transition path) to accept a per-line action with a lineId: 'CONFIRM_LINE' (set resolvedUnitId/resolvedVehicleId + adjusted qty + stagedCondition), 'DENY_LINE'. Write the existing deployment_request_lines columns. Keep idempotent + token-scoped. The whole-request 'PREPARED'/CONFIRMED action becomes the final "all lines resolved → STAGE" gate (reject if any non-denied line is unresolved).
5. api/s/[token]/transition/route.ts: accept the optional lineId + per-line action (the route already wraps withIdempotency + rate-limit — reuse it).
6. s/[token]/page.tsx: rebuild the RESERVATION render as a checklist — each line a row with Confirm/Deny, a serialized-unit <select> (from the context's available units), and an editable quantity (capped at requestedQty). A global "Mark prepared (stage)" button enabled only when every line is Confirmed or Denied. Keep the existing actorLabel capture.

=== R4 wiring: reserve on stage, release on close (the F3↔R4 join) ===
7. lib/deployment-requests.ts — in the RESERVATION REQUESTED→STAGED transition (now gated on all lines resolved): for each CONFIRMED KIT_ITEM/consumable line, reserveAtHub(itemId, request.fulfillerHubId, resolvedQty). If any reserve fails (insufficient available), fail the stage with a 409 naming the short item(s) and do NOT partially reserve (roll back the txn). Set stockReservedAt. Skip lines that are DENIED.
8. Release path: on STAGED→{CANCELLED, DENIED} and STAGED→FULFILLED, releaseAtHub for each previously-reserved line and clear stockReservedAt (idempotent via stockReservedAt). (On a future R5 checkout-conversion, release first, then the normal checkout draw decrements quantity.)

=== Surfacing ===
9. Show "reserved" in the admin per-hub stock table (MH-2) and on the operator reservation status ("N reserved at <hub>"). Admin override (admin/requests Stage button) must remain compatible — if an admin force-stages, run the same reserve logic.

Verify: tsc 0, eslint 0, vitest green (esp. consumable-scoping — reservedQty must not let checkout oversell). Manually on staging: operator files a Rig Reservation to a hub → hub opens the token link → confirms each line + assigns a serialized unit + adjusts a qty → stages → the reserved consumable qty shows as reserved and is NOT checkout-able by another deployment until the reservation is cancelled/fulfilled. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.
```

---

## Split option
If one PR is too big for review: **PR-A = R4** (steps 1–2, 7–9: reserve helpers + reserve-on-stage using the *whole-request* confirm that exists today) then **PR-B = F3** (steps 3–6: per-line portal checklist, then point the reserve at per-line resolved qty). PR-A is safer to land first since it builds on the existing stage flow; PR-B refines the granularity. Doing them together avoids a reserve-amount mismatch between the two.

## After this
Remaining queue per `AHITS_SESSION11_REVISED_WORKPLAN_AND_PROMOTION.md`: **MH-2** (admin per-hub stock UI, if not already merged) → **F8** (project filters; decide derive-vs-FK for Vehicles/Personnel) → **F2 + Shippo groundwork** (Hub addresses + Shipment stub) → **F9** (category-grouped pickers) → the smaller S-items (S2 hub nav, S5 home hubs, S6 dashboard feed). Pilot gates left: **A2** (migrate-on-deploy) + **A6** (real-device offline).
