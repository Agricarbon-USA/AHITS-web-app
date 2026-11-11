# Packet P1-2 D · Data tells the truth: alerts, one open repair, deployment edges · rev 3.2 · 2026-10-28

> **OPEN for the owner:** no open items. (D2 still needs owner reads P2-R1, P2-R2 and P2-R4 on its merge day, §6.)

> **REV 3.2 (2026-10-28), after the practice build** (`p12/stack/STACK_D.md`: D1–D3 built on the Eastern-time PR, Security S1–S4 and Offline O1–O6; 0 High, 1 Medium, 6 Low, 7 Info). Every gate ended green, and the whole stack ran green twice. `p12/stack/FOLD_D.md` maps each finding to its step. What changed:
> - **D3's edges test cleans up after itself (Medium, DX-1).** An add crew that wins writes a `rig_operators` row that `tests/setup.ts` never deletes, and then every later test in the run fails. The new test file deletes those rows after each test.
> - **D3's button label (DX-2):** O4's `Already saved` comes first, then `Say if it can be fixed`. 3.9 gives the button's lines after O4.
> - **D3's Sentry mock is a factory (DX-3).** The bare mock gave no `captureMessage`, and every books test failed.
> - **Tests that prove the fix (DX-4, DX-5, DX-6):** D1 gains an atomic submit test that fails before D1, and its rows that also pass before D1 say so. D2's admin field-fix row is not a regression guard. D3's Move stock row checks that a cleared field stays empty.
> - **D3's `deployment-auth.ts` check (DX-7)** compares with the PR's own base commit, not `origin/development`.
> - **Smaller fixes:** D1's one-bell test uses the 19:00 default cutoff (DX-9). D1's Touched lists `00_START_HERE.md` and this packet, and §7 gives the row's exact text (DX-10). 2.7 replaces only the D-c paragraph of the doc comment (DX-12). The B4-6 race says it also passes before D3 (DX-14).
> - **§5:** a failing test outside the listed ones means stop and report. The known flakes are named. Also `rm -rf .next`, the lint count (47) and a placeholder grep. **§7:** the docs commit checks that the Eastern-time, Security and Offline decisions are in `DECISIONS.md`, and stops if one is missing. Then it takes the number after the highest one there. §9 lists every finding.

> **REV 3.1 (2026-10-27), the owner's answers to rev 3's two "to confirm" items.** Details and re-checks: `p12/rev-D/REV3_1_CHANGES.md`. What changed:
> - **"The admin sees it in Activity" = Admin → Maintenance → Completed.** Now a decision (§0 R7b, §9), not an open item.
> - **A field fix on an Inoperable unit with no open repair puts it back in service**, the same as "fixed means fixed": Available, or Checked out if an open line still holds it. The unit leaves the review list, its review bell is marked read, and the field-fix record names the operator. Rev 3 left it in review. The code is one argument: the field fix's own `restoreIfClear` passes `fixed: true` (2.10). Status writes stay in `asset-status.ts` (D42).
> - **Q5 still holds:** returns and reports never take a unit out of review. A field fix is a fix, not a report.
> - 2.7's comment, 2.10, Tests (the End-versus-field-fix race now runs with and without an open repair), What people see, Interpretations, §4, §5, §7 (D-D2, D42 qualifier), §8 and §9 follow.
> - Re-checked on branch `rev3.1` of the scratch clone (§9): tsc 0, DB suite 81 / 697 green (2 skipped, as in rev 3), the probes 18 / 18 on both databases, the race 40 runs on each with no deadlock.

> **REV 3 (2026-10-27), the owner's round 7.** Each change and its re-check is in `p12/rev-D/REV3_CHANGES.md`. What changed:
> - **Field fix: any gear, any crew (§0 R7a, replaces Q2).** D2 builds no custody check. Rev 2's 403 (another crew's gear), 409 (a shop repair type) and 409 (a live work order) are gone, with their tests and acceptance row. Signing in is still required, and admins can do anything. The field-fix record now names who logged it (today it names nobody). B3-15 is closed by owner decision (§9).
> - **Fixed means fixed (§0 R7b, new D2 2.10).** Completing an Inoperable unit's open repair (a field fix, Complete, or setting it Completed) puts the unit back in service and ends its review. Deleting the repair doesn't. The shop link's Completed never closes a repair, so it frees nothing by itself (§9). All through `restoreIfClear` (D42). New tests, including a race with End's write-off. D-D2, the D42 and D43 qualifiers and the D2 CHANGELOG line follow.
> - **Shop link after close (§0 R7c)** is Security S4's. D2 doesn't touch the link code; §4 says how they meet and in what order.
> - **Also corrected:** the per-operator limit on reports is Offline O2's, not S4's (Security rev 2 moved it). §4's field-fix row names S3's reply change.
> - Re-checked on branch `rev3` of the scratch clone (§9): tsc 0, DB suite 81 / 694 green, UI 76 / 625 green, the new probes 15 / 15, rev 2's stress set 6 / 6 with no deadlock.

> **REV 2 (2026-10-26), after two reviews** (`p12/rev-D/BREAK_D.md`, `p12/rev-D/COMPLETE_D.md`). Each review ID's outcome is in `p12/rev-D/REV2_CHANGES.md`; disagreements are in §9. What changed:
> - **D2 2.9 (new):** a return of a line with no unit never takes a unit that another open line names (BD-1). 2.7: a live work order counts as "with a shop" (BD-2; withdrawn in rev 3, round 7). 2.6: Send for repair on a reviewed unit keeps the admin's shop details (CD-5), and End's "No — write off" on a line with no unit never marks another line's unit (BD-5). 2.3: field fix takes the asset first (BD-8). 2.1, 2.8: reasons and rollback note completed (BD-6, BD-13).
> - **D1:** the odometer trigger gets the overdue scan's guard (1.4, BD-4); a rollback note (1.7, CD-9); the stale CC-31 comment (1.2, CD-14).
> - **§6:** in merge-day order. P2-R1, P2-R2 and the new P2-R4 gate D2; everything else is information (CD-2, CD-7, BD-3). The reads name the gear (CD-8). P2-R2's fix no longer answers the transfer (CD-1). A failed migrate has an exact owner step, checked on a scratch database (CD-3).
> - **§7:** the stop rule for a failed migrate (CD-4), the D43 qualifier (CD-6), house-format decisions (CD-13), plain words (CD-19). §8 prompts check their base first (CD-18). The D48 pace note belongs to the owner's docs PR, so no packet writes it (CD-17 rejected, §9).
> - **Found in rev 2:** the background job runs every 10 minutes, not hourly. Security S4 also edits `setLineFulfillment`, and its per-operator limit shapes D2's race tests (§4).

> STATUS: runnable packet, rev 3.2. Three PRs in order (D1 → D2 → D3), one Claude Code session each. Written in parallel with the Security packet (S1–S4) and the Offline packet (O1–O6); D1–D3 are built after both have merged. **Practice-built as a whole** on 2026-10-28 (`p12/stack/STACK_D.md`): D1–D3 on the Eastern-time PR, S1–S4 and O1–O6, tree `p12/stack/tree`, tags `stack-D1` … `stack-D3`. Every gate ended green; rev 3.2 folds in its findings (§9). · WROTE: 2026-10-26, from `MAP_integrity.md` (minus PR I1 and B5 §3, which went to O1); rev 3 on 2026-10-27, from the owner's round 7; rev 3.1 the same day, from the owner's answers to rev 3's two items; rev 3.2 on 2026-10-28, from the practice build. Every step was checked against `p12/base` @ `3dbaea8`. Rev 1 was built as written in a scratch clone (`p12/rev-D/tree`, branches `d1`–`d3`); rev 2's fixes are branch `rev2` there, rev 3's branch `rev3` and rev 3.1's branch `rev3.1`, each re-run on a scratch Postgres 16 (§9). · READ-WITH: `AGENTS.md` (Next 16 is modified: read the matching guide in `node_modules/next/dist/docs/` before you touch a route handler or a page; this packet changes no Next API), `CLAUDE.md`, `STATUS.md`, `DECISIONS.md` (D10, D11, D21, D42, D43, D45, D48 with the owner's 2026-10-26 merge-pace note, D49, D50–D52, and the Eastern-time PR's decision), the P1-1 packets (rev 4.1) for the base gate and close rules, `AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md` (O1 shares files with every PR here) and `AHITS_PACKET_P1-2S_SECURITY_2026-10-26.md` (S4 shares two, §4).
> WHY: P1-2's integrity map found writes and signals that are quietly wrong:
> - A failed daily check or a material request can lose its alert after the save.
> - A missed daily check rings once, then never again, however many days it runs.
> - The background job, or a daily check's odometer, can turn a service an admin just completed back to Overdue.
> - Two reports of one broken asset at the same moment can open two repairs.
> - A repair closed while its unit waits on a transfer puts the unit back on the shelf. So can a return of a counted line.
> - A return or a "not usable" report quietly moves a unit out of the admin's review list.
> - A field fix doesn't record who logged it.
> - A whole-deployment transfer leaves equipment transfers from it waiting. An admin can add crew to an ended deployment.
> - Reservation books can drift unseen, and a broken hold at pickup is a raw 500.
> - A blank "Can it be fixed?" counts as "No", and admin quantity fields snap back as you type.
> SLOT: after P1-1a–e, the Eastern-time PR, every Security PR and every Offline PR. Order **Security → Offline → Data**.
> - Migrations: D1 none · **D2 one (additive: three partial unique indexes) — merges alone** · D3 none.
> - Anchors are at `3dbaea8`, built from P1-1 **rev 4**. Rev 4.1 moved three spots (top of `MAP_integrity.md`). Two touch this packet: `returnUnit`'s `returnHubId` option (`asset-status.ts:147-152`, D2 2.6) and the Reassign re-read of the primary inside the transaction (`handoff/route.ts:78`, inside D3 3.2's edit at `:71-88`). The Eastern-time, Security and Offline PRs move more lines (§4). **Re-grep every anchor at build.**
> - D21: `src/app/(operator)/operator/my-deployment/page.tsx` is untouched (1454 lines at `3dbaea8`). State `wc -l` in every PR body.
> - Test baselines: re-count both suites on each PR's base (after the S and O merges) and state them next to the new counts. Practice build (files / tests): DB 106 / 837 at O6 → D1 107 / 860 → D2 109 / 894 → D3 111 / 911; UI 98 / 761 → 98 / 761 → 98 / 761 → 99 / 765.

**This packet overrides SESSION CLOSE steps 4–5 in `CLAUDE.md` and in `STATUS.md` for D1–D3.** There is no handoff file unless the session ends mid-work; write one `CHANGELOG.md` line plus the STATUS lines in §7 instead. Stage named files only, never `git add -A`. This packet file sits untracked in the repo root: commit it on the D1 branch, never on `development` (if it is already tracked, skip that).

**Two rules hold throughout.** D42: `src/lib/asset-status.ts` is the only writer of unit and vehicle status (`tests/pr3a-status-writers-guard.test.ts` passes unchanged). D45: an evaluator owns both the raise and the clear of its alert; event-owned alerts (DAILY_CHECK_FAILED, MATERIAL_REQUEST, DAMAGE_REPORTED) are raised by their event.

---

## 0 · Owner decisions (final: apply them, don't re-ask)

| # | Decision | PR | Becomes |
|---|---|---|---|
| Q1 | **One bell per missed day.** When an operator misses the daily check several days running, admins get a bell each day. Yesterday's alert clears at the first background check after midnight Eastern; a new one rings after today's cutoff. (The background check runs every 10 minutes.) | D1 | D-D1 |
| Q7 | **Three new background checks:** gear or vehicles left open on an ended deployment with no waiting transfer; crew still open on an ended deployment; a live deployment with no lead operator. The "free but still out" check also covers Inoperable units, and counts gear waiting on a transfer as out (D51). They show in Admin → Alerts as inventory drift and clear themselves. **Parked:** an alert for transfers nobody answers in N days. | D1 | D-D1 |
| R7a | **Field fix: any gear, any crew** (round 7, 2026-10-27). **This replaces Q2**, the 2026-10-26 rule (operators only on their own crew's or yard gear, never a repair with a shop). Operators may log a field fix and close any repair, whoever has the gear, including a repair where they took the gear to a shop or a work order is out. Admins can do anything, as before. Signing in is still required. The field-fix record now names who logged it (today it names nobody). B3-15 is closed by this decision (§9). | D2 | D-D2 |
| Q5 | **A unit in admin review (Inoperable) stays there** after a return or a "not usable" report. The report still opens or joins its repair, and Send for repair then keeps the shop details the admin enters. It leaves the review by the admin's Send for repair or Retire, a completed repair, or a field fix (R7b). A field fix is a fix, not a report. | D2 | D-D2 |
| R7b | **Fixed means fixed** (round 7; rev 3.1). When an Inoperable unit is fixed, it goes back to Available and leaves the admin's review list, and its review bell is marked read. If an open line still holds it, it goes to Checked out instead. "Fixed" is a field fix by anyone (with or without an open repair; the record names the operator), the admin's Complete, or setting the repair Completed. Deleting the repair is not a fix: the unit stays in review. The shop's "Completed" on its link never closes a repair (the admin's Complete does), so it changes nothing by itself. **"The admin sees it in Activity"** = Admin → Maintenance → Completed (owner, rev 3.1). It shows the closed repair and the "Fixed in field" record with the name. The app has no repair activity feed. | D2 | D-D2 |
| R7c | **Shop link after an operator closes the repair** (round 7): the link keeps taking the invoice number only, until an admin records it or 30 days pass. This amends "a shop's link stops once the repair is closed". It is the Security packet's S4, not D2: D2 doesn't touch the link code (§4). | S4 | — |
| Q3 | **Whole-deployment transfer accepted:** equipment transfers from that deployment still waiting are cancelled, and each waiting person is told. | D3 | D-D3 |
| Q4 | **"Can it be fixed?" must be answered** before sending (`Say if it can be fixed`). Actions already saved on a phone keep today's rule (blank = admin review). | D3 | D-D3 |
| Q6 | **Checking out a consumable by count stops marking that consumable's old recorded units as out** (D-z). The stock count decides. Scanning or returning one of those old units itself works as today. | D3 | D-D3 |
| — | **Order and pace:** Security → Offline → Data. D48 as amended by the owner's docs PR: up to two merges per evening, only in different areas; each deploys and passes its smoke first; any migration merges alone, so **D2 merges alone**. No packet writes that note. | all | — |

New decisions are named **D-D1, D-D2, D-D3** here. They are placeholders: each gets its number when it is first written into `DECISIONS.md`, the number after the highest one there (§7).

Words: D9's and D11's locked strings stay as they are. New strings are sentence case. Users read "transfer", never "handoff".

---

## 1 · D1 · Alerts and monitors tell the truth (B4-14, B4-9, B4-17, B4-18, B4-19 monitors)

**Goal.** Event alerts commit with the write that raises them; the missed-check alert rings once per missed day; neither the background job nor the odometer trigger overwrites a just-completed schedule; retiring an item marks its low-stock bells read; three new monitors and a wider INV-8. No migration. Size M.

