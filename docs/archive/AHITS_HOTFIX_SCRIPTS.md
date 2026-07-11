# AHITS — HOTFIX-1 + HOTFIX-2 CC Scripts

_Prepared 2026-06-25. Two independent hotfixes from the day-of-use feedback + live smoke (see `AHITS_FEEDBACK_FINDINGS_REGISTER.md`). Ship as **two separate PRs** — they touch unrelated subsystems. Both gate the first prod promotion._

---

## HOTFIX-1 (P0) — Unblock consumable checkout + fix the inventory read-divergence (F10 + S1)

**Why:** operators cannot start any deployment containing a consumable (Launch stays disabled, no Source-Hub selector renders), and the admin Inventory list shows consumables as 0 available while the operator picker shows the legacy total (e.g. Cardboard Box: admin "0", picker "75"). Root cause: the kit-builder + legacy total read `InventoryItem.quantity`; checkout draws from per-hub `inventory_stock`; the admin list reads per-hub stock. Items with no `inventory_stock` row read 0.

```
HOTFIX-1 (P0) on AHITS: unblock consumable checkout + fix the inventory read-divergence. Spec: AHITS_FEEDBACK_FINDINGS_REGISTER.md (F10 + S1). Standalone — do NOT bundle other items. tsc/lint/vitest clean.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-hotfix-consumable-stock"

1. Close the create-gap (root): in POST /api/inventory, when itemType==='CONSUMABLE' with a hubId, also setStockAtHub(item.id, hubId, quantity) then resyncItemTotal(item.id) in the same prisma.$transaction (both helpers already exist in lib/inventory-stock.ts). Then repair existing data: add a guarded backfill (migration or one-off script) that, for every non-deleted CONSUMABLE with InventoryItem.quantity>0 and a hubId but NO inventory_stock row, seeds setStockAtHub(quantity). This fixes Cardboard Box etc. on staging.
2. Unify the read source so picker == checkout == admin list:
   - GET /api/inventory returns per-hub stock (listStockForItems already returns {quantity, reservedQty, available} per hub) plus a derived total = SUM(available) for the convenience columns.
   - The admin Inventory list Available/Total columns must render from this per-hub source (sum), NOT a separate legacy derivation. Confirm S1 (0 vs 75) is gone.
3. Operator kit-builder (my-rig New Deployment, Build Kit/Launch steps):
   - Render the Source-Hub Select whenever the kit contains a consumable. It must NOT be hidden when /api/hubs returns rows; if there are 0 active hubs, show an inline "No hubs available — contact an admin" message instead of a permanently-disabled Launch.
   - Default the Select to the operator's home hub if set (User.homeHubId), else the first hub.
   - Gate each consumable's availability + qty cap on the SELECTED hub's available (from the per-hub data), so picker and checkout agree.
   - Manually verify: select a consumable → pick a hub → fill the note → Launch ENABLES and submits successfully.
4. Self-heal (recommended): in the checkout consumable draw, if (item,chosenHub) has no inventory_stock row but InventoryItem.quantity covers it, setStockAtHub from the legacy total before drawFromHub. Preserve the MH-1 dual-write (do not double-decrement).

Per CLAUDE.md: make db-generate; make db-migrate (if you add a backfill migration). Verify tsc 0, eslint 0, vitest green (esp. consumable-scoping). Manually on staging: an operator launches a deployment with a consumable, and admin Inventory Available matches the picker. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.
```

> Note: `User.homeHubId` may not exist yet (Users page shows Home Hub "—" for all). If there's no home-hub field, default the Select to the first/only hub and skip the home-hub default — do NOT add a schema field in this hotfix (that's a separate S5 item).

---

## HOTFIX-2 (P1) — Fix the hydration mismatch that breaks Sign Out (S7 + S8)

**Why:** clicking Sign Out on the operator dashboard does nothing and leaves the session intact. Console shows **React #418 (hydration mismatch)**; when hydration fails, React doesn't attach client event handlers, so Sign Out's onClick never fires. Source: `src/app/(operator)/operator/dashboard/page.tsx` lines 19–20 — `getGreeting()` (`new Date().getHours()`, server-UTC vs client-local), `new Date().toLocaleDateString(...)` (server vs client tz/locale), and `user?.name` (undefined during SSR, stale/cached on the client via SWR → also S7's "Ops" stale name).

```
HOTFIX-2 (P1) on AHITS: fix the React hydration mismatch (#418) on the operator dashboard that breaks Sign Out (S7 + S8). Spec: AHITS_FEEDBACK_FINDINGS_REGISTER.md (S7/S8 root cause). Small, standalone. tsc/lint clean.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-hotfix-dashboard-hydration"

1. src/app/(operator)/operator/dashboard/page.tsx: the greeting + date (lines ~19–20) render differently on server vs client (timezone-dependent getGreeting()/toLocaleDateString, and SWR user.name undefined-on-SSR). Gate them behind a mounted flag so the server renders a stable placeholder and the client fills in after mount:
     const [mounted, setMounted] = React.useState(false)
     React.useEffect(() => setMounted(true), [])
   Render: `Good {mounted ? getGreeting() : ''}{mounted && user?.name ? `, ${user.name.split(' ')[0]}` : ''}` and only render the date line when mounted. (Or render a static "Welcome" on the server and the time-aware greeting after mount.) Result: no server/client text mismatch → no #418 → Sign Out works.
2. Sweep for the same class of bug: grep client components for `new Date(`, `toLocaleDateString`, `toLocaleString`, `Date.now(`, `Math.random(` rendered directly into JSX text without a mount guard (likely candidates: any dashboard/list header that prints "today"/relative times). Apply the same mount-gate or suppressHydrationWarning where a value is intentionally client-only. Do not over-reach — fix confirmed render-time mismatches only.
3. Verify: load /operator/dashboard, confirm NO "#418"/"hydration" error in the browser console, and that Sign Out now redirects to /login AND clears the session (GET /api/auth/me returns 401 after). Also confirm the greeting shows the CURRENT user's name (not the previous user's — closes S7).

No migration. Verify tsc 0, eslint 0. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.
```

---

## Hand-off order
Ship **HOTFIX-1** and **HOTFIX-2** as two separate PRs (any order — independent). Both should land + smoke-pass on staging before the first `development → production` promotion. After these, proceed to the **Requests cluster** (F5/F6, F1, F4, F7) per `AHITS_SESSION11_REVISED_WORKPLAN_AND_PROMOTION.md`.
