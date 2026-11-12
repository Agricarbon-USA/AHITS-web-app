# AHITS — Agricarbon Hardware Inventory & Tracking System

AHITS is the web app Agricarbon's US field crews use to record where vehicles and equipment are and what state they are in. It installs on a phone like an app and holds unsent work when signal drops.

**Who uses it:** 4–9 field operators on phones and 2 admins.

**The one job:** know where all gear is — who has what, and where, at any moment.

**The four areas:** daily vehicle check · deployments and gear lists · requests, transfers and returns · problem reports and repairs.

**Stack:** Next.js 16, React 19, MUI 6, Prisma 5, Postgres (Supabase), Serwist (offline), Google Cloud Run. Node 24 (`.nvmrc`).

There is one environment. It is named "staging" and it is the real app. Merging a PR into `development` deploys it. See `CLAUDE.md`.

## Safe local start

None of these touch a database:

```bash
npm ci
make db-generate      # builds the Prisma client only
npm run lint
npm run type-check
npm run test:ui       # screen tests
```

`make dev` starts the app at http://localhost:3000. It needs a `.env` (copy `.env.example`) whose `DATABASE_URL` and `DIRECT_URL` point at a Postgres on your own machine. Never put the live Supabase addresses in a local `.env`.

**Never run these against the live database.** Most now refuse; `make db-migrate` and the `npm run` / `npx` ones do not:

- `make setup`, `db-migrate-dev`, `db-migrate`, `db-reset`, `db-seed`
- `npm run prisma:reset`, `prisma:migrate:dev`, `prisma:migrate`; any bare `npx prisma migrate …` or `npx prisma db push`
- `make deploy-staging`, `deploy-prod`, `cloud-run-deploy`, `cloud-run-migrate` from a laptop

The live database's structure changes only through a migration file in a merged PR. The deploy pipeline applies it.

## Tests

- `make test` — server tests. Needs Docker. It starts a throwaway Postgres on `localhost:5433`, loads the schema, then runs `npm test`. `make test-db-down` removes it.
- The server tests empty every table between cases. `npm test` refuses to start without `DATABASE_URL_TEST`, and refuses any database that is not local and has no "test" in its name.
- CI runs lint, type-check, screen tests, a build and the server tests on every PR into `development`. CI is the real gate.

## Where things are

The five living docs are this page, STATUS, CHANGELOG, DECISIONS and CLAUDE.md.

| Path | What |
|---|---|
| `STATUS.md` | Live now, in flight, next, owed by the owner, known hazards |
| `CHANGELOG.md` | One line per merge |
| `DECISIONS.md` | The rules that govern the app today |
| `CLAUDE.md`, `AGENTS.md` | How to build, test and ship safely |
| `packets/` | Requests (`README.md` is the template; `paused/` holds parked work) |
| `docs/` | `ROLLBACK.md`, `DECISIONS_HISTORY.md` (the D-numbers cited in code), `operators/` sheets |
| `src/`, `prisma/`, `tests/` | App code, database schema and migrations, tests |
| `.github/workflows/` | CI and deploy |

Older documents: `git show docs-archive-2026-11-11:<path>`.
