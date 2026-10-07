# Session handoff · 2026-10-07 · PR-2 · One vocabulary for numbers

> STATUS: in progress — finalized at session close.

## Environment and test-harness notes

- **Local Node is now 24 LTS** (Homebrew `node@24`, `/opt/homebrew/opt/node@24/bin` first on PATH in `~/.zshrc`). Before this, the machine ran Node 26.3.0, outside `engines` (`>=22 <25`); CI runs 24. `engines` and the CI workflows were left as they were.
- **The UI suite was load-sensitive.** `npm run test:ui` passed on Node 24 (57 files / 432 tests) but had been failing under parallel load on 26. `vitest.config.ui.ts` now sets `fileParallelism: false`, matching `vitest.config.ts`. The underlying timing-dependent tests are **parked** in STATUS §6 and are not fixed here.
- npm 11 (bundled with Node 24.21) gates package install scripts (`npm install-scripts ls`). After `npm ci`, run `npx prisma generate` locally if the Prisma client is stale. The project's npm config was not changed.
