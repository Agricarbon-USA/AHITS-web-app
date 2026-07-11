# AHITS — Wave 0, Batch 3 · Execution Log

_2026-07-03. Continues Wave-0 execution. Two items: **FND-8** (email reliability — the last hard blocker for the invoice→processor email) and **W0-9** (the hub-return loop — makes returns closable for the two email-less staging hubs and stops the Inbound list from accreting duplicates). Implemented on a clean HEAD (`b66c1af`) sandbox, type-checked, linted, production-built. **This batch includes one additive DB migration** (see Migration note)._

## Verification (all green)

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `eslint` (changed files) | **0 errors** (3 pre-existing `set-state-in-effect` warnings, none introduced) |
| `next build --webpack` | **passes** — all 63 routes |
| Migration | `20260703000000_add_email_log` — additive (new table + enum), backward-compatible |

## FND-8 · HIGH · email reliability (patch `FND-8_email_reliability.patch`)

Email had no retry, no delivery record, and failures were swallowed by every caller — a failed shop/hub/invite/alert send just vanished, and alert emails were dropped *after* `notifiedAt` was claimed (so never retried). That's an unacceptable base for a money email.

- **Delivery log** — new `EmailLog` model + `EmailStatus` enum (migration `20260703000000_add_email_log`). Every send attempt is recorded: recipient, subject, `kind`, `status` (SENT / FAILED / SKIPPED), attempts, `lastError`, provider id, timestamps.
- **`sendEmail` rewrite** (`src/lib/email/resend.ts`) — retries transient failures (3 attempts, short backoff), writes an `EmailLog` row for every outcome, and **still throws on final failure** so existing caller contracts (e.g. the invite route's dangling-invite cleanup + 502) are preserved. The non-prod `EMAIL_SANDBOX` guard now logs `SKIPPED` rather than silently returning.
- **Categorised sends** — the outbound callers now pass a `kind` (`ALERT`, `INVITE`, `WORK_ORDER`, `HUB_RETURN`, `RESERVATION`) so the log is filterable.
- **Admin visibility** — `GET /api/admin/email-log` (admin-only; `?status=FAILED` filter + 7-day summary) and a compact **"Email delivery"** panel in Settings that defaults to failures, so a swallowed send is now *seen*.

> **Access-pattern note:** `EmailLog` is read/written via `$queryRaw`/`$executeRaw` (the same pattern the codebase already uses for `inventory_stock`, `hubs`, and `deployment_requests`). This was a deliberate choice so the change type-checks without regenerating the Prisma client (the sandbox can't reach Prisma's engine CDN); **CI regenerates the typed client** from the committed schema on `npm ci`, and the raw-SQL code keeps working either way.

**Still worth a fast-follow (not blocking):** a cron dead-letter that re-attempts `FAILED` logs after a cooldown, and threading `kind` through the remaining `OTHER` callers. The durable record + retry already close the silent-loss hole.

## W0-9 · HIGH · hub-return loop (patch `W0-9_hub_return_loop.patch`)

The Inbound tab was 100% read-only, so for the two email-less staging hubs a returned unit could never be marked received — and duplicates accreted (observed live climbing 13→15, with Garmin Glo2 01 appearing twice) because issuance never superseded prior links and receipt only completed the tapped one.

- **Dedupe on issue** (`status-links.ts`, `issueHubReturnLinks`) — issuing a HUB_RETURN link now revokes any prior active link for the same unit (mirrors the WORK_ORDER/RESERVATION supersede pattern), so a re-deployed-and-re-returned unit can't stack rows.
- **Complete siblings on receipt** — confirming receipt now completes any sibling active links for the same unit, so one confirmation clears it everywhere.
- **Admin actions** (new endpoints, admin-only): `POST /api/status-links/[id]/receive` (mark received on the hub's behalf, reusing the RECEIVED transition with an `Admin: <name>` actor), `POST /api/status-links/[id]/reissue` (revoke + mint a fresh link, returning the URL to copy), and **Dismiss** wired to the already-existing `revoke` endpoint (which had zero UI callers).
- **UI** — the Inbound table gains an ACTIONS column: **Received / Copy link / Dismiss** (write-gated, so read-only operators don't see them); Copy link puts the fresh URL on the clipboard.

## Apply

**Batch 3 has a migration**, so it's its own branch. Independent of Batches 0–2 (no file overlap).

```bash
git checkout development && git checkout -b feature/20260703/maxwellslater-wave0-batch3
# FND-8 (includes the schema + migration):
git apply outputs/wave0_batch3/FND-8_email_reliability.patch
git commit -am "feat(email): delivery log + retry + admin visibility (FND-8)"
# W0-9:
git apply outputs/wave0_batch3/W0-9_hub_return_loop.patch
git commit -am "feat(hubs): closable hub-return loop + dedupe (W0-9)"
# or everything at once:
git apply outputs/wave0_batch3/wave0_batch3_ALL.patch
```

**Migration handling (per CLAUDE.md):** the migration is committed in `prisma/migrations/`. On deploy, the CI `migrate` job applies it **before** the new revision serves traffic. It's additive (new `email_logs` table + `EmailStatus` enum), so it's backward-compatible — old code ignores it, new code uses it. No manual DB step. `prisma generate` runs on CI `npm ci`, so the typed client picks up `EmailLog` there. After merge, confirm the migrate job ran green in the deploy logs.

## Wave 0 status after Batch 3

**Written + verified:** FND-1, 2 (+tests), 3, 7, 8, 11, 12, 14, 15/16 · W0-9. That's the full correctness / security / release / offline-durability / email-reliability / hub-loop core.

**Remaining:**

| Item | Why not here |
|---|---|
| **W0-1 · A6 device pass** | Manual hardware — the pilot gate. |
| **W0-3 · merge 3 security branches** | Your push/CI (csp-nonce after a staging smoke-test). |
| **W0-8 · API hygiene** (wrapWrite coverage, maintenance GET side-effect, claim-first invariants + partial-uniques, `/api/hubs` envelope, missing-index migration, one response envelope + withAuth) | **The next batch, per your sequencing.** |
| **W0-10 · legacy-column retirement** | Snapshot + explicit sign-off; gates invoicing attribution. |
| **W0-11 · rename + SWR + monolith split** | Larger; before GPS/clock UI. |

Next up (your order): **W0-8 API-hygiene primitives**, so the remaining ~25 Phase-3 routes are written on a clean base.
