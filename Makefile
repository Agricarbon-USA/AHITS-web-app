# ============================================================
# AHITS Makefile — Agricarbon Hardware Inventory Tracking
# Usage: make <target>
# ============================================================

APP_NAME      := ahits-web-app
GCP_PROJECT   ?= $(shell grep GCP_PROJECT_ID .env | cut -d= -f2)
GCP_REGION    ?= us-central1
# Use = (lazy) so GCP_PROJECT overrides from CLI propagate into IMAGE
IMAGE          = gcr.io/$(GCP_PROJECT)/$(APP_NAME)
TAG           ?= $(shell git rev-parse --short HEAD)

# Cloud Run deploy parameters — overridable per target
SERVICE       ?= $(APP_NAME)-staging
MIN_INSTANCES ?= 0

.PHONY: help dev build start lint typecheck \
        db-generate db-migrate db-migrate-dev db-studio db-seed db-reset \
        docker-build docker-push docker-run \
        cloud-run-deploy cloud-run-url \
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
	  --set-secrets="DATABASE_URL=AHITS_DATABASE_URL:latest,DIRECT_URL=AHITS_DIRECT_URL:latest,NEXT_PUBLIC_SUPABASE_URL=AHITS_NEXT_PUBLIC_SUPABASE_URL:latest,NEXT_PUBLIC_SUPABASE_ANON_KEY=AHITS_NEXT_PUBLIC_SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=AHITS_SUPABASE_SERVICE_ROLE_KEY:latest,PIN_SESSION_SECRET=AHITS_PIN_SESSION_SECRET:latest,RESEND_API_KEY=AHITS_RESEND_API_KEY:latest,EMAIL_FROM=AHITS_EMAIL_FROM:latest,ADMIN_EMAIL=AHITS_ADMIN_EMAIL:latest,NEXT_PUBLIC_APP_URL=AHITS_NEXT_PUBLIC_APP_URL:latest"

cloud-run-url: ## Print URL of a Cloud Run service. Set SERVICE.
	@gcloud run services describe $(SERVICE) \
	  --region $(GCP_REGION) \
	  --project $(GCP_PROJECT) \
	  --format="value(status.url)"

# ── High-level deploy targets ──────────────────────────────────────
deploy-staging: ## Build, push, and deploy to staging. Override TAG as needed.
	$(MAKE) docker-build
	$(MAKE) docker-push
	$(MAKE) cloud-run-deploy SERVICE=$(APP_NAME)-staging MIN_INSTANCES=0

deploy-prod: ## Build, push, and deploy to production.
	$(MAKE) docker-build
	$(MAKE) docker-push
	$(MAKE) cloud-run-deploy SERVICE=$(APP_NAME) MIN_INSTANCES=1

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
