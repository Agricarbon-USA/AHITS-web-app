# AHITS — F9 CC Script: category-grouped checklists (pickers + admin tables)

_Prepared 2026-06-25. Pure presentation — no schema/migration, no API change. Groups the flat item/vehicle lists by category/type with subheaders so they read as an organized checklist the user works through. Confirmed live: Build Rig + Build Kit + admin Inventory/Vehicles are flat alphabetical lists today; category/type is only a chip._

```
Build F9 (category-grouped checklists) on AHITS. Presentation-only — NO schema/migration/API change. Specs: AHITS_FEEDBACK_FINDINGS_REGISTER.md (F9). tsc/lint clean.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-f9-grouped-checklists"

Goal: every item/vehicle picker and the admin inventory/vehicle tables are GROUPED by category (items) / type (vehicles) with a subheader per group, items sorted within each group. Selection state stays keyed by id (unchanged) — only the rendering changes. Keep it a checklist: the user scrolls through organized sections and checks items off.

1. Shared helper: add a small groupBy util (lib/utils.ts or a local helper) that takes a list + a key-getter and returns ordered [{ group, items }], groups sorted alphabetically (with a stable order for known categories if one exists), items sorted by name within each group.

2. Operator my-rig (src/app/(operator)/operator/my-rig/page.tsx):
   - NewDeploymentDialog → "Build Rig" step: group the vehicle list by vehicle.type (e.g. "TRUCK", "TRAILER", "POLARIS_UTV"…) under subheaders; render each group's vehicles as the existing selectable rows. Keep the selected-vehicle Set keyed by id.
   - NewDeploymentDialog → "Build Kit" step: group the inventory list by category (use the category display name already shown as the chip — categoryDisplay/categoryRef.name). Subheader per category; keep the per-item qty/unit controls and the selected Map keyed by id. The source-hub selector + per-hub availability (HOTFIX-1) stay exactly as-is.
   - The "Add Items" dialog: same category grouping for its picker.
   - Use MUI ListSubheader (or a styled Typography subheader) + keep rows ≥44px touch targets.

3. Admin Inventory (src/app/(admin)/admin/inventory/page.tsx): add a "Group by category" view — section the table by category with a category subheader row (collapsible optional). Keep the existing filters/pagination working within the grouping (or default the grouping on, filters still apply). Don't remove the category column/filter.

4. Admin Vehicles (src/app/(admin)/admin/vehicles/page.tsx): same — group the table by vehicle type with a subheader, keeping the Type/Status/Hub filters + sortable columns working. (If grouping conflicts with column sort, make "Group by type" a toggle, default on.)

5. Empty/edge: a category/type with no items after filtering shows no subheader (don't render empty groups). Items with no category fall under an "Uncategorized" group last.

Verify: tsc 0, eslint 0. Manually on staging: Start Deployment → Build Rig shows vehicles grouped by type, Build Kit shows items grouped by category, selection still works and qty/hub controls unchanged; admin Inventory + Vehicles show grouped sections with filters still functional. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.

NOTE (post-A2): no migration in this slice.
```
