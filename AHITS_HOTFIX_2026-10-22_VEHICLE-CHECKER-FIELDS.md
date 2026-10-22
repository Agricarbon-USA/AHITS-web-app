# Hotfix · Vehicle details stop sending checkers' account records · 2026-10-22

> STATUS: runnable hotfix (paste the §9 prompt into Claude Code) · WROTE: 2026-10-22 · READ-WITH: `CLAUDE.md`, DECISIONS D16 (merge is the deploy), D48 (merge window)
> WHY: `GET /api/vehicles/[id]` returns the **full user row** of whoever did each of the vehicle's last 10 daily checks — `pinHash`, `email`, `hourlyRate`, `failedPinAttempts`, `pinLockedAt`, `tokenVersion`, `lastLoginAt`. Any signed-in user can call it, and the operator daily check calls it on every vehicle pick. A 6-digit PIN (bcrypt, cost 12) can be recovered from its hash offline, and the email (the login name) is in the same payload. The app is in active use (4–9 operators). Found by the 2026-10-22 review; confirmed in code.
> SLOT: first, before any cleanup work. Own PR. No migration. One route line + two test files.

---

## 0 · Owner decisions (final — apply, don't re-ask)

| # | Decision |
|---|---|
| H-a | **An API response never carries a full user row.** A user relation is read with `select` of named fields only; for display that is `{ id: true, name: true }`. |
| H-b | **This PR changes one line of app code.** No service-worker, offline-queue or UI change. Phones holding an old cached copy are covered by the PIN rotation in §5, not by code. |
| H-c | **A guard test keeps it fixed:** any `<userRelation>: true` in `src/app/api/**` or `src/lib/**` fails CI. |

No new decision number. No copy changes.

---

## 1 · Data

No migration.

## 2 · Server

2.1 **`src/app/api/vehicles/[id]/route.ts` (GET, ~line 55):**
`dailyChecks: { orderBy: { date: 'desc' }, take: 10, include: { operator: true } }`
→ `dailyChecks: { orderBy: { date: 'desc' }, take: 10, include: { operator: { select: { id: true, name: true } } } }`
The only readers use `operator.name` (`admin/vehicles/page.tsx:858`; type at `:87`), so nothing else changes.

2.2 **Not touched:** every other route, `src/app/sw.ts`, `src/hooks/useOfflineQueue.ts`, `tests/offline/**`, all UI files.

## 3 · UI

None.

## 4 · Tests

**Node (CI, DB):** `tests/hotfix-vehicle-detail-user-fields.test.ts` (same harness as `tests/pr5b-dead-ends.test.ts`: `vi.mock('../src/lib/auth/session')`, fixtures from `tests/helpers/fixtures.ts`)
- Seed an admin, an operator with a PIN, a vehicle, and one daily check by the operator.
- As the operator, `GET /api/vehicles/<id>` → 200; `data.dailyChecks[0].operator` has exactly the keys `id`, `name`.
- The serialized response contains none of: `pinHash`, `email`, `hourlyRate`, `failedPinAttempts`, `tokenVersion`.

**Guard (pure, no DB — same spirit as `tests/pr3a-status-writers-guard.test.ts`):** `tests/hotfix-no-full-user-rows-guard.test.ts`
- Read `prisma/schema.prisma`; collect every field whose type is `User`, `User?` or `User[]` (today: actor, admin, createdBy, deletedBy, homeOperators, initiatedBy, lead, operator, targetUser, toOperator, uploadedBy, user).
- Scan every `.ts` file under `src/app/api` and `src/lib` for `\b<name>\s*:\s*true\b`. Fail with file:line for each hit.
- Opt-out only with a same-line comment `// user-fields: ok <reason>`.
- Self-test: a fixture string with `include: { operator: true }` is flagged; one with `operator: { select: { id: true, name: true } }` is not.

Local gate before the PR: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint .`, `npm run test:ui`, `npm run build`. The DB suite runs in CI.

## 5 · Owner steps after merge

1. Merge inside D48 (after 8 pm Central, or when Active Deployments = 0). State the count.
2. Watch the deploy through env-drift and `/api/health`.
3. Smoke (tab visible): admin → Vehicles → open any vehicle with recent checks → the "Recent daily checks" list still shows names.
4. **Rotate PINs.** The old hashes may already be on phones or in caches, so every account changes its PIN — admins included. How is the owner's call (asked in chat): each person uses Change PIN, or an admin uses Reset PIN per person (forces a new PIN at next login and signs them out).

## 6 · Legacy data

None.

## 7 · Session close

`STATUS.md`: one resume-box line (hotfix merged, revision, PIN rotation owed or done). Handoff `AHITS_SESSION_HANDOFF_2026-10-22_HOTFIX-CHECKER-FIELDS.md`. Commit this file with the PR. Docs-only follow-up PR after the merge, as usual.

## 8 · Size

One PR. Do not split.

---

## 9 · Paste into Claude Code

```
Build the hotfix in AHITS_HOTFIX_2026-10-22_VEHICLE-CHECKER-FIELDS.md (repo root), exactly as written. Follow CLAUDE.md. Branch from current development: feature/20261022/Agricarbon-USA-hotfix-checker-fields. Named files only (never git add -A): the route, the two new test files, this packet, and the session-close docs in §7. Run the §4 local gate. Open the PR to development titled "Hotfix · Vehicle details stop sending checkers' account records", body with what/why, the one-line diff, the tests, and "Behaviour changes: none for users". Give me the PR number when CI is green. Do not merge it. No reverts.
```
