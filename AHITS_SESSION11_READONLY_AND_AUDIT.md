# AHITS — Session 11: Operator Read-Only Visibility — Write-Auth Audit & Threading Spec

_Prepared 2026-06-25. The org-wide operator read-only feature (workplan §6) in three layers: the route-by-route write-authorization audit (the load-bearing security half), the shared capability primitives shipped this session, and the precise per-page threading spec for the surfaces not yet wired. Scope decision: **org-wide read (everything), read-only** — confirmed with Max this session._

---

## 1. Layer 3 — write-authorization audit (the security half)

UI hiding is not security. The guarantee that an operator cannot mutate the seven surfaces lives in the route handlers. Every mutating handler (`POST`/`PATCH`/`PUT`/`DELETE`) for the seven resources was read and classified on 2026-06-25.

**Result: every admin-only write across the seven surfaces is already `requireAdmin`-gated. No operator-exploitable write exists.** This confirms the Session 10 §6.3 "happy accident": the data layer was already shaped correctly.

| Surface | Write routes (all `requireAdmin` ✓) |
|---|---|
| Inventory | `inventory` POST · `inventory/[id]` PATCH/DELETE · `inventory/[id]/units` POST · `inventory/units/[unitId]` PATCH · `inventory/[id]/review-inoperable` POST · `categories` POST · `categories/[id]` PATCH/DELETE |
| Vehicles | `vehicles` POST · `vehicles/[id]` PATCH/DELETE |
| Maintenance | `maintenance` POST · `maintenance/[id]` PATCH/DELETE · `maintenance/[id]/complete` POST · `maintenance/[id]/send-to-shop` POST |
| Hubs | `hubs` POST · `hubs/[id]` PATCH/DELETE |
| Projects | `projects` POST · `projects/[id]` PATCH/DELETE |
| Deployments (admin actions) | `deployments/[id]` PATCH · `deployments/[id]/operators` POST/DELETE |
| Dashboard | `admin/alerts/[id]/resolve` POST |

**The `requireAuth` writes are NOT a gap.** They are operator self-service on the operator's *own* resources, each scoped by an ownership check (`deployments/[id]/end|transfer|handoff|items|vehicles`, `daily-check`, `checkout`, `notifications/read`, `change-pin`, `uploads`, `deployment-requests`). These live in the operator app (My Deployment), not on the read-only admin surfaces, so they do not contradict read-only visibility. _(Note: the §2 legacy-column authz reads flagged in the slice-4 readiness doc still use `rig.operatorId` — orthogonal to this feature, tracked there.)_

### 1.1 Read endpoints relaxed this session (org-wide read)

Three **read-only GET** endpoints inside the seven surfaces were `requireAdmin` and would have blocked operator read. Relaxed to `requireAuth` (GET-only; no write surface touched):

- `GET /api/dashboard/feeds` — dashboard operational feeds.
- `GET /api/hubs/inbound` — hub awaiting-receipt / discrepancy oversight.

All other surface reads (`inventory`, `vehicles`, `maintenance`, `projects`, `hubs`, `deployments`, `operators`) were already `requireAuth`. `maintenance/[id]` has no GET (detail comes from the list). **`reports/equipment` was deliberately left `requireAdmin`** — the equipment cost & utilization report is financial (repair spend, cost-of-downtime) and Reports is not one of the seven operational surfaces; surface it to operators only on an explicit decision.

### 1.2 The standing rule (so this never drifts)

For the seven surfaces: **reads = `requireAuth`, writes = `requireAdmin`.** Any new write route that touches these resources on `requireAuth` is a bug. Worth a one-line check in PR review and a future `requireViewer(resource)` helper to formalize it.

---

## 2. Layer 2 — shared capability primitives (shipped)

`src/components/shared/ReadOnly.tsx`:

