# ============================================================
# AHITS Makefile — Agricarbon Hardware Inventory Tracking
# Usage: make <target>
# ============================================================

export PATH := /opt/homebrew/bin:/usr/local/bin:$(PATH)

APP_NAME      := ahits-web-app
GCP_PROJECT   ?= $(shell grep GCP_PROJECT_ID .env | cut -d= -f2)
GCP_REGION    ?= us-central1
# Use = (lazy) so GCP_PROJECT overrides from CLI propagate into IMAGE
IMAGE          = gcr.io/$(GCP_PROJECT)/$(APP_NAME)
TAG           ?= $(shell git rev-parse --short HEAD)

# Cloud Run deploy parameters — overridable per target
SERVICE       ?= $(APP_NAME)-staging
MIN_INSTANCES ?= 0
# Secret namespace (PIPE-2): staging uses AHITS_*, prod uses AHITS_PROD_* so the
# two environments NEVER share a database, app URL, or any secret. The prod
# secrets must exist in Secret Manager BEFORE the first prod deploy — Cloud Run
# validates --set-secrets references at deploy time.
SECRET_NS     ?= AHITS

.PHONY: help dev build start lint typecheck verify \
        db-generate db-migrate db-migrate-dev db-studio db-seed db-reset \
        test test-db-up test-db-down test-prepare \
        docker-build docker-push docker-run \
        cloud-run-deploy cloud-run-url cloud-run-migrate \
        deploy-staging deploy-prod logs \
        env-check setup

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Local dev ─────────────────────────────────────────────────────
dev: ## Start Next.js dev server
	npm run dev

build: ## Build for production
	npm run build

start: ## Start production server locally
	npm run start

lint: ## Run ESLint
	npm run lint

typecheck: ## Run TypeScript compiler check
	npm run type-check

verify: db-generate typecheck lint test ## Regenerate client, type-check, lint, and run tests

# ── Database ──────────────────────────────────────────────────────
db-generate: ## Generate Prisma client
	npx prisma generate

db-migrate: ## Apply pending migrations (production)
	npx prisma migrate deploy

db-migrate-dev: ## Create + apply migration (development)
	npx prisma migrate dev

db-studio: ## Open Prisma Studio
	npx prisma studio

db-seed: ## Seed the database with sample data
	npx tsx prisma/seed.ts

db-reset: ## Reset DB and re-seed (DEV ONLY)
	npx prisma migrate reset

# ── Testing (safe: isolated local DB, NEVER production) ───────────
# The suite wipes tables between cases, so it only ever runs against the
# throwaway Postgres in docker-compose.test.yml. vitest.config.ts and
# tests/setup.ts both refuse to run against a non-test database.
TEST_DB_URL := postgresql://test:test@localhost:5433/ahits_test

test-db-up: ## Start the local Postgres test DB (Docker) on :5433
	docker compose -f docker-compose.test.yml up -d
	@echo "Waiting for test database to accept connections..."
	@for i in $$(seq 1 30); do \
	  docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d ahits_test >/dev/null 2>&1 && break; \
	  sleep 1; \
	done
	@echo "Test database ready on localhost:5433"

test-db-down: ## Stop and remove the local test DB (and its data)
	docker compose -f docker-compose.test.yml down -v

test-prepare: test-db-up ## Start test DB and apply the current Prisma schema to it
	DATABASE_URL="$(TEST_DB_URL)" DIRECT_URL="$(TEST_DB_URL)" npx prisma db push --skip-generate --accept-data-loss

test: test-prepare ## Run the full test suite against the safe local test DB
	DATABASE_URL_TEST="$(TEST_DB_URL)" DIRECT_URL_TEST="$(TEST_DB_URL)" npm test

# ── Docker ────────────────────────────────────────────────────────
DISABLE_SW ?= false

docker-build: ## Build Docker image for linux/amd64. Override TAG as needed.
	docker build \
	  --platform linux/amd64 \
	  --build-arg DISABLE_SW=$(DISABLE_SW) \
	  -t $(IMAGE):$(TAG) \
	  .

docker-push: ## Push image to GCR. Override TAG as needed.
	docker push $(IMAGE):$(TAG)

docker-run: ## Run container locally
	docker run --rm -p 8080:8080 \
	  --env-file .env \
	  $(IMAGE):$(TAG)

