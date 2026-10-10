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

## Evening update · #264 merged and deployed; smoke not run
- **Owner rulings (this session's last instruction):**
  - The four afternoon code merges (#258 16:01, #260 16:29, #261 17:18, #259 17:51 Central) are D31 deviations. They are recorded under D31 with the active-deployment count at each, taken from the Deployments history: 0, 0, 1, 1. The 1 was the session's own throwaway smoke rig, so no operator's rig was active at any of them.
  - The merge window is set: **D48**, after 20:00 Central or whenever the dashboard shows 0 Active Deployments; every merge report states the count. It is now item 3 of the STATUS §4 merge checklist.
  - The two untracked files are committed (`AHITS_WHATS_CHANGED_2026-10.md` + its PDF), with routing rows in `00_START_HERE.md`. There was no Operator Start Sheet row to sit next to, so one was added beside it.
- **#264 merged** at 20:32:29 Central. Active Deployments read 0 just before. Squash `1b5d459`; run 38013573234 green (verify, migration-safety, migrate, deploy, env-drift); revision `ahits-web-app-staging-00446-6v5`; `/api/health` 200. **D47 ACTIVE; L-8 CLOSED.**
- **Smoke not run.** It needs two operator logins, and the session may not create accounts or enter PINs on staging. Asked to create two test operators, the owner chose to skip the smoke tonight. A read-only check passed: the admin dashboard renders after the deploy, `/api/dashboard/feeds` 200, Active Deployments 0. No test data was created, so there is nothing to clean up.
- **Resume:** run the PR-5c smoke (STATUS §3 lists the rows). The owner creates two test operators and does the sign-ins; the session does the rest through the admin screens and cleans up.
- **Docs PR:** carries a PDF, so it is not docs-only under CLAUDE.md. The session merged it on the owner's explicit go.
