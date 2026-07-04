# AHITS — Requests Cluster CC Script (F5/F6 + F1 + F4 + F7)

_Prepared 2026-06-25. Bundles the cheap, high-value Requests feedback fixes root-caused in `AHITS_FEEDBACK_FINDINGS_REGISTER.md`. Ship after HOTFIX-1/HOTFIX-2. Can be one PR or split into two (F5/F6 backend+auth, then F1/F4/F7 UI) — both noted below._

## Scope
- **F5 + F6** (one defect): forwarded request invisible to the fulfiller + the fulfiller can't complete it.
- **F1**: Project dropdown missing on the Material form.
- **F4**: a "Consumables" line option that reuses the inventory CONSUMABLE type.
- **F7**: Active/Closed grouping on both the operator and admin Requests pages.

---

```
Requests cluster on AHITS (F5/F6 + F1 + F4 + F7). Spec: AHITS_FEEDBACK_FINDINGS_REGISTER.md. tsc/lint/vitest clean. Reads stay requireAuth (operator scoped); admin-only writes stay requireAdmin.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-requests-cluster"

=== F5 + F6 — forwarded request visibility + operator fulfill (one defect: fulfillerOperatorId is written but never read) ===
1. src/lib/deployment-requests.ts: in listRequests, when scoped to an operator, change the predicate from `WHERE r."requestedById" = ${id}` (~line 98) to `WHERE (r."requestedById" = ${id} OR r."fulfillerOperatorId" = ${id})`. Also return fulfillerOperatorId + status in the row.
2. src/app/api/deployment-requests/[id]/route.ts: the GET and PATCH ownership checks (~lines 28, 53) currently allow only requestedById === session.userId; widen to `requestedById === me || fulfillerOperatorId === me` so the forwarded operator can open + act on the request.
3. Same file (~line 11): `complete` is in ADMIN_ONLY_ACTIONS. Carve it out: allow `complete` when `session.role === 'ADMIN'` OR (`result.request.fulfillerOperatorId === session.userId` AND `requestType === 'MATERIAL'`). Keep the FORWARDED→FULFILLED state guard. Keep forward/decline/fulfill-from-REQUESTED admin-only. Guard precisely on fulfillerOperatorId (a hub-forwarded request, fulfillerHubId set, must NOT be operator-completable).
4. Fire a requester notification on operator-complete (the PATCH route notifies on submit/forward only today) so the requester gets a bell when their forwarded request is fulfilled.
5. src/app/(operator)/operator/requests/page.tsx: add fulfillerOperatorId + status to the local RequestRow interface (~lines 34–44); when a card is status FORWARDED and fulfillerOperatorId === current user, render a "Mark Fulfilled" button (PATCH {action:'complete'}, mirror the admin pattern at admin/requests/page.tsx:330–335) alongside/instead of Cancel. Use useOfflineQueue().mutate. Current user id comes from useAuth.

=== F1 — Project dropdown on the Material form ===
6. operator/requests/page.tsx: the Project <TextField select> currently renders only in the RESERVATION branch (~514–527). Add the same control to the MATERIAL branch (~538–558). The projects array is already fetched on dialog open; projectId state + API + model already carry it. Also fix the latent bug: the mode-toggle reset (~464–468) clears lines/hub but not projectId — add setProjectId('').

=== F4 — "Consumables" line option (lightweight, no migration) ===
7. operator/requests/page.tsx: add a "Consumables" entry to the MATERIAL line-type options (addLineOptions ~445–455 + the LineEditor switch). It maps to lineType='KIT_ITEM' under the hood but filters the item picker to itemType==='CONSUMABLE' (InventoryOption.itemType is available ~line 52) and always shows the Qty field. Keep validation (isLineValid ~107–118) + the API refine treating it as KIT_ITEM (needs specificInventoryItemId). No enum/migration change.

=== F7 — Active/Closed grouping (both surfaces; pure presentation) ===
8. operator/requests/page.tsx: add an Active/Closed segmented toggle (MUI ToggleButtonGroup/Tabs) above the list, default Active. Partition on the existing TERMINAL set (~line 74): Active = DRAFT/REQUESTED/STAGED/FORWARDED, Closed = FULFILLED/DENIED/CANCELLED. Closed stays one click away (no capability lost).
9. src/app/(admin)/admin/requests/page.tsx: add the same Active/Closed tab above the existing Type/Status/Hub/Requester filters; apply the partition in the `filtered` useMemo (~441–450) and default to Active (change default filterStatus ~413 or add the tab as an outer filter). Don't hide a STAGED reservation that still needs an action.

Verify: tsc 0, eslint 0, vitest green. Manually on staging: forward a MATERIAL request to an operator → that operator SEES it and can Mark Fulfilled → requester gets notified; the Material form has a Project dropdown + a Consumables line option; both Requests pages default to Active with a Closed tab. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.
```

---

## Split option
If you'd rather two smaller PRs: **PR-A = F5/F6** (steps 1–5, the backend/auth defect + operator Fulfill button) and **PR-B = F1/F4/F7** (steps 6–9, pure operator/admin UI). PR-A is the one with real auth surface — worth its own review. PR-B is low-risk presentation. One combined PR is fine too since they share the same two pages.

## Not in this cluster (tracked elsewhere)
- **F3** (per-line hub loading checklist) + **R4** (hard-reserve) — sequenced together later; share the `resolved*`/`reservedQty` substrate.
- **F2** (shipping qty/Ship-To + Hub addresses + Shippo) and **F8** (project filters on Vehicles/Personnel) — model-gap work needing the §3 decisions in the revised workplan.
- **S2** (Hubs nav is inbound-only; hub management hidden in Settings), **S5** (no operator home hubs), **S6** (operator dashboard "assigned to me" feed) — fold into the relevant clusters.
