# AHITS — Documentation Cleanup & Self-Navigation (Claude Code packet)

*Paste this to Claude Code (or run in your terminal). It makes the doc corpus self-navigating: places the new entry-point docs, deletes duplicates, archives history, adds status banners, fixes the cross-doc contradictions, and installs the durability process. Native git only — do NOT do this through any remote/bridge tool. Review seat: Calibration + Antagonist.*

**Do it on a docs branch:** `git checkout development && git pull && git checkout -b docs/self-navigating-cleanup-2026-07-11`. Commit at the end; open a PR to `development`.

---

## Part 1 — Place the three always-current entry docs (provided separately)
Add these files at repo root (their content was delivered in this session — copy them in): **`00_START_HERE.md`**, **`STATUS.md`**, **`DECISIONS.md`**. These are the new front door, the always-current state, and the decision log.

## Part 2 — Delete the 38 root duplicates (each is byte-identical to its `docs/archive/` copy; the archive copy is the keeper)
Verify-then-delete. For safety, confirm identity before removing:
```bash
for f in AHITS_29_SLICE3C_4_PLAN AHITS_F2_SHIPPO_GROUNDWORK_SCRIPT AHITS_F3_R4_SCRIPT AHITS_F3_SCRIPT \
  AHITS_F8_SCRIPT AHITS_F9_SCRIPT AHITS_S_ITEMS_SCRIPT AHITS_HOTFIX_SCRIPTS AHITS_READONLY_REMAINING_SCRIPT \
  AHITS_REQUESTS_CLUSTER_SCRIPT AHITS_MULTIHUB_MIGRATE_DESIGN AHITS_REQUESTS_REDESIGN_DESIGN \
  AHITS_FEEDBACK_FINDINGS_REGISTER AHITS_FIELD_BUGS_DIAGNOSIS_2026-06-26 AHITS_FUNCTIONAL_TEST_2026-06-25 \
  AHITS_ULTRA_REVIEW_2026-06-25 AHITS_QA_STAGING_ISSUES AHITS_PHASE3_READINESS_2026-06-26 \
  AHITS_INDEPENDENT_ASSESSMENT_AND_ROADMAP AHITS_ROADMAP_THROUGH_PHASE3 AHITS_WAVE1_ANALYSIS_AND_ROADMAP \
  AHITS_PREPHASE3_WORKPLAN AHITS_PREPHASE3_CLOSEOUT_CHECKLIST AHITS_PIPE2_PROD_DB_RUNBOOK \
  AHITS_PROD_STANDUP_CHECKLIST AHITS_SESSION4_ANALYSIS_AND_PLAN AHITS_SESSION5_RECORD AHITS_SESSION9_RECORD \
  AHITS_SESSION10_ANALYSIS_AND_PLAN AHITS_SESSION10_ADDENDUM_FEEDBACK_AND_WORKPLAN AHITS_SESSION11_HANDOFF \
  AHITS_SESSION11_RECORD AHITS_SESSION11_READONLY_AND_AUDIT AHITS_SESSION11_REVISED_WORKPLAN_AND_PROMOTION \
  AHITS_SESSION11_SLICE4_READINESS WAVE2_COMPLETE; do
  if [ -f "$f.md" ] && [ -f "docs/archive/$f.md" ] && cmp -s "$f.md" "docs/archive/$f.md"; then
    git rm "$f.md"; else echo "SKIP (not identical or missing): $f.md — review by hand"; fi
done
# The two superseded North Stars in root (archive copies with SUPERSEDED banners are the keepers):
git rm AHITS_PHASE3PLUS_NORTH_STAR.md AHITS_PHASE3PLUS_NORTH_STAR_v2.md   # (diff vs docs/archive first if unsure)
```

## Part 3 — Archive the unique historical docs (in root, NOT yet in archive)
```bash
git mv AHITS_PHASE3_DETAILED_WORKPLAN.md docs/archive/         # superseded by WORKPLAN_2026-07-10 + v2
git mv AHITS_SESSION_RECORD_2026-06-29.md docs/archive/
git mv AHITS_SESSION_RECORD_2026-06-30_WAVE0.md docs/archive/
git mv AHITS_WAVE0_BATCH1_EXECUTION_LOG.md docs/archive/
git mv AHITS_WAVE0_BATCH2_EXECUTION_LOG.md docs/archive/
git mv AHITS_WAVE0_BATCH3_EXECUTION_LOG.md docs/archive/
git mv AHITS_WAVE0_BATCH4_EXECUTION_LOG.md docs/archive/
git mv AHITS_CODEBASE_SWEEP_2026-07-03.md docs/archive/
```
Result: root drops from ~62 `AHITS_*.md` to ~22 canonical docs.

Also handle the loose patch files and the prepared SQL (absorbed from the old CC-13 packet):
```bash
# Archive the verified-LANDED patches (they're merged; keep out of the root's way).
mkdir -p docs/archive/patches
for p in batch4b-hubs-envelope-fnd33 batch4c-first-stock-fnd13 batch5-pr1-readers batch5-pr2-invariants \
         batch5-pr2b-vehicle-closeout batch5-pr2c-vehicle-index batch5-pr4a-readers batch7a-request-id-fnd17 \
         batch8-url-filters-fnd48 fix-ur005b-test-env; do
  [ -f "$p.patch" ] && git mv "$p.patch" docs/archive/patches/; done
# KEEP in place: held/batch5-pr4b*, held/batch5-pr4c* (D4), and the pending patches
# (emaillog-failed-alert, batch8-urlfilters-rollout, batch6a-date-unify) until they land.
```
Then add a one-line note at the top of `docs/prepared/slice4_drop_legacy.sql` + `slice4_precheck.sql`: *"Superseded for the operator columns by held/batch5-pr4c; remains the only written plan for the separate `rigs.projectId` drop (not covered by W0-10)."*

