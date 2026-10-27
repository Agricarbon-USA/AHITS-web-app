# AHITS · Session handoff · 2026-10-26 (evening) · Next.js 16.4.3 + CI on the runner's Postgres

## What shipped
| PR | What | Squash | Merged (Central) | Revision | /api/health |
|---|---|---|---|---|---|
| #273 | CI · Use the runner's Postgres (no image download) | `45daced` | 15:02:16 | `ahits-web-app-staging-00454-rnb` | 200, db up |
| #272 | Security · Next.js 16.4.3, image optimizer off | `a489694` | 16:00:23 | `ahits-web-app-staging-00455-rmj` | 200, db up |

- **D48:** both merges were an owner-ruled deviation, before 20:00 with Active Deployments not 0. The count was 4 at 13:03 (ruled on), 4 at 15:02 and 5 at 16:16, each read with the tab visible.
- **Deploys:** both runs passed verify → migration-safety → migrate → deploy → env-drift on the first attempt (40392066283 and 40400630663).
- **#273, in verify.yml's Tests job only:**
  - `ubuntu-24.04`, with no services block.
  - A first step starts the runner's PostgreSQL 16; the log shows `16.15` and `Etc/UTC`.
  - `TEST_DB_URL` uses `:5432`. The DB suite ran 73 files and 532 tests, and nothing was pulled.
  - Local `make test` still uses Docker on `:5433`.
- **#272:**
  - next and eslint-config-next 16.4.3, @sentry/nextjs `^10.76.2`.
  - `images: { unoptimized: true }`, so `/_next/image` returns 404 (GHSA-2464-fhr4-w9xw, GHSA-2xp9-vwfh-vxw4).
  - The breaking-change check against the bundled docs (proxy, route handlers, instrumentation, `useOffline`) is in the PR body.
- **npm audit:** 20 findings (2 critical) before, 15 (0 critical) after. **The 15 remaining (11 high, 4 moderate) are all in build and test tools:** Serwist via zod, vite, undici, vitest and others. None of them is next or Sentry.

## Smoke (desktop Chrome, admin, tab visible, read-only, Active Deployments 5)
| Check | Result |
|---|---|
| a. Update prompt → new build | ✅ Next `16.4.3`, new `main-app` chunk. The prompt auto-hides after 8 s, so its Reload button was pressed from a script |
| b. Dashboard, Deployments, Inventory, Maintenance load; photo on a task | ✅ "Damage repair: Garmin Glo2" (Completed) photo renders, 1205×1600 |
| c. `/_next/image?url=%2Ficons%2Ficon-192.png&w=64&q=75` | ✅ 404 |
| d. Content-Security-Policy header | ✅ present with a nonce, on pages and API |
| e. DevTools offline → offline page; online → reloads itself | ✅ **observed by the owner**. I verified separately that `/~offline` has its nonce'd script and reloads on `online` |
| f. Console | ✅ no errors |

## Resume points
- **Still owed by the owner:** packet §5 steps 3–5 for #270 (phone tests), and PIN rotation for operators only, by admin Reset PIN (see STATUS).
- **Audit:** the remaining highs are in tooling. zod's fix is a breaking `--force` upgrade, and it comes in through Serwist. Pick it up as its own PR if wanted.
- **ECR flake:** retired by #273. If a CI Tests job fails at "Start the runner's PostgreSQL 16", check whether the `ubuntu-24.04` image changed its Postgres.
