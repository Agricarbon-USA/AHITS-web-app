# AHITS — Session 11 Record & Handoff

_Prepared 2026-06-25. Executes the next four items of the Session 10 Addendum workplan. Built and verified in the analysis environment (`tsc` 0 / `eslint` 0 errors); the migrate / commit / PR / deploy steps are your-hands per `CLAUDE.md` (this environment has no `gh` CLI and no DB reachability — by design). Companion docs: `AHITS_SESSION11_SLICE4_READINESS.md`, `AHITS_SESSION11_READONLY_AND_AUDIT.md`._

---

## 1. State re-derived from source (not from the docs)

Verified against the live schema, migrations, route tree, and a green build:

- `tsc --noEmit` → **exit 0**; `eslint .` → **0 errors / 26 warnings** (all the pre-existing `react-hooks/set-state-in-effect` family).
- `#29` slices 1–3b **and** the consumable-availability hotfix (#84) are merged on `development`. The `Rig.operatorId`/`projectId` columns and `rig_operators` table are still present (transition retained).
- Vehicle had free-text `location`, no `hubId`. `InventoryItem` had a single `hubId`, no `InventoryStock`. Both confirmed unbuilt — matching the addendum.
- 42 stale remote feature branches remain (branch-churn risk; worth pruning).

## 2. What shipped this session (four PR-ready changesets)

Each is independent and small, matching the project's slice discipline.

### A. `#29` slice 4 (contract) — **prepared & GATED, not merged**
Finding: slice 4 is **not** "the only step left" — a source audit found **~35 call sites** still read the legacy columns for authorization and the secondary-operator path. A predecessor slice **3c (authz & writer completion)** must land first; until it does, removing the columns from `schema.prisma` won't even compile. Delivered: `docs/prepared/slice4_precheck.sql` (six consistency gates), `docs/prepared/slice4_drop_legacy.sql` (gated drop migration, stored **outside** `prisma/migrations/` so it is never auto-applied), and the `reassignPrimary` smoke checklist. See `AHITS_SESSION11_SLICE4_READINESS.md`.

### B. Vehicles build-out — **mergeable after local migrate**
`Vehicle.hubId` FK (Hub dropdown replaces free-text location; `location` retained as optional notes), hub + assigned-operator surfaced in list and detail, and list **filters** (search, type, status, hub) + **sortable** columns. `hubId` is read/written via raw SQL (matches the `Hub.email` pattern) so it is green pre-regeneration.
Files: `prisma/schema.prisma`, `prisma/migrations/20260625000000_vehicle_hub/`, `src/app/api/vehicles/route.ts`, `src/app/api/vehicles/[id]/route.ts`, `src/app/(admin)/admin/vehicles/page.tsx`.

### C. Multi-hub inventory stock — **EXPAND slice, mergeable after local migrate**
Additive `InventoryStock(itemId, hubId, quantity)` (one row per item+hub) + backfill from each consumable's `(hubId, quantity)` + a raw-SQL data layer (`src/lib/inventory-stock.ts`: list/get/total/set/draw/restore/lowStockByHub). **No live checkout/return reader rewired** — deploy-safe even before the migration is applied, exactly like the `#29` foundation. The MIGRATE slice (operator picks the hub each checkout; per-hub low-stock) and CONTRACT slice are the documented follow-ons; this unblocks the Requests redesign (workplan #5).
Files: `prisma/schema.prisma`, `prisma/migrations/20260625010000_inventory_stock/`, `src/lib/inventory-stock.ts`.

### D. Operator read-only visibility (org-wide) — **foundation + Vehicles exemplar, mergeable**
- **Write-auth audit:** every admin-only write across the seven surfaces is already `requireAdmin`-gated — no operator-exploitable mutation. Two read-only GETs relaxed to `requireAuth` (`dashboard/feeds`, `hubs/inbound`); `reports/equipment` deliberately left admin-only (financial). Full table in `AHITS_SESSION11_READONLY_AND_AUDIT.md`.
- **Shared primitives:** `src/components/shared/ReadOnly.tsx` (`ReadOnlyProvider`, `useCanEdit`, `MutationButton`, `MutationIconButton`, `EditGuard`).
- **Routing/shell:** `proxy.ts` admits operators to the read-only subset; `(admin)/layout.tsx` sets `canEdit`; `AdminNav`/`OperatorNav` wire the nav + a return link.
- **Vehicles** threaded end-to-end as the verified exemplar. The other six surfaces are specified button-by-button in the audit doc (tracked task) and are enabled only after threading + an operator click-through, so no dead buttons ever ship.

## 3. Your-hands steps (per CLAUDE.md)

Ship B, C, D as separate PRs to `development` (recommended), or stack them. For each:

```bash
GH_USER=$(gh api user --jq .login); DATE=$(date +%Y%m%d)
git checkout development && git pull
git checkout -b "feature/${DATE}/${GH_USER}-<slice>"   # e.g. vehicles-hub, inventory-stock, operator-readonly
make db-generate            # picks up schema.prisma (hubId, InventoryStock, Vehicle.hub relation)
make db-migrate             # applies the new migration(s) — BEFORE the code lands (DB rules)
git add -A && git commit -m "<slice>" && git push -u origin HEAD
gh pr create --base development --title "<slice>" --body "See AHITS_SESSION11_RECORD.md §2"
PR=$(gh pr view --json number --jq .number); gh workflow run pr-staging-deploy.yml -f pr_number=$PR; gh run watch
```

Notes:
- **Migrations to apply:** `20260625000000_vehicle_hub`, `20260625010000_inventory_stock`. Both additive/backfill, no destructive change.
- After `make db-generate`, the raw-SQL accessors keep working **and** the typed client gains `Vehicle.hub` / `InventoryStock` if you later want to migrate them off raw SQL.
- **Do NOT** place `docs/prepared/slice4_drop_legacy.sql` into `prisma/migrations/` — it is gated on slice 3c + the soak + a clean precheck.
- The CI `verify` workflow (lint/type-check/build/tests incl. the Postgres-backed vitest specs) is the regression gate; nothing this session rewired a tested path.

## 4. Open decisions (updated)

1. **Slice 4** now gated on **slice 3c** (authz/writer completion) — the recommended next `#29` step, done where the vitest suite runs. (Was framed as imminent; it isn't.)
2. **Multi-hub MIGRATE slice** — confirm "operator picks the hub each checkout" (already the recorded direction) and that per-hub low-stock replaces the item-level scan.
3. **Read-only remaining 6 surfaces** — order Inventory → Deployments → Maintenance → Hubs → Projects → Dashboard; each needs an operator click-through before its routing is enabled. **`reports/equipment` (cost report)**: confirm operators should NOT see it (left admin-only this session).
4. **Requests redesign (workplan #5)** is now unblocked by C — likely the next major build.

## 5. Verification ledger

| Changeset | tsc | eslint | Notes |
|---|---|---|---|
| Slice 4 prep | n/a | n/a | SQL + docs only; nothing imported. |
| Vehicles build-out | 0 | 0 errors | Raw-SQL hubId; client regen not required to compile. |
| Multi-hub expand | 0 | 0 errors | New lib 0/0; imported by nothing live yet. |
| Read-only foundation + Vehicles | 0 | 0 errors | Full tree holds at 0 errors / 26 known warnings. |

Tests (vitest) need the Postgres service container and run in CI; no existing tested path was rewired this session.