- `ReadOnlyProvider({ canEdit })` — wraps a surface; the admin layout passes `canEdit = role === 'ADMIN'`.
- `useCanEdit()` — the single source of truth for "may the viewer mutate this page?"
- `<MutationButton>` / `<MutationIconButton>` — a Button/IconButton that **hides** for read-only viewers (or disables-with-"View only"-tooltip when `keepVisible`).
- `<EditGuard>` — renders children only when `canEdit`; use to drop whole forms/toolbars.

All mutating controls funnel through these so the hide/disable behavior is applied **centrally** and cannot drift page-to-page. This is the "design once, reused by every later screen" primitive M1 calls for.

---

## 3. Layer 1 — routing & shell (shipped)

- `src/proxy.ts` — `OPERATOR_VIEW_ADMIN_PATHS` admits operators to the read-only subset under `/admin/*`; every other `/admin` path bounces them to `/operator/dashboard`.
- `src/app/(admin)/layout.tsx` — admits `OPERATOR` (read-only) as well as `ADMIN`, wraps children in `ReadOnlyProvider canEdit={isAdmin}`, and titles the shell "AHITS" (not "AHITS Admin") for operators.
- `src/components/admin/AdminNav.tsx` — filters to the read-only subset for operators and prepends a "← My Dashboard" return link.
- `src/components/operator/OperatorNav.tsx` — a "Browse (view only)" section links operators to the enabled surfaces.

One source of truth: operators render the **same** admin page components, gated by `canEdit`. No duplicate screens.

> **Consistency guard:** `OPERATOR_VIEW_ADMIN_PATHS` (proxy), `OPERATOR_VIEW_HREFS` (AdminNav), and `VIEW_ITEMS` (OperatorNav) must stay in lockstep. A surface is added to all three **only after** its page is threaded (§4) — otherwise operators would see dead admin buttons. **This session enables `Vehicles`** (threaded end-to-end as the exemplar). The other six are specified below.

---

## 4. Per-page threading spec (remaining six surfaces)

Mechanical and identical in pattern to the shipped Vehicles page: `import { useCanEdit, MutationButton, MutationIconButton } from '@/components/shared/ReadOnly'`, then swap each mutating control. Hiding the top-level "Add" + the per-row edit/delete + the dialog triggers makes a page effectively read-only (an operator can't open a form whose trigger is gone). Each must then be **clicked through as an operator** to confirm no editable affordance remains, before its path is added to the three lists in §3.

| Surface | Controls to gate (swap to Mutation*/EditGuard) |
|---|---|
| **Inventory** (`admin/inventory/page.tsx`) | "Add item" button; per-row/detail Edit, Delete, Retire, Adjust-quantity, "Add units", QR-reprint; review-inoperable action; category add/edit/delete. |
| **Deployments** (`admin/deployments/page.tsx`) | "New deployment"; admin Edit (re-project), force-transfer, add/remove operator, end-deployment, add/remove items/vehicles. (Operator's own-rig actions stay in My Deployment, untouched.) |
| **Maintenance** (`admin/maintenance/page.tsx`) | Create task; Assign shop/hub; Send-to-shop (issue work-order link); Mark complete; set return destination; edit/close; resolve. |
| **Hubs** (`admin/hubs/page.tsx`) | Add hub; Edit (incl. set email); Delete; Confirm receipt; Resolve discrepancy on the inbound view. |
| **Projects** (`admin/projects/page.tsx`) | Create/Edit/Delete project; Assign equipment/deployments. |
| **Dashboard** (`admin/dashboard/page.tsx`) | "Resolve alert" on the pinned banner + any feed-row admin action. Stat cards / feeds remain clickable (read-only drill-through). |

Recommended order (highest operator value first): **Inventory → Deployments → Maintenance → Hubs → Projects → Dashboard.** Each is a small, independently verifiable slice; do one, click through as an operator, add it to the three §3 lists, repeat.

---

## 5. Devices / offline

These views inherit the shell they're reached through and are read-heavy. Per the M1 freshness direction, they should show a "data as of HH:MM" line and render last-synced data offline rather than erroring. No write controls means no offline-queue complexity — a genuine simplification. Threading the freshness indicator is folded into each page's slice in §4.
