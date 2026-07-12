# AHITS — STATUS  ·  the one always-current doc — read me first

_Last updated: **2026-07-12 (session 4)**. If this date is more than a session old, trust the code and `git log` over this file, and update it._

> **Before re-opening any settled "should we…" question, read `DECISIONS.md`.** The big ones (prod deferred, Map scope, admin exclusion, W0-10 sequencing) are settled — don't re-litigate them.

## 1. One-paragraph state
AHITS is at the pilot doorstep, running on **staging**. The hard architecture is done and audit-verified. Merged to `development` (→ staging): CC-01 through CC-09, Wave-0 patches, and the doc-cleanup corpus. **CC-10 field-fix log + vehicle damage path shipped (PR #180, `f2c05a0`):** operators can log a fixed-in-field issue on any vehicle or unit (COMPLETED task, no alert, no status flip) or report vehicle damage (IN_PROGRESS task, vehicle → IN_MAINTENANCE, DAMAGE_REPORTED alert). The admin maintenance close route now handles vehicle repairs without a return destination. Production is deliberately deferred (see D1).

## 2. Environments
- **development → staging:** the live working line. Has the full Wave-0 hardening + W0-10 through PR-4a + this session's CC-01/02/03 + CC-06. **Smoke on staging after every merge.**
- **production:** the git branch is now *current* (PR #144 merged 2026-07-11, `c0d231b`) but there is **NO prod environment** — no Supabase project, no `AHITS_PROD_*` secrets — so nothing is deployed and the triggered deploy failed harmlessly. **Prod is deferred; see `DECISIONS.md` D1 before touching anything prod.**

## 3. Active work — in flight right now
- **A6 device pass** — the pilot gate; human-run on real iOS + Android hardware; **not started — run in parallel with Wave B**.

## 4. Next actions (ordered)
1. **CC-11 (admin-as-operator)** — built on `deployment_assignments`; admin-held rigs excluded from payroll per D3.
3. Run the **A6 device pass** in parallel with Wave B.
4. Then the structural work: Batch 6b / Perf + the operator's **Today** view (CC-14), then the capstones (Map → QR → Time/Invoicing).

## 5. Open decisions (undecided — need a human)
- Governance sweep items (push vs 45s polling; CARRY-* build-or-descope) — see workplan §13.
- Mounted collection units: reuse-vs-new-model design decision (CC-21 spike) before building.

## 6. Do-not-touch / deferred (pointers only — these are NOT gates)
- **Production cutover** → DEFERRED, see `DECISIONS.md` D1 + `AHITS_PROD_CUTOVER_DEFERRED.md`.
- **W0-10 `4b′`/`4c` patches** → HELD, see `DECISIONS.md` D4 (they live in `held/`).
- **Real-time GPS tracking** → permanent anti-goal, see `DECISIONS.md` D2 (crew visibility is last-known only).

## 7. Map to the deep docs
- **Start here / corpus map:** `00_START_HERE.md`
- **Plan of record:** `AHITS_PHASE3_WORKPLAN_2026-07-10.md` · **Paste-ready packets:** `AHITS_CLAUDE_CODE_INSTRUCTIONS_2026-07-10.md` · **Landing order + smoke:** `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`
- **Deep assessment:** `AHITS_STATE_OF_THE_APP_2026-07-10.md` · **Strategy:** `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` · **Sequence:** `AHITS_MASTER_ROADMAP.md` · **One-pager:** `AHITS_ROADMAP_EXEC_SUMMARY.md`
- **Decisions:** `DECISIONS.md` · **Latest handoff:** `AHITS_SESSION_HANDOFF_2026-07-12.md` · **Rules for changing code:** `CLAUDE.md`

---

## SESSION CLOSE — do all 6 (≈5 min). This is the durability contract.
1. **`STATUS.md`** — update §1 state, §3 active work, §4 next actions, and the date line.
2. **`DECISIONS.md`** — append any decision made this session (new `Dn`); mark superseded ones.
3. **`00_START_HERE.md` / `docs/INDEX.md`** — if you added/superseded/moved a doc, fix the row.
4. **Handoff** — write `AHITS_SESSION_HANDOFF_<date>.md`: what shipped + resume points; reference decisions by `Dn`, don't re-narrate them.
5. **Commit + push** all docs to git. (`git add -A && git commit && git push`.)
6. **Sanity:** `git status` clean, and confirm the docs you wrote appear in `git ls-files '*.md'`. **If a doc you wrote isn't tracked, it does not exist for the next session.**
