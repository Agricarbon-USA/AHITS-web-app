# Session handoff — 2026-07-28 · CC-16S (public-surface security, step 0 of CC-16 per D18)

## What shipped (code complete — awaiting Max's staging smoke; nothing merged yet)

Two PRs, both **green in CI** (incl. the node DB suite), both `--base development`. Public surface: **nothing merges on green CI alone** — Max smokes staging first.

### PR #220 — warm-up: cron step-7 stale-hold release (the "discovered latent bug" CC-31 §3 flagged)
- **Bug:** `src/app/api/cron/dispatch/route.ts` step 7 swept stale holds with `AND r."fulfilledAt" < NOW() - make_interval(hours => ${holdTtlHours})`. Prisma binds `${holdTtlHours}` as **bigint**; `make_interval(hours => bigint)` does not exist → Postgres **42883** on **every** cron pass, swallowed by the bare `catch {}` as "held columns missing". **Unclaimed holds NEVER expired — a hub's reserve froze forever, silently, for weeks.**
- **Fix:** bind the cutoff as a JS `Date` (`holdCutoff = new Date(Date.now() - holdTtlHours * 3_600_000)`), the exact house pattern at `lib/deployment-requests.ts:952`. Integer/finite TTL guard kept. Un-silenced the catch (CC-30 pattern): `console.error('[cron] stale-hold release errored', err)` + `Sentry.captureException(err)`, still non-fatal.
- **Test:** `tests/step7-stale-hold-release.test.ts` — FULFILLED request, `fulfilledAt` 100h ago, `holdExpiresAt` elapsed, unclaimed held line → sweep sets `releasedAt` (impossible before the fix — the query threw first). Plus a control: a hold still within its pickup TTL is left alone. **Trap dodged (advisor catch):** `holdExpiresAt` must be NULL/past in the test or the fulfill snapshot's future TTL (default 168h) correctly excludes the row and the test fails for the wrong reason.
- **⚠ DEPLOY GUARD (pre-merge, human — in the PR body):** the first fixed run releases EVERY accumulated stale hold and notifies each affected operator. Max: run the read-only step-7 SELECT (in the PR body) against staging, paste rows, claim/admin-release any genuine pickup first, and add `ORDER BY r."fulfilledAt" ASC LIMIT 10` if >10 rows (`releasedAt` makes per-run draining safe — thundering-herd cap only, not added proactively).
- **Post-merge smoke doubles as CC-31 PR-1's owed retroactive cron smoke** (force-run cron, watch the bell: INV-5 quiet, holds released; lock+reset a PIN → PIN_LOCKED self-clears). **Housekeeping owed:** delete `ahits-web-app-preview-cc31-pr3` + `-pr2` (`gcloud run services delete … --region us-central1`).

### PR #221 — CC-16S proper (two files of substance + the test file; nothing else touched)
1. **§3.4 revoked/expired read-after leak** — `src/app/api/s/[token]/route.ts`. `GET /api/s/[token]` built the full subject payload regardless of link state, so a dead RESERVATION link kept serving live hub inventory (`availableUnits`/`substitutableItems` via `getLineChecklist`) and dead WORK_ORDER/HUB_RETURN links leaked asset/problem/serial. **Fix:** when `!actionable` (REVOKED/COMPLETED/clock-expired), early-return a minimal body `{ type, state, actionable:false, allowedActions:[], subject:{}, label }` and **skip `getRequest`/`getLineChecklist` entirely** — no build-then-strip. `label` (a `Record<StatusLinkType,string>`) is wired into the portal title fallback so a dead link reads "Hub Return" / "Rig Reservation Request" instead of the generic placeholder.
2. **FND-6 final shard** — `src/app/s/[token]/page.tsx`. The per-line `Idempotency-Key` embedded `Date.now()`, so double-tap dedup never fired. **Fix:** a per-intent random nonce in a ref (`lineActionNonce`) keyed by `(lineId, action)` — minted once, reused for every retry/double-tap of that intent (dedup fires), cleared on success so the next intent (incl. re-editing the same line to a new qty) mints fresh and applies. Random (not a counter) so a page reload can't collide with a prior different-body key that `withIdempotency`'s body-hash binding would 422.
3. **Tests** — `tests/fnd6-public-link-gate.test.ts` (its four existing cases kept green): REVOKED GET → minimal body (no inventory keys); `expiresAt`-past GET → likewise, `state:EXPIRED`; ISSUED GET → full subject **control** (asserts `availableUnits` present, proving the strip is real); two same-key line-action POSTs → exactly one `request_line_events` row.

## Resume points (for whoever picks this up)
1. **Max: smoke both PRs on staging, then merge** (merge = deploy under D16). CC-16S gate: one dead link (page says no longer valid, NO item list/qty/serials), one live link (checklist works), one double-tap (one event, no dup, no error flash) — both roles/both widths. #220 gate: the DEPLOY GUARD SELECT.
2. After merge: run the #220 post-merge cron smoke + delete the two preview services.
3. **CC-16-proper stays 🅿 PARKED (D18)** — do not build the public QR form unprompted. Next queued packet after CC-16S: **CC-33** (simplify & unify — dead-code sweep, Forward→Operator removal D21, one unified Transfer entry D22).

## Decisions
- **D18 (ACTIVE, already recorded 2026-07-28):** CC-16 split — step 0 ships as CC-16S now; CC-16-proper PARKED conditional. No new decision this session.

## Pre-flight run locally
- `npm run type-check` ✅ · `npx eslint` on all changed files ✅ (both PRs).
- Node DB suite is **CI-only** here (no local Postgres) — the gate tests + the step-7 regression ran green in CI.
- Portal browser smoke is deferred to Max's staging merge-gate (a dev push mid-smoke would clobber the shared preview — see memory).