# ── Cloud Run — single source of truth for deploy config ──────────
#
# All gcloud flags and Secret Manager mappings live here.
# GitHub Actions call these targets directly; do not duplicate flags in workflows.
#
# Required overrides: SERVICE, TAG
# Optional override:  MIN_INSTANCES (default 0)
#
cloud-run-deploy: ## Deploy image to Cloud Run. Set SERVICE, TAG, MIN_INSTANCES.
	gcloud run deploy $(SERVICE) \
	  --image $(IMAGE):$(TAG) \
	  --platform managed \
	  --region $(GCP_REGION) \
	  --project $(GCP_PROJECT) \
	  --allow-unauthenticated \
	  --min-instances=$(MIN_INSTANCES) \
	  --set-env-vars="NODE_ENV=production" \
	  --set-secrets="DATABASE_URL=$(SECRET_NS)_DATABASE_URL:latest,DIRECT_URL=$(SECRET_NS)_DIRECT_URL:latest,NEXT_PUBLIC_SUPABASE_URL=$(SECRET_NS)_NEXT_PUBLIC_SUPABASE_URL:latest,NEXT_PUBLIC_SUPABASE_ANON_KEY=$(SECRET_NS)_NEXT_PUBLIC_SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=$(SECRET_NS)_SUPABASE_SERVICE_ROLE_KEY:latest,PIN_SESSION_SECRET=$(SECRET_NS)_PIN_SESSION_SECRET:latest,RESEND_API_KEY=$(SECRET_NS)_RESEND_API_KEY:latest,EMAIL_FROM=$(SECRET_NS)_EMAIL_FROM:latest,ADMIN_EMAIL=$(SECRET_NS)_ADMIN_EMAIL:latest,NEXT_PUBLIC_APP_URL=$(SECRET_NS)_NEXT_PUBLIC_APP_URL:latest,CRON_SECRET=$(SECRET_NS)_CRON_SECRET:latest"

cloud-run-url: ## Print URL of a Cloud Run service. Set SERVICE.
	@gcloud run services describe $(SERVICE) \
	  --region $(GCP_REGION) \
	  --project $(GCP_PROJECT) \
	  --format="value(status.url)"

# Apply pending Prisma migrations to the deployed database BEFORE the new
# revision serves traffic. Reads the same AHITS_DIRECT_URL secret the Cloud Run
# service uses, so it always migrates exactly the DB the app will connect to.
# Requires the deployer service account to have roles/secretmanager.secretAccessor.
# `@` suppresses command echo so the connection string is never printed.
cloud-run-migrate: ## Apply pending migrations to the deployed DB. Set GCP_PROJECT (and SECRET_NS=AHITS_PROD for prod).
	@DB_URL="$$(gcloud secrets versions access latest --secret=$(SECRET_NS)_DIRECT_URL --project=$(GCP_PROJECT))"; \
	  if [ -z "$$DB_URL" ]; then echo "❌ Could not read $(SECRET_NS)_DIRECT_URL from Secret Manager"; exit 1; fi; \
	  echo "Applying migrations to the deployed database..."; \
	  DATABASE_URL="$$DB_URL" DIRECT_URL="$$DB_URL" npx prisma migrate deploy

# ── High-level deploy targets ──────────────────────────────────────
deploy-staging: ## Build, push, and deploy to staging. Override TAG as needed.
	$(MAKE) docker-build
	$(MAKE) docker-push
	$(MAKE) cloud-run-deploy SERVICE=$(APP_NAME)-staging MIN_INSTANCES=0 SECRET_NS=AHITS

deploy-prod: ## Build, push, and deploy to production (uses AHITS_PROD_* secrets).
	$(MAKE) docker-build
	$(MAKE) docker-push
	$(MAKE) cloud-run-deploy SERVICE=$(APP_NAME) MIN_INSTANCES=1 SECRET_NS=AHITS_PROD

logs: ## Tail Cloud Run logs (staging by default; override SERVICE for prod)
	gcloud run services logs tail $(SERVICE) \
	  --region $(GCP_REGION) \
	  --project $(GCP_PROJECT)

# ── Setup ─────────────────────────────────────────────────────────
env-check: ## Verify required env vars are set
	@echo "Checking required env vars..."
	@test -n "$(DATABASE_URL)"    || (echo "❌ DATABASE_URL missing"    && exit 1)
	@test -n "$(DIRECT_URL)"     || (echo "❌ DIRECT_URL missing"     && exit 1)
	@test -n "$(NEXT_PUBLIC_SUPABASE_URL)" || (echo "❌ NEXT_PUBLIC_SUPABASE_URL missing" && exit 1)
	@test -n "$(PIN_SESSION_SECRET)" || (echo "❌ PIN_SESSION_SECRET missing" && exit 1)
	@echo "✅ All required env vars present"

setup: ## First-time local dev setup
	npm install
	$(MAKE) db-generate
	$(MAKE) db-migrate-dev
	$(MAKE) db-seed
	@echo "✅ Setup complete — run 'make dev' to start"