## Part 4 — Add a status banner to the top of every canonical & superseded doc
Prepend this 4-line banner (fill per doc) so a reader can trust/discard any doc in 5 seconds:
```
> STATUS: canonical | current | reference | superseded   ·   UPDATED: <date>
> SUPERSEDES: <doc or —>   ·   SUPERSEDED-BY: <doc or —>
> READ-WITH: <1–2 companion docs>
```
Apply specifically:
- `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` → `canonical`; and at its "crew visibility, declined by name" + "no real-time GPS / no route history" lines, add: `> ⚠️ SUPERSEDED BY DECISIONS.md D2 — route history + last-known crew visibility are now IN scope (attestation GPS only, no live tracking).`
- Any surviving `AHITS_PHASE3PLUS_NORTH_STAR.md`/`_v2.md` and `docs/archive/…_v1/_v2` → `superseded`, SUPERSEDED-BY `AHITS_PHASE3PLUS_NORTH_STAR_v3.md`.
- `docs/archive/AHITS_PHASE3_DETAILED_WORKPLAN.md` → `superseded`, SUPERSEDED-BY `AHITS_PHASE3_WORKPLAN_2026-07-10.md`; note the three decisions (D1/D2/D3) it predates.
- `AHITS_PHASE3_WORKPLAN_v2.md` → `canonical (ID register)`; add "re-baselined in *ordering* by `AHITS_PHASE3_WORKPLAN_2026-07-10.md`; strategy = `AHITS_PHASE3PLUS_NORTH_STAR_v3.md`."
- `PROD_CUTOVER_RUNBOOK.md` → `reference (DEFERRED)`, READ-WITH `AHITS_PROD_CUTOVER_DEFERRED.md` + `DECISIONS.md` D1.

## Part 5 — Fix the cross-doc contradictions (the Antagonist register)
1. **Money loop un-gated.** In `AHITS_ROADMAP_EXEC_SUMMARY.md` (the non-negotiable-gates line) and `AHITS_MASTER_ROADMAP.md` §1.2, change "W0-10 retirement → before invoicing (cannot be reordered)" to: *"W0-10 **readers** (PR-4a, landed) gate invoicing attribution; the **DROP** (4b′/4c) is elective and does NOT gate the money loop."*
2. **Prod exists vs not.** Everywhere prod is described, use one sentence: *"The `production` git branch exists (current since #144 merged 2026-07-11); the production **environment/DB does not** — the from-scratch standup is deferred (DECISIONS.md D1)."* Touch: `AHITS_SESSION_HANDOFF_2026-07-10.md` §3, `AHITS_STATE_OF_THE_APP_2026-07-10.md` §7 ("empty production current" wording), and `CLAUDE.md`'s prod-migrate paragraph (gate it with "prod cutover deferred — see DECISIONS.md D1; the real remaining work is the from-scratch standup, not one secret").
3. **PR #144 is merged.** Remove/annotate every "PR #144 stays a Draft / do not merge" line (`AHITS_ROADMAP_EXEC_SUMMARY.md` gate line, `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`, `PROD_CUTOVER_RUNBOOK.md` Step 1) → "#144 was merged 2026-07-11; production branch is current but the environment is still deferred (DECISIONS.md D1)."
4. **Master Roadmap Map anti-goal.** At §7.2A "no route history, no operator-facing map," add: `> ⚠️ SUPERSEDED BY DECISIONS.md D2 — route history + last-known crew visibility are in scope (attestation GPS only; real-time tracking remains an anti-goal).`
5. **Delete the root `AHITS_ROADMAP_THROUGH_PHASE3.md`** (Part 2 handles it) — it re-lists prod standup as a live pilot gate, contradicting "A6 is the only pilot gate."

## Part 6 — Rewrite `docs/INDEX.md` (or redirect it)
Simplest: replace its body with a pointer — "**This index is superseded by `/00_START_HERE.md` at the repo root. Go there.**" — plus the tier list from `00_START_HERE.md`. (It currently points at North Star **v1** and omits the entire 07-10 set.)

## Part 7 — Install the durability process in `CLAUDE.md`
At the top of `CLAUDE.md`, add:
```
> Before re-opening any settled "should we…" question, read DECISIONS.md. If it's an ACTIVE
> decision you may not act against it — only propose a superseding entry with owner sign-off.
> First read for state: STATUS.md and 00_START_HERE.md. If git status shows untracked *.md, commit before proceeding.
```
And append the 6-step **SESSION CLOSE** checklist (it's at the bottom of `STATUS.md`) so every session sees it.

## Part 8 — Commit
```bash
git add -A
git commit -m "docs: self-navigating corpus — START_HERE/STATUS/DECISIONS, dedup 38 root copies, archive history, status banners, contradiction fixes, session-close process"
git push -u origin docs/self-navigating-cleanup-2026-07-11
gh pr create --base development --title "docs: self-navigating documentation corpus" --body "Adds a single entry point (00_START_HERE), an always-current STATUS.md and append-only DECISIONS.md, deletes 38 root/archive duplicates, archives dated history, adds status banners, fixes ~10 cross-doc contradictions (incl. money-loop-un-gated, #144-merged, Map D2 override), and installs a session-close durability checklist. Root drops from ~62 to ~22 canonical docs, all reachable from one map."
```

**End state:** a newcomer opens the repo, sees `00_START_HERE.md` sort to the top, reads the through-line + the 15-minute path, and is current — with `STATUS.md` and `DECISIONS.md` guaranteeing no settled work gets lost or re-litigated again.