**1.1 · B4-14 · Failed daily check** (`src/app/api/daily-check/route.ts`):
- The `vehicleExists` read (`:128-131`) selects `{ id: true, name: true }`.
- Inside the transaction, after the upsert (`:160-201`) and before `return { check }` (`:202`):
```ts
    // P1-2 D1 (B4-14): a failed check raises its alert in the check's own transaction, so the
    // alert can't be lost after the check commits. CC-29 4d: a late failing check still raises.
    if (!passFail) {
      await createAlert('DAILY_CHECK_FAILED', 'vehicles', vehicleId, {
        name: vehicleExists.name,
        operatorName: session.name,
        issues: issues ?? 'No details provided',
        checkId: check.id, // CC-26: the alert deep-links to the latest failed check
      }, tx)
    }
```
- In the post-commit `try` (`:252-289`), delete the `if (!passFail) { … }` arm and its vehicle re-read (`:253-268`). What is left is `if (passFail && isToday) await resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', vehicleId)`, then the missed-check resolves (`:274-286`) as they are. Keep the CC-29 4d comments. Reword the UR-034 comment (`:246-251`): the raise is in the transaction now; this block only clears.
- The two refusals (`:144` crewmate's check, `:157` late duplicate) return before the upsert, so a refused check raises nothing.

**1.2 · B4-14 · Material requests** (`src/lib/deployment-requests.ts`):
- `:5` → `import { createAlert, resolveActiveAlert } from '@/lib/alerts'`.
- `createRequest` (`:289-322`), last statement inside `prisma.$transaction`, after the line loop:
```ts
    // P1-2 D1 (B4-14): a material request sent straight to REQUESTED raises its alert with the request.
    if (requestType === 'MATERIAL' && input.status === 'REQUESTED') {
      await createAlert('MATERIAL_REQUEST', 'deployment_requests', id, { name: input.label ?? 'Material request' }, tx)
    }
```
- `case 'submit'` (`:702-708`) becomes:
```ts
    case 'submit': {
      // P1-2 D1 (B4-14): the MATERIAL_REQUEST alert commits with the submit.
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ label: string | null }[]>`
          UPDATE "deployment_requests" SET "status" = 'REQUESTED', "updatedAt" = now()
          WHERE "id" = ${id} AND "status" = 'DRAFT' RETURNING "label"`
        if (rows.length === 0) return { ok: false, code: 'STATE_MISMATCH' } as TransitionResult
        if (requestType === 'MATERIAL') {
          await createAlert('MATERIAL_REQUEST', 'deployment_requests', id, { name: rows[0]!.label ?? 'Material request' }, tx)
        }
        return { ok: true } as TransitionResult
      })
    }
```
- Reword the CC-31 comment at `:675-676`: the MATERIAL_REQUEST alert is raised in `createRequest` and `submit` (P1-2 D1); this block only clears it.
- Delete the route raises:
  - `src/app/api/deployment-requests/route.ts:105-114`: keep only the RESERVATION link, as `if (d.status === 'REQUESTED' && d.requestType === 'RESERVATION' && d.fulfillerHubId) await issueReservationLink(…).catch(() => {})`. Drop the `createAlert` import (`:5`).
  - `src/app/api/deployment-requests/[id]/route.ts:107-110`: delete the `submit` arm; the chain starts at `if (action === 'forward')`. Drop the `createAlert` import (`:5`).

**1.3 · B4-9 · One missed-check bell per day** (`src/lib/alert-evaluators.ts`, Q1):
- `OperatorE` (`:190`) gains `alertDate?: string | null`. It is optional, so `tests/pr4-evaluators.test.ts:63` still compiles.
- `operatorEntities` (`:191-212`): read the open alerts once, after the rosters, and push `alertDate` with each entity:
```ts
  // P1-2 D1 (B4-9): the business day each operator's open missed-check alert was raised for.
  const alertDate = new Map((await prisma.alert.findMany({
    where: { type: 'DAILY_CHECK_MISSED', sourceTable: 'operators', resolved: false },
    select: { sourceId: true, metadata: true },
  })).map((a) => [a.sourceId, (a.metadata as { date?: unknown } | null)?.date]))
  // …in the loop:
  const d = alertDate.get(operatorId)
  out.push({ /* existing fields */, alertDate: typeof d === 'string' ? d : null })
```
- `evaluate` (`:230`):
```ts
  // P1-2 D1 (B4-9, Q1): one alert per missed day. An alert raised for an earlier day clears on
  // the first pass of a new day; a new alert, with a new bell, rings after today's cutoff.
  evaluate: (e, ctx) => (e.checkedToday ? 'CLEAR'
    : e.alertDate && e.alertDate !== ctx.today ? 'CLEAR'
    : ctx.pastDailyCheckCutoff ? 'RAISE' : 'HOLD'),
```
- **The day is the business day.** `ctx.today` and `ctx.pastDailyCheckCutoff` come from `evalContext` (`alert-evaluators.ts:72-76`), which reads the APP_TIMEZONE wall clock, and `metadata.date` is written from the same `ctx.today` (`:231`). After the Eastern-time PR that is the Eastern business day. Write no zone name anywhere: the Eastern-time guard test (`tests/components/eastern-time-guard.test.ts`) fails on one in `src`.
- Rewrite the comment at `:183-189` to say the same. The key stays the operator id, so `alertLink` (`src/lib/alert-display.ts`, DAILY_CHECK_MISSED branch) and the daily-check resolves (`daily-check/route.ts:277,284`) are unchanged. A new row gets a new id, so dispatch (`notifications.ts:101,150`, `notifiedAt IS NULL`) bells it.
- Alerts with no `metadata.date` (older rows) keep today's behaviour until they clear.

**1.4 · B4-17 · Nothing overwrites a completed task**
- The overdue scan (`src/app/api/cron/dispatch/route.ts:84-97`):
```ts
  // P1-2 D1 (B4-17): one guarded UPDATE — a task an admin completes meanwhile (rolled forward,
  // nextDue in the future) is never set OVERDUE again.
  const overdue = await prisma.maintenanceTask.updateMany({
    where: { intervalType: { in: ['DAYS', 'MONTHS'] }, isDamageReport: false, status: { in: ['UPCOMING', 'DUE_SOON'] }, nextDue: { lt: now }, deletedAt: null },
    data: { status: 'OVERDUE' },
  })
```
  At `:462`: `overdueMarked: overdue.count`.
- **The odometer trigger, the same rule (BD-4)** (`src/lib/maintenance.ts` `applyOdometerReading`, the loop at `:61-72`). It runs after every daily check that carries an odometer and reads the tasks before it writes, so a check racing `/complete` can set a just-serviced task Overdue:
```ts
      // P1-2 D1 (B4-17): guarded, as the cron's overdue scan — a task /complete rolled forward
      // meanwhile (a new nextOdometer) is never set OVERDUE or DUE_SOON again.
      if (odometer >= t.nextOdometer) {
        const r = await prisma.maintenanceTask.updateMany({ where: { id: t.id, status: { in: ['UPCOMING', 'DUE_SOON'] }, nextOdometer: { lte: odometer } }, data: { status: 'OVERDUE' } })
        if (r.count > 0) {
          await createAlert('MAINTENANCE_OVERDUE', 'maintenance_tasks', t.id, {
            taskName: t.taskName,
            itemName: vehicle.name,
          })
        }
      } else if (odometer >= t.nextOdometer - DUE_SOON_MILES && t.status === 'UPCOMING') {
        await prisma.maintenanceTask.updateMany({ where: { id: t.id, status: 'UPCOMING', nextOdometer: { lte: odometer + DUE_SOON_MILES } }, data: { status: 'DUE_SOON' } })
      }
```
  The direct MAINTENANCE_OVERDUE raise stays, now only when the guarded write wins. It is a second raiser of an evaluator-owned type (D45); the evaluator raises and clears it on its next pass anyway. Say so under the PR's **Interpretations**.

**1.5 · B4-18 · Item retire marks low-stock bells read** (`src/app/api/inventory/[id]/route.ts:192-195`; import `resolveActiveAlert` from `@/lib/alerts`):
```ts
        // P1-2 D1 (B4-18): through resolveActiveAlert, so admins' bell rows are read too.
        const low = await tx.alert.findMany({ where: { type: 'LOW_INVENTORY', sourceTable: 'inventory_items', sourceId: { startsWith: `${id}:` }, resolved: false }, select: { sourceId: true } })
        for (const a of low) if (a.sourceId) await resolveActiveAlert('LOW_INVENTORY', 'inventory_items', a.sourceId, tx)
```

**1.6 · Monitors** (same cron file, Q7):
- `drift`'s `sourceTable` type (`:327`) becomes `'inventory_units' | 'vehicles' | 'kit_items' | 'rig_vehicles' | 'deployment_assignments' | 'rigs'`.
- **INV-8** (`:360-368`): the population is **every open line**, not only lines on live deployments (D51: a unit on any open line, including one waiting on a transfer, is out), and the status set gains INOPERABLE. Drop the `kits`/`rigs` joins:
```ts
    // INV-8: a unit marked Available, Returning or Inoperable while an open kit line still holds it —
    // on a live deployment, or waiting on a transfer from an ended one (D51, P1-2 D1).
    const inv8 = await prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT DISTINCT u."id", u."status"::text AS "status" FROM "inventory_units" u
      JOIN "kit_items" ki ON ki."inventoryUnitId" = u."id" AND ki."removedAt" IS NULL
      WHERE u."deletedAt" IS NULL AND u."status" IN ('AVAILABLE', 'IN_TRANSIT', 'INOPERABLE')`
    await drift('inventory_units', 'inv8-free-but-in-kit', 'INV-8 units Available/Returning/Inoperable but still on an open line', inv8)
```
- After INV-9 (`:385`):
```ts
    // INV-10: gear or vehicles still open on an ended deployment with no waiting transfer holding them.
    const inv10Lines = await prisma.$queryRaw<{ id: string }[]>`
      SELECT ki."id" FROM "kit_items" ki JOIN "kits" k ON k."id" = ki."kitId" JOIN "rigs" r ON r."id" = k."rigId"
      WHERE r."endedAt" IS NOT NULL AND ki."removedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "transfer_items" ti JOIN "transfer_requests" tr ON tr."id" = ti."transferRequestId"
                        WHERE ti."kitItemId" = ki."id" AND tr."status" = 'PENDING')`
    await drift('kit_items', 'inv10-open-on-ended', 'INV-10 lines open on an ended deployment with no waiting transfer', inv10Lines)
    const inv10Vehicles = await prisma.$queryRaw<{ id: string }[]>`
      SELECT rv."vehicleId" AS "id" FROM "rig_vehicles" rv JOIN "rigs" r ON r."id" = rv."rigId"
      WHERE r."endedAt" IS NOT NULL AND rv."removedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "transfer_vehicles" tv JOIN "transfer_requests" tr ON tr."id" = tv."transferRequestId"
                        WHERE tv."vehicleId" = rv."vehicleId" AND tr."fromRigId" = rv."rigId" AND tr."status" = 'PENDING')`
    await drift('rig_vehicles', 'inv10-open-on-ended', 'INV-10 vehicles open on an ended deployment with no waiting transfer', inv10Vehicles)
    // INV-11: crew still open on an ended deployment — a PRIMARY there blocks that operator's next Start.
    const inv11 = await prisma.$queryRaw<{ id: string }[]>`
      SELECT a."id" FROM "deployment_assignments" a JOIN "rigs" r ON r."id" = a."rigId"
      WHERE a."endedAt" IS NULL AND r."endedAt" IS NOT NULL`
    await drift('deployment_assignments', 'inv11-crew-on-ended', 'INV-11 open crew on an ended deployment', inv11)
    // INV-12: a live deployment with no open lead (PRIMARY) operator.
    const inv12 = await prisma.$queryRaw<{ id: string }[]>`
      SELECT r."id" FROM "rigs" r WHERE r."endedAt" IS NULL AND NOT EXISTS (
        SELECT 1 FROM "deployment_assignments" a WHERE a."rigId" = r."id" AND a."role" = 'PRIMARY' AND a."endedAt" IS NULL)`
    await drift('rigs', 'inv12-live-without-primary', 'INV-12 live deployment with no lead operator', inv12)
```
- The catch comment (`:387-389`) says INV-1..6 and 8–12. The evaluator header (`alert-evaluators.ts:40`) says `INVENTORY_DRIFT (INV-1..12)`.
- None of these states is passing: End and transfer accept end the crew in the same transaction as the deployment (`end/route.ts`, `transfers/[id]/accept/route.ts:252-257`), End creates its transfer rows in the same transaction, and `reassignPrimary` ends and opens the lead together.

**1.7 · Rollback note** (add to `PILOT_ROLLBACK.md` under §1 in this PR, after the last paragraph there; CD-9): `**P1-2 D1 (alerts and monitors, no migration).** Rolling back leaves any open INV-10, INV-11 and INV-12 alerts with nothing to clear them: the old revision doesn't run those checks, and Admin → Alerts hides Resolve for drift alerts. After rolling back, on the owner's go, the owner runs in the Supabase SQL Editor: UPDATE "notifications" SET "readAt" = now() WHERE "readAt" IS NULL AND "alertId" IN (SELECT "id" FROM "alerts" WHERE "type" = 'INVENTORY_DRIFT' AND "resolved" = false AND "sourceId" IN ('inv10-open-on-ended','inv11-crew-on-ended','inv12-live-without-primary')); then UPDATE "alerts" SET "resolved" = true, "resolvedAt" = now(), "activeKey" = NULL WHERE "type" = 'INVENTORY_DRIFT' AND "resolved" = false AND "sourceId" IN ('inv10-open-on-ended','inv11-crew-on-ended','inv12-live-without-primary'). No undo is needed: rolling forward raises again whatever still holds.`

**Tests.** Node (CI), new `tests/p1-2-alerts-monitors.test.ts`, harness as `tests/pr5b-dead-ends.test.ts`. Label rows that also pass on the old code "regression guard".
- 1.1: a failing check → DAILY_CHECK_FAILED active with `checkId` (regression guard). The first check of a vehicle passes; a crewmate's failing check of it the same day → 409 and no alert. Atomic: a hook mock of `@/lib/alerts` (spread the real module; `createAlert` rejects while `hook.failAlert` is set; reset in `afterEach`, the `p1-1a-end-claim` pattern) → the POST rejects and no `daily_checks` row exists.
- 1.2: MATERIAL created REQUESTED → one alert. Created DRAFT → none; submit → one; a second submit → 409, still one. RESERVATION created REQUESTED → no MATERIAL_REQUEST. All three are regression guards: the old routes raised the alert right after commit. **Atomic (the row that fails before D1):** with the 1.1 hook set, `PATCH submit` rejects and the request stays DRAFT. As built (the file's helpers: `createRequestRoute` and `requestAction` are the two request routes' POST and PATCH; `body(status)` is a MATERIAL request with one line):
```ts
  it('atomic: a submit whose alert write fails rolls back, the request stays DRAFT', async () => {
    const { id } = await (await createRequestRoute(req('/api/deployment-requests', 'POST', body('DRAFT')))).json()
    hook.failAlert = true
    await expect(requestAction(req(`/api/deployment-requests/${id}`, 'PATCH', { action: 'submit' }), p(id))).rejects.toThrow('alert write failed')
    const [row] = await prisma.$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "deployment_requests" WHERE "id" = ${id}`
    expect(row!.status).toBe('DRAFT')
  })
```
- 1.3 (Q1): leave APP_TIMEZONE unset (the code default, Eastern after the Eastern-time PR), and use the default cutoff: `DEFAULT_DAILY_CHECK_CUTOFF` from `@/lib/business-date` (`'19:00'`). `runEvaluator(dailyCheckMissed, evalContext(new Date('2026-10-09T23:30:00Z'), DEFAULT_DAILY_CHECK_CUTOFF))` with a live rig, no check, and an open alert whose `metadata.date` is `2026-10-08` (plus its admin bell row) → resolved and the bell row read. Run again → a **new** alert row (another id, `notifiedAt` null, `date` `2026-10-09`). A same-day alert → the same row, metadata refreshed. Pure: `dailyCheckMissed.evaluate(op({ alertDate: '2026-10-08' }), morning)` → `CLEAR` (`morning` at `2026-10-09T14:00:00Z`, the same cutoff). 23:30Z is 19:30 Eastern, past the cutoff; 14:00Z is 10:00 Eastern, before it; both on 2026-10-09.
- 1.4: a DAYS task due yesterday → OVERDUE (regression guard). A rolled-forward UPCOMING task → untouched. Race: `Promise.all(cron, POST /complete)` 10 runs → never OVERDUE with a future `nextDue` (regression guard: the window is narrow, so this also passes before D1; the odometer case is the one that fails). Odometer: a MILEAGE task UPCOMING at `nextOdometer` 10 000; spy once on `prisma.maintenanceTask.findMany` so `POST /complete` with `actualOdometer: 10100` runs between the trigger's read and its write; `applyOdometerReading(v, 10050)` → the task stays UPCOMING at `nextOdometer` 15 100, no active MAINTENANCE_OVERDUE.
- 1.5: retire a serialized item with a `<id>:serialized` LOW_INVENTORY alert and an admin bell row → resolved, `readAt` set.
- 1.6: each of INV-10 (line and vehicle), INV-11 and INV-12 raised from a seeded bad row and cleared once fixed. A line waiting on a PENDING transfer → no INV-10. An INOPERABLE unit on a live line → INV-8. An AVAILABLE unit on a waiting line of an ended deployment → INV-8.

**Existing tests that change:** `tests/ur034-daily-check-failed-alert.test.ts:52` — `createAlert` now gets a 5th argument (`tx`), so add a 5th `expect.anything()`. (O1 already changed its dates at `:45,65`.)

**Must pass unchanged:** `pr4-evaluators`, `pr4-signals-cron`, `pr5c-today-crew-rig`, `cc29-late-sync-date`, `cc26-alert-metadata-refresh`, `cc31-alert-autoresolve` (mocks the alerts module), `cc31-inv5-custody-strand`, `cc34-schedules-and-alerts`, `maintenance-recurrence`, `pr3b-guards` (INV-6/8/9 at `:355-393`), `fnd7-business-date` and the Eastern-time guard, `p1-1d-staged-ready` test 17 (`:682`) and `p1-1e-expired-holds:87`. Those last two assert no INVENTORY_DRIFT at all: test 17 has no deployment, and p1-1e's rig is started through the API with a lead.

**What people see (PR body: Behaviour changes).**
- Admins: a missed daily check rings once per missed day. Failed-check and material-request alerts can't be lost after the save. A just-completed schedule no longer flips back to Overdue, from the background job or from a daily check's odometer. Retiring an item marks its low-stock bells read.
- Admins: new INVENTORY_DRIFT alerts INV-10, INV-11 and INV-12, and INV-8 now lists Inoperable units and units on lines waiting on a transfer. **On the first background check after the deploy (within 10 minutes), old leftovers raise these** (owner read P2-I1, §6, lists them).
- Operators: nothing visible.

**Acceptance (owner, app screens).** State Active Deployments first. Rows marked (owner) need a test operator signed in with a PIN, so they are the owner's.
1. Ten minutes after the deploy, Admin → Alerts shows INV-10/11/12 or INV-8 only for what that day's P2-I1 listed.
2. (owner) Fail a daily check on a test vehicle → its alert opens that check (regression).
3. (owner) A test material request sent → it is in Admin → Alerts at once (regression).
4. (Optional, two days) A test operator on a live test deployment skips two days: one missed-check bell on each day.

**Touched:** `src/app/api/daily-check/route.ts`, `src/lib/deployment-requests.ts`, `src/app/api/deployment-requests/route.ts`, `src/app/api/deployment-requests/[id]/route.ts`, `src/lib/alert-evaluators.ts`, `src/app/api/cron/dispatch/route.ts`, `src/lib/maintenance.ts` (the odometer trigger only), `src/app/api/inventory/[id]/route.ts`, `PILOT_ROLLBACK.md`, `tests/ur034-daily-check-failed-alert.test.ts`, new test, `00_START_HERE.md` (one row, §7) and this packet file (unless it is already tracked).

---

## 2 · D2 · One open repair, one open line; admin decisions stay put (B4-8, B4-5, B4-15; B3-15 accepted by the owner) · one additive migration

**Goal.** One open damage report per asset and one open kit line per unit, kept by the code and backed by the database; a unit on any open line stays out, and no return sweep takes it; the admin's review queue stays put and keeps the admin's details, until a repair on the unit is completed or a field fix is logged on it; a field fix names who logged it. **Owner reads P2-R1, P2-R2 and P2-R4 return 0 rows first (§6), on the merge day.** Merges alone. Size M.

**2.1 · Migration** `prisma/migrations/<YYYYMMDDHHMMSS>_p1_2_one_open_repair_one_open_line/migration.sql`. Use `date -u +%Y%m%d%H%M%S` at build time, later than every migration on `development` (the Security packet's S2 adds one before it). Keep the comments free of `;` and `'`: the safety script splits on `;` and strips only comments without a `'`. This exact text created all three indexes on a scratch database built from the base's migrations, re-ran cleanly, rejected each duplicate with 23505, failed to create while a duplicate existed, and passed `check-migration-safety.sh` once committed (§9).
```sql
-- P1-2 D2 (B4-8, B4-5): two rules the code already keeps, now held by the database.
-- Additive: three partial unique indexes, no column and no data change. Prisma cannot
-- model a filtered unique index, so schema.prisma only gains comments. Owner reads
-- P2-R1 and P2-R2 in AHITS_PACKET_P1-2D_DATA_2026-10-26.md return zero rows before this
-- merges, else the CREATE fails and blocks the deploy. Not CONCURRENTLY on purpose: the
-- tables are small, and that form cannot run inside migrate.

-- One open damage report per unit.
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_tasks_one_open_damage_per_unit"
  ON "maintenance_tasks" ("inventoryUnitId")
  WHERE "isDamageReport" = true AND "deletedAt" IS NULL AND "status" <> 'COMPLETED' AND "inventoryUnitId" IS NOT NULL;

-- One open damage report per vehicle (a vehicle report carries no unit).
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_tasks_one_open_damage_per_vehicle"
  ON "maintenance_tasks" ("vehicleId")
  WHERE "isDamageReport" = true AND "deletedAt" IS NULL AND "status" <> 'COMPLETED' AND "inventoryUnitId" IS NULL AND "vehicleId" IS NOT NULL;

-- A unit is on at most one open kit line.
CREATE UNIQUE INDEX IF NOT EXISTS "kit_items_one_open_line_per_unit"
  ON "kit_items" ("inventoryUnitId")
  WHERE "removedAt" IS NULL AND "inventoryUnitId" IS NOT NULL;
```
- Run `scripts/check-migration-safety.sh "origin/development"` **after** committing; before a commit it reports a false "no migrations".
- **Don't add the indexes to `.github/workflows/verify.yml`** (the P1-1a precedent). `tests/pr3a-asset-status.test.ts:50-53` and `:242-245`, `tests/pr3a-status-owner-routes.test.ts:114` and `tests/pr1a-list-envelope.test.ts:112` seed two open repairs on purpose (legacy rows): with the indexes present, 7 tests in those 3 files fail. The new test creates the indexes from the migration file. Say so in the PR body.

**2.2 · `prisma/schema.prisma`** (comments only; for `<ts>`, use the folder name you created in 2.1):
- Above `@@map("maintenance_tasks")` (`:700`): `// P1-2 D2: at most one open damage report per unit and per vehicle — partial unique indexes maintenance_tasks_one_open_damage_per_unit / _per_vehicle (migration <ts>_p1_2_one_open_repair_one_open_line). Prisma can't model them.`
- In `KitItem`, above `@@index([inventoryUnitId])` (`:355`): `// P1-2 D2: a unit is on at most one open line — partial unique index kit_items_one_open_line_per_unit (same migration). This plain index stays for lookups.`

**2.3 · B4-8 · Every damage-task writer takes the asset first** (`src/lib/maintenance.ts`). Add after `openTaskWhere` (`:129-133`):
```ts
/** P1-2 D2 (B4-8): every damage-task writer — open, join, reopen, close and field fix — takes the
 *  asset's own row first, then the task, so find-then-create can't race and no two writers take
 *  the rows in opposite orders. The partial unique indexes are the backstop. */
export async function lockAsset(tx: Tx, asset: AssetRef): Promise<void> {
  if (asset.kind === 'vehicle') await tx.$queryRaw`SELECT 1 FROM "vehicles" WHERE "id" = ${asset.id} FOR UPDATE`
  else await tx.$queryRaw`SELECT 1 FROM "inventory_units" WHERE "id" = ${asset.id} FOR UPDATE`
}
```
- `openDamageTask`: after `:148` (the `assertSerialized` line), `if (asset.kind !== 'item') await lockAsset(tx, asset)`.
- `closeDamageTask`: right after `const asset = await assetOf(tx, task)` (`:283`), before the REOPEN branch: `if (asset) await lockAsset(tx, asset)`. This covers every reason (COMPLETED, FIELD_FIX, DELETED, RETIRED, REOPEN). **Not only REOPEN:** today a close takes the task row and then the asset (`:317`, then `restoreIfClear` at `:319`), while a locked open would take the asset and then the task; the two would deadlock.
- **Field fix (BD-8)** (`src/app/api/maintenance/field-fix/route.ts`): import `lockAsset` with `closeDamageTask` (`:7`); the transaction's first statement (`:66`) is `if (asset) await lockAsset(tx, asset) // P1-2 D2 (B4-8): the asset first, then its tasks`. Without it, field fix is safe only because its audit row's foreign key waits behind another writer's `FOR UPDATE`. With it, a field fix racing a report runs wholly before or wholly after it.
- Lock order after this: End and the returns hold the deployment, then the line, then the unit (`placeUnits` or End's unit update comes before `openDamageTask`), then the task. Report-problem, report-damage, open-task, field fix, `/complete`, the PATCH close, delete, retire and review-inoperable take the asset, then the task. Alert rows come last (2.10 adds the unit's review bell after the unit, the order End's write-off already uses).
- No new catch. A 23505 from the repair indexes can't happen through these paths; if it ever did, the route's existing 500 lets the queue retry, and the retry joins the open task.

**2.4 · B4-5 · Any open line holds the unit** (`src/lib/asset-status.ts` `restoreIfClear`, `:85-88`):
- `where: { removedAt: null, inventoryUnitId: asset.id }`, with `// P1-2 D2 (B4-5): any open line holds it — an ended deployment's line still waiting on a transfer too (§0-s, D52), so a repair closed meanwhile can't free a unit its recipient is about to take.`
- Drop `LIVE_KIT_ITEM` from the import at `:4` (this was its only use in the file).
- Module comment (`:16`): `CHECKED_OUT ⇔ an open kit line (on a live deployment, or waiting on a transfer from an ended one)`. Doc at `:58-60`: the same words.
- This also holds a unit on a line left open on an ended deployment with no transfer (an INV-10 leftover). Nothing in the app can close such a line, so owner read P2-R4 clears them before D2 merges (§6). Don't narrow this `where` to "live or waiting": that frees the unit while its line is open, and its next scan-in hits the index.

**2.5 · B4-5 · A transfer moves the line's own unit:**
- `src/app/api/deployments/[id]/transfer/route.ts:138`: `inventoryUnitId: kitLines.find((ki) => ki.id === i.kitItemId)!.inventoryUnitId`. The schema field stays (old phones send it) and its value is ignored; TransferDialog already sends the line's unit (`TransferDialog.tsx:130`).
- `src/app/api/transfers/[id]/accept/route.ts:213`, `:222`, `:232`: `currentKitItem?.inventoryUnitId ?? null` (the in-transaction read at `:175`), not `ti.inventoryUnitId`.

**2.6 · B4-15 · The review queue stays put** (Q5; `src/lib/asset-status.ts`, `src/lib/maintenance.ts`):
- `pullForRepair(tx, asset, opts: { fromInoperable?: boolean } = {})`. The unit `where` (`:50`): `status: { notIn: opts.fromInoperable ? ['RETIRED', 'IN_MAINTENANCE'] : ['RETIRED', 'IN_MAINTENANCE', 'INOPERABLE'] }`. Doc: `INOPERABLE is the admin's review queue (D-c): only the admin's own Send for repair (source ADMIN_REVIEW) moves it on.`
- `maintenance.ts:214`: `await pullForRepair(tx, asset, { fromInoperable: f.source === 'ADMIN_REVIEW' })`. REOPEN (`:298`) keeps the default. `review-inoperable` REPAIR (`inventory/[id]/review-inoperable/route.ts:74-87`) relies on this and keeps working.
- **Send for repair keeps the admin's details (CD-5).** Q5 makes "Inoperable with an open repair" a normal state, so the admin's Send for repair now often **joins** that repair, and the join branch (`:156-170`) keeps only the notes and `returnHubId`. In `openDamageTask`'s `if (existing)` branch, after the `returnHubId` update:
```ts
    // P1-2 D2 (Q5): the admin's Send for repair on a unit whose report stayed open in review
    // keeps the admin's repair details instead of dropping them.
    if (f.source === 'ADMIN_REVIEW') {
      await tx.maintenanceTask.update({
        where: { id: existing.id },
        data: {
          ...(f.repairType != null && { repairType: f.repairType }),
          ...(f.shopName != null && { shopName: f.shopName }),
          ...(f.shopAddress != null && { shopAddress: f.shopAddress }),
          ...(f.dateDelivered != null && { dateDelivered: f.dateDelivered }),
          ...(f.purchaseOrder != null && { purchaseOrder: f.purchaseOrder }),
          ...(f.invoiceNumber != null && { invoiceNumber: f.invoiceNumber }),
          ...(f.repairHubId != null && { repairHubId: f.repairHubId }),
        },
      })
    }
```
- `returnUnit` (rev 4.1 adds a `returnHubId` option here; re-grep). `placeUnits` still runs first (`:154`), so the unit's location follows the return.
  - GOOD branch (`:167-171`), first line: `if (unit.status === 'INOPERABLE') return 'INOPERABLE' // P1-2 D2 (B4-15, Q5): a return doesn't move a unit out of review`.
  - Damaged branch (`:173-179`): `openDamageTask` still runs, so the report and its notes are kept (D43: a damaged return is never task-less), and `pullForRepair` leaves INOPERABLE. Then `return unit.status === 'INOPERABLE' ? 'INOPERABLE' : 'IN_MAINTENANCE'`.
  - Add one bullet to the doc (`:128-143`): `• INOPERABLE (in admin review) stays INOPERABLE; a damaged return still opens or joins its repair.` Callers push to `returning` only for IN_TRANSIT, so no hub-return link is issued.
- **End never marks another line's unit (BD-5).** A line with no unit picks a stand-in unit for "Can it be fixed?" with no exclusion, so it can pick another deployment's unit, and after Q5 the wrong Inoperable mark sticks. End (`end/route.ts:309-310`) and the bulk return (`items/route.ts:547-549`): the fallback becomes `findFirst({ where: { inventoryItemId, status: 'CHECKED_OUT', kitItems: { none: { removedAt: null } } } })`. Lines with no unit on serialized gear are legacy or API-only (the screens block them).

**2.7 · R7a · Field fix: any gear, any crew; the record names who logged it** (`src/app/api/maintenance/field-fix/route.ts`; B3-15 accepted, §9). **Build no custody check.** Rev 2's 403 (another crew's gear), its 409 for a shop repair type and its 409 for a live work order are withdrawn, with their tests and acceptance row. What stays: `requireAuth` (`:42-43`, 401 when signed out; operators and admins are the only roles), admins can do anything, and the PR-6 consumable 409 (`:58-64`).
- The field-fix record (`:78-92`) gains, after `notes,` (`:87`): `reportedById: session.userId, // P1-2 D2 (R7a): who logged the fix (Admin → Maintenance shows the name)`. Today the record names nobody. The column exists (CC-34 1b), so no migration. Admin → Maintenance → Completed shows the name on the "Fixed in field" row, in the "Reported / Due" column and as "Reported by <name>" in its drawer (`maintenance/page.tsx:687`, `:727`).
- In the doc comment (`:22-33`), the D-c paragraph (`:26-32`, from ` * D-c (PR-3a)` to the line before ` */`; `:27-33` after S3) becomes the lines below. The two lines above it (`Log a fixed-in-field issue …`, `Accessible by operators and admins.`) stay.
```ts
 * D-c (PR-3a): "Log fixed issue" closes every open damage report on the asset
 * (`closeDamageTask(FIELD_FIX)`, alerts resolved) and returns it to service — vehicle
 * ACTIVE, unit CHECKED_OUT if an open line still holds it else AVAILABLE. An admin's
 * OUT_OF_SERVICE and a RETIRED unit stay as they are. P1-2 D2 (round 7): an INOPERABLE
 * unit goes back to service too, with or without an open repair, and leaves the admin's
 * review ("fixed means fixed", `restoreIfClear`'s `fixed`). A field fix is a fix, not a
 * report. Then the audit row: a COMPLETED MaintenanceTask with resolutionPath=IN_FIELD,
 * as before, now naming who logged it (`reportedById`). No DAMAGE_REPORTED alert — the
 * issue was noticed and fixed on the spot. An item-only fix (no unit) has no asset to
 * settle and writes the audit row alone.
 *
 * P1-2 D2 (round 7, B3-15 accepted by the owner): any operator or admin may log a field
 * fix on any gear, whoever has it, including a repair a shop has. No custody check.
```
- A field fix on a repair with a work order out closes it like any other: COMPLETED, `completedAt` set, `resolutionPath` IN_FIELD. What the shop's link accepts after that is Security S4's rule (R7c, §4), not D2's.
- Operators see no change: today's code has no custody check either. Admins see the name.

**2.8 · Rollback note** (add to `PILOT_ROLLBACK.md` under §1 in this PR; for `<ts>`, use the folder name from 2.1): `**P1-2 D2 (one open repair, one open line; migration <ts>_p1_2_one_open_repair_one_open_line).** Rolling back past it leaves the three partial unique indexes in place, and the old revision runs against them. It can only hit them in the races and leaks D2 closed: two reports of one asset at the same moment (the second gets a 500, and the phone's retry joins the open repair); a repair closed while its unit waits on a transfer, or a return of a counted line that marks a unit still waiting on a transfer as back, and that unit then picked again (Start answers 409 with the wrong words, Add items a retried 500; answer the transfer). Never drop the indexes by hand.`

**2.9 · BD-1 · A return sweep never takes a unit an open line names** (`src/lib/check-log-helpers.ts` `getUnitsInOtherRigs`, `:17-32`). A return of a line with no unit "sweeps" CHECKED_OUT units of the item and skips only units on another **live** deployment's line. So it can take a unit still on a line waiting on a transfer, on this deployment or an ended one: the unit goes Available while its transfer waits, and its next scan-in hits D2's line index (ran: Start 409 with the wrong words). The `where` becomes:
```ts
    where: {
      inventoryItemId,
      removedAt: null,
      inventoryUnitId: { not: null },
      // P1-2 D2 (B4-5): any open line holds its unit — another live deployment's, an ended one's
      // line waiting on a transfer, or a waiting line on this same deployment (D51, §0-s). The
      // line being returned is already closed, or names no unit.
    },
```
Rename the third parameter `_excludeRigId` (ESLint accepts it; checked) and make the doc say "the units of this item that any open kit line names". The name and the callers stay: End `:209`, `:282`; items `:441`, `:519`; `[kitItemId]` `:183`; D3 3.3. A partly returned consumable line that names a unit keeps that unit out while the line is open.

**2.10 · R7b · Fixed means fixed** (`src/lib/asset-status.ts` `restoreIfClear`, `src/lib/maintenance.ts` `closeDamageTask`, `src/app/api/maintenance/field-fix/route.ts`). Q5 makes "Inoperable with an open repair" a normal state (2.6). When that repair is completed, or a field fix is logged on the unit with or without an open repair, the unit goes back to service and leaves the review. The status write stays in `asset-status.ts` (D42).
- `asset-status.ts:3`: `import { resolveActiveAlert, resolveAlertsFor } from '@/lib/alerts'`.
- `restoreIfClear` (`:62-95`): `opts: { excludeTaskId?: string; fixed?: boolean } = {}`. Replace the last statement (`:94`, `return res.count > 0 ? to : null`) with:
```ts
  if (res.count > 0) return to
  // P1-2 D2 (round 7): fixed means fixed. A completed repair or field fix on a unit in the
  // admin's review ends the review: back to service, and its review bell (raised when it was
  // marked Inoperable) is marked read. The unit row is already locked (lockAsset, in
  // closeDamageTask and at the top of the field fix).
  if (opts.fixed) {
    const fromReview = await tx.inventoryUnit.updateMany({
      where: { id: asset.id, status: 'INOPERABLE' },
      data: { status: to },
    })
    if (fromReview.count > 0) {
      await resolveActiveAlert('DAMAGE_REPORTED', 'inventory_units', asset.id, tx)
      return to
    }
  }
  return null
```
  `to` is the existing rule: CHECKED_OUT when an open line holds the unit (2.4), else AVAILABLE. The doc (`:55-61`): `OUT_OF_SERVICE and RETIRED are never touched (D-c). INOPERABLE moves only with fixed (P1-2 D2, round 7): the caller is completing a repair (the admin's Complete) or logging a field fix (with or without an open repair), never a delete, so the unit leaves the admin's review the same way.` The module comment (`:19-20`) adds: `with one exception: a completed repair or a field fix on an INOPERABLE unit puts it back in service (P1-2 D2, round 7, restoreIfClear's fixed).`
- `closeDamageTask` (`maintenance.ts:319`):
```ts
  // P1-2 D2 (round 7): a repair completed (the admin's Complete, the PATCH close or a field fix)
  // also takes an INOPERABLE unit out of the admin's review — fixed means fixed. Delete and
  // retire are not fixes.
  if (asset) await restoreIfClear(tx, asset, { excludeTaskId: taskId, fixed: reason === 'COMPLETED' || reason === 'FIELD_FIX' })
```
  Its doc (`:263-272`): after `holds it (restoreIfClear`, add `; COMPLETED and FIELD_FIX also free an INOPERABLE unit, P1-2 D2 round 7`.
- **Field fix with no open repair (rev 3.1).** The field fix's own `restoreIfClear`, after the audit row (`field-fix/route.ts:93-94`), passes `fixed: true`, so a fix frees an INOPERABLE unit even when there was no repair to close:
```ts
    // An asset left IN_MAINTENANCE with no open report (an orphan) is back in service too. So is
    // an INOPERABLE unit with no open repair (P1-2 D2, round 7: fixed means fixed).
    if (asset) await restoreIfClear(tx, asset, { fixed: true })
```
  With an open repair this call changes nothing: `closeDamageTask(FIELD_FIX)` already freed the unit. A vehicle ignores `fixed`.
- **Which paths clear Inoperable** (only `restoreIfClear` with `fixed` does it):

| Path | Clears? | Why |
|---|---|---|
| Field fix with an open repair, by anyone (`closeDamageTask(FIELD_FIX)`) | Yes | R7b. |
| The admin's Complete (`maintenance/[id]/complete`, `COMPLETED`) | Yes | The same rule. A hub destination then puts the unit at that hub (D51), as today. |
| The admin sets the repair Completed (the PATCH, `maintenance/[id]/route.ts:113`) | Yes | The same call. |
| The shop link's Completed (`status-links.ts:306-311`) | Not by itself | It never closes the repair (CC-34 3e, `:233-236`): it marks the link done and rings "ready to finalize". The admin's Complete that follows clears it (§9). |
| Delete the repair (`DELETED`) | No | Not a fix. The unit stays in review with its bell. |
| Retire (`RETIRED`) | — | The unit is retired anyway. |
| A field fix on an Inoperable unit with no open repair | Yes | The owner's answer (rev 3.1): a field fix is a fix. The field fix's own `restoreIfClear` (`:94`) passes `fixed: true`. The record names the operator. |
| A return, or any report (report-problem, report-damage) | No | Q5. They call `openDamageTask` or `returnUnit`, never `restoreIfClear` with `fixed`. |

- With two open repairs (legacy rows), only the last one completed frees the unit: the `stillOpen` check runs first. Vehicles have no Inoperable state; an admin's Out of service stays as it is.
- The review bell is the DAMAGE_REPORTED alert keyed on the unit: End and the bulk return raise it on "No — write off" (`end/route.ts:362`, `items/route.ts:601`), and review-inoperable clears the same key (`:98`). `resolveActiveAlert` marks its bell rows read. The unit's `inoperableNotes`, `inoperableReportedAt` and `inoperableReportedById` stay as history, as Send for repair leaves them.
- **Lock order: unchanged.** `closeDamageTask` already holds the unit (2.3), and so does a field fix with no open repair (its first statement, 2.3). The new writes are that unit row, then its alert row. End's write-off takes the unit (`markInoperable`), then the same alert row (`createAlert`): the same order. The race test below checks it, with and without an open repair.
- Q5 (2.6) holds: a return or a report never takes a unit out of review. Only a completed repair, a field fix, Send for repair or Retire does. A field fix is a fix, not a report.

**Tests.** Node (CI). **A fresh operator for each run of a race:** Offline O2 limits report-problem and report-damage to 20 an hour per operator (`notify:<userId>`, stored in Postgres; moved there from Security S4), so one operator across 20 runs gets 429.
- New `tests/p1-2-one-open.test.ts`. `beforeAll` finds the migration folder by its `_p1_2_one_open_repair_one_open_line` suffix, reads the three `CREATE UNIQUE INDEX` statements and runs them; `afterAll` drops only the indexes this file created (check `pg_indexes` first). `fileParallelism: false` keeps them out of other files.
  - Race: `Promise.all` of two report-problem calls on one unit, 20 runs → exactly one open task, both 201, both notes on it, never a 500. The same for two vehicle report-damage calls.
  - Race: report-problem and End with fixable damage on the same unit, 20 runs → one open task, never a deadlock message.
  - **Race (the close order):** `Promise.all` of `closeDamageTask(COMPLETED)` and `openDamageTask(REPORT)` on the same unit, each in its own `prisma.$transaction`, 20 runs → no error, never a deadlock message; afterwards the unit has at most one open task.
  - Reopen racing a new report → one open task, or the named 409 (`OpenRepairExists`).
  - Field fix racing a "not usable" report (hold the report at its `createAlert`, the `p1-1a-end-claim` hook pattern) → the fix waits on a lock (`pg_stat_activity`), both 201, at most one open task, never a deadlock.
  - The backstop: a second open damage row for a unit, inserted directly → 23505. The same for a vehicle, and for a second open line of a unit.
  - B4-5: a unit IN_MAINTENANCE on a wholly waiting line; End; `/complete` to a hub → the unit is **CHECKED_OUT**, not pickable. X accepts → it is on X's kit, CHECKED_OUT. Or X declines → AVAILABLE (`releaseFromEndedRig`).
  - A transfer POST naming another unit's `inventoryUnitId` → the TransferItem stores the line's unit, and accept moves the line's unit.
  - 2.9: a legacy consumable unit scanned onto deployment A's line, that line waiting on a transfer to X, and a by-count line of the same item. End returns the by-count line → the unit stays CHECKED_OUT. Start scanning it → 409 `A selected unit was just checked out by someone else…`, never a 23505. X accepts → the unit is CHECKED_OUT on X's kit.
- New `tests/p1-2-review-queue.test.ts` (no indexes needed):
  - report-problem "not usable" on an INOPERABLE unit → stays INOPERABLE, one open task, DAMAGE_REPORTED raised.
  - Then review-inoperable REPAIR with `repairType: 'AT_SHOP', shopName: 'ZZ Shop'` → IN_MAINTENANCE, one open task carrying AT_SHOP, `ZZ Shop` and both notes. The same unit with RETIRE instead → RETIRED, the task closed.
  - review-inoperable REPAIR on an INOPERABLE unit with no open task → IN_MAINTENANCE (regression guard).
  - `returnUnit` GOOD on an INOPERABLE unit → `'INOPERABLE'`, status unchanged, no task, no hub-return link at End. Damaged → `'INOPERABLE'`, one open task with the notes, status unchanged.
  - End "No — write off" on a serialized line with no unit, with another live deployment's CHECKED_OUT unit of the item and one unit no line names → only that unit is INOPERABLE.
  - **Field fix, any gear (R7a).** As an operator of another crew: a live unit with an open repair → 201, the repair closed, the unit stays CHECKED_OUT on its line, and the field-fix record's `reportedById` is that operator. A unit on a line waiting on a transfer from an ended deployment → 201, stays CHECKED_OUT. An AT_SHOP repair → 201, closed. A repair with an ISSUED work order → 201, the repair COMPLETED with `completedAt` set, the link row untouched (S4's tests own what it accepts). As an admin → 201, the record names the admin. No session → 401.
  - **Fixed means fixed (R7b).** Make the unit the app's way: End "No — write off" (raises the review bell), an admin bell row for that alert, then a "not usable" report that opens a repair (the unit stays INOPERABLE). Then, each from that start:
    - a field fix by an operator of another crew → AVAILABLE, 0 open repairs, the review bell resolved and its row read, not in `GET /api/inventory/inoperable-units`;
    - the admin's Complete to a hub → AVAILABLE at that hub, the same;
    - PATCH `status: 'COMPLETED'` → AVAILABLE, the same;
    - DELETE the repair → stays INOPERABLE, the bell active, still listed;
    - the shop's COMPLETED (`applyTransition` on its work order) → stays INOPERABLE with the repair open; then the admin's Complete → AVAILABLE.
  - An INOPERABLE unit with no open repair (End "No — write off", an admin bell row) + a field fix by an operator of another crew → AVAILABLE, the review bell resolved and its row read, not listed; the record names the operator.
  - Q5 with no repair: on that written-off unit, a "still usable" report, a "not usable" report and a GOOD `returnUnit` each leave it INOPERABLE, the bell active, still listed; then a field fix → AVAILABLE, the bell read, not listed.
  - An INOPERABLE unit on an open line (seeded, INV-8's state) + a field fix, with an open repair and with none → CHECKED_OUT, not AVAILABLE.
  - Two open repairs on an INOPERABLE unit (legacy rows; this file has no indexes): Complete one → still INOPERABLE; the second → AVAILABLE.
  - A vehicle Out of service with an open repair + a field fix → stays OUT_OF_SERVICE (regression guard).
  - **Race (R7b):** End "No — write off" on a unit ∥ a field fix on it by another operator, 20 runs with an open repair and 20 with none, a fresh pair of operators each run, the fix started 0–95 ms late so both orders occur → End 200 and the fix 201 every time, never a deadlock, 0 open repairs, and always either INOPERABLE with its bell active (the fix ran first, before the write-off) or AVAILABLE with none (End ran first: a fix after the write-off puts the unit back in service, repair or not). Each set has at least one AVAILABLE run. In rev 3, every run with no open repair ended INOPERABLE.

**Existing tests that change:** none (rev 3.1's code ran green against the full suite, §9, and so did the practice build's D2).

**Must pass unchanged:** `pr3a-asset-status` (incl. the two-open fixtures, and `:69-81`: `restoreIfClear` with no `fixed` leaves INOPERABLE), `pr3a-status-writers-guard`, `pr3a-status-owner-routes` (field-fix matrix `:63-99`), `cc10-field-fix`, `pr5b-dead-ends` (Reopen 409), `cc34-orphan-closure` (incl. `:146` review REPAIR), `ur029-repaired-unit-returns`, `p1-1c-where-things-are` (`/complete` placements; `:414` admin field fix), `pr6-serialized-only` (`:194` field fix; `:289-325` legacy units), `consumable-return-scoping`, `ur001-bulk-return-perhub` and `data-integrity` (the sweeps), `transfer-lifecycle`, `fnd2-transfer-consumable-stock`, `transfer-handler-uniqueness`, `uxp3-photos-d36`, `cc34-schedules-and-alerts:138-157` (a shop COMPLETED on an open task), S4's `p1-2s4-portal-bounds` (incl. its after-close shop-link cases); UI: `pr6-serialized-only.test.tsx`.

**What people see (PR body: Behaviour changes).**
- Operators: two people reporting the same broken asset at once get one repair with both notes. Log fixed issue works on any gear, whoever has it, as today. On a unit in admin review, it puts the unit back in service, with or without an open repair.
- Admins: an Inoperable unit stays in the review list after a return or a "not usable" report. Such a unit can now also have an open repair. Completing that repair (Complete, or setting it Completed) or anyone's field fix (with or without an open repair) puts the unit back to Available (Checked out if a line still holds it), takes it off the review list and marks its review bell read; deleting the repair doesn't. Until then the 7-day stale-repair bell can ring for it, and deleting its item asks for the repair to be closed first. Send for repair on it keeps the shop details entered.
- Admins: a field fix now shows who logged it (Admin → Maintenance → Completed, the "Fixed in field" row).
- Admins: closing a repair while its unit waits on a transfer leaves the unit with the transfer (Checked out), not on the shelf. A return of a counted line no longer marks a unit that is still waiting on a transfer as back.
- Deploy: the migrate job creates three indexes. If a duplicate slipped in after the owner reads, the job fails, the deploy stops and the old revision keeps serving (§6 says what to do).

**Interpretations (PR body).** R7b's "unless it's on an open line" means Checked out, not Available (D42: Checked out means on an open line). "The admin sees it in Activity" is Admin → Maintenance → Completed (owner, rev 3.1). A field fix on an Inoperable unit with no open repair puts it back in service too (owner, rev 3.1): a field fix is a fix, not a report, so Q5 doesn't apply to it. A fix saved on a phone offline counts when it reaches the server: if the unit was written off in between, the fix puts it back in service. The shop's Completed frees nothing by itself; the admin's Complete does. `getUnitsInOtherRigs` keeps its name and an unused third parameter, so no caller changes. Field fix takes the asset first, so a racing report lands wholly before or after it.

**Acceptance (owner, app screens).** State Active Deployments first. Test data: "ZZ P1-2 … (throwaway)", through the app's screens. Rows marked (owner) need a test operator signed in with a PIN.
1. The deploy's migrate job is green.
2. Report a problem on a test unit twice → Admin → Maintenance shows one open repair with both notes (regression).
3. (owner) As a test operator, scan another crew's test unit that has an open test repair → Log fixed issue → it saves. Admin → Maintenance → Completed shows the repair closed and a "Fixed in field" row with that operator's name.
4. End a test deployment with a test unit marked damaged, "No — write off" → Inventory → the item → Units shows it Inoperable with Send for repair and Retire (regression).
5. (owner) Then, as a test operator, scan that unit → Report a problem, not usable → Units still shows it Inoperable. Log fixed issue on it → Units shows it Available, and the Maintenance review list no longer has it.

The review queue staying put after a return is node tests only.

**Touched:** new migration, `prisma/schema.prisma` (comments), `src/lib/maintenance.ts`, `src/lib/asset-status.ts`, `src/lib/check-log-helpers.ts`, `src/app/api/deployments/[id]/transfer/route.ts`, `src/app/api/transfers/[id]/accept/route.ts`, `src/app/api/deployments/[id]/end/route.ts`, `src/app/api/deployments/[id]/items/route.ts`, `src/app/api/maintenance/field-fix/route.ts` (the lock, the name, `fixed: true`, the comment), `PILOT_ROLLBACK.md`, two new tests (`p1-2-one-open`, `p1-2-review-queue`).

---

## 3 · D3 · Deployment edges and reservation books (B4-16 rest, Q3, the decline/cancel sweep, B4-19 pick, B4-6, B4-7, B1-8, B2-21)

**Goal.** Add crew needs a live deployment; a whole-deployment accept cancels waiting equipment transfers; decline and cancel don't free a unit an open line names; a consumable checkout marks no legacy units; reservation line edits can't land after Stage; INV-3 checks both sides; a hold that doesn't match the stock is a named 409 and an over-release is reported; "Can it be fixed?" is answered on screen; admin quantity fields keep what is typed. No migration. Size M–L (mostly small edits). **B5 §3 (add after End → "already ended") is O1's, not here: don't touch `src/lib/deployment-auth.ts`.**

**3.1 · B4-16 rest · Add crew needs a live deployment** (`src/app/api/deployments/[id]/operators/route.ts` POST; import `claimActiveRig, DeploymentEnded` from `@/lib/deployment-auth`):
- First statement in the transaction (`:44`, before the `rigOperator.upsert` at `:45`): `await claimActiveRig(tx, id) // P1-2 D3 (B4-16): an ended deployment takes no crew`.
- First line of the catch (`:55`): `if (err instanceof DeploymentEnded) return NextResponse.json({ error: err.message }, { status: 409 })`.

**3.2 · Q3 · A whole-deployment accept cancels waiting equipment transfers:**
- `src/lib/deployment-handoffs.ts`, after `cancelPendingHandoffs` (`:94-103`):
```ts
/** P1-2 D3 (Q3): cancel every waiting equipment transfer from a deployment and mark their bells
 *  read. Raw RETURNING, so a transfer accepted in between is never reported as cancelled. */
export async function cancelPendingTransfers(
  rigId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<{ id: string; toOperatorId: string; toOperatorName: string }[]> {
  const rows = await db.$queryRaw<{ id: string; toOperatorId: string; toOperatorName: string }[]>`
    WITH c AS (UPDATE "transfer_requests" SET "status"='CANCELLED', "updatedAt"=now() WHERE "fromRigId"=${rigId} AND "status"='PENDING' RETURNING "id","toOperatorId")
    SELECT c.*, u."name" AS "toOperatorName" FROM c JOIN "users" u ON u."id" = c."toOperatorId"`
  for (const row of rows) await resolveAlertsFor('transfer_requests', row.id, db)
  return rows
}
```
- `src/app/api/deployments/[id]/handoff/route.ts:83-85` (Reassign): `cancelled.transfers = await cancelPendingTransfers(id, tx)` — the same SQL, moved. Import it with the other `deployment-handoffs` names (`:8`); drop `resolveAlertsFor` from the alerts import (`:9`), its only use was `:85`. Rev 4.1 re-reads the primary inside this transaction (`:78`); keep that line where it lands.
- `src/app/api/handoffs/[id]/accept/route.ts`: declare `let cancelledTransfers: { id: string; toOperatorId: string; toOperatorName: string }[] = []` before the `try` (`:41`). After `reassignPrimary` (`:56`), inside the transaction: `cancelledTransfers = await cancelPendingTransfers(handoff.rigId, tx)`. The lock order is the deployment (`:46`), the handoff row, then the transfer rows, as in transfer accept. The lines stay on the deployment (it is live), so nothing is reverted.
- After commit, best-effort, with the other notifications:
```ts
  // P1-2 D3 (Q3): tell each person whose transfer was cancelled (not the new operator — the gear is
  // now theirs), and the old operator once, naming them.
  const newName = handoff.toOperatorName ?? 'The new operator'
  const waiting = new Map(cancelledTransfers.filter((c) => c.toOperatorId !== handoff.toOperatorId).map((c) => [c.toOperatorId, c.toOperatorName]))
  if (waiting.size > 0) {
    await prisma.notification.createMany({ data: [
      ...[...waiting.keys()].map((userId) => ({ userId, type: 'TRANSFER_CANCELLED', title: 'Transfer cancelled',
        body: `${newName} took over the deployment, so the transfer waiting for you was cancelled.`, link: '/operator/my-deployment' })),
      { userId: handoff.fromOperatorId, type: 'TRANSFER_CANCELLED', title: 'Transfer cancelled',
        body: `${newName} took over the deployment and cancelled the waiting transfer to ${[...waiting.values()].join(', ')}.`, link: '/operator/my-deployment' },
    ] }).catch(() => {})
  }
```
  This mirrors the Reassign rows (§0-c of P1-1, `handoff/route.ts:116-140`).

**3.3 · Decline and cancel don't free a unit an open line names.** `src/app/api/transfers/[id]/decline/route.ts:112-116` and `src/app/api/transfers/[id]/route.ts:98-102` (import `getUnitsInOtherRigs` from `@/lib/check-log-helpers`):
```ts
          // P1-2 D3: the same rule End and the returns use — never a unit an open line names (D2 2.9).
          const exclude = await getUnitsInOtherRigs(tx, kitItem.inventoryItemId, transfer.fromRigId)
          const units = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: kitItem.inventoryItemId, status: 'CHECKED_OUT', ...(exclude.length > 0 && { id: { notIn: exclude } }) },
            take: kitItem.quantity,
          })
```
Both routes close the transfer's own line before this sweep, and the sweep runs only for a line with no unit, so D2 2.9's rule is exactly right here.

**3.4 · B4-19 · A consumable checkout picks no units** (Q6): `src/app/api/deployments/route.ts:236-239` and `src/app/api/deployments/[id]/items/route.ts:173-176`:
```ts
          // P1-2 D3 (B4-19, Q6): only serialized gear picks units. A consumable's legacy units (D-z)
          // stay as they are — its stock rows decide (PR-6).
          const available = requireUnits
            ? pickableFirst(await tx.inventoryUnit.findMany({ where: { inventoryItemId: ki.inventoryItemId, ...PICKABLE_UNIT }, select: { id: true, status: true } })).slice(0, quantity)
            : []
```
In the items route the names are `availableUnits`, `entry.inventoryItemId` and `entry.quantity`. The serialized-by-count path is unchanged.

**3.5 · B4-6 · A line edit can't land after Stage** (`src/lib/deployment-requests.ts` `setLineFulfillment`, transaction at `:397-418`). Security S4 (4.2) adds its checks earlier in this function (after `:377`) and moves these lines; keep them before the transaction. Wrap the transaction, and make this its first statement:
```ts
  try {
    await prisma.$transaction(async (tx) => {
      // P1-2 D3 (B4-6): take the request's row and re-check it is still REQUESTED, so an edit can't
      // land after Stage took its reserve (lock order: request → lines → stock, A5-12).
      const open = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "deployment_requests" WHERE "id" = ${line.requestId} AND "status" = 'REQUESTED' FOR UPDATE`
      if (open.length === 0) throw Object.assign(new Error('NOT_REQUESTED'), { _code: 'NOT_REQUESTED' })
      // …the existing UPDATE and INSERT
    })
  } catch (err: unknown) {
    if ((err as { _code?: string })._code === 'NOT_REQUESTED') return { ok: false, error: 'Request cannot be modified in the current state.' }
    throw err
  }
```
The words are the existing ones (`:372`). Stage's flip (`:784-790`) takes the same row, and its reserve reads the lines after the flip (`:809`), so the reserve matches the last committed edit.

**3.6 · B4-6 · INV-3 checks both sides** (`src/app/api/cron/dispatch/route.ts:229-242`). Same alert key, label and `sample` mapping; only the query changes:
```sql
      WITH h AS (
        SELECT l."heldItemId" AS "itemId", l."heldHubId" AS "hubId", SUM(l."heldQty" - l."claimedQty") AS "held"
        FROM "deployment_request_lines" l JOIN "deployment_requests" r ON r."id" = l."requestId"
        WHERE l."releasedAt" IS NULL AND l."heldQty" > l."claimedQty" AND r."status" IN ('STAGED','FULFILLED')
          AND l."heldItemId" IS NOT NULL AND l."heldHubId" IS NOT NULL
        GROUP BY 1, 2
      ), s AS (SELECT "itemId", "hubId", "reservedQty" FROM "inventory_stock" WHERE "reservedQty" > 0)
      SELECT COALESCE(h."itemId", s."itemId") AS "itemId", COALESCE(h."hubId", s."hubId") AS "hubId",
             COALESCE(h."held", 0) AS "heldOutstanding", COALESCE(s."reservedQty", 0) AS "reservedQty"
      FROM h FULL OUTER JOIN s ON s."itemId" = h."itemId" AND s."hubId" = h."hubId"
      WHERE COALESCE(h."held", 0) <> COALESCE(s."reservedQty", 0)
```
After P1-1d every reserve is mirrored by held lines (Stage snapshots), so a reserve with no hold is a real leak (owner read P2-I2 lists today's).

**3.7 · B4-7 · An over-release is reported** (`src/lib/inventory-stock.ts` `releaseAtHub`, `:183-190`; its only caller is `releaseHeldLine`):
```ts
/** Release a prior reserve, floored at 0. Returns the shortfall: > 0 means the floor hid an
 *  over-release (P1-2 D3, B4-7) — the caller reports it. */
export async function releaseAtHub(itemId: string, hubId: string, qty: number, db: RawClient = prisma): Promise<number> {
  if (qty <= 0) return 0
  const [row] = await db.$queryRaw<{ reservedQty: number }[]>`
    SELECT "reservedQty" FROM "inventory_stock" WHERE "itemId" = ${itemId} AND "hubId" = ${hubId} FOR UPDATE`
  await db.$executeRaw`
    UPDATE "inventory_stock" SET "reservedQty" = GREATEST("reservedQty" - ${qty}, 0), "updatedAt" = now()
    WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}`
  return Math.max(qty - Number(row?.reservedQty ?? 0), 0)
}
```
In `releaseHeldLine` (`deployment-requests.ts:1291-1294`; add `import * as Sentry from '@sentry/nextjs'`, the cron's import), the call at `:1292` becomes the lines below; `return Number(r.rel)` stays:
```ts
    const short = await releaseAtHub(r.heldItemId, r.heldHubId, Number(r.rel), tx)
    if (short > 0) {
      console.error('[releaseHeldLine] reserve underflow', { lineId, short })
      Sentry.captureMessage('RESERVE_UNDERFLOW', { extra: { lineId, itemId: r.heldItemId, hubId: r.heldHubId, short } })
    }
```
The lock order is the line, then the stock, as in `claimHeldStock`. INV-3 shows the mismatch on the next run.

**3.8 · B4-7 · A broken hold at pickup is a named 409** (`claimHeldStock`, `deployment-requests.ts:1054`; import `ReferenceConflict` from `@/lib/asset-references`, which imports only prisma and populations, so there is no cycle):
```ts
    if (drawn < claim) {
      // P1-2 D3 (B4-7): never a raw 500, never a free draw (H2) — refuse by name and tell Sentry.
      const [it] = await db.$queryRaw<{ name: string }[]>`SELECT "name" FROM "inventory_items" WHERE "id" = ${inventoryItemId}`
      console.error('[claimHeldStock] HOLD_INVARIANT_BREACH', { inventoryItemId, hubId, claim })
      Sentry.captureMessage('HOLD_INVARIANT_BREACH', { extra: { inventoryItemId, hubId, claim } })
      throw new ReferenceConflict(`The reservation for "${it?.name ?? 'this item'}" doesn't match the stock at the hub. Ask an admin to check it.`)
    }
```
Start and Add items already map `ReferenceConflict` → 409 first (`deployments/route.ts:313`, `items/route.ts:268`). The transaction rolls back. The phone shows the words once instead of retrying 8 times.

**3.9 · B1-8 · "Can it be fixed?" is answered on screen** (Q4; `src/components/shared/DispositionDialog.tsx`; UI only, the server rule at `end/route.ts:312` and `items/route.ts:551` stays). O4 edits this file first (an "already saved" notice, `endSaved` in `disabled` and an `Already saved` label, the queued toast). Lines are base, then after O4:
- After `missingPerson` (`:181`; `:193`):
```ts
  // P1-2 D3 (B1-8, Q4): "Can it be fixed?" is answered before sending — a blank used to land as "No".
  const missingFixable = sendable.some((d) => d.type === 'INOPERABLE' && !consumableLines.has(d.kitItemId) && d.canBeFixed === undefined)
```
- The guard (`:196`; `:208`): `if (missingHub || missingPerson || missingFixable) return`.
- `disabled` (`:415`; `:450`), with O4's `!!endSaved` kept: `disabled={loading || missingFixable || missingHub || missingPerson || (mode === 'remove-items' && sendable.length === 0) || !!endSaved}`.
- The label (`:418`; `:453`). O4's `Already saved` stays first, then `missingFixable`:
```tsx
          {loading ? 'Working…' : mode === 'end-deployment' && endSaved ? 'Already saved' : missingFixable ? 'Say if it can be fixed' : missingHub ? 'Pick a return hub' : missingPerson ? 'Pick a person' : mode === 'end-deployment' ? 'End Deployment' : 'Return Items'}
```
  An End already saved on the phone stays disabled (`!!endSaved`), so its button must say `Already saved`, not ask for an answer the user can't send.
- The select (`:360-364`; the `value` line `:399`) gains `error={disp.canBeFixed === undefined}`.
- Preset lines (`initialDisposition`, `:97-99`) already answer Yes.

**3.10 · B2-21 · Quantity fields keep what is typed; checked on submit.**
- `src/app/(admin)/admin/deployments/page.tsx`:
  - `:188` `React.useState('1')`; `:764` `setRemoveQty(String(ki.quantity))`; `:1074` `onChange={(e) => setRemoveQty(e.target.value)}`.
  - After `removeWriteOff` (`:558`):
  ```ts
  // P1-2 D3 (B2-21): keep what the admin typed; check it here instead of clamping each key.
  const removeMax = removeDialog.kitItem?.quantity ?? 1
  const removeQtyNum = Number(removeQty)
  const removeQtyOk = removeDialog.kitItem?.item.itemType !== 'CONSUMABLE' || (Number.isInteger(removeQtyNum) && removeQtyNum >= 1 && removeQtyNum <= removeMax)
  ```
  - The field (`:1070-1078`) gains `error={!removeQtyOk}` and `helperText={removeQtyOk ? undefined : \`Enter 1–${removeMax}\`}`. Return (`:1091`): `disabled={actionLoading || !removeQtyOk || (!removeWriteOff && !removeHubId)}`. The body (`:565`) sends `quantity: removeQtyNum`.
- `src/app/(admin)/admin/inventory/page.tsx` `MoveStockDialog`: `:563` `React.useState('1')`; in `handleSubmit` (`:572`) `const n = Number(qty)` and `:578` `if (!Number.isInteger(n) || n < 1) errs.qty = 'Quantity must be at least 1'`; `:586` sends `qty: n`; `:638` `onChange={(e) => { setQty(e.target.value); setFieldErrors({}) }}`.
- D10: these are point fixes on the admin pages, not splits.

**Tests.** Node (CI):
- New `tests/p1-2-deployment-edges.test.ts`:
  - **Clean up `rig_operators` after each test** (DX-1): `afterEach(async () => { await prisma.rigOperator.deleteMany() })`. An add crew that wins writes a `rig_operators` row, and `tests/setup.ts` never deletes that table. Its `rig.deleteMany()` then fails on `rig_operators_rigId_fkey`, the database stays dirty, and every later test in the run fails (25 in the practice build, `ur010` included).
  - Add crew to an ended deployment → 409 `This deployment has already ended.` and no assignment row. Race: `Promise.all(End, add crew)` 20 runs → never an open assignment on an ended deployment; INV-11 quiet after the cron.
  - Handoff accept with waiting equipment transfers to X and to the new operator → both CANCELLED; X gets one `Transfer cancelled` and X's earlier bell is read; the new operator gets none; the old operator gets one naming X; the lines stay open. With no waiting transfer → no extra rows (regression guard).
  - Reassign still cancels and tells as in P1-1a (regression guard: `p1-1a-field-writes` keeps it).
  - Decline, and separately cancel: an ended deployment's legacy consumable line of 2 with two unlinked CHECKED_OUT units, plus a third unit of the item on another live deployment's line, plus a fourth on a line of the same ended deployment waiting on another transfer → only the two become AVAILABLE.
  - Start and Add items of a consumable that has AVAILABLE legacy units → the units stay AVAILABLE; stock drawn and the line as before. A serialized item by count still picks units (regression guard, as `wave-a-correctness:82`).
- New `tests/p1-2-reservation-books.test.ts`. Mock Sentry with a factory, as `cc30-cron-lock-connect-error.test.ts:31` does: `vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))` (the cron calls `captureException`). A bare `vi.mock('@sentry/nextjs')` gives no `captureMessage`, and every test in the file fails. Clear it in `beforeEach`: `vi.mocked(Sentry.captureMessage).mockClear()` (`import * as Sentry from '@sentry/nextjs'`).
  - An edit after Stage → refused with the existing words (regression guard).
  - Race: `Promise.all(stage, line edit to qty 3)` 20 runs → `reservedQty == Σ held` for the pair; INV-3 quiet after the cron (also passes before D3: a race; the edit after Stage is the guard).
  - A stock row with `reservedQty` 2 and no hold → INV-3 raised; cleared once the row is fixed. Mixed staged and fulfilled holds that match → quiet.
  - A release with `reservedQty` below the hold → floored at 0, Sentry called once with `RESERVE_UNDERFLOW`.
  - Start and Add items Pick Up against a broken reserve → 409 naming the item; stock, lines and `claimedQty` unchanged.

UI (jsdom), new `tests/components/p1-2-integrity-screens.test.tsx`:
- A serialized line switched to Mark Inoperable / Damaged → the button reads `Say if it can be fixed` and is disabled. "No — write off" → enabled, and the body has `canBeFixed: false`. "Yes — send for repair" → it needs a hub.
- Admin Return item on a ×3 consumable: clear the field → it stays empty and Return is disabled; type `2` → the DELETE body has `quantity: 2`; `5` → disabled with `Enter 1–3`.
- Move stock (render the inventory page as `tests/components/p1-1c-where-things-are.test.tsx` does): clear → the field stays empty (`expect(qty).toHaveValue(null)`; before D3 it shows 1); then `3` → the POST body has `qty: 3`. The empty-field check is the one that fails before D3: with `fireEvent.change`, typing `3` passes on the old code too.

**Existing tests that change:**
- `tests/ur010-hold-through-claim.test.ts:199-201`: `.rejects.toThrow('HOLD_INVARIANT_BREACH')` → `.rejects.toThrow(/doesn't match the stock/)`. The rollback asserts stay.
- `tests/components/DispositionDialog.test.tsx:83-99`: after choosing Mark Inoperable / Damaged, pick `No — write off` before asserting the button is enabled. D36's point (no photo needed) stays.

**Must pass unchanged:** `p1-1a-end-claim` (`active` and `claim` hooks), `p1-1a-field-writes` (incl. Reassign after end and the cancel rows), `transfer-lifecycle`, `data-integrity`, `consumable-return-scoping`, `wave-a-correctness`, `pr3a-status-owner-routes:205-218`, `fnd1-ended-deployment-operator`, `pr3b-guards` (`:328` add a deactivated operator → 409), `pr6-serialized-only`, `f3-line-checklist`, `r4-hub-stock-reserve`, `ur010-hold-through-claim` (the rest), `p1-1d-staged-ready` (incl. 17), `p1-1e-expired-holds` (incl. 7), `step7-stale-hold-release`, S4's `p1-2s4-portal-bounds`; UI: `p1-1b-screens` (incl. `:378`), `pr3b-guards.test.tsx:237-255`, `pr6-serialized-only.test.tsx:253-278`, `copy-contract`, `FulfillmentChecklist`.

**What people see (PR body: Behaviour changes).**
- Operators: in End deployment and Return equipment, a line marked damaged needs "Can it be fixed?" answered; the button reads `Say if it can be fixed`. Actions already saved on a phone keep the old rule (blank = admin review). When someone accepts a whole-deployment transfer, equipment transfers from it that were waiting are cancelled; each waiting person gets `Transfer cancelled`.
- Operators: a Pick Up or Start against a reservation whose hold doesn't match the hub's stock fails with `The reservation for "<item>" doesn't match the stock at the hub. Ask an admin to check it.` (it used to be a server error retried 8 times).
- Admins: add crew to an ended deployment → `This deployment has already ended.` Return item and Move stock quantity fields can be cleared and retyped; a bad number is caught on submit. A checklist edit after Stage is refused. INV-3 now also flags a hub reserve with no reservation behind it (P2-I2 lists today's).
- A consumable checkout no longer marks its legacy units out. Returns still bring legacy units home (PR-6), so a return of a new consumable line may bring home units an older line marked out; counts are unaffected (stock decides, D-z).

**Acceptance (owner, app screens).** State Active Deployments first. Throwaway data through the app's screens. Row 3 needs two people signed in, so it is the owner's.
1. End deployment on a test deployment: mark a serial-numbered line damaged → the button reads `Say if it can be fixed` until answered.
2. Admin → Deployments → Return item on a ×3 test consumable: clear the quantity, type 2 → it returns 2. Inventory → Move stock: clear the quantity, type 1 → it moves 1.
3. (owner) Transfer one test item to person A (don't answer). Transfer the whole test deployment to B; B accepts → A's bell shows `Transfer cancelled`.

Add crew on an ended deployment, the sweep, the books and the races: node tests only.

**Touched:** `src/app/api/deployments/[id]/operators/route.ts`, `src/lib/deployment-handoffs.ts`, `src/app/api/deployments/[id]/handoff/route.ts`, `src/app/api/handoffs/[id]/accept/route.ts`, `src/app/api/transfers/[id]/decline/route.ts`, `src/app/api/transfers/[id]/route.ts`, `src/app/api/deployments/route.ts`, `src/app/api/deployments/[id]/items/route.ts`, `src/lib/deployment-requests.ts`, `src/lib/inventory-stock.ts`, `src/app/api/cron/dispatch/route.ts`, `src/components/shared/DispositionDialog.tsx`, `src/app/(admin)/admin/deployments/page.tsx`, `src/app/(admin)/admin/inventory/page.tsx`, `tests/ur010-hold-through-claim.test.ts`, `tests/components/DispositionDialog.test.tsx`, three new tests. my-deployment untouched (D21).

---

## 4 · Shared files and rebase order

Every D PR branches from the then-current `development`, after the Eastern-time PR and every Security and Offline PR have merged (and D1/D2 before it). Those PRs move these files' lines, so re-grep. Two hunks are shared: DispositionDialog's submit button, where O4 and D3 both add conditions to `disabled` and to the label (keep both; the label checks O4's `Already saved` first, 3.9), and `setLineFulfillment`, where S4 adds checks before the transaction D3 wraps (keep S4's checks first).

| File | Security | Offline | D |
|---|---|---|---|
| `src/app/api/cron/dispatch/route.ts` | S1 adds a sign-in-records purge after the reap (`:99-109`) | O1 reaps keys at 10 days (`:99-109`) | D1 step 1 (`:84-97`, `:462`), INV-8, INV-10–12; D3 INV-3 (`:229-242`) |
| `src/app/api/daily-check/route.ts` | S3 narrows the GET include (`:79`) | O1 amends D26: 7 days, older refused (`:13-18`, `:110-119`) | D1 the failed-check alert (`:128-131`, the transaction, `:252-289`) |
| `tests/ur034-daily-check-failed-alert.test.ts` | — | O1 dates (`:45`, `:65`) | D1 `:52` |
| `src/app/api/deployment-requests/route.ts`, `…/[id]/route.ts` | — | O2 rate limit (`:72-74`; `[id]:66` on submit; moved from S4) | D1 deletes the alert raises (`:105-114`; `[id]:107-110`) |
| `src/app/api/inventory/[id]/route.ts` | S3 GET fields (`:121-138`) | — | D1 retire resolve (`:192-195`) |
| `src/lib/deployment-requests.ts` | S4 `setLineFulfillment` checks (`:349-377`) | — | D1 (`:5`, `createRequest`, `submit`, `:675-676`); D3 (`setLineFulfillment`'s transaction, `claimHeldStock`, `releaseHeldLine`) |
| `src/lib/maintenance.ts` | — | — | D1 the odometer trigger (`:61-72`); D2 `lockAsset`, `openDamageTask`, `closeDamageTask` (the lock, and `fixed` at `:319`, 2.10) |
| `prisma/schema.prisma` + migrations | S2 Owner mark (its own migration, merges alone) | — | D2 comments + its migration, timestamped after S2's |
| `src/lib/asset-status.ts` | — | O1 `releaseUnlinkedReturns` (`:187-193`, B4-11) | D2 `pullForRepair`, `restoreIfClear` (2.4, and 2.10's `fixed`), `returnUnit` |
| `src/lib/check-log-helpers.ts` | — | — | D2 2.9; D3 3.3 calls it |
| `src/app/api/maintenance/field-fix/route.ts` | S3 the reply through `forRole` (`:98`) | — (O1 lists it only as a re-run case) | D2 2.3 (the lock, `:66`), 2.7 (the name, `:87`; the comment, `:22-33`), 2.10 (`fixed: true`, `:93-94`). No custody check. |
| `src/lib/status-links.ts`, `src/app/api/s/[token]/…` | S4 4.3 (a link stops when its repair closes). S4's next revision, from round 7: after the repair closes, a shop link takes only the invoice number, until an admin records it or 30 days pass | — | **Not touched.** D2 changes how a close settles the unit, not the repair row: every close still writes COMPLETED and `completedAt` (a field fix also `resolutionPath` IN_FIELD), which is what S4's rule reads. |
| `src/app/api/deployments/[id]/end/route.ts` | — | O1 (`:92-96`, `:420`, `:427`); O4 4.7 (End lists what it saw) | D2 `:309-310` |
| `src/app/api/deployments/[id]/transfer/route.ts` | — | O1 records the outcome in the transaction and a fallback reply (`:162`, `:175`) | D2 `:138` |
| `src/app/api/deployments/route.ts` | — | O1 (`:307`, `:372`) | D3 pick loop (`:236-239`) |
| `src/app/api/deployments/[id]/items/route.ts` | — | O1 (`:116-117`, `:261`, `:304-305`, `:316-317`, `:640`, `:665-666`; "already ended" 409) | D2 `:547-549`; D3 pick loop (`:173-176`) |
| `report-problem` and `report-damage` routes | S3 the reply through `forRole` (3.6b) | O2 per-operator limit, 20 an hour (moved from S4) | not touched; D2's race tests use a fresh operator each run |
| `src/lib/deployment-auth.ts` | — | O1 (B5 §3) | **not touched**; D3 imports the existing `claimActiveRig` and `DeploymentEnded` |
| `src/lib/idempotency.ts` | — | O1 records outcomes in the transaction (B4-1), takes over dead claims, binds keys to the caller (B3-11) | not touched |
| `src/components/shared/DispositionDialog.tsx` | — | O4 (`:134`, `:177`, `:230-250`, the button) | D3 (`:181`, `:196`, `:360-364`, `:415`, `:418`) |
| `PILOT_ROLLBACK.md` | S1 (1.13), S2 (2.13) add §1 notes | — | D1 1.7, D2 2.8 add theirs after the last §1 note |

The Eastern-time PR, merged first, rewords `alert-evaluators.ts:66` (a comment) and adds a `PILOT_ROLLBACK.md` §1 note.

**S4 and D2 (round 7).** They share no file, but they meet at a closed repair. S4 decides what a shop link accepts after its repair closes (R7c). D2 decides what a close does to the unit (R7b), and builds no rule on who may close (R7a). Order: S4 merges first (Security → Offline → Data), and D2 rebases on it. If S4's next revision also edits `closeDamageTask`, `restoreIfClear`, the Complete route or the field-fix route, keep S4's lines and add D2's. S4 can't rely on D2's new `reportedById` on the field-fix record, since D2 lands later. Today a field fix (anyone's) marks the closed repair `resolutionPath` IN_FIELD; nothing on that row says whether an operator or an admin closed it.

Inside this packet: D1 and D2 share `maintenance.ts`; D1 and D3 share the cron and `deployment-requests.ts`; D2 and D3 share the items route, and D3 3.3 relies on D2 2.9. Each D PR has its evening to itself in practice: every S and O PR has merged before D1 is built, and D1 → D2 → D3 are built one after another. D2 merges alone in any case.

---

## 5 · Gate (every PR, before opening it)

The P1-1 base gate (`AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md` §5): `npx prisma generate` · `rm -rf .next` (an older build's `.next/types` can break `tsc`, as in the Security and Offline gates) · `npx tsc --noEmit` (0) · `npx eslint .` (0 errors; no new warnings in touched files; state the count. Practice build: 47 warnings at O6 and at every D PR) · `npm run test:ui` (green) · `npm run build` · `wc -l "src/app/(operator)/operator/my-deployment/page.tsx"` unchanged (1454 at O6 and at every D PR in the practice build). D2: `scripts/check-migration-safety.sh "origin/development"` **after** committing.
- The DB suite runs in CI. State both suites' base and new counts (the `.test.ts` guards under `tests/components` run in both). A local Postgres must run in UTC, as CI's does.
- **Existing tests:** each PR's Tests section lists every existing test that changes ("Existing tests that change"). **Any other failing test, after the re-runs below, means stop and report.** Don't change it to make it pass.
- Under heavy machine load the UI suite's 5 s timeouts flake (STATUS §6). Re-run failing untouched files alone before reading anything into them.
- Known DB-suite flakes with no D code on their path. Re-run each alone; none is D's to fix:
  - `tests/p1-2s1-pin-attempts.test.ts` "1 right and 19 wrong PINs in parallel" (Security S1), **only if S1 was built before Security rev 4.1.** The old test assumed the right PIN reserves its slot first; Postgres sometimes reserves five wrong ones first. Rev 4.1's test sets the order and doesn't flake. The practice build hit it once, in D1's gate; 3 of 3 alone passed.
  - `f3-line-checklist` can fail once in a full run at base too (`getLineIds` orders by `createdAt`, which ties inside one transaction). `r4-hub-stock-reserve` "skips reserve for SERIALIZED…" has the same cause (Offline §5).

Anchor greps:
- **After D1:**
  - `grep -n "createAlert" src/app/api/deployment-requests/route.ts "src/app/api/deployment-requests/[id]/route.ts"` → 0
  - `grep -n "/api/deployment-requests\[/id\]" src/lib/deployment-requests.ts` → 0 (the CC-31 comment)
  - `grep -n "alert.updateMany" "src/app/api/inventory/[id]/route.ts"` → 0
  - `grep -n "maintenanceTask.update(" src/app/api/cron/dispatch/route.ts` → 0
  - `grep -c "nextOdometer: { lte: odometer" src/lib/maintenance.ts` → 2
  - `grep -c "inv10-open-on-ended\|inv11-crew-on-ended\|inv12-live-without-primary" src/app/api/cron/dispatch/route.ts` → 4
  - `grep -c "alertDate" src/lib/alert-evaluators.ts` → ≥ 3
  - `grep -c "P1-2 D1" PILOT_ROLLBACK.md` → 1
- **After D2:**
  - `grep -c "lockAsset" src/lib/maintenance.ts` → ≥ 3 (the function, open, close); `grep -c "lockAsset" src/app/api/maintenance/field-fix/route.ts` → 2
  - `grep -c "f.source === 'ADMIN_REVIEW'" src/lib/maintenance.ts` → 2 (the pull, the join)
  - `grep -n "LIVE_KIT_ITEM" src/lib/asset-status.ts` → 0
  - `grep -n "endedAt: null, id: { not: excludeRigId }" src/lib/check-log-helpers.ts` → 0
  - `grep -n "inventoryUnitId: i.inventoryUnitId" "src/app/api/deployments/[id]/transfer/route.ts"` → 0
  - `grep -n "ti.inventoryUnitId" "src/app/api/transfers/[id]/accept/route.ts"` → 0
  - `grep -c "fromInoperable" src/lib/asset-status.ts src/lib/maintenance.ts` → each ≥ 1
  - `grep -c "hasOpenAssignment\|WORK_ORDER\|status: 403" src/app/api/maintenance/field-fix/route.ts` → 0 (no custody check, R7a); `grep -c "reportedById: session.userId" src/app/api/maintenance/field-fix/route.ts` → 1
  - `grep -c "fixed: reason === 'COMPLETED' || reason === 'FIELD_FIX'" src/lib/maintenance.ts` → 1; `grep -c "'DAMAGE_REPORTED', 'inventory_units'" src/lib/asset-status.ts` → 1; `grep -c "restoreIfClear(tx, asset, { fixed: true })" src/app/api/maintenance/field-fix/route.ts` → 1 (R7b)
  - `grep -c "kitItems: { none: { removedAt: null } }" "src/app/api/deployments/[id]/end/route.ts" "src/app/api/deployments/[id]/items/route.ts"` → each 1
- **After D3:**
  - `grep -n 'UPDATE "transfer_requests"' "src/app/api/deployments/[id]/handoff/route.ts"` → 0
  - `grep -c "cancelPendingTransfers" "src/app/api/deployments/[id]/handoff/route.ts" "src/app/api/handoffs/[id]/accept/route.ts"` → each ≥ 1
  - `grep -c "claimActiveRig" "src/app/api/deployments/[id]/operators/route.ts"` → ≥ 1
  - `grep -c "getUnitsInOtherRigs" "src/app/api/transfers/[id]/decline/route.ts" "src/app/api/transfers/[id]/route.ts"` → each ≥ 1
  - `grep -rn "new Error('HOLD_INVARIANT_BREACH')" src` → 0
  - `grep -c "FULL OUTER JOIN" src/app/api/cron/dispatch/route.ts` → 1
  - `grep -n "Math.min(parseInt" "src/app/(admin)/admin/deployments/page.tsx"` → 0 and `grep -n "setQty(Math.max(1, parseInt" "src/app/(admin)/admin/inventory/page.tsx"` → 0 (Add stock's own field at `inventory/page.tsx:725` is not in scope)
  - **Compare with the PR's own base commit (the commit the D3 branch started from), not with `origin/development`:** `git fetch origin`, then `git diff --stat "$(git merge-base HEAD origin/development)" -- src/lib/deployment-auth.ts` → empty. O1 changed this file before D3, so a plain diff against `origin/development` shows O1's change whenever that ref isn't at D3's base (the practice build hit this). Only D3's own change must be empty. On a branch made from current `development`, the merge-base is that base commit.
- **Every PR:** `grep -rn "America/" src` → only `src/lib/business-date.ts` (the Eastern-time guard) · `grep -rnE "D-D[0-9]" src tests` → 0 (a placeholder never goes in code; 0 at every PR in the practice build).

PR title `P1-2 D<n> · <plain outcome>`. Body: what/why, finding IDs, **Behaviour changes**, **Interpretations**, tests changed outside this packet's list, my-deployment line count, lint warning count, both suite counts.

## 6 · Owner reads (Supabase SQL Editor)

Every read here is read-only (the one write, after a failed migrate, is marked). Run each read on its PR's merge day, just before the merge, and send the output to the session. A **gate** read must show 0 rows, or the PR doesn't merge that day. An **information** read needs nothing from you before the merge.

| Merge day | Read | Kind |
|---|---|---|
| D1 | P2-I1 · what the new checks will flag | information |
| D2 | P2-R1 · gear with two open repairs; P2-R2 · a unit on two open lines; P2-R4 · gear left on an ended deployment | **gate** |
| D2 | P2-R3 · old lines that name a unit but count more than 1 | information (fix before or after) |
| D3 | P2-I2 · hub stock held back for nobody | information |

### D1 merge day · P2-I1 (information)
Each non-zero line becomes one admin alert within 10 minutes of the deploy. D1's acceptance row 1 compares the alerts with this output, so run it that day.
```sql
-- P2-I1
SELECT 'INV-8 units free or in review but on an open line' AS monitor, count(DISTINCT u.id) AS rows FROM inventory_units u
  JOIN kit_items ki ON ki."inventoryUnitId" = u.id AND ki."removedAt" IS NULL
  WHERE u."deletedAt" IS NULL AND u.status IN ('AVAILABLE','IN_TRANSIT','INOPERABLE')
UNION ALL SELECT 'INV-10 gear left on an ended deployment', count(*) FROM kit_items ki JOIN kits k ON k.id = ki."kitId" JOIN rigs r ON r.id = k."rigId"
  WHERE r."endedAt" IS NOT NULL AND ki."removedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM transfer_items ti JOIN transfer_requests tr ON tr.id = ti."transferRequestId" WHERE ti."kitItemId" = ki.id AND tr.status = 'PENDING')
UNION ALL SELECT 'INV-10 vehicles left on an ended deployment', count(*) FROM rig_vehicles rv JOIN rigs r ON r.id = rv."rigId"
  WHERE r."endedAt" IS NOT NULL AND rv."removedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM transfer_vehicles tv JOIN transfer_requests tr ON tr.id = tv."transferRequestId" WHERE tv."vehicleId" = rv."vehicleId" AND tr."fromRigId" = rv."rigId" AND tr.status = 'PENDING')
UNION ALL SELECT 'INV-11 crew still on an ended deployment', count(*) FROM deployment_assignments a JOIN rigs r ON r.id = a."rigId"
  WHERE a."endedAt" IS NULL AND r."endedAt" IS NOT NULL
UNION ALL SELECT 'INV-12 live deployment with no lead', count(*) FROM rigs r
  WHERE r."endedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM deployment_assignments a WHERE a."rigId" = r.id AND a.role = 'PRIMARY' AND a."endedAt" IS NULL);
```
- Any non-zero line: nothing to do before D1. After D1 merges, the session lists the rows behind each alert with a read-only query and proposes each clean-up. Clear the INV-10 gear lines before D2's merge day: they are what P2-R4 looks for.

### D2 merge day · P2-R1, P2-R2, P2-R4 (gate) and P2-R3 (information)
P2-R1 and P2-R2 must show 0 rows: a row there makes the migration fail and stops the deploy. P2-R4 must show 0 rows too: it doesn't stop the migration, but after D2 a repair closed on that unit leaves it stuck as Checked out, and nothing in the app can free it. A row that appears between your read and the merge does the same, so read late.
```sql
-- P2-R1 · gear with more than one open repair (gate).
SELECT 'unit' AS kind, i.name || ' · ' || coalesce(u."serialNumber", u.id) AS asset, count(*) AS open_repairs,
       string_agg(t."taskName" || ' · ' || t.id, ', ' ORDER BY t."createdAt") AS repairs_oldest_first
FROM maintenance_tasks t
JOIN inventory_units u ON u.id = t."inventoryUnitId" JOIN inventory_items i ON i.id = u."inventoryItemId"
WHERE t."isDamageReport" AND t."deletedAt" IS NULL AND t.status <> 'COMPLETED'
GROUP BY i.name, u."serialNumber", u.id HAVING count(*) > 1
UNION ALL
SELECT 'vehicle', v.name, count(*), string_agg(t."taskName" || ' · ' || t.id, ', ' ORDER BY t."createdAt")
FROM maintenance_tasks t JOIN vehicles v ON v.id = t."vehicleId"
WHERE t."isDamageReport" AND t."deletedAt" IS NULL AND t.status <> 'COMPLETED' AND t."inventoryUnitId" IS NULL
GROUP BY v.id, v.name HAVING count(*) > 1;
-- P2-R2 · a unit on more than one open line (gate).
SELECT i.name || ' · ' || coalesce(u."serialNumber", u.id) AS unit, u.status, count(*) AS open_lines,
       string_agg(ki.id || ' on ' || coalesce(r.label, r.id) || CASE WHEN r."endedAt" IS NULL THEN ' (live)' ELSE ' (ended)' END, ', ') AS lines
FROM kit_items ki JOIN kits k ON k.id = ki."kitId" JOIN rigs r ON r.id = k."rigId"
JOIN inventory_units u ON u.id = ki."inventoryUnitId" JOIN inventory_items i ON i.id = u."inventoryItemId"
WHERE ki."removedAt" IS NULL
GROUP BY i.name, u."serialNumber", u.id, u.status HAVING count(*) > 1;
-- P2-R4 · a unit on an open line of an ended deployment, with no transfer waiting for it (gate).
SELECT ki.id AS line, i.name AS item, coalesce(u."serialNumber", u.id) AS unit, u.status, coalesce(r.label, r.id) AS deployment
FROM kit_items ki JOIN kits k ON k.id = ki."kitId" JOIN rigs r ON r.id = k."rigId"
JOIN inventory_units u ON u.id = ki."inventoryUnitId" JOIN inventory_items i ON i.id = u."inventoryItemId"
WHERE r."endedAt" IS NOT NULL AND ki."removedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM transfer_items ti JOIN transfer_requests tr ON tr.id = ti."transferRequestId"
                  WHERE ti."kitItemId" = ki.id AND tr.status = 'PENDING');
-- P2-R3 · open lines that name a unit but count more than 1, old consumable lines (information).
SELECT ki.id AS line, i.name AS item, coalesce(u."serialNumber", u.id) AS unit, ki.quantity, coalesce(r.label, r.id) AS deployment,
       CASE WHEN r."endedAt" IS NULL THEN 'live' ELSE 'ended' END AS state
FROM kit_items ki JOIN kits k ON k.id = ki."kitId" JOIN rigs r ON r.id = k."rigId"
JOIN inventory_units u ON u.id = ki."inventoryUnitId" JOIN inventory_items i ON i.id = u."inventoryItemId"
WHERE ki."removedAt" IS NULL AND ki.quantity > 1;
```
- **P2-R1 row:** open each repair at `/admin/maintenance?task=<id>` (the ids are in `repairs_oldest_first`). Keep the one with the shop details, or else the older one. Copy the other's notes into it (Edit), then Delete the other. Run P2-R1 again.
- **P2-R2 row:** don't merge, and don't answer or cancel a transfer waiting for that unit. Accepting keeps two lines open, and cancelling marks a unit that is still out as free. Send the output to the session. It works out where the unit really is and gives you the fix: a screen step, or SQL with its undo. Run P2-R2 again.
- **P2-R4 row:** don't merge. These lines were left open when a deployment ended, with no transfer waiting (D1's INV-10 alert lists the same lines), and the app can't close them. Send the output to the session. It writes the fix (close each line, and put its unit where it really is), with its undo, for you to run. Run P2-R4 again.
- **P2-R3 row:** this doesn't stop the merge. After D2, moving part of such a line by transfer fails. On a live deployment: Admin → Deployments → Return item for that line, then add the item again by count. On an ended one: send the output to the session. Before or after the merge.

### If D2's migrate job fails anyway
The deploy stops before the new version serves, so the old version keeps serving and operators see no change. The session stops too (§7 step 3): it re-runs nothing and runs no SQL.
1. Run P2-R1 and P2-R2 again. Fix their rows as above, then read again until both show 0 rows.
2. Then, on your own go, run this in the SQL Editor. **It is a write:** it marks the failed attempt as rolled back so the next run can try again. It should say `UPDATE 1`.
```sql
UPDATE "_prisma_migrations" SET "rolled_back_at" = now()
WHERE "migration_name" LIKE '%_p1_2_one_open_repair_one_open_line' AND "finished_at" IS NULL AND "rolled_back_at" IS NULL;
-- Undo, only before the re-run:
-- UPDATE "_prisma_migrations" SET "rolled_back_at" = NULL
-- WHERE "migration_name" LIKE '%_p1_2_one_open_repair_one_open_line' AND "finished_at" IS NULL AND "rolled_back_at" IS NOT NULL;
```
3. Tell the session to re-run the failed deploy (`gh run rerun <run-id> --failed`). It watches it as in §7 step 3.

Keep the order. If the UPDATE runs before the rows are fixed, the re-run fails again and needs the UPDATE once more. (Checked on a scratch database built by `migrate deploy`: the failed run left a row that blocked every re-run; after this UPDATE and the fix, the migration applied.)

### D3 merge day · P2-I2 (information)
Hub reserves with no hold behind them; D3's INV-3 raises one alert for these.
```sql
-- P2-I2
SELECT s."itemId", s."hubId", s."reservedQty", COALESCE(h.held, 0) AS held
FROM inventory_stock s
LEFT JOIN (SELECT l."heldItemId" AS "itemId", l."heldHubId" AS "hubId", SUM(l."heldQty" - l."claimedQty") AS held
           FROM deployment_request_lines l JOIN deployment_requests r ON r.id = l."requestId"
           WHERE l."releasedAt" IS NULL AND l."heldQty" > l."claimedQty" AND r.status IN ('STAGED','FULFILLED')
           GROUP BY 1, 2) h ON h."itemId" = s."itemId" AND h."hubId" = s."hubId"
WHERE s."reservedQty" > 0 AND COALESCE(h.held, 0) <> s."reservedQty";
```
- Any row: stock is held back for nobody. Send it to the session; it writes a one-line fix with its undo for you to run, before or after the merge.

## 7 · Merge and close (each PR, on your go)

1. **Your go.** You say go in chat, and CI is green. D2 also needs that day's P2-R1, P2-R2 and P2-R4 at 0 rows, and its migration-safety check green.
2. **When.** Only inside the D48 window, or when Admin → Dashboard shows 0 Active Deployments. The session reads the count and the time just before merging and states both. Pace, from D48 as amended by your docs PR: up to two merges per evening, only in different areas, each deployed and smoked before the next; any migration merges alone, so **D2 merges alone**.
3. **Watch the deploy** (`deploy.yml`) to its last check (env-drift). D2's run includes the migrate job. `/api/health` answers 200; record the revision. **If D2's migrate job fails, the session stops**: no re-run, no SQL, no revert. It reports, and you follow §6 "If D2's migrate job fails anyway".
4. **Smoke test** the PR's acceptance rows with the tab visible. Test data is made through the app's screens, named "ZZ P1-2 … (throwaway)", and cleaned up through the app. State Active Deployments first. **These rows are yours, not the session's:** a physical phone, two people signed in, or a PIN or password to type. The session never types one.
5. **One docs-only commit**, merged by the session when CI is green. Named files only:
   - **`CHANGELOG.md`:** one line, `- <date> · #<n> · <outcome> · <revision>`:
     - D1: `Alerts tell the truth: one missed-check bell per day; failed-check and material-request alerts are saved with the check or request; a completed service stays completed; new checks for gear and crew left on ended deployments and for deployments with no lead`
     - D2: `One open repair per unit or vehicle and one open line per unit, backed by the database; gear waiting on a transfer stays out; Inoperable stays in review and keeps the admin's repair details until the repair is done; a completed repair or field fix puts it back in service; a field fix records who logged it`
     - D3: `Deployment edges and reservation books: waiting transfers cancelled on takeover; add crew needs a live deployment; "Can it be fixed?" must be answered; quantity fields keep what you type; a broken hold is refused by name`
   - **`STATUS.md`:** one RESUME BOX bullet (PR, squash, revision, the Active Deployments count and time, smoke result), the `_Last updated_` line, and the §2 merged list. Where the next session starts: D1 `alertDate` (`src/lib/alert-evaluators.ts`), D2 `lockAsset` (`src/lib/maintenance.ts`), D3 `cancelPendingTransfers` (`src/lib/deployment-handoffs.ts`).
   - **`DECISIONS.md`:** the PR's decision below, in the house format (Date, Owner Max, Status **ACTIVE** with the PR, squash and revision, Read-with, Decision, Revisit triggers, Rationale). Number it in two steps:
     1. Check that the decisions before it are there. Each of these must print 1 or more:
        - the Eastern-time decision: `grep -c "The business day is Eastern" DECISIONS.md`;
        - Security's three: `grep -c "Sign-ins are recorded, the lockout is exact" DECISIONS.md`, `grep -c "one Owner guards the admin accounts" DECISIONS.md`, `grep -c "Operators and outside links see and change only" DECISIONS.md`;
        - Offline's four: `grep -c "A saved action applies once" DECISIONS.md`, `grep -c "The phone keeps saved work through server trouble" DECISIONS.md`, `grep -c "A shared phone keeps people apart" DECISIONS.md`, `grep -c "saved copies say how old they are" DECISIONS.md`;
        - at D2 also `grep -c "Alerts and monitors tell the truth" DECISIONS.md`; at D3 also that and `grep -c "One open repair, one open line" DECISIONS.md`.

        **If one prints 0, stop and tell the owner, and write nothing:** that docs commit lands first. Numbered now, the D decision would take the number the missing one needs.
     2. Give the decision the number after the highest one in `DECISIONS.md`. With every earlier decision in, there is no gap.

     Write that number in place of D-Dn: in the decision, in its qualifiers (under the decisions they name) and in the STATUS bullet, which also states the mapping (`D-Dn = Dnn`). The placeholders stay in this packet. **The D48 pace note is not this commit's:** it comes from your docs PR. If it isn't in `DECISIONS.md` when D1 closes, the session tells you and writes nothing.
   - **D3 only:** `AHITS_A6_DEVICE_CHECKLIST.md` row 8 and `AHITS_A6_TESTER_CHECKLIST.md` §2.5, add `(a line marked damaged needs "Can it be fixed?" answered)`.

   No handoff file unless the session ends mid-work.
6. **No revert without your go.**

**In the D1 PR itself:** commit this packet file (unless it is already tracked), and add this row to the `00_START_HERE.md` table, after the last `build P1-2` row: `` | build P1-2 D1/D2/D3 | `AHITS_PACKET_P1-2D_DATA_2026-10-26.md` | ``

**Decisions** (each appended in its PR's docs commit). All three: **Date:** decided 2026-10-26 (owner, `OWNER_DECISIONS_P1-2.md`; D-D2 also round 7, 2026-10-27), recorded <merge date> · **Owner:** Max.
- **D-D1 · Alerts and monitors tell the truth.** Read-with: D45, D51. Decision: §0 Q1 and Q7, plus: "An alert that an event raises (a failed check, a material request) is saved together with the check or the request, so one can't exist without the other. The missed-check alert clears on the first background check of a new business day, and a new one rings after that day's cutoff. A completed service is never set back to Overdue. The 'free but still out' check watches every open line." Revisit: a crew that is off for days makes one bell per day noise (then a "crew off" marker). Rationale: B4-14, B4-9, B4-17, B4-18, B4-19. **D45 qualifier:** `P1-2 (D-Dn): the inventory drift checks are INV-1 to 6 and 8 to 12.`
- **D-D2 · One open repair, one open line; admin decisions stay put.** Read-with: D42, D43, D51, D52. Decision: §0 R7a, Q5 and R7b, plus: "One open repair per unit and per vehicle, and one open line per unit, are kept by the app and backed by three database rules. A unit on any open line, including one waiting on a transfer from an ended deployment, is out: closing its repair leaves it Checked out, and no return of another line takes it. Any operator may log a field fix on any gear, whoever has it, a shop's repair included; the field-fix record names who logged it. A completed repair (Complete, or setting it Completed) or a field fix, with or without an open repair, puts an Inoperable unit back in service and ends its review; deleting a repair doesn't, and neither does a return or a report. The admin's Send for repair keeps the admin's details, even when it joins an open report." Revisit: field fixes close repairs that a shop or an admin still needed open (then bring back a rule for shop repairs). Rationale: B4-8, B4-5, B4-15; B3-15 accepted by the owner (round 7). **D42 qualifier:** `P1-2 (D-Dn): Checked out means on an open line, on a live deployment or waiting on a transfer from an ended one. Inoperable moves only by the admin's Send for repair or Retire, a completed repair (Complete), or a field fix (with or without an open repair): then Available, or Checked out if an open line holds it.` **D43 qualifier:** `P1-2 (D-Dn): a unit in admin review (Inoperable) that comes back damaged still opens or joins its repair and stays Inoperable. Completing that repair (a field fix or Complete) puts the unit back in service and ends the review; deleting it doesn't.`
- **D-D3 · Deployment edges and reservation books.** Read-with: D49, D50, D52. Decision: §0 Q3, Q4 and Q6, plus: "Adding crew needs a live deployment. Decline and cancel never free a unit an open line names. A reservation line can't change once its request is staged. A hold that doesn't match the hub's stock is refused at pickup by name, never drawn from free stock. The reserve check compares both sides." Revisit: admins want stale waiting transfers chased (the parked "unanswered transfers" alert). Rationale: B4-16, B4-19, B4-6, B4-7, B1-8, B2-21. **D49 qualifier:** `P1-2 (D-Dn): a consumable checkout by count marks no old recorded units out (D-z); returns still bring them home.` **D52 qualifier:** `P1-2 (D-Dn): a whole-deployment transfer accepted cancels the deployment's waiting equipment transfers, as a Reassign does; each waiting person and the old operator are told.`

**Parked (not in P1-2 D):**
- An alert for transfers nobody answers in N days (owner, Q7).
- A Stage whose "nothing confirmed" gate read is stale (§9).
- The rest of the shared return module (API-16) and lines with no unit on serialized gear (API-6), Phase 3. D2 2.9 already gives every sweep the "no open line anywhere" rule for units a line names.
- A rig PATCH re-linking a project on an ended deployment (minor); the post-commit `resolveAlertsFor` in transfer and handoff answers (best-effort bell reads).
- Reservation unit lines aren't held at the hub (D50's revisit trigger; needs a product call). Low-stock alerts read on-hand stock, not available stock (B6-11, FR Q7). B6-2 and the `?id=` request link (D12) are not integrity; they stay with the reservations backlog.
- B4 I7: two first checkouts of a legacy item with no stock rows can both self-heal and create phantom stock (`deployments/route.ts:264-270`; legacy items only, DM-5). INV-5 omits ACTED hub-return links (`cron/dispatch/route.ts:300`), and INV-6 flags legacy item-only repairs: monitor accuracy, Phase 3 with API-6.
- B4-1, B4-11 and B5 §3: in the Offline packet (O1).

## 8 · Paste prompts

Build D1 (after every Security and Offline PR has merged):
```
Build D1 in AHITS_PACKET_P1-2D_DATA_2026-10-26.md (repo root, rev 3.2), exactly as written: the override line under the banner, §0, the D1 section, §4, §5, §7. Read AGENTS.md first (Next 16 is modified) and follow CLAUDE.md except where the packet overrides it. First confirm STATUS §2 lists the Eastern-time PR and every Security and Offline PR as merged, and that DECISIONS.md holds their decisions (§7.5 step 1); if not, stop and tell me. Commit the packet file on this branch with the 00_START_HERE.md row; if it is already tracked, skip committing it. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-d1-alerts-monitors from current development. Re-grep every anchor first; the Eastern-time, Security and Offline PRs moved lines. Named files only. Open the PR to development titled "P1-2 D1 · Alerts and monitors tell the truth" and give me the number when CI is green. Do not merge it. No reverts.
```
Build D2 (after D1 merges):
```
Build D2 in AHITS_PACKET_P1-2D_DATA_2026-10-26.md (repo root, rev 3.2), exactly as written: the override line, §0, the D2 section, §4, §5, §6, §7. Read AGENTS.md first and follow CLAUDE.md except where the packet overrides it. First confirm STATUS §2 lists D1 as merged and /api/health shows its revision; if not, stop and tell me. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-d2-one-open from current development. Re-grep every anchor first (rev 4.1 changed returnUnit; O1 and O4 changed End and the items route). Name the migration with date -u at build time and run scripts/check-migration-safety.sh after committing. Don't add the indexes to verify.yml. Use a fresh operator for each run of a race (O2's limit). D2 builds no field-fix custody check (§0 R7a). Named files only. Open the PR to development titled "P1-2 D2 · One open repair, one open line" and give me the number when CI is green; put the migration folder name in the PR body. Do not merge it. No reverts. I run owner reads P2-R1 to P2-R4 on the merge day.
```
Build D3 (after D2 merges):
```
Build D3 in AHITS_PACKET_P1-2D_DATA_2026-10-26.md (repo root, rev 3.2), exactly as written: the override line, §0, the D3 section, §4, §5, §7. Read AGENTS.md first and follow CLAUDE.md except where the packet overrides it. First confirm STATUS §2 lists D2 as merged and /api/health shows its revision; if not, stop and tell me. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-d3-deployment-edges from current development. Re-grep every anchor first; O1 and O4 changed the items and deployments routes and DispositionDialog, and S4 changed setLineFulfillment. Don't touch src/lib/deployment-auth.ts. Named files only. Open the PR to development titled "P1-2 D3 · Deployment edges and reservation books" and give me the number when CI is green. Do not merge it. No reverts.
```
Merge (any of the three, after my go):
```
Go on PR #<n>. Follow §7 of AHITS_PACKET_P1-2D_DATA_2026-10-26.md. Merge only inside the D48 window and its pace (D2 alone), and state the Active Deployments count and the time read. My reads today: D1, I ran P2-I1 just now; D2, P2-R1, P2-R2 and P2-R4 returned 0 rows; D3, I ran P2-I2 just now. Watch the deploy through env-drift and /api/health. If the migrate job fails, stop and follow §6 (no re-runs, no SQL, no revert without my go). Smoke the PR's acceptance rows with the tab visible and test data through the app's screens; never type a PIN or password, the rows that need one are mine. Clean up, then the one docs-only commit (§7.5): check DECISIONS.md as §7.5 step 1 says (stop if a decision it lists is missing), give the decision the number after the highest one there, and merge it on green. No reverts. Report back.
```

## 9 · Findings ledger: rejected, moved, corrected (everything else in MAP_integrity and both rev-1 reviews is applied)

| Finding or map step | Verdict | Why |
|---|---|---|
| PR I1 (B4-1, B4-11) | Moved | To O1 (plan). D2 rebases on O1's `releaseUnlinkedReturns` edit in `asset-status.ts`. |
| I4b step 1, B5 §3 (add after End → 409) | Moved | To O1 (plan). Its tests ("Add items / Remove vehicles on an ended deployment → 409") left D3 with it. D3 doesn't touch `deployment-auth.ts`. |
| B4-2, B4-3, B4-4, B4-13 | Closed elsewhere | By P1-1a (MAP §2). |
| B4-12 | Closed elsewhere | By P1-1d (`deployment-requests.ts:1108-1114`, no catch). |
| B4-10 | Moved | Offline packet. |
| B4-19's "unit on more than one open line" monitor | Replaced | D2's line index refuses the state, and 2.9 closes the last path into it. |
| I3 step 2: lock the asset only in `openDamageTask` and Reopen | **Corrected** | A close takes the task row, then the asset (`maintenance.ts:317`, then `restoreIfClear` `:319`), so a locked open (asset, then task) racing `/complete` would deadlock. D2 locks the asset at the top of `closeDamageTask` for every reason, and adds a close-versus-open race test. Rev 2 adds field fix (BD-8). |
| I4a step 1: `returnUnit` returns INOPERABLE before both branches | **Corrected** | That made a damaged return of an Inoperable unit task-less, against D43, and dropped the operator's notes. D2: GOOD leaves it INOPERABLE; damaged still opens or joins the repair, and the status stays INOPERABLE (D43 qualifier, §7). |
| I2 step 6: INV-8 widened to INOPERABLE only, still live deployments only | **Extended** | D51 and D2's rule say a unit on any open line, including one waiting on a transfer, is out. INV-8 now joins every open line, so the B4-5 state shows as an alert until D2 lands. Verified on seeded rows. |
| Status row B4-5: "no index on `kit_items(inventoryUnitId)`" | **Corrected** | There is a plain index (`schema.prisma:355`); there is no unique one. The migration adds the partial unique index; the plain one stays. |
| I5 step 1: "Stage … reads the lines after the flip" | **Corrected in part** | Stage's reserve reads come after its flip (`:809`), so the lock closes B4-6. Its PENDING and NOTHING_CONFIRMED gates read before the flip (`:764-781`): an edit that denies the last line in that gap lets Stage proceed with nothing reserved. No stock moves; parked. |
| "Hourly" (owner's Q1 and Q7 words, rev 1 text) | **Corrected (rev 2)** | Cloud Scheduler fires `/api/cron/dispatch` every 10 minutes (`docs/archive/AHITS_SESSION5_RECORD.md:30`), and the cron has no hourly gate. Same decision; the words now say "background check". |
| Anchors | Corrected | `daily-check` `vehicleExists` `:128-131` (map `:126-129`); its post-commit block `:252-289` (map `:252-286`); `createRequest` `:289-322`; the two-open fixtures `pr3a-asset-status:50-53, :242-245`; `ur010` assert `:199-201`; `releaseHeldLine` call `:1291-1294`. Every other anchor matched `3dbaea8` (re-checked by both reviews). |
| A named 409 for the kit-line index in Start, Add items and accept | Rejected | Unreachable once 2.9 lands. BD-1 showed one path in (a sweep freeing a unit still on a waiting line); 2.9 closes it, and `restoreIfClear` (2.4) closes the other. INV-8 watches. If it ever fired, Start and accept answer a 409 with their generic words and Add items a retried 500. |
| Widen `getUnitsInOtherRigs` to ended deployments' waiting lines | **Applied (rev 2)** | Rev 1 parked it with API-16. BD-1 proved D2's index turns the old gap into a wrong 409, so D2 2.9 takes it; D3 3.3 gets the same rule. |
| BD-3's alternative: narrow `restoreIfClear` to "live or waiting" | Rejected | It frees the unit while its leftover line stays open, and the next scan-in hits the line index. P2-R4 clears those lines before D2 instead (the reviewer's own recommendation). |
| BD-4: drop the odometer trigger's direct MAINTENANCE_OVERDUE raise | Not taken | The guarded raise is kept (the smaller change; no test moves). It is a second raiser of an evaluator-owned type (D45), stated under D1's Interpretations. |
| CD-1: "the one screen step that closes the stale line" | Changed | After a duplicate line there may be no screen step that is safe (cancel frees a unit that is still out), so the session gives "a screen step, or SQL with its undo". |
| CD-3: the owner's `_prisma_migrations` UPDATE | Changed | Applied with the order made explicit (fix rows, read again, then the UPDATE) and a `LIKE` on the folder suffix, so no timestamp is typed. Checked on a scratch database: run before the fix, the UPDATE only buys another failed attempt. |
| CD-17: D1's docs commit adds the D48 pace note if missing | Rejected | Rule set since rev 1: the owner's docs PR records the D48 amendment, never a packet. §7 now says the session tells the owner and writes nothing. |
| Stop the return sweeps on consumable lines too (Q6 symmetry) | Rejected | PR-6 brings legacy units home on purpose (`pr6-serialized-only:289-325`). Listed under D3's behaviour changes; counts are unaffected (D-z). |
| Old operator told on a whole-deployment accept | Applied, not asked | Q3 says "tell each waiting person". The old operator's one row mirrors the owner-approved Reassign rows (P1-1 §0-c). |
| Owner reads | Added, then reordered | P2-I1 (D1 day) and P2-I2 (D3 day), information only. P2-R1, P2-R2 and P2-R4 gate D2; P2-R3 is information (the index allows its rows). Each read names the gear, and each row has a fix. |
| Cross-packet (rev 2) | Added; corrected in rev 3 | S4 edits `setLineFulfillment` (D3 3.5 keeps S4's checks first). The per-operator limit on report-problem and report-damage is O2's, not S4's: Security rev 2 moved B3-17 to O2 (Security §9.4). D2's race tests still use a fresh operator each run. |
| B3-15 · field fix has no custody check (`check2/B3_security.md:208`) | **Closed by owner decision** ("accepted: any operator may close any repair"; round 7, 2026-10-27; rev 3) | D2 builds no custody check. Rev 2's 403 and both 409s are withdrawn, with their tests, acceptance row and greps. The finding's other point stays true and is accepted with it: a field fix skips the admin's Complete, so it records no cost and no return destination. The PATCH (Edit) still takes cost and invoice on a closed repair; the return destination is not one of its fields. |
| §0 Q2 (2026-10-26) and BD-2's work-order rule | **Replaced (rev 3)** | Round 7 replaces Q2; BD-2's "a live work order means a shop has it" goes with it. Rev 2's BD-2 probe is withdrawn: the same call now answers 201, as intended. |
| "Who closed it stays recorded" (round 7) | **Corrected premise (rev 3)** | Today the field-fix record names nobody (`field-fix/route.ts:78-92`), and nothing else records who logged a fix. D2 2.7 adds `reportedById: session.userId`, an existing column, so the rule holds from D2 on. |
| R7b: which closes free an Inoperable unit | **Decided (rev 3; rev 3.1)** | Field fix, Complete and the PATCH close all go through `closeDamageTask` with COMPLETED or FIELD_FIX, so they behave the same (2.10). The shop link's Completed differs, for a reason: it never closes a repair (`status-links.ts:233-236`, CC-34 3e). It marks the link done and rings "ready to finalize"; the admin's Complete then frees the unit. Making the shop's Completed close the repair would skip the admin's cost and return destination, which round 7 doesn't ask for. Delete is not a fix. A field fix with no open repair frees the unit too (owner, rev 3.1; rev 3 left it in review): the field fix's own `restoreIfClear` passes `fixed: true`. Returns and reports never free it (Q5). |
| R7b: "the admin sees it in Activity" | **Decided (owner, rev 3.1)** | Admin → Maintenance → Completed: the closed repair and the "Fixed in field" row with the operator's name. The app has no repair activity feed (Dashboard "Recent activity" lists check-ins and check-outs only), and none is added. |
| R7b: "unless it's on an open line" | **Read as (rev 3)** | Checked out, not left Inoperable: D42 says a unit on an open line is Checked out, and INV-8 (D1) flags Inoperable on an open line as drift. This is `restoreIfClear`'s existing rule. |
| Verification, rev 1 | Done | On a scratch Postgres 16 built from the base's migrations: the three indexes create and re-run (IF NOT EXISTS); each duplicate fails with 23505; a closed line plus a new open line in one transaction (accept's order) passes; with an R1 row present the CREATE fails. INV-8/10/11/12, the two-sided INV-3, the submit `RETURNING`, the line-edit lock, the release read, `cancelPendingTransfers`, P2-R1–R3 and P2-I1–I2 return the expected rows. In a scratch clone the committed migration passed `check-migration-safety.sh` (exit 0); uncommitted, it gave the false "no migrations". Review BREAK_D built D1–D3 as written: tsc 0, eslint 0 errors and the base's 11 warnings in touched files, `next build` OK, DB 79 / 673 and UI 76 / 625 green at each PR; no deadlock in 20 runs each of three mixed-writer races; one bell per missed day across the 2026-11-01 fall-back night under Eastern time. |
| Verification, rev 2 | Done | Branch `rev2` of the scratch clone = D1–D3 as written plus 2.3's field-fix lock, 2.6 (both fixes), 2.7's work-order arm, 2.9 and 1.4's odometer guard: tsc 0; ESLint clean on the touched files; DB suite 79 / 673 green plus 8 probe tests. With the indexes: the waiting legacy unit stays Checked out after End, Start answers the named 409, and X's accept puts it on X's kit; the work-order field fix → 409 (expired link → 201, admin → 201); Send for repair keeps AT_SHOP, `ZZ Shop` and both notes (RETIRE → Retired, repair closed); End's write-off marks only the unlinked unit; the stale odometer read leaves the task UPCOMING with no alert; field fix waits at the asset lock. The three mixed-writer races, the handoff race and the bell walk re-ran clean. The failed-migrate recovery (§6) ran on a database built by `migrate deploy`. Every §6 read and the 1.7 SQL ran there. |
| Verification, rev 3 | Done | Branch `rev3` of the scratch clone = `rev2` plus 2.7 (no custody check, the name) and 2.10 (fixed means fixed); local commit only, never pushed. tsc 0; ESLint clean on the three touched files. DB suite on the CI-shape database: 81 files, 694 passed, 2 skipped (= base 673 + 6 rev 2 probes + 15 rev 3 probes; the 2 skipped are rev 2's withdrawn BD-2 probes); no existing test changed. UI suite 76 / 625. The 15 rev 3 probes also pass with D2's indexes. They cover every R7a and R7b test above; the two-open case runs only without the indexes (Inoperable, then Available after the second). The End-versus-field-fix race, 20 runs on each database: End first 15 and 14 times (Available, no bell), the fix first 5 and 6 times (Inoperable, bell active); never a deadlock, never an open repair left. Rev 2's stress set (three mixed-writer races, the handoff race, concurrent failed checks, the bell walk) re-ran 6 / 6 with no deadlock. |
| Verification, rev 3.1 | Done | Branch `rev3.1` of the scratch clone = `rev3` plus 2.10's field-fix `fixed: true` and the comments; local commit only, never pushed. tsc 0; ESLint clean on the touched files. DB suite on the CI-shape database: 81 files, 697 passed, 2 skipped (= base 673 + 6 rev 2 probes + 18 rev 3.1 probes; the 2 skipped are still rev 2's withdrawn BD-2 probes); no existing test changed. The field-fix and status files alone (`cc10-field-fix`, `pr3a-status-owner-routes`, `pr3a-asset-status`, `pr3a-status-writers-guard`, `p1-1c-where-things-are`, `pr6-serialized-only`, `cc34-orphan-closure`, `ur029-repaired-unit-returns`, `cc34-schedules-and-alerts`, rev 2's probes): 10 files, 140 passed, the same 2 skipped. The 18 probes pass on both databases. No open repair + field fix → Available, the bell resolved and read, off the list, the record names the operator; on an open line → Checked out. Q5: a still-usable report, a not-usable report and a GOOD return each leave the unit Inoperable and listed; the field fix then frees it. The End-versus-field-fix race, 20 runs each way: with an open repair, End first 14 times on each database (Available, no bell), the fix first 6 (Inoperable, bell active), the same as rev 3; with no open repair, End first 14 and 13 times (Available), the fix first 6 and 7 (Inoperable). Never a deadlock, a 500 or an open repair left. Control: with rev 3's field-fix line, the no-repair cases stay Inoperable (20 / 20 in the race). The UI suite was not re-run: no UI or copy file changed (rev 3: 76 / 625). |
| Tests the map listed as unaffected | Checked | `p1-1d-staged-ready` test 17 creates no deployment; `p1-1e-expired-holds` test 1 starts its rig through the API with a lead; the field-fix matrices use the operator's own crew or an admin; no existing UI test submits a damaged serialized line with "Can it be fixed?" blank except `DispositionDialog.test.tsx:83-99`. With D2's indexes present, 7 tests in 3 files fail because they seed two open repairs (2.1), so the indexes stay out of `verify.yml`. |

### Rev 3.2 · the practice build

`p12/stack/STACK_D.md` built D1–D3 on `stack-O6` (base + #273 + #272 + the Eastern-time PR + S1–S4 + O1–O6; tree `p12/stack/tree`, tags `stack-D1` … `stack-D3`), with the gate on Postgres 16 in UTC. Where the builder's code was the better answer, rev 3.2 uses it (read from the tags with `git show`). `p12/stack/FOLD_D.md` maps each ID to its step.

| ID | Sev | PR | Verdict | Where |
|---|---|---|---|---|
| DX-1 a winning add crew leaves a `rig_operators` row; every later test fails | Med | D3 | Applied: `afterEach` deletes those rows in the new file (the builder's line) | D3 Tests (`p1-2-deployment-edges`) |
| DX-2 the button label with O4 | Low | D3 | Applied: O4's `Already saved` first, then `Say if it can be fixed`; `missingFixable` right after `loading` in `disabled`, and in the guard (the builder's lines, with the lines after O4) | 3.9, §4 |
| DX-3 the bare Sentry mock | Low | D3 | Applied: the factory form, as `cc30-cron-lock-connect-error:31`; cleared in `beforeEach` | D3 Tests (`p1-2-reservation-books`) |
| DX-4 1.2's rows and the 1.4 race pass before D1 | Low | D1 | Applied: both marked as regression guards; the builder's atomic submit test added (fails before D1) | D1 Tests 1.2, 1.4 |
| DX-5 the R7a admin row fails before D2 | Low | D2 | Applied: "(regression guard)" dropped | D2 Tests (R7a) |
| DX-6 the Move stock row passes before D3 | Low | D3 | Applied: "the field stays empty" after clearing (fails before D3) | D3 UI tests |
| DX-7 the `deployment-auth.ts` grep against `origin/development` | Low | D3 | Applied: compare with the PR's own base commit (`git merge-base HEAD origin/development` after `git fetch`). On the stack `origin/development` was the old base, so the builder compared with `stack-D2`; on a real branch the merge-base is that commit. The builder's `HEAD~1` holds only for a one-commit PR | §5 After D3 |
| DX-8 D1 anchors moved by E, S and O | Info | D1 | **Noted, no change.** The build found every anchor by re-grep, which the packet already requires | — |
| DX-9 1.3 passes `'18:00'` | Info | D1 | Applied, as the owner asked: the test uses `DEFAULT_DAILY_CHECK_CUTOFF` (`'19:00'`). "The same verdicts under Central and Eastern" is gone: D builds after the Eastern-time PR. Checked by reading `evalContext` and the wall times (23:30Z = 19:30 Eastern, past; 14:00Z = 10:00, before; both 2026-10-09); not re-run | D1 Tests 1.3 |
| DX-10 D1's Touched; the start-here row's form | Info | D1 | Applied: both files in Touched; §7 gives the row text and where it goes | D1 Touched, §7 |
| DX-11 D2 anchors moved | Info | D2 | **Noted, no change.** Found by re-grep. The stack's `returnUnit` has no rev-4.1 `returnHubId` (built from P1-1 rev 4), as SLOT says | — |
| DX-12 2.7's doc comment range | Info | D2 | Applied: only the D-c paragraph is replaced. At the base it is `:26-32` (the builder's `:27-33` is the line after S3); both given | 2.7 |
| DX-13 D3 anchors moved | Info | D3 | Applied for the button (3.9 gives the lines after O4, with DX-2). The rest **noted, no change** (found by re-grep) | 3.9 |
| DX-14 the B4-6 race passes before D3 | Info | D3 | Applied: "(also passes before D3: a race)" | D3 Tests (`p1-2-reservation-books`) |
| STACK_D §3, cross-packet | — | all | Applied where a finding names it (DX-2, DX-7, DX-9; the D-numbers below). Every other meeting point held as written: **noted, no change** | — |

**Also from the practice build:** the stop rule for an unlisted failing test, and the known flakes (S1's parallel-PIN test hit once in D1's gate, 3 of 3 alone); `rm -rf .next`, the lint count, the my-deployment count and a placeholder grep (§5); the counts per PR (banner); the decision check (§7.5, §8 Build D1 and Merge).

**Decision numbers on the stack.** `DECISIONS.md` there ends at D56, with D53 missing (the Eastern-time docs commit, D-E1, was never written; SX-2, OX-9) and no Offline entries. With O's D57–D60 written, D-D1…D-D3 would be D61–D63. Taking "the next free number" would have given D-D1 the gap at D53. So §7.5 now checks that the earlier decisions are there, stops if not, and then takes the number after the highest. The placeholders stay in this packet.

**Cross-packet notes for the Offline packet (O not edited).**
- DX-2: O4's text ("in end mode the label reads `Already saved` (checked before `missingHub`)") agrees with D3 3.9. O's §4 "For packet D" could add: the label checks `Already saved` first, then D3's `Say if it can be fixed`. Not needed to build O: D3 carries the order.
- DX-7: O's §5 "After O3" uses the same form: `git diff --stat origin/development -- src/app/sw.ts` → empty. It passed on the stack only because nothing before O3 touches `sw.ts`. The merge-base form (§5 After D3) is safer; worth taking in O's next revision.

**Verification, rev 3.2 (the practice build).** Each gate green: tsc 0; eslint 0 errors, 47 warnings, none new in a touched file; build OK; my-deployment 1454; every §5 grep (the `deployment-auth.ts` one, see DX-7); the Eastern-time guard; `grep -rnE "D-D[0-9]" src tests` → 0. D2: migration safety additive after commit; `migrate deploy` 64 / 64 with the three indexes as written. New tests run on the code before each PR: D1 12 of 23 fail, D2 26 of 34, D3 11 of 17 plus 3 of 4 UI. The §6 reads, 1.7's SQL and §6's failed-migrate recovery ran as written. The whole stack at `stack-D3`, twice on a fresh database: DB 111 / 911 and UI 99 / 765, green. Rev 3.2's own edits (DX-9's cutoff, DX-7's merge-base form, the §7.5 greps) were not re-run.
