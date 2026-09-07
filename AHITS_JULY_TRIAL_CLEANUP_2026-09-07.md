# July-trial cleanup · staging · 2026-09-07 — report first, then tidy

> STATUS: runnable packet (owner-executed; nothing runs until Max pastes it) · WROTE: 2026-09-07 · READ-WITH: `AHITS_PILOT_FLOOR_TODO.md` Part 1 item 7 · DECISIONS.md D33 (attempt-1 data is KEPT — this tidies *status*, never history)
> WHY: attempt-1 (late July) left deployments open, alerts unresolved and bells unread. On relaunch day 1 that reads as a wall of red. Some equipment is still physically with operators (Max, 2026-09-07), so **nothing here is blanket** — Phase A shows the list, Phase B is Max's call per rig, Phase C only then.
> RULES: Phase A is read-only. Anything touching **custody or stock** (ending a deployment, cancelling a reservation) goes through the **admin app**, never SQL — the API releases reservations and returns gear to hubs correctly; raw SQL would not. SQL is used only for status flags (alerts resolved, notifications read) and every write is tagged so it can be undone exactly. Nothing is deleted.

---

## Phase A · The report (read-only — paste into Supabase → SQL Editor, one block at a time)

**A1 · Deployments still open** (one row per open rig — the decision list for Phase B)
```sql
SELECT r.id, r.label, u.name AS operator, r."startedAt"::date AS started,
       (SELECT max(dc.date)::date FROM daily_checks dc WHERE dc."operatorId" = r."operatorId") AS operator_last_check,
       (SELECT string_agg(v.name, ', ') FROM rig_vehicles rv JOIN vehicles v ON v.id = rv."vehicleId"
         WHERE rv."rigId" = r.id AND rv."removedAt" IS NULL) AS vehicles,
       (SELECT count(*) FROM kits k JOIN kit_items ki ON ki."kitId" = k.id
         WHERE k."rigId" = r.id AND ki."removedAt" IS NULL) AS kit_lines,
       (SELECT count(*) FROM kits k JOIN kit_items ki ON ki."kitId" = k.id
         WHERE k."rigId" = r.id AND ki."removedAt" IS NULL AND ki."inventoryUnitId" IS NOT NULL) AS serialized_units
FROM rigs r JOIN users u ON u.id = r."operatorId"
WHERE r."endedAt" IS NULL
ORDER BY r."startedAt";
```

**A2 · Open alerts by type**
```sql
SELECT type, count(*) AS open, min("triggeredAt")::date AS oldest, max("triggeredAt")::date AS newest
FROM alerts WHERE resolved = false
GROUP BY type ORDER BY open DESC;
```

**A3 · Open alerts, row by row** (to spot anything real hiding in the noise)
```sql
SELECT id, type, "triggeredAt"::date AS since, "sourceTable", "sourceId", left(metadata::text, 140) AS meta
FROM alerts WHERE resolved = false
ORDER BY type, "triggeredAt";
```

**A4 · Requests still in flight**
```sql
SELECT id, status, "requestType", label, "createdAt"::date AS created, "neededBy"::date AS needed_by, "stockReservedAt" IS NOT NULL AS has_reserved_stock
FROM deployment_requests
WHERE status IN ('DRAFT','REQUESTED','STAGED','FORWARDED')
ORDER BY "createdAt";
```

**A5 · Transfers and handoffs still pending**
```sql
SELECT 'transfer' AS kind, id, "fromRigId" AS rig, status, "createdAt"::date AS created FROM transfer_requests WHERE status = 'PENDING'
UNION ALL
SELECT 'handoff', id, "rigId", status::text, "createdAt"::date FROM deployment_handoffs WHERE status::text = 'PENDING'
ORDER BY created;
```

**A6 · Unread bell items per person**
```sql
SELECT u.name, u.role, count(*) AS unread, min(n."createdAt")::date AS oldest
FROM notifications n JOIN users u ON u.id = n."userId"
WHERE n."readAt" IS NULL
GROUP BY u.name, u.role ORDER BY unread DESC;
```

**A7 · Damage reports untouched for 30+ days** (real work items — never blanket-resolved; decide each)
```sql
SELECT id, "taskName", status, "createdAt"::date AS created, "updatedAt"::date AS last_touched, "vehicleId", "inventoryUnitId"
FROM maintenance_tasks
WHERE "isDamageReport" = true AND status <> 'COMPLETED' AND "deletedAt" IS NULL
  AND "updatedAt" < now() - interval '30 days'
ORDER BY "updatedAt";
```

Paste the A1 rows (and anything surprising in A3/A7) back to Claude, or fill Phase B yourself.

## Phase B · Decide (Max — one line per A1 row)

| Rig (label / operator) | Gear physically… | Action |
|---|---|---|
| … | back at the hub | **END** via the app (Phase C1) |
| … | still with the operator | **KEEP OPEN** — the daily missed-check alert will keep firing for this operator until they check in or the rig ends; that is correct, not noise |

