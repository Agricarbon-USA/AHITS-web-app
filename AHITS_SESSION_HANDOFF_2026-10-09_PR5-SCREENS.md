# Session handoff · 2026-10-09 · PR-5 "Screens reconcile" — built, split, both open

> Read with `STATUS.md` (the PR-5 row in §3; §4 has the point fixes ticked), the program's PR-5 section in `AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md`, the evidence in `AHITS_SCREENING_REPORT_2026-10-05_ROOT-CAUSES.md`, and the previous handoff `AHITS_SESSION_HANDOFF_2026-10-09_PR3C-DELETE.md`.
> - **No new decision.** The PR-5 spec names none.
> - **D10 is not triggered (D-k).** No page was split.
> - **D21 held:** my-deployment went from 1475 to 1467 lines.

## What shipped this session
PR-5 grew past review size, so it was split at the module boundary the program allows. The split was announced before the first PR was opened. **Both PRs are OPEN and neither is merged.**

**5a — #258** (branch `feature/20261009/Agricarbon-USA-pr5a-screens-reconcile`)
- Contents: `useMutation`, `useInvalidation`, the queue-drain dispatch, the register's conversions, and `GET /api/deployments/mine`.
- CI is green, including the node DB suite, and the PR is marked ready for review.

**5b — #259** (branch `feature/20261009/Agricarbon-USA-pr5b-dead-ends-copy`)
- Contents: the dead ends, the copy module `src/lib/copy/admin-actions.ts` with its contract test, and the five STATUS point fixes.
- **It is cut from #258's tip**, because it edits #258's `useMutation` call sites. Its base is still `development`, so CI runs.

**Finding IDs closed** (each PR body lists its own):
- U-6, U-9, U-10, U-11, U-14, U-15.
- L-8 (partial; see "Open owner question" below), L-9, L-10 (residual), L-11 (residual).
- FND-32 and FND-48, marked "closed by #258 / #259 on merge" in `AHITS_PHASE3_WORKPLAN_v2.md`.

**The house rule held:**
- `src/app/sw.ts` and `tests/offline/**` are untouched.
- `src/hooks/useOfflineQueue.ts` received only the optional `invalidates` field (passed through `mutate()`'s three enqueues) and the dispatch after a successful apply. #258's body lists every changed line.

## Resume points
1. **Merge order: #258, then #259.**
   - #259's diff shows #258's three commits until #258 lands. Review #259 from `601687b` onward.
   - **After #258 squash-merges, rebase #259:**
     ```bash
     git fetch origin
     git checkout feature/20261009/Agricarbon-USA-pr5b-dead-ends-copy
     git rebase --onto origin/development b2eaaa9   # b2eaaa9 = 5a's last commit
     git push --force-with-lease
     ```
   - Then let #259's CI go green again before merging.
2. **#259's CI** was running when this handoff was written. If it is red, fix it on the branch.
3. **Owner smoke after each merge, with the tab visible.**
   - **#258:**
     - Do an action offline, go online, and the screen updates by itself (End deployment clears the rig).
     - Resolve an alert, and the Open alerts card drops by one.
     - Cancel a transfer in the deployment drawer, and the page's list updates.
   - **#259:**
     - A failed hub receive is red.
     - Pick up with an active rig opens Add items.
     - The In Maintenance card lands on the filtered vehicle list.
     - A refused vehicle Delete closes its dialog.
     - Vehicle Show deleted → Restore works.
     - The hub Deactivate button says "Deactivate".
4. **After both merge:** tick row 5 in `AHITS_PILOT_FLOOR_TODO.md`, record the smoke in STATUS §3, and mark FND-32 and FND-48 closed (drop the "on merge" wording). That is the last PR of the fix program.

## Open owner question (not decided here)
- **Should Today show a SECONDARY-only operator's crew rig?**
  - `getActiveRigForOperator` is now the one rule: PRIMARY first, then newest, then id.
  - `/api/deployments/mine` reads it with `includeSecondary`, so My Deployment, scan, daily check and operator requests show a crewmate's rig.
  - **Today stays PRIMARY-only**, because its done/due checks are per-operator. The code defers that view to the "secondary-operator Today" packet (CC-32 comment, STATUS §4).
  - Every surface agrees for anyone who is PRIMARY, so #258 claims L-8 as **partial**. Decide this when that packet is scheduled.

## Things the next session should know
- **Interpretations recorded in the PR bodies:**
  - Admin writes converted to `useMutation` go through the offline queue, as the spec says. Offline, they queue rather than fail.
  - `/mine` falls back to the cached list only on a thrown fetch, for a phone that has not yet read `/mine` online.
  - Deleted vehicles show "Deleted 9 Oct" with no name: there is no `deletedById` column, and PR-5 allows no migration. A deleted vehicle row is not clickable.
  - Pick up while deployed has the builder's `availFor > 0` limit. That is parity, not new behaviour.
  - The custom `Dialog` confirms on deployments (Cancel Transfer) and projects (Delete project) stay inline, because they contain markup.
- **Behaviour change in #259:** Reopen now 409s when another repair is open. The PR-3a/3b smoke recipe (report → complete → report → Reopen) is refused now.
- **The copy contract** (`tests/components/copy-contract.test.tsx`) fails in three cases:
  - A new key in `admin-actions.ts` has no effect row.
  - A row names a route or method that does not exist.
  - A moved string longer than 15 characters reappears inline in an admin page. The check is quote-based, so a comment that quotes a string counts too.
- **Existing UI tests edited in #258**, for the stubs only: five tests now serve `/api/deployments/mine`, and two import `fake-indexeddb/auto`, because those pages mount the real queue through `useMutation`.
- **Timing-dependent UI tests: still parked.** They were not a quick find. The leads are in STATUS §6: `pr1a-inventory-just-added` and `pr1b-picker-search` wait on real debounces.
- **Local shell:** prefix commands with `PATH=/opt/homebrew/opt/node@24/bin:$PATH`. There is no local Postgres, so the node suite runs in CI only.
