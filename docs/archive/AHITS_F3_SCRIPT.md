# AHITS — F3 CC Script: Mandatory item-by-item hub loading checklist

_Prepared 2026-06-25. R4 (hub-stock hard-reserve, #91) is merged — this builds the per-line fulfillment UX on top of it. Specs: AHITS_FEEDBACK_FINDINGS_REGISTER.md (F3) + AHITS_REQUESTS_REDESIGN_DESIGN.md §4–§5._

## The requirement (confirmed with Max)
Fulfilling a RESERVATION must work like a **physical loading checklist**, not a single confirm:
- The fulfiller (**hub operator via the tokenized portal, OR an admin internally**) sees **every line**.
- They must **explicitly check off each line one at a time** with a **Confirm / Edit / Deny** choice. No bulk "confirm all."
  - **Confirm** = fulfill exactly as requested.
  - **Edit** = change it as necessary — adjust the quantity, assign/swap the serialized unit, or **substitute a different inventory item**.
  - **Deny** = can't fulfill (with a reason).
- Visible **progress** ("3 of 7 checked").
- The request **cannot be staged/completed until every line is checked off** — enforced **server-side**, not just disabled in the UI.
- Per-line state **persists** so the fulfiller can stop and resume, and survives a page reload.
- **Every change is tracked back to the requesting operator.** The requester sees, per line, **requested → fulfilled** (adjusted qty, substituted item/unit, or denied + reason), gets a **notification when it's staged** summarizing the changes, and there is a **per-line change log** (who/what/when) so the deltas are auditable — the operator always knows exactly what they're actually getting.

## Builds on what's already live
R4 (#91) already: reserves consumable kit-item stock at the fulfiller hub on Confirm/Prepare → STAGED, releases on cancel/fulfill, `stockReservedAt` idempotency, `reserveAtHub`/`releaseAtHub`, the "Stock reserved at <hub>" chip. F3 makes the *path to STAGED* an item-by-item checklist and feeds the per-line confirmed quantity into the existing reserve.

---

```
Build F3 (mandatory item-by-item hub loading checklist) on AHITS. Specs: AHITS_F3_SCRIPT.md + AHITS_REQUESTS_REDESIGN_DESIGN.md §4–§5. Builds on R4 (#91, merged). tsc/lint/vitest clean. The portal is the only unauthenticated write path — keep every write token-scoped, idempotent (withIdempotency), rate-limited.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-f3-hub-loading-checklist"

=== 1. Per-line checklist state + change log (additive schema) ===
- DeploymentRequestLine: add fulfillmentStatus ('PENDING' | 'CONFIRMED' | 'EDITED' | 'DENIED', default 'PENDING') + fulfilledQty Int? (confirmed/adjusted amount) + substitutedItemId String? (when a different item is substituted) + denyReason String?. (resolvedUnitId/resolvedVehicleId/stagedCondition already exist — reuse for unit/vehicle assignment.) The ORIGINAL request values (requestedQty, the requested item/category) stay untouched on the line, so requested→fulfilled is always derivable.
- NEW table request_line_events (id, lineId, requestId, action 'CONFIRM'|'EDIT'|'DENY', fromQty, toQty, fromItemId, toItemId, note, actorLabel (portal) / actorUserId (admin), createdAt) — the per-line change log tracked toward the requester. Raw-SQL access (mirror status_link_events).
- Add helpers to lib/deployment-requests.ts: setLineFulfillment(lineId, {status, fulfilledQty, resolvedUnitId, resolvedVehicleId, substitutedItemId, denyReason, stagedCondition, actor}) — writes the line AND appends a request_line_events row capturing the from→to delta; and getLineChecklist(requestId) returning every line + current status + original-vs-fulfilled + (for SERIALIZED) available units to assign.

=== 2. Enforce "all lines checked" server-side (the core rule) ===
- The RESERVATION REQUESTED→STAGED transition (in deployment-requests.ts / the stage helper R4 added) must REJECT with 409 if ANY line is still 'PENDING'. Only CONFIRMED or DENIED lines may exist before staging. This makes the checklist mandatory regardless of UI.
- On stage, R4's reserve uses each CONFIRMED/EDITED line's fulfilledQty (not requestedQty) for the ACTUAL item (substitutedItemId ?? original itemId) at fulfillerHubId; DENIED lines reserve nothing. (Wire fulfilledQty + the effective itemId into the existing reserveAtHub call.)

=== 3. Per-line Confirm / Edit / Deny (both fulfillers) ===
- api/s/[token]/transition/route.ts: accept a per-line action {lineId, action:'confirm'|'edit'|'deny', fulfilledQty?, resolvedUnitId?, resolvedVehicleId?, substitutedItemId?, denyReason?, stagedCondition?} → setLineFulfillment (which also writes the request_line_events delta). 'confirm' = as requested; 'edit' = sets fulfilledQty / resolvedUnitId / substitutedItemId (status EDITED); 'deny' = status DENIED + denyReason. A line may be re-actioned before staging (each change appends an event). Reuse the existing withIdempotency + rate-limit wrapper. The whole-request 'PREPARED'/STAGE action is the FINAL gate (server rejects if any line still PENDING — step 2).
- Mirror an admin endpoint: per-line PATCH /api/deployment-requests/[id]/lines/[lineId] (requireAdmin) → same setLineFulfillment (actor = admin user), plus the admin stage action using the same all-lines-checked gate. Both fulfiller paths produce the same change log.

=== 4. Portal context ===
- api/s/[token]/route.ts RESERVATION branch: per line return {id, requestedName, requestedQty, lineType, itemType, fulfillmentStatus, fulfilledQty, substitutedItemId, substitutedName, resolvedUnitId, denyReason} and, for SERIALIZED/substitution, the available units + a short list of substitutable items at this hub (id + name + availableAtHub) so Edit can swap. Add a progress summary {checked, total}. Least-privilege — no costs/emails.

=== 5. The checklist UI (shared component, two surfaces) ===
- Extract a shared <FulfillmentChecklist> component used by BOTH the portal and the admin page (consistency — they must not drift).
- Each line row shows: the requested item + requested qty, a status badge (Pending / Confirmed / Edited / Denied), and — once actioned — the **requested → fulfilled** delta inline (e.g. "10 → 8", "Sample Bags → Cardboard Box", "Denied: out of stock"). Per-line controls: **Confirm**, **Edit** (qty field + serialized-unit <select> + "substitute item" picker), **Deny** (reason). A line stays editable/re-openable until staged.
- A sticky progress header "X of Y checked"; the **Stage / Mark prepared** button is DISABLED until checked === total with helper "Check off every item to stage." (Server enforces too — step 2.)
- src/app/s/[token]/page.tsx (portal) and src/app/(admin)/admin/requests/page.tsx (admin internal/override) both render <FulfillmentChecklist> with the same all-checked gate.

=== 6. Track changes toward the requesting operator ===
- On STAGE, build a per-line diff (requested → fulfilled) for the request and: (a) create a Notification to the requester ("Your reservation was prepared: N items adjusted, M denied — review") deep-linking to the reservation; (b) the diff is also derivable any time from the line (original fields vs fulfilled fields) + request_line_events.
- Operator (requester) reservation detail shows, per line: requested → fulfilled with status (Confirmed as-is / Adjusted / Substituted / Denied + reason), and a "what changed" view backed by request_line_events. The card shows progress ("Loading: 3 of 7 checked") while pending and the existing "Stock reserved at <hub>" chip once staged.

NOTE (post-A2 #36): create the committed migration + run `make db-generate` locally so the client/tsc are current, but do NOT manually `make db-migrate` — the deploy pipeline's migrate job auto-applies it on merge (requires the `AHITS_MIGRATE_URL` secret to exist).

Verify: tsc 0, eslint 0, vitest green — ADD tests: (a) staging with any PENDING line → 409; (b) confirm/edit/deny each line then stage → reserves the EDITED fulfilledQty for the effective item (substituted item if set), DENIED reserves nothing; (c) a SERIALIZED line requires a unit assignment to confirm; (d) every confirm/edit/deny appends a request_line_events row with from→to; (e) staging creates a requester Notification summarizing the changes. Manually on staging: file a Rig Reservation with several lines → open the hub token link → Confirm one, Edit one (drop qty + swap to a substitute item), assign a serialized unit, Deny one with a reason → Stage stays disabled until all checked → stage → reserved amounts match the fulfilled qtys, and the requesting operator sees requested→fulfilled per line + a notification; repeat via the admin page. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.
```

---

## Notes
- **Why server-side enforcement (step 2) matters:** the user requirement is that the fulfiller *must* work through every item. UI-disabling the button isn't enough — a stale client or the admin override path could bypass it. The "no PENDING lines before STAGED" guard makes the checklist a real invariant.
- **Shared component (step 5):** the portal and admin must show the identical checklist (consistency goal) — extract it once, use in both, so they can't drift.
- **Reuses, doesn't duplicate, R4:** F3 only changes *how a reservation reaches STAGED* (item-by-item) and feeds per-line `fulfilledQty` into R4's existing reserve. No change to the reserve/release mechanics that #91 already verified.
