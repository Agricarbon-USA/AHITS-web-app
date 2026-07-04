# AHITS Documentation Index

_Last consolidated: 2026-07-03._ Root now holds only **canonical** and **current-cycle** docs; everything historical/superseded lives in `docs/archive/`.

## Canonical (root)

| Doc | Purpose |
|-----|---------|
| `README.md` | Project overview + setup. |
| `CLAUDE.md` | Agent/dev operating instructions + deployment workflow (branch → development=staging → production, migrate-on-deploy, DB rules). |
| `AGENTS.md` | Agent conventions (referenced by CLAUDE.md). |
| `AHITS_PRD_v2.md` | Product requirements (v2, authoritative). |
| `AHITS_PRD_v2.1_ADDENDUM.md` | PRD v2.1 addendum (maintenance/return-destination/repair additions). |
| `AHITS_CONSOLIDATED_TRACKER.md` | Living issue/feature tracker. |

## Current cycle (root)

| Doc | Purpose |
|-----|---------|
| `AHITS_PHASE3_WORKPLAN_v2.md` | Current Phase 3 workplan (v2, newest). |
| `AHITS_PHASE3_DETAILED_WORKPLAN.md` | Detailed Phase 3 workplan companion. |
| `AHITS_PHASE3PLUS_NORTH_STAR.md` | Phase 3+ direction / north star. |
| `PROD_CUTOVER_RUNBOOK.md` | Go-live / prod cutover runbook (current). |
| `AHITS_A6_TESTER_CHECKLIST.md` | A6 tester checklist (active — offline PWA verification). |
| `AHITS_A6_DEVICE_CHECKLIST.md` | A6 per-device install/test checklist (active). |
| `AHITS_SESSION_RECORD_2026-06-29.md` | Session record (2026-06-29). |
| `AHITS_SESSION_RECORD_2026-06-30_WAVE0.md` | Session record — Wave 0 (2026-06-30). |
| `AHITS_WAVE0_BATCH1..4_EXECUTION_LOG.md` | Wave 0 batch execution logs (1–4). |
| `AHITS_CODEBASE_SWEEP_2026-07-03.md` | Full codebase smoke-test + antagonistic + Fable sweep (this pass). |

## Archived (`docs/archive/`)

Historical/superseded — retained for provenance, not maintained:

- **Session records:** SESSION4/5/9/10 (+ addendum) / all SESSION11 variants (handoff, record, readonly-audit, revised-workplan, slice4-readiness).
- **Analyses & roadmaps:** ULTRA_REVIEW / INDEPENDENT_ASSESSMENT / FUNCTIONAL_TEST (06-25) / FIELD_BUGS_DIAGNOSIS (06-26) / QA_STAGING_ISSUES / PHASE3_READINESS (06-26) / ROADMAP_THROUGH_PHASE3 / WAVE1_ANALYSIS / WAVE2_COMPLETE.
- **Superseded plans:** PREPHASE3_WORKPLAN / PREPHASE3_CLOSEOUT_CHECKLIST / 29_SLICE3C_4_PLAN.
- **Design docs (implemented):** MULTIHUB_MIGRATE_DESIGN / REQUESTS_REDESIGN_DESIGN / FEEDBACK_FINDINGS_REGISTER.
- **Superseded runbooks:** PIPE2_PROD_DB_RUNBOOK / PROD_STANDUP_CHECKLIST (see PROD_CUTOVER_RUNBOOK).
- **One-off scripts:** F2/F3/F3_R4/F8/F9/S_ITEMS/HOTFIX/READONLY_REMAINING/REQUESTS_CLUSTER.
- Plus the pre-existing `docs/archive/` set (early CLAUDE_* feature/sprint notes, REVIEW/AUDIT, STATE_ANALYSIS, etc.).

> Moved out of root in the 2026-07-03 consolidation: 36 files. Nothing deleted — all are tracked in `docs/archive/`.
