# AHITS — Wave 0, Batch 1 · Execution Log

_2026-07-03. Fixes implemented and verified this session against `AHITS_PHASE3_WORKPLAN_v2.md`. Every change was applied to a clean HEAD (`b66c1af`) sandbox copy, type-checked, linted, and production-built. **Delivered as patches** (see §Apply) because a stale `.git/index.lock` on the connected repo blocks commits from this environment — the patches apply cleanly to HEAD and are the intended handoff._

## Verification (all green, whole app)

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `eslint` (changed files) | **0 errors** (8 pre-existing `set-state-in-effect` warnings, none introduced) |
| `next build --webpack` | **passes** — all 63 routes compile/bundle |
| `deploy.yml` | valid YAML |
| `Makefile` | parses; `cloud-run-migrate` dry-run resolves the correct per-env secret |

## What was fixed (7 items across 2 batches)

### Batch 0 — the live crash + doc drift (branch `feature/20260702/maxwellslater-fix-ended-deployment-crash`; patch `ahits_ended_deployment_fix_and_docs.patch`)

- **FND-1 · HIGH · ended-deployment crash.** `src/app/api/deployments/[id]/route.ts` GET now hydrates `operator` from the retained legacy `Rig.operatorId` when the roster returns none (ended deployments), mirroring the #128 list fix. Reproduced live this session (ending a deployment threw the admin page to the error boundary); this closes the root cause. No schema change.
- **Doc drift** (README branch/workflow/env; dead `ADMIN_EMAIL`; CLAUDE.md migrate-on-deploy correction + the FND-15 prod-secret warning).

### Batch 1 — this session (patches in `outputs/wave0_batch1/`)

- **FND-3 · HIGH · bulk-invite token security** — `src/app/api/users/bulk/route.ts`. Was storing the **raw** account-minting token at rest and emailing it, so every bulk-invite link 404'd (validation hashes before lookup) **and** the DB held live secrets in plaintext. Now generates a CSPRNG token, stores only `hashInviteToken(raw)`, emails the raw token, and deletes the dangling invite if the email fails — identical posture to the single-invite route.
- **FND-2 · HIGH · consumable stock leak across transfers** — `src/app/api/transfers/[id]/accept/route.ts`. The destination kit item was created with `drawnQuantity:0/drawnHubId:null`, so returning a transferred consumable restored `min(qty, 0) = 0` and the hub stock drawn at checkout was permanently lost. Now splits the drawn amount across the transfer (destination takes up to the transferred qty; source keeps the remainder), conserving the total so later returns restore correctly. Serialized items are unaffected (`drawnQuantity` 0 → no-op). _Regression tests still to add (see Remaining)._
- **FND-11 · HIGH · bare "Item" request lines** — `src/lib/deployment-requests.ts` + `src/app/api/s/[token]/route.ts`. `getLineChecklist` omitted the vehicles join that `getRequest` has, so specific-vehicle reservation lines rendered as a bare "Item" (confirmed live) in both admin and the external hub page. Added the `specificVehicleName` join + field, inserted it into the public name chain, and mapped `vehicleType` through a readable label instead of showing the raw enum. Admin's `lineDisplayName` already preferred `specificVehicleName` — it just wasn't being populated.
- **FND-12 · HIGH · admin error toasts shown as green success** — `src/app/(admin)/admin/users/page.tsx` + `admin/deployments/page.tsx`. Users' toast was hardwired `severity="success"` and callers overwrote a failed `patchUser`'s error with a green "X deactivated"; three deployments toasts passed error text without the severity arg. Now `patchUser` returns success/failure, callers announce success only on success, the toast honors severity, and the three deployments error toasts render red.
- **FND-15 + FND-16 · HIGH · release safety** — `Makefile` + `.github/workflows/deploy.yml`.
  - **FND-15:** `cloud-run-migrate` hardcoded the **staging** migrate secret, so a `production` deploy would migrate staging and serve prod against an unmigrated schema. Parameterized to `$(SECRET_NS)_MIGRATE_URL` (defaults to staging; unchanged) and the `deploy.yml` migrate job now passes `SECRET_NS=AHITS_PROD` on the `production` branch. **Ops prerequisite: create `AHITS_PROD_MIGRATE_URL` in Secret Manager (prod session pooler, port 5432, IPv4) before the first prod deploy.**
  - **FND-16:** `EMAIL_SANDBOX` is now mounted via `--set-env-vars` (so it persists across deploys — a console-only value is wiped each deploy) with `deploy-staging` setting it `true` and `deploy-prod` `false`. Staging can no longer email real shops/hubs.