Alerts: everything in A2 of types `DAILY_CHECK_MISSED`, `DAILY_CHECK_FAILED`, `MATERIAL_REQUEST`, `EQUIPMENT_NOT_RETURNED`, `PIN_LOCKED`, `EMAIL_FAILED`, `LOW_INVENTORY` raised **before 2026-09-01** is trial noise → resolve in bulk (C2). `DAMAGE_REPORTED`, `INVENTORY_DRIFT`, `MAINTENANCE_OVERDUE`, `INSURANCE_EXPIRING`, `REGISTRATION_EXPIRING`, `CRON_SILENT` are **real** → look at each A3 row; resolve individually in the app's Alerts screen if it's stale.

## Phase C · Execute (only after Phase B)

**C1 · End the finished deployments — in the admin app, not SQL.** Admin → Deployments → open the rig → **End deployment** → every item defaults to *return to its home hub*; adjust any item that is actually broken (Out of service) or being handed to someone else (Transfer) → confirm. Repeat per END row. (Custody, stock and the operator's "deployed" state all update correctly; SQL can't do that safely.)

**C2 · Resolve the trial's alert noise (SQL, tagged, undoable)** — paste as ONE block; check the two counts; `COMMIT` only if they make sense.
```sql
BEGIN;
SELECT count(*) AS before_open FROM alerts
 WHERE resolved = false AND "triggeredAt" < '2026-09-01'
   AND type IN ('DAILY_CHECK_MISSED','DAILY_CHECK_FAILED','MATERIAL_REQUEST','EQUIPMENT_NOT_RETURNED','PIN_LOCKED','EMAIL_FAILED','LOW_INVENTORY');

UPDATE alerts
   SET resolved = true, "resolvedAt" = now(),
       metadata = coalesce(metadata, '{}'::jsonb) || '{"cleanupBatch":"2026-09-07-july-trial"}'::jsonb
 WHERE resolved = false AND "triggeredAt" < '2026-09-01'
   AND type IN ('DAILY_CHECK_MISSED','DAILY_CHECK_FAILED','MATERIAL_REQUEST','EQUIPMENT_NOT_RETURNED','PIN_LOCKED','EMAIL_FAILED','LOW_INVENTORY');

SELECT count(*) AS after_open FROM alerts
 WHERE resolved = false AND "triggeredAt" < '2026-09-01'
   AND type IN ('DAILY_CHECK_MISSED','DAILY_CHECK_FAILED','MATERIAL_REQUEST','EQUIPMENT_NOT_RETURNED','PIN_LOCKED','EMAIL_FAILED','LOW_INVENTORY');
-- expect after_open = 0. If anything looks wrong: ROLLBACK;
COMMIT;
```
*Undo, exact:* `UPDATE alerts SET resolved = false, "resolvedAt" = NULL WHERE metadata->>'cleanupBatch' = '2026-09-07-july-trial';`
*Note:* a `DAILY_CHECK_MISSED` for an operator whose rig you KEEP OPEN will be re-raised by the next cron run — expected.

**C3 · Clear the trial's bell backlog (SQL)** — marks old notifications read; nothing is removed.
```sql
UPDATE notifications SET "readAt" = now()
 WHERE "readAt" IS NULL AND "createdAt" < '2026-09-01';
```

**C4 · Requests and transfers from A4/A5 — in the admin app.** Requests: Admin → Requests → **Deny** (with a one-line note "closed in the Sept 7 cleanup") or let the requester Cancel — this releases any reserved stock; **do not** flip them in SQL (a `STAGED` reservation cancelled by SQL leaves stock counted as reserved forever). Transfers/handoffs still pending from July: decline them from the receiving phone or cancel from the sender's; if those phones are unreachable, this SQL is safe (no stock side-effects):
```sql
UPDATE transfer_requests SET status = 'CANCELLED', "respondedAt" = now(),
       "responseNote" = 'Cancelled in the 2026-09-07 July-trial cleanup'
 WHERE status = 'PENDING' AND "createdAt" < '2026-09-01';
```

**C5 · Re-run Phase A.** A1 should show only the KEEP OPEN rigs; A2 only real types; A6 near zero. Paste the result into STATUS §3 as the dated artifact ("July-trial cleanup executed 2026-MM-DD: N rigs ended in-app, N alerts resolved (batch-tagged), N notifications read").

## What this does NOT touch
Daily-check rows, photos, custody logs, audit logs, pilot metrics (snapshot-per-day scoring is unchanged — D33), inventory quantities, any user. Everything above is a status flip with a date on it.

## Plain-English summary
The July trial left the app thinking a few people are still deployed and a few dozen things still need attention. This tidies that: you end the deployments whose gear really is back (in the app — a few taps each), Claude's SQL quietly marks the old alerts and bell items as handled with a tag so it can be undone, and anything that's a *real* open problem (damage, stock drift, expired insurance) stays visible on purpose. Half an hour, most of it reading the list.
