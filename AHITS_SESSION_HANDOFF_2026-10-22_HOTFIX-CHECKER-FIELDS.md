# Session handoff · 2026-10-22 · Hotfix: vehicle details stop sending checkers' account records

> Read with `STATUS.md` (resume line) and the packet `AHITS_HOTFIX_2026-10-22_VEHICLE-CHECKER-FIELDS.md` (decisions H-a, H-b, H-c; no new D number). D16: merging is the deploy. D48: the merge window.

## Merged, deployed and smoked (later the same day)
- **Merged:** #268, at 14:31 Central on the owner's go, as a **D48 deviation**. Active Deployments was **4**, read at about 14:27 with the tab visible. The note is under D48 in DECISIONS.
- **Squash:** `1f258a8`.
- **Deploy:** run 39840916750, green through verify → migration-safety → migrate → deploy → env-drift. The first attempt's Tests job couldn't pull `postgres:16` from ECR Public (`toomanyrequests: Data limit exceeded`) and passed on rerun. The PR's CI hit the same limit twice before passing.
- **Revision:** `ahits-web-app-staging-00450-hvm`. `/api/health` returns 200 `{"status":"ok","db":"up"}`.
- **Smoke (tab visible):** the live `GET /api/vehicles/[id]` returns `dailyChecks[].operator` with only the keys `id` and `name`. None of `pinHash`, `email`, `hourlyRate`, `failedPinAttempts`, `tokenVersion`, `pinLockedAt` or `lastLoginAt` is present. Vehicles → Bobcat Giddings #3 → "Recent daily checks (2)" shows Annabelle Matthews for Oct 20 and Oct 19. No data was written.

## What was built
- **Branch** `feature/20261022/Agricarbon-USA-hotfix-checker-fields`, **PR #268** to `development`. No migration.
- **One line of app code** in `src/app/api/vehicles/[id]/route.ts` (GET): `include: { operator: true }` becomes `include: { operator: { select: { id: true, name: true } } }`. Before this, the route sent the full user row of each of the last 10 checkers, including `pinHash`, `email`, `hourlyRate`, lockout state and `tokenVersion`, to any signed-in user. The only reader, `admin/vehicles/page.tsx`, uses `operator.name`.
- **Tests:**
  - `tests/hotfix-vehicle-detail-user-fields.test.ts` (DB, CI only): an operator calls GET and gets 200. `dailyChecks[0].operator` has only the keys `id` and `name`. The response contains none of `pinHash`, `email`, `hourlyRate`, `failedPinAttempts` or `tokenVersion`, and neither the hash value nor the email value.
  - `tests/hotfix-no-full-user-rows-guard.test.ts` (pure): reads the schema for fields of type `User`, `User?` or `User[]` and fails on any `<field>: true` under `src/app/api` or `src/lib`. A same-line `// user-fields: ok <reason>` opts out. The self-tests prove it flags the bad shape and passes the good one.
- **Local gate:** `prisma generate`, `tsc --noEmit` clean, `eslint .` 0 errors (50 warnings were already there, none in the touched files), `test:ui` 68 files / 564 tests, `build` OK. The guard was also run locally: it passes with the fix and fails on `route.ts:55` without it. The DB test runs only in CI (no local Postgres here).

## Resume points
1. ~~Merge, watch the deploy, smoke~~: done (above).
2. **CI flake to consider:** the Tests job pulls `postgres:16` from ECR Public and hit a data limit three times today. Moving it to another registry would be a CI-config PR and needs the owner's go.
3. **Rotate PINs (packet §5.4): owed.** Every account changes its PIN, admins included. The owner chooses the method: each person uses Change PIN, or an admin uses Reset PIN for each person.
4. **Docs-only follow-up:** this PR. Record the PIN-rotation state in STATUS once it's done.

## Notes
- `AHITS_SESSION_CLOSE_2026-10-22_FIX-PROGRAM-WRAP.md` was untracked in the tree at session start. It is not part of this packet, so it was left uncommitted.
