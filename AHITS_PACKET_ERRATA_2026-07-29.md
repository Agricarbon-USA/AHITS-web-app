# AHITS — Packet Errata & Hardening Rider · 2026-07-29

> STATUS: canonical (paste-along rider) · Produced by the full six-seat pre-execution review (Calibration, Antagonist, Integration, Operator-lens, SRE, Fable) run against TRUE current development (`844c682`, post all 16 of 2026-07-28's merged PRs).
> **HOW TO USE: paste the relevant section of this file TOGETHER WITH its packet.** The rider supersedes the packet text wherever they disagree. Execution order CONFIRMED: **CC-16S → CC-33 → CC-34** (Fable seat: CC-33's flow renames get cheaper the earlier they land in a rolling start; CC-34 hard-requires the post-CC-33 rebase).

---

## RIDER A — paste with CC-16S

1. **SCOPE AMENDMENT — the warmup the scope guard would otherwise forbid.** In addition to the two portal files, this session is explicitly authorized ONE warmup commit + test:

```
──── ITEM 0 · WARM-UP: STEP-7 STALE-HOLD RELEASE HAS NEVER RUN (P0-adjacent) ────
Closes: cron step 7 throws 42883 on EVERY pass — Prisma binds ${holdTtlHours} as bigint and
make_interval(hours => bigint) does not exist (the exact trap lib/deployment-requests.ts:952
already dodges) — and the bare catch (cron/dispatch/route.ts:264-266) swallows it as "held
columns missing". Unclaimed holds have NEVER expired; hub reserve freezes forever, silently.
Files: src/app/api/cron/dispatch/route.ts only.
- Replace the make_interval predicate (:242) with the :952 house pattern: const holdCutoff =
  new Date(Date.now() - holdTtlHours * 3_600_000); predicate AND r."fulfilledAt" < ${holdCutoff}.
  Keep the :229-230 integer guard.
- Un-silence the catch per CC-30's pattern: console.error('[cron] stale-hold release errored',
  err) + Sentry.captureException(err) — still non-fatal to the run.
- ⚠ DEPLOY GUARD (SRE): release has silently no-op'd for weeks — the first fixed run releases
  EVERY accumulated stale hold and notifies each affected operator. PRE-MERGE: run the step-7
  SELECT read-only against staging, paste the rows in the PR body; Max claims/admin-releases any
  genuinely-waiting pickup first; if >10 rows, add ORDER BY r."fulfilledAt" ASC LIMIT 10 to the
  sweep (releasedAt makes per-run draining safe — comment why).
- This deploy's smoke DOUBLES as CC-31 PR-1's owed retroactive cron smoke: force-run the cron,
  watch the bell (INV-5 quiet on a normal end-of-deployment; holds released as predicted); also
  lock+reset a test PIN → PIN_LOCKED self-clears. Tick both in STATUS §3.
- Warmup housekeeping line: delete the two preview services (gcloud run services delete
  ahits-web-app-preview-cc31-pr3 ahits-web-app-preview-cc31-pr2 --region us-central1).
ACCEPTANCE: grep -n "make_interval" src/app/api/cron/dispatch/route.ts → no step-7 hit. Test
(node suite): FULFILLED request, fulfilledAt 100h ago, unclaimed held line → sweep → releasedAt
set — impossible before this fix; it pins the regression.
```

2. **Item 2 nonce-lifecycle FIX (Antagonist — the packet's "clear on success" would wedge fail-then-correct):** withIdempotency caches 400s bound to bodyHash; a hub that submits a bad qty (400 cached under nonce K) then corrects it would hit 422 "already used with a different request" forever. **Clear/re-mint the nonce on ANY server-settled response (2xx OR 4xx) — the intent is spent either way; keep it only across network errors/timeouts and double-taps.** Update the packet's test (d) accordingly: add a case — 400 then corrected body → 2xx (fresh key), not 422.
3. Calibration: every CC-16S anchor verified EXACT on 844c682 — no line-ref changes. Preview-service smoke: NOT used for this packet (portal reads the live DB; evening staging smoke suffices).

---

## RIDER B — paste with CC-33

1. **Line-ref corrections (Calibration, against 844c682):** A3 cron import :8→**:9** · D1 hubs toLocaleDateString :71→**:72** · E1 ForwardOperatorDialog :156-195→**:158-193** (button/mount/union/opName/chip refs unchanged) · E2 Mark-Handled arm :250-266→**:255-271**, handleFulfill :132-149→**:131-152** · E5 'forward' case :774-785→**:801-812** (sets fulfillerOperatorId at :807) · scope-guard listRequests WHERE-arm :177→**:182-183** (now includes CC-31's forOperatorId arm — byte-untouched applies to BOTH arms) · Shipment refs → enum :1195-1202, model :1204-1225 · PR-2 action row :1336-1344→**:1338-1352** · handoff initiate dialog :1834-1866→**:1837-1875** · admin strings :725→**:727**, :1510→**:1512**, Reassign dialog :1225-1240→**:1228-1245**.
2. **E2 correction (Integration):** the surviving Cancel arm is now itself gated by CC-31's `requestedById === user?.userId` ternary — **keep that gate**; it is part of the arm, not of the deleted FORWARDED guard.
3. **PR-2 item 3 is INCOMPLETE as written (Calibration):** the incoming cards render TWICE — no-rig copies (:1042/:1074) AND active-rig copies (**:1212/:1244**); and there are TWO transfer respond dialogs (:1157 and **:1794**), plus handoff respond at :1128/:1879. All copies get the string change.
4. **The "nothing says Handoff" smoke is unreachable without a fuller sweep (Integration + Operator-lens):** also reword the ~9 operator-facing handoff toasts (:804,:817,:820,:834,:842,:845,:859,:871,:874), the Cancel Handoff dialog (:1185,:1194), the CC-32 preset `'Heading home — covering handoff'` → `'Heading home — covering transfer'` (note-presets.ts:9), and the dialog placeholder "handing off to cover the weekend" (:1863). New acceptance: `grep -in "handoff"` over operator-surface string literals → 0 (code identifiers/DB fields exempt).
5. **Entire-rig consequence sentence corrected (Operator-lens):** → **"Hands the whole deployment to them. Once they accept, they become the primary operator — daily checks and gear custody move to them."** ("primary operator" matches every landed accept-dialog string; the "pay" claim is cut — nothing computes payroll until CC-17.)
6. **PR-2 anti-regrowth baseline:** my-deployment/page.tsx is **1,924** lines on 844c682 (CC-32 growth) — acceptance is "strictly below its pre-PR-2 count (1,924)".
7. **E3 pre-merge check (SRE):** run read-only on staging `SELECT id,label FROM deployment_requests WHERE status='FORWARDED' AND "fulfillerOperatorId" IS NOT NULL` — Max Mark-Handles any live row BEFORE the merge (a stale client's Mark Handled becomes a 403 after).
8. **Add to MERGE GATES:** evening deploys only; anyone already onboarded reloads after each merge (launch rule 5) — and for PR-2, Max texts the crew the new "Transfer" word with the reload ask. Preview-service smoke: worth it for **PR-2 only** (no schema → faithful); PR-1 is mechanical, CI + staging smoke suffice.
9. **C3/D2 unverifiable from the review snapshot** (no public/ or *.patch in the archive): before deleting the svg icons, `grep -n svg public/manifest.json next.config.*` AND confirm the Serwist precache config doesn't enumerate public/icons — paste both (empty) results in the PR body. Confirm batch6a-date-unify.patch still exists at root before the delete step.

---

## RIDER C — paste with CC-34 (largest corrections — read before PR-1)

**SESSION SPLIT (Fable — context-death prevention): run PR-1 + PR-2 in session one; PR-3 as its own second session. Move the D29 append to PR-1's close (not session close) so a mid-session death cannot lose the decision record. Within PR-3, droppable order if time runs short: 3e → 3c-chips → 3b.**

1. **PR-1a's premise is HALF WRONG (Antagonist + Calibration — blocking):** the drawer does NOT fetch vehicle.status — both vehicle selects are `{id,name,type,isRental,rentalAgreementUrl}` (api/deployments/route.ts:14 and [id]/route.ts:12,:40), and `RigVehicleRow` (page.tsx:54-60) has no status; ":96/:118 already carries status" is wrong (those are the picker/transfer types). **The "one small server addition" must ALSO add `status: true` to both vehicle selects + the RigVehicleRow interface.** Unit half is correct as written.
2. **PR-1a amber-chip gate (Operator-lens):** openTasks filtered only by `status != COMPLETED` fires "Service due" for UPCOMING tasks months out. Amber renders only for **DUE_SOON / OVERDUE / IN_PROGRESS**; "Damage" red always.
3. **PR-1c consumable trap (Antagonist):** in items/[kitItemId], the INOPERABLE arm's alert has NO unitId for consumables (updateMany, null inventoryUnitId → activeKey `…:null` shared across ALL consumable reports, unresolvable). **Scope 1c's task/alert to the serialized branch (inventoryUnitId non-null); skip when no unit resolves.** End-route sibling anchor: else-branch starts **:257** (flip :264).
4. **PR-1c addition (Integration):** the maintenance **DELETE** route (maintenance/[id]/route.ts:61) soft-deletes without resolving alerts — add one line mirroring the complete route's `alert.updateMany({ sourceTable:'maintenance_tasks', sourceId:id })`, else a mis-filed report deleted instead of completed leaves a permanent bell ghost.
5. **PR-1b migration notes (SRE):** passes the gate untouched (verified: no nullable-ADD-COLUMN or CREATE INDEX arms in DESTRUCTIVE_RE) — it is the gate's first real ADD COLUMN: confirm the CI job log shows the file SCANNED (not "no migrations to check"); CI is the only authoritative run (macOS false-green). Migration comments: no apostrophes, no destructive keywords in prose (comment-strip quirk).
6. **PR-2a photo backstop (Antagonist — silent photo loss):** both report routes' zod schemas MUST use the shared `photoUrlsField()` + `isPhotoNotUploadedError` → 422 pattern (src/lib/validation.ts:40; mirror deployments/[id]/end/route.ts:30). `filterAllowedPhotoUrls` alone silently drops localphoto refs → photo-less task reported as success.
7. **PR-2a placement + copy (Operator-lens):** (a) mount the unit-panel button OUTSIDE the `canReturn||canAdd` gate (scan/page.tsx:311-336) — it must appear on EVERY scanned-unit panel, including gear in a crewmate's kit or already In Maintenance; (b) DeploymentCards mounts = one 44px icon-button (tooltip "Report a problem"), distinct icon/color, placed LEFT of the existing ⊖ — two same-weight adjacent icons invite report/return mis-taps; (c) state the CC-23 44px/16px discipline for the dialog's toggle options, photo button, submit, and both scan-panel mounts; (d) **toggle label fix:** "Out of service" collides with the distinct VehicleStatus OUT_OF_SERVICE label while the action sets IN_MAINTENANCE — helper text must name the resulting state: *"Marked In Maintenance — unusable until repaired."*; (e) add the disambiguation caption in the dialog: *"Reporting keeps it in your kit — use Return to Hub to send it back."*; (f) **photo rule:** required ≥1 for UNITS (§11.10 damage-photo rule), OPTIONAL-but-prompted for VEHICLES (the old vehicle path was photo-less — a new required photo there is added friction the line must not hide). Mount anchors drifted: vehicle button :389-396→**:392-401**, bespoke dialog :448-479→**:453-483**; report-damage flip anchor :37→**:36**.
8. **PR-2b (Antagonist):** wrap `/api/maintenance/field-fix` in **withIdempotency** in the same change — routing it through mutate() without idempotency = duplicate COMPLETED tasks on timeout-replay.
9. **PR-3b backfill guard (SRE — confirmed hazard):** bound the stale-damage arm `orderBy: { updatedAt: 'asc' }, take: 5` per run (dedup + the 7-day predicate drain the backlog a handful per pass — comment why). PRE-MERGE: run the staging count SELECT (isDamageReport, not COMPLETED, deletedAt null, updatedAt < now−7d) and state the number in the PR body; if >15, Max triages the list BEFORE deploy. **Copy fix (Operator-lens):** *"<taskName> — no updates in N days. Worth a look."* (never "without progress"). presentAlert anchor :29→**:17**.
10. **PR-3c server half (Integration — stranded-unit bug):** the complete route always flips units IN_MAINTENANCE→AVAILABLE (complete/route.ts:86); closing an in-kit repair (2a's still-in-kit rule) would strand an AVAILABLE unit inside an open kit item on an active rig — double-issuable, invisible to INV-5. **On complete: if an open kit item (removedAt null, rig endedAt null) references the unit → restore to CHECKED_OUT, not AVAILABLE.** Copy: "returns to service (back in the kit, or Available at the hub)."
11. **PR-3a:** date inputs are native `TextField type="date"` (RentalVehicleForm.tsx:188 / RequestComposer.tsx:589 precedents) — @mui/x-date-pickers was removed in CC-33 C2; do not reintroduce.
12. **PR-3d (Operator-lens):** render the human label via the lib/status.ts maintenance label map — never raw IN_PROGRESS; on captioned rows don't stack chip + caption for the same state (drop "In repair —" prefix or the chip, one word per state).
13. **PR-3e:** anchor drift — WORK_ORDER COMPLETED notifyAdmins branch :285-292→**:296-303**. Marked **first-droppable** (D29-3: zero current portal traffic; keep only if session time allows).
14. **Preview-service smokes: do NOT preview PR-1** (previews apply no migrations → maintenance surfaces 500 against the un-migrated pilot DB, actively misleading); PR-2/PR-3 previews only after PR-1's merge has migrated staging — the evening staging smoke per PR remains the gate.

---

*Verified clean and needing NO change (for the executing sessions' confidence): CC-16S anchors exact; CC-33's entire zero-importer deletion list re-proven on 844c682 (no merge added a caller; tests import only non-listed siblings); E1-E6 compatible with CC-31's landed forOperatorId work; CC-34's PR-2c photo re-link is schema-legal with no ownership blocker; alert triples across CC-31/CC-34 are disjoint (no dedup cross-fire); SW already covers `?rigId=` reads; CI caches survive CC-33's package-lock shrink; CC-33 tap math and CC-34's "scan + 3 taps + photo" claim verified on current surfaces.*
