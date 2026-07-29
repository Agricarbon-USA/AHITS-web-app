# AHITS — CC-34 · Maintenance Speaks (paste-ready packet)

> STATUS: canonical (queued packet) · UPDATED: 2026-07-29
> READ-WITH: `AHITS_CC29-31_PILOT_FLOOR_PACKETS.md` (the queue) · `DECISIONS.md` (D24; D29 is appended BY the executing session — full text in the header below)
> Produced by the 2026-07-29 maintenance interrogation (Integration+Operator-lens agent over fresh development) + Max's owner interview. **Slots after CC-33** (shared files: my-deployment, scan page). One packet, one Claude Code session, three PRs.

## The findings this closes (from the interrogation)

1. A failed daily check is a dead end — alert only; no task, no flip; the operator's notes + photos strand on the check.
2. No operator path to report damage on a kit item without REMOVING it from the kit; the vehicle path is online-only and photo-less.
3. The admin deployment drawer fetches vehicle + unit statuses and renders NEITHER; no open-task badges. (R3 fails for want of rendering data already on the wire.)
4. Tasks have no deployment identity (no rigId) and no reporter.
5. Three server branches flip status with NO task and/or NO alert — invisible damage.
6. Scheduled maintenance is UNCREATABLE (POST /api/maintenance has zero UI callers); a task created without an explicit date never goes overdue; PER_DEPLOYMENT never fires.
7. Damage tasks can never go "overdue" (cron scans scheduled-only); shop-portal updates are bell-only (miss one → repair idles forever).
8. Operators never see the repair state of their own gear.

## CC-34 · Maintenance speaks (post-CC-33)

