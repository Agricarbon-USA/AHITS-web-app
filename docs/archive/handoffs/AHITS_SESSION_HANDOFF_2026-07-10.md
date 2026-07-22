> ⤴ **ARCHIVED (superseded) — moved 2026-07-22.** Historical record; current state lives in `STATUS.md` + the newest handoff. Kept for provenance only — do not act on it.

# AHITS — Session Handoff (2026-07-10)

Comprehensive handoff for the next session. Covers **what shipped**, **where it stands (staging/prod)**, **exact resume points**, and **everything forward**. Every code change this session went through the same discipline: build → **multi-agent adversarial review** (antagonist / Fable soundness / calibration / product-operator-lens, plus a reversibility/SRE and data-retention/audit seat for the irreversible DB drop) → fixes incorporated → **verified git patch** that applies cleanly onto `development`. Nothing was committed to your repo by the assistant; everything is delivered as patches your Claude Code (CC) lands.

---

## 1. Headline: what this session accomplished

- **W0-10 legacy-column retirement — the single largest data risk in the codebase — is fully designed, built, six-agent-reviewed, and (through PR-4a) live on staging.** This retires `Rig.operatorId`, the `rig_operators` table, and `Vehicle.assignedOperatorId` onto the `deployment_assignments` model, which is the gate the invoicing capstone sits behind.
- **Three additional Wave-0 items** built, four-agent-reviewed, and delivered as patches: EmailLog-FAILED alert, admin URL-filter rollout, and app-wide date-format unification.
- **A `development → production` reconcile** that unblocked the standing promote PR (production had been frozen at the June-26 state); **prod cutover deliberately paused** on one missing secret.
- **This session's field feedback** investigated against live code and turned into a grounded fix plan (`AHITS_FIELD_FEEDBACK_FIX_PLAN_2026-07-10.md`).

---

## 2. Delivered patches (in the repo root) — landing order

All apply cleanly onto `development` with `git apply --3way` (or `git am` for the format-patch ones). Each PR: land → `make db-generate && npx tsc --noEmit && npx eslint src && npm test` → PR → staging.

### W0-10 (Batch 5) — the retirement sequence
| Patch | What | State |
|---|---|---|
| `batch5-pr1-readers.patch` | Migrate every *reader* to `deployment_assignments` (non-revoking; legacy kept as fallback) | **LIVE on staging** (merged) |
| `batch5-pr2-invariants.patch` | FND-23 partial-unique indexes A/B/D | **LIVE on staging** |
| `batch5-pr2b-vehicle-closeout.patch` | Free vehicles on deployment-end + backfill + 23505→409 | **LIVE on staging** |
| `batch5-pr2c-vehicle-index.patch` | Index C (one open RigVehicle per vehicle) | **LIVE on staging** |
| `batch5-pr4a-readers.patch` | Remove the legacy *reader* fallbacks (columns kept) | **LIVE on staging** |
| `batch5-pr4b-writers-nullable.patch` | Remove *writers* + drop schema fields (client stops projecting) + make `operatorId` nullable; **columns still exist** | **HELD** — land after 4a is live on **prod** |
| `batch5-pr4c-drop.patch` | Archive + transactional **DROP** (irreversible) | **HELD** — land after 4b′ is live on prod + go/no-go green |

3-phase (4a→4b′→4c) was chosen so the irreversible DROP runs against a revision that **neither reads nor writes** the columns → zero read/write blip. Break-glass recovery committed: `prisma/recovery/W0-10_forward_fix_readd_operator_columns.sql`. Full plan + go/no-go + gates: **`AHITS_W0-10_MIGRATION_PLAN.md`** (see its "CURRENT STATUS & RESUME POINT" and §10–§11).

### Other Wave-0 items (independent, land anytime to `development`)
| Patch | What |
|---|---|
| `emaillog-failed-alert.patch` | Cron surfaces swallowed FAILED emails as self-resolving `EMAIL_FAILED` alerts (enum-add migration + presentAlert content + mutable + deep-link) |
| `batch8-urlfilters-rollout.patch` | Deployments + requests admin filters URL-persisted (deep-linkable, reload-safe); tamper-hardened |
| `batch6a-date-unify.patch` | 18 date sites → `formatDate`/`formatDateTime` (kills hydration-risky `toLocale…`); numbers + the guarded weekday greeting left alone |

*(Superseded/obsolete patches you can delete: `batch5-pr4-REFERENCE-needs-split.patch`, `batch5-pr4b-writers-drop.patch`.)*

---

## 3. Where things stand

