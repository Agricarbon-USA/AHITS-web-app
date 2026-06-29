# AHITS — Read-only visibility: remaining 6 surfaces CC Script

_Prepared 2026-06-25. Threads the already-built `canEdit` primitives (`src/components/shared/ReadOnly.tsx`) through the six surfaces still admin-only — Inventory, Deployments, Maintenance, Hubs, Projects, Dashboard — and enables their operator routing. Vehicles already shipped as the exemplar; this repeats that pattern. Scope: **org-wide read (everything), read-only** (confirmed). The write-auth audit already verified every write on these surfaces is `requireAdmin`-gated, so the data layer is safe — this is UI gating + routing. Reads were already relaxed (`dashboard/feeds`, `hubs/inbound`) in the foundation PR._

```
Build read-only visibility for the remaining 6 admin surfaces on AHITS. Threads the existing canEdit primitives (src/components/shared/ReadOnly.tsx: useCanEdit/MutationButton/MutationIconButton/EditGuard) — the same pattern already shipped on admin/vehicles. Scope: org-wide read, read-only. tsc/lint/vitest clean. No migration. No new API (writes already requireAdmin; the relevant GETs already requireAuth).

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-readonly-remaining-surfaces"

Pattern per page (mirror admin/vehicles/page.tsx): const canEdit = useCanEdit(); add a "View only" chip to the header when !canEdit; replace each mutating control (Button→MutationButton, IconButton→MutationIconButton, whole mutating sections→<EditGuard>). Hiding controls makes the page read-only; an operator can't open a form whose trigger is gone. Keep all reads/filters/detail drawers working.

Gate these controls per surface (from AHITS_SESSION11_READONLY_AND_AUDIT.md §4):
1. Inventory (admin/inventory/page.tsx): Add item; row/detail Edit, Delete, Retire, Adjust-quantity, Add units, QR-reprint, review-inoperable; category Add/Edit/Delete; the MH-2 per-hub stock Set/Move controls.
2. Deployments (admin/deployments/page.tsx): New deployment; admin Edit (re-project), force-transfer, add/remove operator, end, add/remove items/vehicles. (Operators' OWN-rig actions live in My Deployment — untouched.)
3. Maintenance (admin/maintenance/page.tsx): Create task; Assign shop/hub; Send-to-shop; Mark complete; set return destination; edit/close; resolve; the inoperable-review actions.
4. Hubs (admin/hubs/page.tsx — the S2 page): Add/Edit/Deactivate hub, set email/address (Hubs tab); Confirm receipt, Resolve discrepancy (Inbound tab).
5. Projects (admin/projects/page.tsx): Create/Edit/Delete project; Assign equipment/deployments.
6. Dashboard (admin/dashboard/page.tsx): "Resolve alert" on the banner + any feed-row admin action. Stat cards + feeds STAY clickable (read-only drill-through to the read-only detail).

Then enable operator routing — add all six paths to ALL THREE lists, in lockstep:
- src/proxy.ts → OPERATOR_VIEW_ADMIN_PATHS: add /admin/inventory, /admin/deployments, /admin/maintenance, /admin/hubs, /admin/projects, /admin/dashboard.
- src/components/admin/AdminNav.tsx → OPERATOR_VIEW_HREFS: same six.
- src/components/operator/OperatorNav.tsx → VIEW_ITEMS: same six (under "Browse (view only)").
Operators must NOT reach Users, Settings, or Requests-write (leave those out of all three lists).

Verify per surface as an OPERATOR before considering it done (this is the key check — no dead buttons): log in as an operator, open each of the six under /admin/* via the Browse nav, confirm: the "View only" chip shows, NO Add/Edit/Delete/Assign/Resolve controls render, reads/filters/detail all work, and the page does not 403 or error. Then tsc 0, eslint 0, vitest green. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.

If one PR is too large to review, split: PR-A = Inventory + Deployments + Maintenance, PR-B = Hubs + Projects + Dashboard — but only add a surface to the three routing lists once its controls are gated + operator-clicked-through, so no dead buttons ship.
```

## Notes
- **Consistency-by-construction:** every surface uses the same `useCanEdit`/`MutationButton` primitives and the same "View only" chip as Vehicles, so the seven read-only surfaces look and behave identically — the "every element speaks to one another" goal.
- **The lockstep rule prevents dead buttons:** a surface's path goes into `OPERATOR_VIEW_ADMIN_PATHS` + `OPERATOR_VIEW_HREFS` + `VIEW_ITEMS` ONLY after its controls are gated and clicked-through as an operator. Otherwise an operator reaches a page with admin buttons that 403 on click.
- **API is already safe:** the write-auth audit confirmed all writes here are `requireAdmin`; UI hiding is defense-in-depth, not the only guard. No API changes needed.
- After this, **every operator gets org-wide read-only across all 7 surfaces** — closing the workplan #6 / task-#6 item.
```
