# AHITS — F8 CC Script: Project filters (derive from active deployment)

_Prepared 2026-06-25. Decision (Max): for Vehicles & Personnel, **derive** the project from the active deployment — no new FK/membership table, no migration. Deployments already carry projects via the `#29 deployment_projects` M2M; Inventory's existing filter must be rewired off legacy `Rig.projectId` onto `deployment_projects` (required before #29's contract slice drops that column)._

## How "project" is derived (no schema change)
- **Deployment (rig/kit):** its projects = `deployment_projects` rows (removedAt IS NULL) — the #29 M2M. (Already the source of truth.)
- **Vehicle:** its active project(s) = projects of the active rig(s) it's on → `rig_vehicles` → `rigs` (endedAt IS NULL) → `deployment_projects`.
- **Operator (personnel):** their active project(s) = projects of the active deployment(s) they're assigned to → `deployment_assignments` (endedAt IS NULL) → `deployment_projects`.
- **Inventory item:** its active project(s) = projects of the active deployment(s) it's checked out on → `kit_items` (removedAt IS NULL) → `kits` → `rigs` (endedAt IS NULL) → `deployment_projects`.

```
Build F8 (project filters, derive-from-active-deployment) on AHITS. Decision: derive, no new FK/migration. Specs: AHITS_F8_SCRIPT.md + AHITS_FEEDBACK_FINDINGS_REGISTER.md (F8). tsc/lint/vitest clean.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-f8-project-filters"

1. Derive helpers (lib/deployment-assignments.ts or a new lib/project-associations.ts, raw SQL via deployment_projects — NO use of legacy Rig.projectId):
   - getActiveProjectsForVehicles(vehicleIds): Map<vehicleId, {id,name}[]> — JOIN rig_vehicles → rigs(endedAt IS NULL) → deployment_projects(removedAt IS NULL) → projects.
   - getActiveProjectsForOperators(operatorIds): Map<operatorId, {id,name}[]> — JOIN deployment_assignments(endedAt IS NULL) → deployment_projects → projects.
   - getActiveProjectsForItems(itemIds): Map<itemId, {id,name}[]> — JOIN kit_items(removedAt IS NULL) → kits → rigs(endedAt IS NULL) → deployment_projects → projects.
   - (Deployments already expose projects via the #29 reader; reuse it.)

2. Vehicles (src/app/api/vehicles/route.ts + admin/vehicles/page.tsx): merge each vehicle's active projects (getActiveProjectsForVehicles) into the GET payload (like the hub/operator merge already there). Add a "Project" filter dropdown (GET /api/projects) + show project chip(s) in the row/detail. Client-side filter on the derived projects (small fleet).

3. Deployments (admin/deployments/page.tsx): add a "Project" filter dropdown. The deployments GET already sources projects from deployment_projects (#29) — confirm and filter on it. (If the API needs a ?projectId, it already supports one; wire the control.)

4. Personnel / Team (admin/users/page.tsx + the users GET): merge getActiveProjectsForOperators into the row, show the operator's active project chip(s), add a "Project" filter. (Operators only; admins show none.)

5. Inventory (src/app/api/inventory + admin/inventory/page.tsx): the existing "Project" filter currently keys off legacy Rig.projectId — REWIRE it to getActiveProjectsForItems (deployment_projects). This is required before #29's contract slice drops Rig.projectId, or the filter silently breaks. Behaviour unchanged for the user; source changes.

6. Consistency: all four surfaces present the project filter the same way (a "Project" dropdown of active projects) and render project as a StatusChip-style chip, so they match.

Verify: tsc 0, eslint 0, vitest green. Manually on staging: create/confirm a deployment on a project with a vehicle + a checked-out item + an operator → that vehicle (Vehicles), item (Inventory), operator (Team), and deployment (Deployments) all filter correctly by that project; ending the deployment removes the association. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.

NOTE (post-A2): no migration in this slice — pure derive + UI.
```

## Why this is the tidy choice
- **No schema churn:** vehicles/operators get their project "for free" from the live deployment graph, which is the real-world truth (a vehicle's project IS whatever deployment it's on right now).
- **Retires a #29 landmine:** rewiring Inventory's filter off `Rig.projectId` onto `deployment_projects` is a prerequisite for the eventual #29 contract slice (slice 4) that drops the legacy column. Doing it here means slice 4 won't silently break the inventory project filter.
- **A direct FK can be added later** only if you ever need a project assignment that exists independent of a live deployment (e.g. "this truck is reserved for Project X next month"). Not needed now.