## Apply

The connected repo currently has a stale `.git/index.lock` (harmless; remove it once, it's a 0-byte sandbox artifact). Then, from the repo root:

```bash
rm -f .git/index.lock

# Batch 0 (crash fix + docs) — already in your working tree on its branch, or re-apply:
git checkout -b feature/20260703/maxwellslater-wave0-crash-docs
git apply ahits_ended_deployment_fix_and_docs.patch      # (from outputs/)
git commit -am "fix: ended-deployment crash (FND-1) + doc drift"

# Batch 1 — one branch, one commit per finding (or split into PRs):
git checkout development && git checkout -b feature/20260703/maxwellslater-wave0-batch1
git apply outputs/wave0_batch1/FND-3_bulk_invite_token_hashing.patch   && git commit -am "fix(security): hash bulk-invite tokens at rest (FND-3)"
git apply outputs/wave0_batch1/FND-2_consumable_stock_transfer.patch   && git commit -am "fix(inventory): carry drawn stock across transfers (FND-2)"
git apply outputs/wave0_batch1/FND-11_request_line_labels.patch        && git commit -am "fix(requests): name specific-vehicle request lines (FND-11)"
git apply outputs/wave0_batch1/FND-12_admin_toast_severity.patch       && git commit -am "fix(admin): show error toasts as errors, not success (FND-12)"
git apply outputs/wave0_batch1/FND-15-16_release_safety.patch          && git commit -am "fix(deploy): per-env migrate secret + EMAIL_SANDBOX mount (FND-15/16)"

# or apply everything at once:
git apply outputs/wave0_batch1/wave0_batch1_ALL.patch
```

Open PRs `--base development`; CI `verify` (lint/type-check/build/tests) gates the merge. After the batch-0 crash fix deploys to staging, **re-test End Deployment** on the drawer to confirm the crash is gone.

## Remaining Wave 0 (not done here — why, and the path)

| Item | Status / why not automatable here |
|---|---|
| **W0-1 · A6 device pass** | Manual on-hardware procedure (5 real targets, 22 rows). The pilot gate — run it after batch-0 deploys. |
| **W0-3 · Merge the 3 security branches** (pin-hardening, rate-limit-uploads, csp-nonce) | They already exist; merging needs your push/CI. `csp-nonce` needs a staging smoke-test first. Verified merge-clean in the workplan. |
| **FND-2 regression tests** | Add before merge: transferred-consumable return restores correct stock; partial-transfer end doesn't over-credit. Needs the Postgres test service (CI). |
| **FND-7 · business-date unification** | Ready to implement (one `businessDate(APP_TIMEZONE)` helper across client/cron/feeds); a focused next batch — touches the daily-check client + cron + feeds. |
| **FND-14 · offline queue poisoning** (reconnect re-load + 401-park) | Next batch; needs care in `useOfflineQueue` — best paired with an A6 re-run. |
| **FND-8 · email retry/delivery-log** | Next batch (unblocks the invoice email). |
| **W0-10 · legacy-column retirement** | **Do not automate.** Irreversible `DROP COLUMN` — snapshot + your explicit sign-off, sequenced before invoicing. |
| **W0-8 hygiene, W0-9 hub loop, W0-11 rename/SWR/monolith, W0-12 cleanup** | Sequenced next; several are ready-to-spec. Say the word and I'll take the next batch. |

_This log covers 7 verified fixes. The rest of Wave 0 is either manual (A6), credential-gated (branch merges/deploys), high-risk-by-design (legacy drop), or queued for the next implementation batch._
