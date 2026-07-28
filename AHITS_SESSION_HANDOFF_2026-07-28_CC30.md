# Session handoff — CC-30 (2026-07-28)

**Packet:** CC-30, Tier 2 of `AHITS_SIX_SEAT_REVIEW_2026-07-28.md` §2 (SRE seat).
**Governing decision:** **D16** — staging is home; the pilot is a rolling start and the
team operates on staging indefinitely, so staging is hardened to de-facto-production
posture. (D16 was recorded in the 2026-07-28 review session — referenced here, not
re-appended.)

> **Note on this file's name.** A concurrent CC-29 session owned
> `AHITS_SESSION_HANDOFF_2026-07-28.md` and had uncommitted edits to `STATUS.md` /
> `DECISIONS.md` throughout this session. This handoff is deliberately suffixed `_CC30`
> to avoid collision, and **`STATUS.md` was intentionally not touched** — see
> "Session-close deviation" at the end.

---

## What shipped

| PR | Title | State |
|---|---|---|
| **#204** | CC-30 PR-1: pipeline hardening for D16 (staging is home) | Open, **CI green**, base `development` |
| **#206** | CC-30 PR-2: server-side eyes on the offline-queue P0 and the cron invariants | Open, **CI green**, base `development` |

### #204 — pipeline, CI gates, guards, rollback doc

