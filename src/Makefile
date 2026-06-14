# ============================================================
# AHITS Makefile — Agricarbon Hardware Inventory Tracking
# Usage: make <target>
# ============================================================

APP_NAME     := ahits-web-app
GCP_PROJECT  ?= $(shell grep GCP_PROJECT_ID ../.env | cut -d= -f2)
GCP_REGION   ?= us-central1
IMAGE        := gcr.io/$(GCP_PROJECT)/$(APP_NAME)
TAG          ?= $(shell git rev-parse --short HEAD)

.PHONY: help dev build start lint typecheck \
        db-generate db-migrate db-migrate-dev db-studio db-seed db-reset \
        docker-build docker-push docker-run \
        deploy deploy-prod logs \
        env-check setup

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Local dev ─────────────────────────────────────────────────────
dev: ## Start Next.js dev server
	cd .. && npm run dev

build: ## Build for production
	cd .. && npm run build

start: ## Start production server locally
	cd .. && npm run start

lint: ## Run ESLint
	cd .. && npm run lint

typecheck: ## Run TypeScript compiler check
	cd .. && npm run type-check

# ── Database ──────────────────────────────────────────────────────
db-generate: ## Generate Prisma client
	cd .. && npx prisma generate

db-migrate: ## Apply pending migrations (production)
	cd .. && npx prisma migrate deploy

db-migrate-dev: ## Create + apply migration (development)
	cd .. && npx prisma migrate dev

db-studio: ## Open Prisma Studio
	cd .. && npx prisma studio

db-seed: ## Seed the database with sample data
	cd .. && npx tsx prisma/seed.ts

db-reset: ## Reset DB and re-seed (DEV ONLY)
	cd .. && npx prisma migrate reset

# ── Docker ────────────────────────────────────────────────────────
docker-build: ## Build Docker image
	docker build -t $(IMAGE):$(TAG) -t $(IMAGE):latest ..

docker-push: ## Push image to GCR
	docker push $(IMAGE):$(TAG)
	docker push $(IMAGE):latest

docker-run: ## Run container locally
	docker run --rm -p 3000:3000 \
	  --env-file ../.env \
	  $(IMAGE):latest

# ── GCP Deploy ────────────────────────────────────────────────────
deploy: ## Build, push, and deploy to Cloud Run (staging)
	$(MAKE) docker-build
	$(MAKE) docker-push
	gcloud run deploy $(APP_NAME)-staging \
	  --image $(IMAGE):$(TAG) \
	  --platform managed \
	  --region $(GCP_REGION) \
	  --project $(GCP_PROJECT) \
	  --allow-unauthenticated \
	  --set-env-vars="NODE_ENV=production"

deploy-prod: ## Deploy to Cloud Run production service
	$(MAKE) docker-build
	$(MAKE) docker-push
	gcloud run deploy $(APP_NAME) \
	  --image $(IMAGE):$(TAG) \
	  --platform managed \
	  --region $(GCP_REGION) \
	  --project $(GCP_PROJECT) \
	  --allow-unauthenticated \
	  --min-instances=1 \
	  --set-env-vars="NODE_ENV=production"

logs: ## Tail Cloud Run logs
	gcloud run services logs tail $(APP_NAME) \
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
	cd .. && npm install
	$(MAKE) db-generate
	$(MAKE) db-migrate-dev
	$(MAKE) db-seed
	@echo "✅ Setup complete — run 'make dev' to start"