- **`development` / staging:** has everything above through **PR-4a** + the reconcile merge (`ef37a58`), deployed and **smoke-clean** (operators render from the assignment table; dashboard/deployments/vehicles good; zero console errors). The three other Wave-0 patches are **not yet landed** (your call next session).
- **`production` branch:** exists and is current (PR #144 merged 2026-07-11; `production` branch = `development` HEAD). The production **environment/DB does not** — the from-scratch standup is deferred (DECISIONS.md D1).
- **Prod cutover: DEFERRED (your decision).** No environment to deploy to yet; the remaining pre-prod work is the from-scratch Cloud Run + DB standup, not just one secret. See `AHITS_PROD_CUTOVER_DEFERRED.md`.

---

## 4. Exact resume points

**To take prod current (when ready):**
1. Create `AHITS_PROD_MIGRATE_URL` in Secret Manager (prod Supabase **session pooler**, port 5432, IPv4) with an ENABLED version; confirm the deploy service account has `secretmanager.secretAccessor`.
2. **⚠️ RUN THE INVARIANT GATE ON PROD *BEFORE* MERGING #144 — this is the highest operational risk.** Merging #144 makes **PR-4a** (which removed the last legacy operator-ownership *fallback*) live on **prod with no soak** — so the assignment-table invariants must hold on the **prod** DB first, or a drifted/incompletely-backfilled rig silently loses operator access (or the list render throws) at cutover, with no compiler backstop and no app rollback. Run §6 **Q1/Q2** *and* the active-rig parity **Q3/Q4/Q5** from `AHITS_W0-10_MIGRATION_PLAN.md` against **prod** — all must return zero. A non-zero **Q5** is a payroll-attribution incident; reconcile by hand before proceeding. Also **capture a prod PITR/backup restore point + note the UTC timestamp** as the cutover rollback anchor.
3. Merge PR **#144** → on the **production**-branch deploy run, confirm the **migrate** job's secret-read line did **not** error (`❌ Could not read AHITS_PROD_MIGRATE_URL` = stop) and that the expected **10 additive migrations** (`ADD COLUMN/CREATE INDEX IF NOT EXISTS`; nothing destructive) are listed. *(The migrate host is masked by design — you confirm the production-branch run + a clean secret read + the migration set, not the DB URL itself.)* → smoke prod.
4. PR-4a is then live on prod → land **PR-4b′**, soak on prod, → then **PR-4c** (the DROP) behind its full go/no-go gate (prod Q1/Q2 zero, archive taken, PITR). Details in `AHITS_W0-10_MIGRATION_PLAN.md` §11.

> **🔒 "HELD" means: do NOT merge PR-4b′ or PR-4c to `development`.** `development` auto-promotes to prod, and CI's migration-safety gate is *bypassed* by the DROP's `-- migration-safety: acknowledged` line — so **human sequencing is the only guard on the irreversible prod DROP**. Land 4b′/4c only once PR-4a is live *and soaked on production* with the §11 gate green. (Applying `batch5-pr4c-drop.patch` also requires dropping its `prisma/recovery/…sql` hunk — that file is already committed to the tree, so the patch won't `git apply` as-is.)

**To keep building on staging (independent of prod):** land the three Wave-0 patches (EmailLog / URL-filters / date-unify), then start the Field-Feedback Wave A. These do **not** touch the W0-10 held patches.

---

## 5. Everything forward

### A. Field feedback (this session) → `AHITS_FIELD_FEEDBACK_FIX_PLAN_2026-07-10.md`
Investigated against live code; grounded verdicts + fix approaches + sequencing. Highlights:
- **BUG:** operator/admin dashboard "—" = `/api/dashboard` `requireAdmin` 403 for operators + no `res.ok` guard. One-route fix.
- **GAP:** Fulfill → "Awaiting Pickup" thread (UR-010 hold plumbing exists; the *visible* thread doesn't). Field-fixed issue logging (model ready; no operator surface). Admin-as-operator (can own a rig; blocked as a transfer recipient). Hubs discrepancy view + dismiss destination + bulk verify (real dead-ends today).
- **FEATURE:** vehicle types edit + **mounted collection units** (Giddings/Wintex as separate check/maintenance assets — new model, the largest item).
- **UX/PERF:** mobile optimization + full "jittery/clunky" pass → fold with **Batch 6b** into one **Performance & Feel** workstream.
Recommended waves: A (quick wins: dashboard bug, admin-as-operator, vehicle-type enum) → B (flow gaps) → C (structural + perf).

### B. Remaining Wave-0 / Phase-0 tail
- **Batch 6b** — operator freshness substrate (monolith split, SWR, outbox). Structural; the backbone of the perf pass.
- **Sentry** — blocked on you providing the DSN.
- **Batch 2** — your staging correctness-sweep verification.

### C. Phase 3 capstones (from `AHITS_PHASE3_DETAILED_WORKPLAN.md` §6)
1. Deployment Map (smallest; de-risks GPS plumbing) — do first.
2. No-app QR daily-check web form (reuses the token primitive).
3. Time Tracking, Invoicing & Availability (the heavy one) — **gated behind W0-10**, which is now essentially done.
Plus the map follow-ons folded in earlier (M-1 path history, M-2 operator map, M-3 pending-pickup pins; real-time tracking kept out of scope).

### D. Yours / operational
- The W0-10 prod cutover (§4) on your timeline.
- **A6 device pass** after the app freezes.
- `AHITS_PROD_MIGRATE_URL` secret (§4.1).

---

## 6. How to work the next session
Everything ships as **verified patches, four-agent-reviewed**, landing to `development` → staging first, prod on your explicit go. The in-sandbox limitation to remember: the Prisma client can't be regenerated offline, so **CI `tsc` (with a fresh `make db-generate`) is the authoritative type gate** — always run it when landing a schema-touching patch. Start next session from Field-Feedback **Wave A** (quick wins) unless you want to take prod current first.

---

*Companion docs: `AHITS_W0-10_MIGRATION_PLAN.md` (the retirement, in full), `AHITS_FIELD_FEEDBACK_FIX_PLAN_2026-07-10.md` (this session's field notes), `AHITS_PHASE3_DETAILED_WORKPLAN.md` (capstones + sequencing).*
