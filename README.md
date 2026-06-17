# AHITS — Agricarbon Hardware Inventory & Tracking System

A full-stack PWA for managing vehicles, equipment, and field operations across distributed soil sampling sites.

**Stack:** Next.js 16 · TypeScript · Prisma · Supabase · Material UI · Serwist PWA · GCP Cloud Run

PWA note: This repo uses Serwist via webpack integration, so run Next commands with webpack (`next dev --webpack`, `next build --webpack`).

Routing note: Next.js `middleware` was migrated to `proxy` (`src/proxy.ts`) for Next 16 compatibility.

---

## Quick Start

```bash
cp .env.example .env          # Fill in your values
make setup                    # Install, migrate, seed
make dev                       # Start dev server → http://localhost:3000
```

Default seed credentials:

- **Admin:** `ops@agricarbon.com` / password `Admin1234!`
- **Operator:** `operator1@agricarbon.com` / PIN `123456`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable                        | Description                                            |
| ------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL`                  | Supabase pooler connection (port 6543, pgbouncer=true) |
| `DIRECT_URL`                    | Supabase direct connection (port 5432, for migrations) |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role key                              |
| `PIN_SESSION_SECRET`            | 32-byte hex secret (`openssl rand -hex 32`)            |
| `RESEND_API_KEY`                | Resend API key for email alerts                        |
| `ADMIN_EMAIL`                   | Email to receive system alerts                         |
| `GCP_PROJECT_ID`                | GCP project ID for deployment                          |

---

## Makefile Commands

```bash
make help            # List all commands
make dev             # Start dev server
make db-migrate-dev  # Create & apply DB migration
make db-seed         # Seed sample data
make db-studio       # Open Prisma Studio
make docker-build    # Build Docker image
make deploy          # Deploy to Cloud Run (staging)
make deploy-prod     # Deploy to Cloud Run (production)
make logs            # Tail Cloud Run logs
```

---

## Testing

Tests run against an **isolated local Postgres** (Docker), never your real database.
The suite deletes all rows between cases, so two guards make a production wipe
impossible: `vitest.config.ts` requires `DATABASE_URL_TEST` (it will not fall back
to `DATABASE_URL`), and `tests/setup.ts` refuses any database that isn't local or
named `*test*`.

**Prerequisite:** Docker running, and a `.env.test` file (copy from
`.env.test.example` — it's gitignored).

```bash
make test            # one-shot: start test DB → apply schema → run the suite
```

Or step by step:

```bash
make test-db-up      # start the Docker Postgres test DB on :5433
make test-prepare    # (re)apply the current Prisma schema to it
make test            # run the suite
make test-db-down    # stop the test DB and discard its data
```

If you run `npm test` without a test database configured, it stops with a clear
error instead of touching production.

---

## GCP Deployment

### Prerequisites

1. GCP project with Cloud Run + Container Registry APIs enabled
2. Service account with roles: `Cloud Run Admin`, `Storage Admin`, `Service Account User`
3. Add secrets to GitHub Actions:
   - `GCP_PROJECT_ID`
   - `GCP_SERVICE_ACCOUNT_KEY` (JSON key file content)
4. Store app secrets in GCP Secret Manager with prefix `AHITS_*`

### CI/CD

- **`develop` branch** → deploys to `ahits-web-app-staging`
- **`main` branch** → deploys to `ahits-web-app` (production, min 1 instance)

---

## Project Structure

```
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.ts              # Development seed data
├── Makefile                 # Dev/deploy shortcuts
├── src/
│   ├── app/
│   │   ├── (auth)/login/    # Login page
│   │   ├── (admin)/admin/   # Admin routes
│   │   ├── (operator)/operator/  # Operator routes
│   │   └── api/             # API route handlers
│   ├── components/
│   │   ├── ui/              # Shared components (AppShell, StatCard)
│   │   ├── admin/           # Admin navigation
│   │   └── operator/        # Operator navigation
│   ├── hooks/               # useAuth, useOfflineQueue
│   ├── lib/                 # prisma, supabase, auth, email
│   └── types/               # TypeScript types
├── .github/workflows/
│   ├── ci.yml               # PR lint + type check
│   └── deploy.yml           # GCP Cloud Run deploy
├── Dockerfile
└── .env.example
```

---

## Adding a Database Migration

```bash
make db-migrate-dev           # Prompts for migration name, applies it
# Commit the generated prisma/migrations/* files
```

## Running in Production Locally (Docker)

```bash
make docker-build
make docker-run
```

Then to get running:
bashcd "Agricarbon US Codebase"
cp .env.example .env # fill in your Supabase + GCP details
make setup # installs, migrates, seeds
make dev # → http://localhost:3000
GCP secrets needed (add to GitHub repo → Settings → Secrets):

GCP_PROJECT_ID
GCP_SERVICE_ACCOUNT_KEY

Then store each env var in GCP Secret Manager with the AHITS\_ prefix (e.g. AHITS_DATABASE_URL) — the deploy workflow pulls them in automatically. Once you have your Supabase connection strings, just drop them in .env and run make db-migrate-dev.
