# AHITS — STATUS

Updated 2026-11-11. History: `CHANGELOG.md`.

## Live now
- Last code change: PR #279 (P1-1b), merged Nov 1, 2026. It went live on Nov 11, 2026 with #280's deploy (revision `ahits-web-app-staging-00462-6ns`). Its own deploys on Nov 1 and Nov 3 failed because Google Cloud billing was off.
- `/api/health` was ok on Nov 11, 2026.
- REQ-A1 (#281) is live. One check left: the next docs-only PR deletes this line and, once merged, confirms no Deploy run started for it (comment on #281).
- The only environment. It is named "staging" but is the real app.
- Users: 4–9 field operators on phones, 2 admins (Max, the owner; Stewart).

## In flight

## Next, in order
1. The owner's no-code safety jobs (below). Claude drafts a short "in case of emergency" guide for Stewart (roll back, restore, who to call) from `docs/ROLLBACK.md`; the owner checks it.
2. Email off. Tests use a database built like the live one.
3. Quick fixes, second set, the rest: the daily check uses the phone's own day; Reports repair cost; a failed check stays open; the two missing redirects after an admin Reset PIN; the Makefile's PATH line on GitHub Actions.
4. A unit's location accepts temporary places.
5. The rest of "where is the gear": serial/QR search; holder and place on Scan and Inventory; hand-overs change at once, with "Not mine"; a place for vehicles at return; a "Missing" state.
6. Finish the half-done data moves: old holder columns, categories, consumable counts, project link.
7. The two field complaints: daily check opens in one load; one deployment builder.
8. Re-cut the rest of the paused queue (`packets/paused/`).
9. New features.

## Owed by the owner (date = when it became owed)
- 2026-07-28: TOP PRIORITY · Backup restore test (never done). Restore into a new throwaway project, check the data, write the date in `docs/ROLLBACK.md`.
- 2026-10-26: TOP PRIORITY · Supabase Data API off.
- 2026-11-11: Local Claude Code settings file (`.claude/settings.local.json`): change the admin password saved in it; delete the two saved sign-in lines and the saved approvals for `gh pr`, `git push`, `git merge`, `git reset`, `git rebase`, `npx prisma`, `make db-*`, `gcloud` and `gh secret`, so each asks first. Until then only the written rules stop a session merging or migrating.
- 2026-11-03: Accounts page: who owns and pays for Google Cloud, Supabase, GitHub, Sentry, Mapbox, Resend. Move billing and the database to Agricarbon accounts. Note why billing stopped on Nov 3.
- 2026-07-28: Look in Cloud Run for the two July preview copies (`ahits-web-app-preview-cc31-pr2`, `-pr3`). Delete any found.
- 2026-07-28: Fire the alarms once: heartbeat, "jobs stopped" banner, Sentry.
- 2026-11-11: P1-1b live checks: the six rows in the PR #279 comment, on a throwaway "ZZ" deployment. P1-1b went live this day.
- 2026-10-28: Vehicles #101, #301, #302, #603 were used in a test. Check each shows its real operator.
- 2026-10-22: 38 labelled units sit on count-only items. Look once (read-only) for tracked gear typed wrong.
- 2026-10-22: July clean-up SQL: record which steps ran (C4 is not recorded).
- 2026-07-11: Delete the secret `AHITS_PROD_MIGRATE_URL` if it exists; it may point at the live database (to confirm).

Closed by the owner's word on Nov 11, 2026: the operator PIN reset after Oct 22. Other old owed checks are written off by the planning Claude's proposal, which the owner accepted in the review ("write off the old rows in one go; keep a short list that is real"). Old list: `git show docs-archive-2026-11-11:STATUS.md`.

## Known hazards
- Nobody is told when a deploy fails. After every merge, open the Deploy run and see it end green.
- When you make an admin a Field Operator, set a Reset PIN in the same save, or that person cannot sign in.
- Never run a Prisma or `make db-*` command with `.env` pointing at the live database. Some have no guard. Full list: `README.md`.
- The CI test database is built from the schema file, not the migrations. A migration first runs for real on the live database.
- Email reaches no real recipient: the deploy forces test mode. Use copy-link.
- The live database appears to sit in the contractor's Supabase organisation on a free plan, which can be paused (to confirm).
- A lost phone stays signed in for up to 4 days. Users → Manage → "Log out of all devices" ends it at once.
- After a Reset PIN, an admin who signs in may see a blank sign-in form, and Change PIN may not move on after "PIN updated." Opening the app address again continues. Seen in the #282 live check; to fix in the second set of quick fixes.
