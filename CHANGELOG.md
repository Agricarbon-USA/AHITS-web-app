# AHITS — Changelog

One line per merge to `development` (merging is the deploy), newest first: `date · #PR · what changed for users`. The line is written inside the PR and never edited afterwards. The live revision and the live-check result go in a comment on the PR, not here. Older lines keep their form. Starts Oct 22, 2026; earlier merges: `git log`.

- 2026-11-12 · #283 · Phones stay signed in for 4 days without use (was 24 hours), 14 days at most; a change of role signs that person out
- 2026-11-12 · #282 · Quick fixes: an admin with a reset PIN, or an operator made Admin, can sign in; reservations with serial-numbered items can be confirmed; Pick Up keeps the reserved amount; Transfer — Selected Gear opens with nothing ticked; a cancelled transfer leaves the admin Pending Transfers card at once
- 2026-11-11 · #281 · Docs-only merges no longer redeploy the app; risky make commands refuse outside a local database or GitHub Actions
- 2026-11-11 · correction · #280's deploy also put P1-1b (#279) live for the first time, as revision `ahits-web-app-staging-00462-6ns`. #279's own deploys on Nov 1 and Nov 3 failed because Google Cloud billing was off, so the app ran P1-1a code until Nov 11. The #280 line's "No change to the app" and the #279 line's revision are wrong; both lines are left as written
- 2026-11-11 · #280 · Docs clean-up: five living docs (README, STATUS, CHANGELOG, DECISIONS, CLAUDE.md); the old documents leave the repo folder and stay at git tag `docs-archive-2026-11-11`. No change to the app; phones show the "new version" prompt once
- 2026-11-01 · #279 · P1-1b: screens tell the truth — End and Return show what is waiting on a transfer and need a hub; Scan names its hub; Hub Inbound drops answered rows; the daily check knows when a crewmate already checked; four small P1-1a fixes · `ahits-web-app-staging-00461-nh9` · live check: owed (the owner's six rows are in a comment on PR #279; `/api/health` ok on 2026-11-11)
- 2026-10-30 · #278 · docs: P1-1a (#277) recorded as merged and live; its checks 1–2 passed, 3–4 owed. No change to the app · revision not recorded (a docs merge redeploys the same code) · live check: none needed
- 2026-10-27 · #277 · P1-1a: transfers and End are safe — every deployment write claims the deployment first, one rule for who a transfer may go to, waiting gear stays put and says who it waits on, named 409s instead of 500s · `ahits-web-app-staging-00459-jz4`
- 2026-10-26 · docs · STATUS §4 merge checklist now carries the D48 amendment (two merges per window) · no deploy change
- 2026-10-26 · docs · D48 amended: up to two merges per window when they touch different areas, each deployed and smoked before the next; a service-worker change or migration merges alone · no deploy change
- 2026-10-26 · #274 · docs: #272 and #273 recorded as merged and checked. No change to the app · revision not recorded · live check: none needed
- 2026-10-26 · #272 · Security: Next.js 16.4.3 and @sentry/nextjs 10.76.2, image optimizer off (`/_next/image` returns 404). npm audit criticals 2 → 0 · `ahits-web-app-staging-00455-rmj`
- 2026-10-26 · #273 · CI tests use the runner's own PostgreSQL 16 and download no image (ends the ECR "Data limit exceeded" flake) · `ahits-web-app-staging-00454-rnb`
- 2026-10-26 · #271 · docs: hotfix #270 recorded; PIN reset limited to operators. No change to the app · revision not recorded · live check: none needed
- 2026-10-26 · #270 · Signal returning no longer reloads the app. Screens re-read instead, and the offline page reloads itself · `ahits-web-app-staging-00452-p2h`
- 2026-10-22 · #269 · docs: hotfix #268 recorded as merged and checked. No change to the app · revision not recorded · live check: none needed
- 2026-10-22 · #268 · Vehicle details stop sending checkers' account records (checker is `{ id, name }` only) · `ahits-web-app-staging-00450-hvm`
