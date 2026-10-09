# Session handoff · 2026-10-09 (evening) · smoke rules + merge checklist · PR-5c "Today shows the crew rig"

> Read with `STATUS.md` (resume box; §3 PR-5c row; §4 merge checklist, post-program point fixes, and the parked two-rigs question), **D47** (new), and the spec in `AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md` § PR-5c.

## What shipped
- **Docs PR #263, merged by the session** (docs-only; CI green):
  - **CLAUDE.md, two new smoke rules:**
    - Throwaway smoke data goes in through the app's own screens, never raw API calls.
    - Before any staging smoke, read and report the dashboard's Active Deployments count.
  - **STATUS §4, a merge checklist** with D31's evening window. D31 calls "the evening-deploy rule (D16)" the guardrail against mid-shift service-worker swaps, but **neither D31 nor D16 names an hour**. The checklist reads it as after the crews' day, US Central, until the owner sets one.
  - **STATUS §4, three post-program point fixes:**
    - `POST /api/inventory` should require a category.
    - The transfer card shows ×2 for a transfer of 1 from a line of 2.
    - A failed Receive leaves a stale row until refresh.
- **PR-5c #264, OPEN and not merged** (the owner merges). CI ran on push.
  - Branch: `feature/20261009/Agricarbon-USA-pr5c-today-crew-rig`. Commits: the spec, then the code, then the tests, then these docs.

## PR-5c in one paragraph
- **One resolver:** `resolveMyRigId`, in `rig-list.ts`, serves both `/mine` and Today.
- **One definition** of "checked for this rig today": `src/lib/rig-daily-checks.ts`. It is the first check that day by anyone ever assigned to the rig, for each of the rig's current vehicles, keyed on the vehicle's current rig. Four readers use it:
  - Today's shared done state ("Checked by <name> at <time>").
  - The POST's 409 "Already checked today by <name> at <time>", under a transaction-scoped advisory lock on (vehicle, date).
  - The DAILY_CHECK_MISSED evaluator.
  - The dashboard's missed list.
- **Kept as before:** the filer's own redo updates their row, and a non-crew check stays allowed.
- **Server permissions unchanged:** the write guards stay PRIMARY-only. A crewmate's check isn't openable (own-only reads), so it shows the name and time plus one line of reason.

## Resume points
1. **Owner: review and merge #264, in the evening.** Use the STATUS §4 merge checklist. Read the PR's "Behaviour changes" first.
2. **Owner smoke after merge:** two operators on one test rig. Per CLAUDE.md, enter the test data through the app's screens and state the Active Deployments count first.
3. **Merge times today were afternoon/evening Central:**
   - #258 at 16:01, #260 at 16:29, #261 at 17:18, #259 at 17:51.
   - Docs #262 at 18:17 and #263 at 18:42.
   - **The owner should say whether the 16:01–17:51 code merges count as D31 deviations, and set the evening hour.**
4. **Untracked files not committed:** `AHITS_WHATS_CHANGED_2026-10.md` and `AHITS_Whats_Changed_2026-10.pdf` appeared in the working tree during the session. They weren't written by this session and aren't named for this PR, so they were left untouched for the owner.
5. **Parked (STATUS §4):** one operator can be SECONDARY on several active rigs at once. The schema and code allow it, and every reader shows one rig (PRIMARY first, then newest).