- **`pr-staging-deploy.yml` no longer reaches the live service.** The
  `pull_request: [labeled]` trigger is gone (it deployed *any* labeled PR onto
  `ahits-web-app-staging` with no verify, no migration-safety, `DISABLE_SW=true`, and
  that PR's migrations applied to the live DB). Now `workflow_dispatch` only, with a
  required `service` input and a first-step guard:
  `REFUSING: pr-staging-deploy may never target ahits-web-app-staging (D16 — staging is home)`.
  **The migrate step was removed**, not gated — a preview must never migrate the pilot
  DB. Documented as a deliberately degraded preview.
- **Migration-safety on the live branch.** New `migration-safety` job in `deploy.yml`
  between `verify` and `migrate`; `migrate` is `needs: [verify, migration-safety]`.
  `check-migration-safety.sh` now hard-fails an *acknowledged* destructive migration on
  `development` as well as `production`. `ci.yml`'s W0-10 DROP guard runs for
  development-targeting PRs with `BASE` parametrized off `github.base_ref`.
- **Seed/reset guards.** `prisma/seed.ts` and a shared `GUARD_LIVE_DB` Makefile recipe
  (used by both `db-seed` and `db-reset`) refuse a live Supabase host unless
  `AHITS_DANGEROUS_TARGET=yes-i-mean-staging`.
- **Pilot env into the pipeline.** `EMAIL_SANDBOX ?= true`, new `EMAIL_SANDBOX_TO`
  (previously set nowhere — its absence made every sandboxed send a silent `SKIPPED`
  that never raised `EMAIL_FAILED`), `deploy-staging` at `MIN_INSTANCES=1`, and a
  post-deploy **env-drift** check that fails the workflow if any of the three drift.
- **`PILOT_ROLLBACK.md`** — traffic-rollback play, never-hand-revert-the-schema rule,
  what-is-serving-now, and the Q1–Q4 lost-write reconciliation query pack.

### #206 — server-side eyes (two files only)

- `useOfflineQueue.ts`: Sentry captures at the `possible-data-loss` tripwire and all
  three `-> 'failed'` transitions. No payload bodies or photos; `userId` only.
- `cron/dispatch/route.ts`: the drift and INV-1..5 **bare catches** now log +
  `captureException` (the three legitimately best-effort catches stay bare); the
  advisory lock returns a discriminated result so a **connect error** is a `500`
  (`advisory-lock-connect-error`) instead of looking like benign contention forever.
- Heartbeat-only-on-full-success **verified** and commented, not restructured.

---

## Resume points / open items

### 1. ✅ Merge order with CC-29 — RESOLVED, no action needed

CC-29 landed first (#202/#203/#205 merged to `development` during this session), so
**#206 was rebased onto post-CC-29 `development` and its instrumentation re-anchored**;
#204 was rebased too. Both branches are current with `development`.

Worth knowing *why* this wasn't a mechanical re-anchor: CC-29 raised the number of
`-> 'failed'` transitions in `useOfflineQueue.ts` from **three to six**, and the three
new ones are exactly CC-29's new wedge-proofing paths (photo-upload retry-cap, that
branch's own dependent-quarantine loop, and the in-flight-409 retry-cap). Left alone
they would have shipped **blind** — defeating the purpose of #206. All six are now
instrumented, plus the data-loss tripwire; site-by-site table in **#206's body**.
CC-29's `tests/offline` flush-lifecycle harness passes with the captures in place
(`test:ui` 18 files / 84 tests, up from 17/74).

### 2. Latent trap found — the migration-safety gate is a false green on macOS

`scripts/check-migration-safety.sh` cannot run natively on macOS for two *pre-existing*
reasons: `mapfile` needs bash 4+ (macOS ships 3.2), and **BSD awk silently drops
`ORS="\0"`** — verified with
`printf 'a;b;c' | awk 'BEGIN{RS=";";ORS="\0"}{print}' | od -c` → **zero NUL bytes**, so
the statement-splitting loop makes zero iterations and the script reports green for
*everything*. Anyone smoke-testing this gate on a Mac gets a false pass. **Not fixed
here** — changing a CI gate's chunk-splitting mechanism deserves its own review and was
outside the packet's scope guard. **Worth a follow-up packet.**

### 3. A packet assumption that was wrong (already handled, but know why)

The packet assumed the script "fails closed if the base can't resolve." For the
all-zeros SHA it does **not**: `git rev-parse --verify --quiet 000…0` exits 0, the
subsequent `git diff` error is swallowed by the existing `2>/dev/null || true`, and the
script reports a green "no migrations to check." The explicit all-zeros skip in
`deploy.yml` is therefore load-bearing, not a nicety, and is a loud `::warning`.
Branch protection (Max item **f**) removes the path entirely.

### 4. Coverage gap inherited, not created

`grep -rln 'cron/dispatch\|api/cron' tests/` returns **nothing** — there are no cron
route tests at all, so #206's new `500` branch has no automated coverage. It is first
exercised by a real DB outage.

### 5. env-drift step is unproven until the first post-merge deploy

The `jq` expressions were validated against a hand-built Cloud Run JSON blob (pass case
and drift case, including that `minScale` is a *string* annotation and container env is
a list looked up by name), but never against real `gcloud` output. Max item **e** is
the human cross-check.

---

## MAX — LIVE-FIRE CHECKLIST (none of these has ever been attempted)

Record each result in `STATUS.md` §3.

- [ ] **a. Backups + restore drill.** Supabase → Settings → Database → Backups: write
      down the plan + retention actually in effect; enable PITR if the tier offers it.
      Then run ONE restore drill (~15 min): restore a backup to a **NEW throwaway
      project** (never over the live one), open its table editor, confirm
      `daily_checks` rows exist, delete the throwaway. **Write the exact click-path
      into `PILOT_ROLLBACK.md`'s "Restore drill" section** — the placeholder is already
      there waiting for it.
- [ ] **b. healthchecks.io.** Open the cron check — confirm a **real ping arrived in
      the last hour** (CC-22 shipped this but it has never been observed live). Set the
      grace period **below 30 min** so it alarms before the in-app `CRON_SILENT` does.
- [ ] **c. Dead-man's first live fire.** Cloud Scheduler: pause the cron job, wait
      >30 min, open the admin dashboard → the `CRON_SILENT` banner must appear; resume
      the job → the next run clears it.
- [ ] **d. Sentry.** `/admin/settings` → Sentry diagnostics → trigger the client-error
      and server-error buttons; confirm both events arrive **with a `request_id` tag**.
- [ ] **e. min-instances.** Cloud Run console → `ahits-web-app-staging`, after the first
      post-CC-30 deploy: confirm **min-instances = 1**. The deploy now fails loudly if
      not (env-drift check) — this is the human cross-check of a step that has never run.
- [ ] **f. Branch protection.** GitHub → Settings → Branches → protect `development`:
      require a PR before merging + require the CI status checks green. **This is what
      makes #204's item 2 airtight** — it removes direct pushes (and with them the
      force-push/all-zeros skip in item 3 above) entirely.
- [ ] **g. Delete the ambient invitation.** `gh label delete deploy-staging --yes`.
      One command. The in-repo guard in #204 is the backstop; this removes the
      temptation. *(The label still existed as of this session.)*
- [ ] **h. Mapbox token.** account.mapbox.com → Tokens → confirm the token mounted as
      `AHITS_MAPBOX_TOKEN` is a **public (`pk.`)** token with **URL restrictions**
      limited to the staging domain. It is served to authed clients, so the URL
      restriction is the only fence. If unrestricted, add it — no code change needed.
- [ ] **i. OPTIONAL (~5 min).** Add a GCP Uptime (or healthchecks.io-style) check on
      `GET https://<staging-url>/api/health` expecting 200 — it returns 503 when the DB
      is unreachable. The cron heartbeat proves the *cron* is alive, not the *service*;
      a wedged app at 5:50am is currently discovered by operator texts.

---

## Session-close deviation (deliberate, with sign-off)

The standard close updates `STATUS.md` §1/§3/§4 + the date line. **That was skipped on
purpose.** A concurrent CC-29 session held uncommitted edits to `STATUS.md` and
`DECISIONS.md` for this session's entire duration (and moved the main working tree
across three CC-29 branches while CC-30 ran). Writing those files would have risked
clobbering live work, and committing them from the main tree would have mixed CC-30
docs into a CC-29 branch. Max chose **handoff-doc-only**; `STATUS.md` and
`DECISIONS.md` are left to the CC-29 session that has them open.

**Therefore, still owed by whoever closes CC-29:** `STATUS.md` §3 rows for the nine Max
checklist items above, and §4 next-actions referencing #204 / #206.

`DECISIONS.md` needs **no** new entry — D16 already governs this packet.

### Step-7 grep anchors (all verified present on the two branches)

| Anchor | Where |
|---|---|
| `REFUSING: pr-staging-deploy` | `.github/workflows/pr-staging-deploy.yml` (#204) |
| `migration-safety` | `.github/workflows/deploy.yml` (#204) |
| `AHITS_DANGEROUS_TARGET` | `prisma/seed.ts` + `Makefile` (#204) |
| `env-drift` | `.github/workflows/deploy.yml` (#204) |
| `advisory-lock-connect-error` | `src/app/api/cron/dispatch/route.ts` (#206) |
| `PILOT_ROLLBACK.md` tracked | `git ls-files '*.md'` — lands with #204 |

> The last two anchors resolve only **after both PRs merge**. Re-run the check then,
> not before.
