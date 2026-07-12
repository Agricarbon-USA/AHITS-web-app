# AHITS — STATUS  ·  the one always-current doc — read me first

_Last updated: **2026-07-12 (session 5)**. If this date is more than a session old, trust the code and `git log` over this file, and update it._

> **Before re-opening any settled "should we…" question, read `DECISIONS.md`.** The big ones (prod deferred, Map scope, admin exclusion, W0-10 sequencing) are settled — don't re-litigate them.

## 1. One-paragraph state
AHITS is at the pilot doorstep, running on **staging**. The hard architecture is done and audit-verified. Merged to `development` (→ staging): CC-01 through CC-10, Wave-0 patches, and the doc-cleanup corpus. **CC-11 admin-as-operator shipped (PR #181, `a97079b`):** an admin can now hold a rig, be a transfer/handoff recipient, and accept transfers/handoffs — all writing `deployment_assignments` PRIMARY rows, never the legacy column. Admin-held rigs are flagged distinctly (not excluded outright) in the missed-check cron and both dashboard missed-check surfaces, and are excluded from payroll attribution per D3 via a `role`-carrying hook in `deployment-assignments.ts` — D3's note makes this a HARD acceptance criterion on CC-17. Production is deliberately deferred (see D1).

## 2. Environments
- **development → staging:** the live working line. Has the full Wave-0 hardening + W0-10 through PR-4a + CC-01 through CC-11. **Smoke on staging after every merge.**
- **production:** the git branch is now *current* (PR #144 merged 2026-07-11, `c0d231b`) but there is **NO prod environment** — no Supabase project, no `AHITS_PROD_*` secrets — so nothing is deployed and the triggered deploy failed harmlessly. **Prod is deferred; see `DECISIONS.md` D1 before touching anything prod.**

## 3. Active work — in flight right now
- **A6 device pass** — the pilot gate; human-run on real iOS + Android hardware; **not started — run in parallel with the reflection-increment packets below**.

## 4. Next actions (ordered)
1. **CC-22** (pilot ops rider — cron heartbeat + Sentry) → **CC-23** (design tokens + quick fixes + first 3 primitives) → **CC-24** (subtraction + glossary) → **CC-25** (live-camera QR) — the reflection-increment packets, per `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`.
2. Then **CC-12** (Batch 6b/perf) → **CC-14** (Today view) → **CC-26** (daily-check viewer — must land before the pilot fortnight) → **pilot fortnight** (CC-27 as scheduled filler) → CC-15/16/17/18.
3. Run the **A6 device pass** in parallel, starting now.
4. **D5/D6/D7/D8 are open PENDING decisions** — need Max's call before the pilot fortnight starts (see `DECISIONS.md`).

## 5. Open decisions (undecided — need a human)
- **D5** — hold the pilot fortnight for Today (CC-14), or ship the Today-lite bridge (CC-28)? See `AHITS_PILOT_CHARTER.md` §5.
- **D6** — EMAIL_SANDBOX global flip timing, after the two-part audit.
- **D7** — name a second pilot-hours contact.
- Governance sweep items (push vs 45s polling; CARRY-* build-or-descope) — see workplan §13.
- Mounted collection units: reuse-vs-new-model design decision (CC-21 spike) before building.

## 6. Do-not-touch / deferred (pointers only — these are NOT gates)
- **Production cutover** → DEFERRED, see `DECISIONS.md` D1 + `AHITS_PROD_CUTOVER_DEFERRED.md`.
- **W0-10 `4b′`/`4c` patches** → HELD, see `DECISIONS.md` D4 (they live in `held/`).
- **Real-time GPS tracking** → permanent anti-goal, see `DECISIONS.md` D2 (crew visibility is last-known only).

## 7. Map to the deep docs
- **Start here / corpus map:** `00_START_HERE.md`
- **Plan of record:** `AHITS_PHASE3_WORKPLAN_2026-07-10.md` · **Paste-ready packets:** `AHITS_CLAUDE_CODE_INSTRUCTIONS.md` (canonical, supersedes the dated `_2026-07-10`/`_2026-07-12` packet docs) · **Landing order + smoke:** `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`
- **Deep assessment:** `AHITS_STATE_OF_THE_APP_2026-07-10.md` · **Strategy:** `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` · **Sequence:** `AHITS_MASTER_ROADMAP.md` · **One-pager:** `AHITS_ROADMAP_EXEC_SUMMARY.md`
- **Decisions:** `DECISIONS.md` · **Latest handoff:** `AHITS_SESSION_HANDOFF_2026-07-12.md` · **Rules for changing code:** `CLAUDE.md`

---

## SESSION CLOSE — do all 7 (≈6 min). This is the durability contract.
> **§1 ≡ §2 invariant:** the merged set named in §1 (one-paragraph state) MUST match the merged set listed in §2 (environments). If they disagree, §2's code-grounded list wins — reconcile §1 to it before closing.
1. **`STATUS.md`** — update §1 state, §3 active work, §4 next actions, and the date line.
2. **`DECISIONS.md`** — append any decision made this session (new `Dn`); mark superseded ones.
3. **`00_START_HERE.md` / `docs/INDEX.md`** — if you added/superseded/moved a doc, fix the row.
4. **Handoff** — write `AHITS_SESSION_HANDOFF_<date>.md`: what shipped + resume points; reference decisions by `Dn`, don't re-narrate them.
5. **Commit + push** all docs to git. (`git add -A && git commit && git push`.)
6. **Sanity:** `git status` clean, and confirm the docs you wrote appear in `git ls-files '*.md'`. **If a doc you wrote isn't tracked, it does not exist for the next session.**
7. **Verify every merge you claimed (60 seconds).** For each packet you marked merged in §1/§2, grep the code for ONE acceptance string that only exists if that packet landed. Canonical anchors for the new packets: CC-22 → `CRON_SILENT` · CC-23 → the tokens.ts import in the theme · CC-24 → `Mark handled` · CC-25 → `QrScannerDialog` · CC-26 → the daily-check viewer route path · CC-27 → an MUI import in FulfillmentChecklist. If the string is absent, the claim is wrong — CORRECT §1/§2 before closing, do not close on an unverified claim. Velocity without this check is how STATUS went self-inconsistent within a day of its own contract.
