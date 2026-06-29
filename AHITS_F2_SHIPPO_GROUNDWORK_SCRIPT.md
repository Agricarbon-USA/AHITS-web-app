# AHITS — F2 + Shippo groundwork CC Script

_Prepared 2026-06-25. **Groundwork only** — additive, deploy-safe, NO live Shippo API calls. Adds Hub addresses (the prerequisite the Session 10 §5 Shippo design wrongly assumed existed), structured Ship-To + qty on shipping-label request lines, and an additive `Shipment` model stub (a seam, read by nothing yet — same pattern as the #29 foundation / InventoryStock expand). The real Shippo integration (register tracking, HMAC webhook, cron reconcile, tracking chips/alerts) is a SEPARATE later slice. Decision (Max): track-only first cut; label-purchase deferred. Sequence AFTER S2 (which consolidates hub management) — F2 extends that same hub form._

```
Build F2 + Shippo GROUNDWORK on AHITS (additive, deploy-safe, NO live Shippo calls). Specs: AHITS_F2_SHIPPO_GROUNDWORK_SCRIPT.md + AHITS_SESSION10_ANALYSIS_AND_PLAN.md §5. Rebase on S2 (hub management) once it's merged. tsc/lint/vitest clean.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-f2-shippo-groundwork"

=== 1. Schema (additive migration) ===
- Hub: add street1 String?, street2 String?, zip String?, country String? (default 'US'). (city/state/email already exist.) Raw-SQL access like Hub.email.
- DeploymentRequestLine: add shipToHubId String? + shipToAddress String? (free-text override). requestedQty already carries the amount.
- NEW enum ShipmentStatus { UNKNOWN PRE_TRANSIT TRANSIT DELIVERED RETURNED FAILURE }.
- NEW model Shipment (additive; scalar FK columns, NO @relation; raw-SQL access; read by nothing live yet — deploy-safe even before its migration applies):
  id, provider ('SHIPPO'), shippoObjectId String?, trackingNumber String?, carrier String?, status ShipmentStatus @default(UNKNOWN), statusDetail String?, etaAt DateTime?, lastEventAt DateTime?, trackingUrl String?,
  // polymorphic subject — exactly one set:
  maintenanceTaskId String?, inventoryUnitId String?, deploymentRequestLineId String?, hubId String?,
  fromAddressJson Json?, toAddressJson Json?, createdById String, createdAt, updatedAt. @@map("shipments") + indexes on (status), (trackingNumber), each subject id.
- Migration is additive; the deploy pipeline auto-applies it (A2). Run make db-generate locally; do NOT manually db-migrate.

=== 2. Hub address fields (extends the S2 Hubs management form) ===
- Hubs API (GET/POST/PATCH /api/hubs[/id]): read/write street1/street2/zip/country via raw SQL (best-effort merge like email). Validate country as 2-letter; zip non-empty when an address is being set.
- Admin Hubs management form (the S2 "Hubs" tab): add Street, Street 2, Zip, Country fields beside city/state/email. Surface the full address in the hub detail.

=== 3. Shipping-label request line — qty + Ship-To (default Hub) ===
- operator/requests/page.tsx: the SHIPPING_LABEL line currently captures only free-text description. Add: a Qty field (clone the NEW_PURCHASE qty control, maps to requestedQty) and a "Ship To" control — a hub <select> (GET /api/hubs) DEFAULTING to the operator's home hub (homeHubId from useAuth) else the first hub, with an "other address" free-text override (shipToAddress). Persist shipToHubId / shipToAddress on the line.
- Admin requests + the F3 fulfillment checklist + the hub portal context: show the Ship-To (hub name + address, or the override) on SHIPPING_LABEL lines so the fulfiller sees where it goes.

=== 4. Shipment data-access stub (the seam; imported by nothing live yet) ===
- NEW src/lib/shipments.ts (raw SQL, same discipline as lib/inventory-stock.ts): createShipment(input), getShipment(id), listShipmentsForSubject({maintenanceTaskId|inventoryUnitId|deploymentRequestLineId|hubId}), updateShipmentStatus(id, {...}). NO Shippo HTTP calls, NO env/secret access — this is structure only, to be wired by the future integration slice. Dormant: imported by nothing.

=== 5. Do NOT do (explicitly out of scope for groundwork) ===
- No Shippo API client, no POST /tracks, no /api/webhooks/shippo, no cron reconcile, no tracking chips/alerts. No AHITS_SHIPPO_* secret usage or Makefile --set-secrets change (the stub touches no secret). Those land in the later "Shippo integration" slice.

Verify: tsc 0, eslint 0, vitest green. Manually on staging: a hub can be given a street address in the Hubs form; a SHIPPING_LABEL material request captures a quantity + a Ship-To hub (defaulting to home hub) with an override, and the fulfiller/admin see the Ship-To. The Shipment table exists but is unused. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.
```

## Why this shape
- **Groundwork, not integration:** like #29's foundation and the InventoryStock expand, this lands the *additive schema + seam* with no live reader/secret, so the PR is deploy-safe and low-risk. The Shippo HTTP integration is a separate, clearly-bounded slice that builds on this.
- **Closes the §5 design's false assumption:** the Session 10 Shippo plan assumed Hubs already had addresses — they didn't (only city/state). This adds them, so "Ship To = the Hub" can resolve a real carrier address later.
- **Shippo-shaped data now:** `shipToHubId`/`shipToAddress` + `requestedQty` map directly to Shippo's `address_to` + parcel count; the polymorphic `Shipment` mirrors the `StatusLink` pattern so one tracker can serve repair-ship, hub-return, and label shipments.

## When you schedule the real Shippo integration (later slice)
Prerequisites at that point (NOT now): create `AHITS_SHIPPO_API_TOKEN` + `AHITS_SHIPPO_WEBHOOK_SECRET` in Secret Manager and add their `NAME=AHITS_NAME:latest` mappings to the Makefile `--set-secrets` line **before** the deploy that mounts them; the webhook endpoint must be HMAC-verified + rate-limited; track-only first (buy-label deferred).