**Review seats:** Integration (primary — every item is a checks↔maintenance↔alerts↔deployments seam) · Operator-lens (PR-2 flow + copy) · Antagonist (mandatory sign-off on PR-2's offline paths — both report routes must survive airplane mode).
**Provenance:** Max's 2026-07-28 complaint ("clunky, not actively speaking across operators, admin, and deployments") + the 2026-07-29 maintenance-seat interrogation + Max's interview answers, recorded as **D29** (full text below — the executing session APPENDS it to DECISIONS.md at close; it does not exist yet). Builds on D24 (mounted units = named tasks on the carrier vehicle — PR-3a is how those rows finally become enterable).
**Sequencing:** AFTER CC-33. Three PRs, in order. Shared files with CC-33's PR-2 (my-deployment/page.tsx, scan/page.tsx, DeploymentCards.tsx) — rebase on CC-33's merged state first; all line refs verified against 2026-07-29 development pre-CC-33: treat as anchors to re-locate, re-grep each before editing, report drift in the PR body.

**D29 · Maintenance speaks — one report verb, admin triage, schedules are the value center** (append verbatim, dated 2026-07-29, Owner: Max, Status: ACTIVE):
> (1) **Field reality:** breakage is RARE and severity-varied — small stuff is field-patched and logged; revenue-critical (instrument) damage triggers a phone call to Max. Routine service discipline is the REAL value; scheduled-maintenance UI outranks damage-flow polish. (2) **One operator verb — "Report a problem"**: what + photo + note, admin triages. PLUS an optional operator self-triage toggle: "Still usable" (default — gear STAYS in the kit, annotated in place) / "Out of service" (status flips). "Log fixed issue" (field-fix) stays as the already-patched path and finally gets its item/unit mounts. The four-vocabulary problem (Condition / ReturnCondition / canBeFixed / status enums) collapses at the UI only — DB enums untouched. (3) **Shop portal DEPRIORITIZED** — "we're not currently pushing anything to repair shops." No new portal investment; send-to-shop kept as-is; admin manual status updates ≤2 clicks; the close dialog gains the flexible return destination (DEPLOYMENT — which the API already supports — plus hub): "equipment can return wherever needed." (4) **Schedules are calendar/mileage only**; PER_DEPLOYMENT is CUT from the form (mechanics stay dormant in schema). **Revisit triggers:** a real use-based cadence demand ("service every N deployments" actually asked for), or a shop starts genuinely working the emailed portal.

```
CC-34 · MAINTENANCE SPEAKS — make checks, damage, repairs, alerts, and deployments one conversation.
Follow CLAUDE.md and AGENTS.md exactly (modified Next.js — read node_modules/next/dist/docs/ first).
Feature branch per PR, full verify gate each: make db-generate && npx tsc --noEmit && npx eslint src &&
npm test && npm run test:ui. Tag every change `// CC-34 (<item>)` — session-close greps key off these.
Evening deploys only; Max smokes each PR on staging before any merge go.

════════ SCOPE GUARD — read twice ════════
- DB ENUMS UNTOUCHED. No new EquipmentStatus / VehicleStatus / MaintenanceStatus / AlertType values.
  The ONLY schema change in this packet is PR-1b's single additive-nullable-column migration on
  maintenance_tasks (migration-safety compliant, scripts/check-migration-safety.sh, flagged in the PR body).
- SHOP PORTAL: no new features beyond PR-3e's one alert. src/app/s/[token]/** and api/s/** are otherwise
  UNTOUCHED (CC-16S owns their hardening; D29-3 deprioritizes the portal). send-to-shop stays as-is.
- DispositionDialog.tsx and the removal/end UI flows are BYTE-UNTOUCHED — removal stays the swap/return
  path. PR-1c edits only the named SERVER branches (adds tasks/alerts inside existing branches).
- PER_DEPLOYMENT stays in prisma/schema.prisma:126 and the zod enum (api/maintenance/route.ts:53) —
  dormant. It is removed from the NEW form only (PR-3a). Parked per D29-4 with its revisit trigger.
- No offline-queue-engine edits (CC-29 owns useOfflineQueue.ts internals — PR-2 only CALLS mutate()).
  No glossary re-litigation (D11/CC-32). No dead-code sweeps (CC-33). Daily-check date semantics (D26)
  untouched. prisma/seed.ts untouched.
- Every PR to `development`; never merge without Max's explicit go after his staging smoke.

════════ PR-1 · "THE DEPLOYMENT DRAWER TELLS THE TRUTH" (R3 + orphan closure) ════════

──── 1a · Render the health that is already fetched ────
Closes: the admin deployment drawer fetches vehicle.status and inventoryUnit.status and renders NEITHER —
an IN_MAINTENANCE truck or unit looks healthy on the one surface Max plans deployments from.
Files: src/app/(admin)/admin/deployments/page.tsx (+ one small server addition, below).
- Vehicle rows (:784-814, currently Rental/Agreement/type chips only): add
  <StatusChip status={rv.vehicle.status} kind="vehicle" /> — but ONLY when status !== 'ACTIVE' (a wall of
  green "Active" chips is noise; absence = healthy). The interface at :96/:118 already carries status.
- Kit rows (:843-870, currently name + S/N + category chip): same rule with
  ki.inventoryUnit.status (interface :66) and kind="equipment", shown when not AVAILABLE/CHECKED_OUT.
- Open-task badge: ONE query for the drawer — extend the deployment detail read the drawer already makes
  with openTasks: maintenanceTask.findMany({ where: { deletedAt: null, status: { not: 'COMPLETED' },
  OR: [{ vehicleId: { in: rigVehicleIds } }, { inventoryUnitId: { in: rigUnitIds } }] },
  select: id, taskName, status, isDamageReport, vehicleId, inventoryUnitId }). Per matching row render a
  small warning chip ("Damage" red / "Service due" amber) that router.push()es
  /admin/maintenance?task=<id> — the deep-link auto-open already exists (maintenance/page.tsx:233-239).
ACCEPTANCE: grep -n "kind=\"vehicle\"" src/app/\(admin\)/admin/deployments/page.tsx AND
grep -n "openTasks" (page + the route it reads). SMOKE (Max, laptop): report damage on a deployed
vehicle from a phone → open the deployment drawer → the vehicle row shows "In Maintenance" + a red
Damage chip; click it → lands on the exact task on /admin/maintenance.

──── 1b · Tasks learn which deployment they came from ────
Closes: MaintenanceTask has no rig link (prisma/schema.prisma:629-682) — damage loses its deployment the
moment the task is created; "Rig / reported by" is unanswerable on /admin/maintenance.
Files: prisma/schema.prisma, ONE new migration, src/app/api/deployments/[id]/{items,end}/route.ts,
src/app/api/maintenance/route.ts (GET include), src/app/(admin)/admin/maintenance/page.tsx.
- Migration: ONE additive migration adding TWO nullable scalar columns to maintenance_tasks — "rigId"
  and "reportedById" (both indexed, no backfill, raw-SQL-tolerant scalar FKs per the house pattern —
  no @relation needed). reportedById rides along because "reported by" has no home today (the alert
  metadata operatorId at items/route.ts:465-468 dies with the alert). Flag both in the PR body.
- Populate at every deployment-scoped creator: the damage-task creates at items/route.ts:447-464 and
  end/route.ts:224-241 set rigId: id / rigId of the ending rig, reportedById: session.userId. The
  PR-2 routes set them too (named there). review-inoperable and admin field-fix leave them null (no
  rig context) — that is correct, not a gap.
- /admin/maintenance: GET include gains rig (label) + reporter name; the table (page.tsx:480-530)
  gains one combined "Reported" cell (reporter · rig label · date) replacing the bare date at :522.
ACCEPTANCE: grep -n "rigId" prisma/schema.prisma (inside model MaintenanceTask) AND
grep -n "reportedById" src/app/api/deployments/\[id\]/items/route.ts. SMOKE: covered by 1a's smoke —
the task drawer must now say who reported it and from which deployment.

──── 1c · Orphan closure: no more flip-without-task ────
Closes: three server branches change asset status with NO task and/or NO alert — damage that never
reaches /admin/maintenance or the bell (R1's "clearly express WHAT is damaged" currently lies by omission).
Files: src/app/api/deployments/[id]/items/[kitItemId]/route.ts, src/app/api/deployments/[id]/vehicles/
route.ts, src/app/api/deployments/[id]/{items,end}/route.ts, src/app/api/inventory/[id]/review-inoperable/
route.ts.
- Scan-return conditions (items/[kitItemId]/route.ts:59-63 status mapping, :88-92 serialized flip): when
  returnCondition === 'IN_MAINTENANCE' → inside the same transaction, create the damage task (unit-linked,
  isDamageReport, IN_PROGRESS, rigId+reportedById per 1b, notes from body.data.notes) + DAMAGE_REPORTED
  alert — mirror items/route.ts:416-479, which is the correct existing shape. When 'INOPERABLE' → keep
  the flip (review-queue semantics) but raise createAlert('DAMAGE_REPORTED','inventory_units',unitId,…)
  so the bell rings before someone happens to open the maintenance page.
- Vehicle-removal "Send to Maintenance" (vehicles/route.ts:189-198): flipping to IN_MAINTENANCE now also
  creates the vehicle damage task + alert — mirror api/vehicles/[id]/report-damage/route.ts:37-58,
  with the removal note as task notes and rigId of the rig it was removed from.
- canBeFixed=false branches (items/route.ts:480-506 AND its end/route.ts sibling ~:264-280): add the
  missing createAlert('DAMAGE_REPORTED','inventory_units',targetUnit.id,…,tx). In review-inoperable/
  route.ts, BOTH decisions (RETIRE and REPAIR) call resolveActiveAlert('DAMAGE_REPORTED',
  'inventory_units',unitId) — triage clears the bell.
- Antagonist check: createAlert takes the tx client (lib/alerts.ts:34) — pass it everywhere here.
ACCEPTANCE: grep -n "DAMAGE_REPORTED" src/app/api/deployments/\[id\]/items/\[kitItemId\]/route.ts
src/app/api/deployments/\[id\]/vehicles/route.ts AND grep -n "resolveActiveAlert"
src/app/api/inventory/\[id\]/review-inoperable/route.ts. SMOKE (Max, phone+laptop): scan-return a unit
as "Needs maintenance" → within a minute the bell shows Damage reported and the unit appears on
/admin/maintenance with a task. Mark one "Inoperable / can't be fixed" → bell rings; Retire it →
that alert clears itself.
- Tests: extend tests/check-log-condition.test.ts (or a new tests/cc34-orphan-closure.test.ts, node
  suite): each branch above asserts task-created / alert-raised / alert-resolved.

════════ PR-2 · "ONE WAY TO REPORT A PROBLEM" (R2 + the check dead-end) ════════
Required PR-body FRICTION LINE: reporting a problem on a unit = scan it (or find its my-deployment row)
+ 3 taps + a photo. State this against BOTH old paths: the only unit path was remove-from-kit via
DispositionDialog (~8 taps, framed as removal, gear leaves the kit); the vehicle path was 4 taps,
online-only, photo-less. A required interaction that removes nothing does not ship.

──── 2a · ReportProblemDialog — the one verb ────
Files: NEW src/components/shared/ReportProblemDialog.tsx; mounts in src/app/(operator)/operator/scan/
page.tsx and src/components/operator/DeploymentCards.tsx; NEW src/app/api/inventory/units/[unitId]/
report-problem/route.ts; src/app/api/vehicles/[id]/report-damage/route.ts.
- Dialog fields: "What happened" (required) · PhotoCapture (≥1 required — the §11.10 damage-photo rule
  DispositionDialog already enforces at :119,:294-301) · self-triage toggle, two options with honest
  helper copy: "Still usable" (DEFAULT — "Stays in your kit. An admin will follow up.") / "Out of
  service" ("Marked unusable until repaired."). No condition dropdowns, no fixable question — D29-2:
  the four vocabularies collapse here; admin triages severity.
- Mounts: (i) unit scan panel — scan/page.tsx:264-339 currently has NO damage affordance; add the button
  to the action stack at :311-336. (ii) vehicle scan panel — REPLACE the bespoke report-damage dialog
  (:389-396 button, :448-479 dialog) with this shared one; delete the old dialog + its submit fn
  (:135-159). (iii) my-deployment kit AND vehicle rows — mount inside DeploymentCards.tsx (rows at
  :79-82 vehicles, :151-157 items), NOT in my-deployment/page.tsx. ANTI-REGROWTH RULE: my-deployment/
  page.tsx net lines DOWN or flat; state the count in the PR body.
- Server, unit route (NEW, sibling of the vehicle one): requireAuth; withIdempotency; transaction:
  create task (isDamageReport, status IN_PROGRESS, itemId+inventoryUnitId, rigId+reportedById when the
  unit sits in the caller's active rig kit — resolve via kitItem lookup), DAMAGE_REPORTED alert (tx),
  photos via filterAllowedPhotoUrls → Photo rows (context DAMAGE, maintenanceId). Toggle: stillUsable
  (default true) → NO status flip, unit stays CHECKED_OUT in the kit; outOfService → unit →
  IN_MAINTENANCE. NEVER remove the kit item — this is annotation, not return.
- Server, vehicle route: extend report-damage/route.ts to accept photoUrls + the same toggle
  (stillUsable → skip the IN_MAINTENANCE flip at :37) and wrap in withIdempotency (it is currently
  replay-unsafe). Keep the alert + task exactly as-is otherwise.
- BOTH submits go through useOfflineQueue's mutate() (the current vehicle path is a raw online-only
  fetch, scan/page.tsx:139-143 — the one flow that by definition happens in the field). queued:true
  → the honest "saved on this phone, will sync" toast. Antagonist seat: verify localphoto refs ride
  the queue and CC-29's photo-wedge semantics hold for this new photo-bearing write.
ACCEPTANCE: grep -rn "ReportProblemDialog" src → the new file + ≥4 mounts AND
grep -n "withIdempotency" src/app/api/vehicles/\[id\]/report-damage/route.ts
src/app/api/inventory/units/\[unitId\]/report-problem/route.ts. SMOKE (Max, phone, AIRPLANE MODE):
scan a unit → Report a problem → photo + note → submit offline → reconnect → task + photo + bell
appear; the unit is STILL in the operator's kit. Repeat with "Out of service" → unit shows In
Maintenance on scan.

──── 2b · Field-fix finally reaches items ────
Files: scan/page.tsx, src/app/(admin)/admin/maintenance/page.tsx.
The API has accepted itemId/inventoryUnitId since CC-10 (field-fix/route.ts:8-10) but every mount is
vehicle-only. Add "Log fixed issue" to the unit scan panel (sends inventoryUnitId + itemId), and give
the admin Log-field-fix dialog (maintenance/page.tsx:702-745) a subject picker (vehicle OR item/unit).
Route the scan-page submit through mutate() while you are in the file (it is a raw fetch at :116).
ACCEPTANCE: grep -n "inventoryUnitId" src/app/\(operator\)/operator/scan/page.tsx (in the field-fix
payload). SMOKE: scan a unit → Log fixed issue → it appears under /admin/maintenance Completed tab.

──── 2c · Check→task promotion (manual, admin triage — never automatic) ────
Closes: a failed daily check is a dead end — DAILY_CHECK_FAILED alert only, no task, and the admin
re-types the operator's notes into a separate damage report (api/daily-check/route.ts:238-254; the
check's photos stay stranded on the check).
Files: NEW src/app/api/daily-check/[id]/open-task/route.ts, src/components/admin/DailyCheckViewer.tsx.
- Route (admin-only, withIdempotency): from check id → create damage task on check.vehicleId with
  notes = check.issues + each failing item's "label: note" line; RE-LINK the check's photos by setting
  Photo.maintenanceId (KEEP dailyCheckId — one photo, two contexts); rigId from the vehicle's active
  RigVehicle if any; reportedById = check.operatorId. Body flag flipVehicle: true → vehicle
  IN_MAINTENANCE. Then resolveActiveAlert('DAILY_CHECK_FAILED','vehicles',vehicleId) — triaged is
  resolved; the task is the live object now (do NOT also raise DAMAGE_REPORTED — the admin is looking
  at it; one object, one bell thread).
- UI: in DailyCheckViewer, on a failing check, one button "Open repair task from this check" (+
  "take the vehicle out of service" checkbox) → success routes to /admin/maintenance?task=<id>.
  The DAILY_CHECK_FAILED alert already deep-links to the check (CC-26 path), so the full chain is:
  bell → check → one click → task. Two clicks total from the bell — state it.
ACCEPTANCE: grep -n "open-task" src/components/admin/DailyCheckViewer.tsx AND
ls src/app/api/daily-check/\[id\]/open-task/route.ts. SMOKE (Max): fail a check with a photo on a
phone → bell → open the check → Open repair task → the task carries the operator's words and photo;
the failed-check alert is gone; the task is on the Damage tab.

════════ PR-3 · "SCHEDULES BECOME REAL" (the value center — D29-1) ════════

──── 3a · The Add-scheduled-task dialog ────
Closes: POST /api/maintenance (route.ts:62-76) has ZERO UI callers — D24's named Wintex/Giddings
schedules literally cannot be entered; and a task created without an explicit nextDue NEVER goes
overdue (nextDue optional at route.ts:56; the cron scan requires nextDue < now, cron/dispatch:93).
Files: src/app/(admin)/admin/maintenance/page.tsx, src/app/api/maintenance/route.ts.
- "Add scheduled task" button beside "Log field fix" (:437-444) → dialog: subject picker (vehicle OR
  inventory item — SearchableSelect over /api/vehicles + /api/inventory), taskName (free text — this
  is where "Wintex: hydraulic service" lives, the D24 bridge), intervalType limited to
  MILEAGE / DAYS / MONTHS — PER_DEPLOYMENT is NOT offered (D29-4; the zod enum keeps it, dormant),
  intervalValue, priority, optional first-due date / next-odometer.
- SERVER (route.ts POST): when nextDue is omitted for DAYS/MONTHS, default it to
  nextDueFromInterval(intervalType, intervalValue, now) (lib/maintenance.ts:18-27); when nextOdometer
  is omitted for MILEAGE and the subject vehicle has an odometer, default vehicle.odometer +
  intervalValue. A schedulable task must never be born unschedulable — say so in a comment.
ACCEPTANCE: grep -n "Add scheduled task" src/app/\(admin\)/admin/maintenance/page.tsx AND
grep -n "nextDueFromInterval" src/app/api/maintenance/route.ts. SMOKE (Max): create "Wintex: hyd oil
check — every 90 days" on the Can-Am carrier from the UI in under a minute; it shows Upcoming with a
real due date; create one dated last week on staging → next cron run flags it Overdue + bell.

──── 3b · Damage tasks can go stale ────
Closes: the overdue cron scans isDamageReport:false ONLY (cron/dispatch:91) — a forgotten damage
repair idles IN_PROGRESS forever with no nag.
Files: src/app/api/cron/dispatch/route.ts, src/lib/notifications.ts.
After the overdue scan (:85-105): damage tasks (isDamageReport true, status not COMPLETED, deletedAt
null) with updatedAt < now − 7d → createAlert('MAINTENANCE_OVERDUE','maintenance_tasks',t.id,
{ taskName, itemName, staleDamageDays: N }) — REUSING the existing type (no AlertType enum change);
activeKey dedup can't collide (damage tasks never get the calendar arm). presentAlert
(notifications.ts:29): when meta.staleDamageDays is set, message reads "<task> has been open N days
without progress." Self-clears via the complete route's existing alert resolution; any task edit
bumps updatedAt and re-arms the 7-day clock (state this in a comment — desired behavior).
ACCEPTANCE: grep -n "staleDamageDays" src/app/api/cron/dispatch/route.ts src/lib/notifications.ts.

──── 3c · Two-click shop status + flexible return destination ────
Files: src/app/(admin)/admin/maintenance/page.tsx.
- D29-3 "≤2 clicks": in the drawer's repair-details block, add one-tap chips that PATCH immediately
  via the existing patch() helper (:278-303): "Delivered to shop today" (dateDelivered=now) and
  "Repair started" where Start repair isn't already showing. No new endpoints.
- Close dialog (:747-786, currently hub-only): add a destination-type select — "Return to hub" (as
  now) / "Return to a deployment" (active rigs from /api/deployments, label + primary operator).
  Submit passes returnDestinationType 'DEPLOYMENT' + rig id — the complete route ALREADY validates
  and stores it; this is pure UI unlock. Copy stays honest: the unit flips AVAILABLE either way;
  physically getting it there is the human step.
ACCEPTANCE: grep -n "DEPLOYMENT" src/app/\(admin\)/admin/maintenance/page.tsx (in the close dialog).
SMOKE (Max): close a unit repair back to an active deployment in ≤3 clicks from the drawer.

──── 3d · Operators see their own gear's repair state ────
Closes: an operator whose auger went to repair sees NOTHING anywhere (operator-today.ts:22-40 doesn't
even select vehicle.status; DeploymentCards.tsx:151-157 renders no unit status).
Files: src/app/api/maintenance/route.ts, src/components/operator/DeploymentCards.tsx,
src/app/(operator)/operator/my-deployment/page.tsx (fetch only — anti-regrowth rule from 2a holds).
- GET /api/maintenance gains a ?rigId= where-arm (PR-1b's column makes this a one-line filter). It is
  already operator-readable with costs stripped (route.ts:38-44) — no auth change.
- My-deployment fetches open tasks for the active rig once; DeploymentCards rows render the same
  non-healthy-only StatusChips as PR-1a plus a one-line caption on affected rows: "In repair —
  <task status>". Read-only. No operator actions on tasks.
ACCEPTANCE: grep -n "rigId" src/app/api/maintenance/route.ts AND grep -n "In repair"
src/components/operator/DeploymentCards.tsx. SMOKE (Max, phone): after 2a's out-of-service report,
My Deployment shows the item with "In Maintenance · In repair — In Progress"; after the admin closes
it, the caption is gone on next refresh.

──── 3e · Shop "completed" becomes a real alert (keeps the existing portal honest — nothing more) ────
Closes: WORK_ORDER portal COMPLETED is bell-rows-only via notifyAdmins (status-links.ts:285-292) — no
email, no Active-Alerts presence, no dedup; one scrolled-past bell strands the task IN_PROGRESS.
Files: src/lib/status-links.ts.
In the COMPLETED branch only: replace the direct notifyAdmins call with
resolveActiveAlert('DAMAGE_REPORTED','maintenance_tasks',taskId) then createAlert('DAMAGE_REPORTED',
'maintenance_tasks',taskId,{ phase:'READY_TO_FINALIZE', shop: actorLabel }) — the fresh row has
notifiedAt null so the dispatcher bells + emails it once, deduped; presentAlert renders "Repair
completed by <shop> — review and finalize in Maintenance" when phase is set. RECEIVED/IN_PROGRESS/
INVOICED keep their bell-only notifyAdmins (portal is deprioritized — do not gold-plate). The alert
self-resolves when the admin completes the task (existing complete-route updateMany).
ACCEPTANCE: grep -n "READY_TO_FINALIZE" src/lib/status-links.ts src/lib/notifications.ts.
- Tests (node suite, NEW tests/cc34-schedules-and-alerts.test.ts): POST /api/maintenance without
  nextDue → nextDue = now+interval; cron stale-damage arm raises once (deduped) and complete resolves;
  WORK_ORDER COMPLETED transition yields exactly one unresolved READY_TO_FINALIZE alert.

════════ MERGE GATES ════════
Per PR: verify gate green + every ACCEPTANCE grep in the PR body + Max's staging smoke before the
merge go. PR-2 additionally requires: the friction line (taps stated vs both old paths), the
Antagonist seat's explicit sign-off that both report routes are offline-safe (airplane-mode smoke
performed), and the my-deployment net-line count. PR-1's migration runs the migration-safety script
and states the two-column addition in the body. Evening deploys only.

════════ SESSION CLOSE (7-step per STATUS.md) ════════
1-2. STATUS §1: "CC-34 maintenance speaks MERGED (PR-1 #…, PR-2 #…, PR-3 #…) — deployment drawer
shows equipment health (R3), one operator report verb + check→task promotion (R2), scheduled-task
create UI live (D24 bridge), orphan flips closed, stale-damage nag on". §3/§4 next actions updated.
3. DECISIONS.md: APPEND D29 exactly as given in the packet header (it does not exist yet — this
session writes it). Add one note line to D24: "The named Wintex/Giddings schedule rows are enterable
via CC-34 PR-3a — the template bridge's other half." Do not otherwise edit D24.
4. AHITS_CLAUDE_CODE_INSTRUCTIONS.md ledger: add the CC-34 row (3 PRs, D29 recorded, PER_DEPLOYMENT
UI parked with trigger).
5. Handoff doc AHITS_SESSION_HANDOFF_<date>_CC34.md — include anything CC-33's rebase moved.
6. Commit/push + git ls-files sanity (no stray files; migration checked in).
7. Step-7 grep anchors, re-verify each at close: "openTasks" · "reportedById" (items route) ·
"resolveActiveAlert" in review-inoperable · "ReportProblemDialog" (≥4 mounts) · "withIdempotency" in
report-damage · "open-task" route present · "Add scheduled task" · "nextDueFromInterval" in the POST ·
"staleDamageDays" · close-dialog "DEPLOYMENT" · "In repair" in DeploymentCards · "READY_TO_FINALIZE" ·
PER_DEPLOYMENT still in schema.prisma AND still absent from the new dialog's options.
```
