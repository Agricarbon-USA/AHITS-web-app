# AHITS — Revised Workplan (feedback + smoke folded in) & Staging→Prod Promotion Plan

_Prepared 2026-06-25. Integrates the day-of-use feedback (root-caused in `AHITS_FEEDBACK_FINDINGS_REGISTER.md`), the live staging smoke confirmations below, and the in-flight slice plan (MH-2, R4, read-only remainder, #29 3c). Plus a concrete plan for the strategic flag: a lot is stacked on `development`/staging with nothing promoted to prod._

---

## 1. Live smoke confirmations (staging, 2026-06-25, admin acct on operator surfaces)

| Ref | Confirmed live | Severity |
|---|---|---|
| **F10** | Built a kit with a consumable (Cardboard Box, "75 avail."), reached **Launch** with the required note filled — **"Launch Deployment" stays disabled and there is NO Source-Hub selector anywhere in the wizard**. The `hasConsumableInKit && !sourceHubId` gate is unsatisfiable from the UI. **Operators cannot start any deployment containing a consumable.** Worse than the static analysis predicted (not just a 409 on submit — you can't even submit). | **P0 — blocking** |
| **F9** | Build Rig and Build Kit are flat alphabetical lists; category is a chip, not a grouping. | P2 |
| **F7** | Operator Requests shows Forwarded/Fulfilled/Cancelled all intermixed, no Active/Closed split. | P2 |
| **F6** | A "Forwarded" Material request renders only a **Cancel** button — no Fulfill. | P1 |
| **F2** | A shipping-label request is titled "18 labels" — the operator put the quantity in the free-text name because there's no qty/destination field. | P1/DESIGN |

The smoke prioritized the highest-value confirmations; a full per-surface + **real-device offline (A6)** pass is still owed (see §4). No data was mutated (the blocked deployment couldn't launch; nothing was submitted).

---

## 2. Revised sequence (what to build, in order)

Priority is re-ordered around the **F10 P0** and clustering the cheap high-value Requests fixes. Effort: S/M/L.

### HOTFIX-1 — F10: unblock consumable deployments (**do first, ahead of everything**)
Root cause: the kit-builder reads availability from legacy `InventoryItem.quantity` while checkout draws from per-hub `inventory_stock`, and the Source-Hub selector isn't rendering, so Launch is permanently gated. **Fix bundle (one PR):**
1. Render the Source-Hub `Select` reliably whenever the kit has a consumable (verify it's in the Build Kit/Launch step and not conditionally hidden when `hubs` is empty); show an inline message if no active hubs exist instead of a dead button.
2. `GET /api/inventory` returns per-hub stock; the kit-builder gates availability/qty on the **selected hub's** stock so picker and checkout agree.
3. `POST /api/inventory` self-heals: seed an `inventory_stock` row on CONSUMABLE create (the MH-2 create-gap fix — pull it forward into this hotfix).
4. Optional belt-and-suspenders: lazy-create a stock row from the legacy total in `drawFromHub` so pre-existing inventory stays checkout-able.
**Effort M. This is the gate on any prod promotion.**

### Cluster R — Requests fixes (cheap, high user value; 1–2 PRs)
- **F5+F6** (one defect): widen operator visibility to `requestedById OR fulfillerOperatorId` (list + `[id]` auth) and allow `complete` for the forwarded operator; render a "Mark Fulfilled" button. **M.**
- **F1**: add the Project dropdown to the MATERIAL branch + reset `projectId` on mode toggle. **S.**
- **F4**: add a "Consumables" line option mapping to `KIT_ITEM` filtered to `itemType==='CONSUMABLE'`. **S.**
- **F7**: Active/Closed segmented tabs (default Active) on operator + admin. **S+S.**

### Cluster H — Hub fulfillment + hard-reserve (sequence together, shared substrate)
- **R4** (hub-stock hard-reserve via `reservedQty`) + **F3** (per-line hub loading checklist writing `resolvedUnitId`/`stagedCondition`). Design jointly so per-line resolution and reserve don't double-count. **L.** (Keep the portal token-scoped/idempotent/rate-limited — it's the only unauthenticated write path.)

### Cluster M — Multi-hub admin
- **MH-2** (admin per-hub stock UI). If HOTFIX-1 already absorbed the create-gap, MH-2 is just the distribution/move UI. **M.**

### Cluster P — Project filters (after a decision; §3 below)
- **F8**: rewire inventory/deployment project filters off legacy `Rig.projectId` onto `deployment_projects`; add the missing UI filters; decide derive-vs-FK for Vehicles & Personnel. **S–M each.** Must precede #29's contract slice.

### Cluster S — Shipping/Shippo groundwork (additive, unblocks F2)
- Add `Hub` address columns (`street1/street2/zip/country`) + admin form; add `shipToHubId`/`shipToAddress` + qty to the SHIPPING_LABEL line; land the additive `Shipment` model stub + reserve `AHITS_SHIPPO_*` secrets. Full Shippo integration stays **track-only Phase-3**. **M groundwork.**

### Cluster X — UX + parked
- **F9** category-grouped pickers (operator first, admin toggle later). **S–M.**
- Parked deeper tracks: read-only remaining 6 surfaces (task #6); **#29 slice 3c → slice 4 → R5**.

---

## 3. Decisions to lock (one-liners)
1. **F8 Vehicles/Personnel project link** — derive-from-active-deployment (no migration, recommended) vs a direct FK / membership table (needed only if assignment must exist with no live deployment).
2. **F4 Consumables** — lightweight filter (recommended) vs a real `CONSUMABLE` enum value.
3. **F2 ShipTo override** — hub-only default + free-text override (recommended) now; real Shippo label-buy deferred.
4. **F3/R4 reserve granularity** — reserve per resolved line at the fulfiller hub; confirm reserve happens on STAGE, releases on cancel/deny/checkout.

---

## 4. Environment & release plan — TWO environments, Option A (decision REVISED 2026-06-26)

> **Supersedes the 2026-06-25 "single environment" call.** Max chose a **separate production environment** (Option A). The text below from 2026-06-25 is retained struck-through for history; the operative plan is the revised one.

**Decision (2026-06-26):** a **separate production environment** — a new Supabase project + the eleven `AHITS_PROD_*` secrets + a `production`-branch deploy — so real operator/asset/durable data is isolated from staging QA. **Execution is DEFERRED until late Phase 3 / immediately before go-live.** Until cutover, the existing `ahits-web-app-staging` service remains the working env and all Phase 3 work ships there. `AHITS_PROD_STANDUP_CHECKLIST.md` + the PIPE-2 runbook are the **executable runbook (un-shelved)**; run them at cutover. This re-aligns with `AHITS_ROADMAP_THROUGH_PHASE3.md`, which already lists the prod-DB standup as a pilot/go-live gate.

**What this changes:**
- **PIPE-2 (prod DB standup) is back ON the gate list** — but as a **pre-go-live** task, not a blocker for Phase-3 build work.
- During Phase 3: releases continue as today — merge to **`development`** → `deploy.yml` auto-deploys to staging. At cutover: promote `development → production` per the standup checklist.

> ~~**Decision (2026-06-25, SUPERSEDED):** Max chose a single environment; `AHITS_PROD_*` secrets would not be created and the standup checklist was shelved.~~
- **A2 (migrate-on-deploy) is now DONE** — PR #36 added a `migrate` job to `deploy.yml` that runs **between `verify` and `deploy`**, applying any pending migration via `make cloud-run-migrate` (now pointed at `AHITS_MIGRATE_URL`, the IPv4 session pooler, reachable from GitHub Actions) **before** the new revision goes live. The manual "`make db-migrate` before merge" ceremony is retired. **One-time prerequisite:** the `AHITS_MIGRATE_URL` secret must exist in Secret Manager (session-pooler URL, port 5432) or the migrate job fails — create it once.
- **Pilot gate = A6** (real-device offline pass). **Go-live (production) gates = A6 + the prod-DB standup (Option A) + UR-005b (private photo bucket).**

**Why Option A (separate prod):** real operator/asset data must not share a database with QA writes — a single env has **no place to test risky changes** before operators see them, and no test/prod isolation. The cost is one-time standup work, deferred to cutover. Until then, gate every staging merge on **green CI + a quick smoke** (migrate-before-code ordering is automatic).

**Release flow (reusable, post-A2):** create the change incl. any **committed migration** (+ `make db-generate` locally so the client/tsc are current) → green CI on the PR → quick smoke of the changed surface → merge to `development` → `deploy.yml` runs **verify → migrate (auto-applies the migration) → deploy** → verify `/api/health` 200. **No manual `make db-migrate` step** — the pipeline does it. (Update `CLAUDE.md` §3, which still describes the old manual step, to match — ideally as part of #36.)

**Optional tidy-up:** remove the `production`-branch trigger from `deploy.yml` so a stray push can't re-attempt a (broken, unwanted) prod deploy. Not urgent.

---

## 5. One-line status
Feature-rich on a single live environment. P0/P1 (F10/S1, S7/S8 hydration) fixed; HOTFIX-1/2, Requests cluster, MH-2, R4 (#91), and A2 migrate-on-deploy (#36) all merged; PR backlog triaged (7 superseded PRs closed). **Remaining build queue:** F3 (per-line loading checklist) → F8 (project filters) → F2/Shippo groundwork → F9 → S-items → read-only remaining 6 surfaces → slice 3c→4. **Only pilot gate left: A6** (real-device offline pass). Open verification: F10 UI click-through.

---

## 6. Repo hygiene — standing process (added 2026-06-25)

**Why:** ~42 stale remote branches and ~9 open PRs accumulated — many describe work already merged into `development` (e.g. maintenance lifecycle, schema hardening, consumable model, health endpoint, auth tests). Open PRs don't affect the running app (only merges to `development` deploy), but they cause confusion and risk an accidental merge of stale code/conflicts.

**Backlog triage — ✅ DONE (2026-06-25):** 7 superseded PRs closed (#28, #29, #30, #31, #32, #35, #38 — all already on `development`); #91 (R4) merged; **#36 (A2) merged** (it really did add the migrate job — see §4). Remaining cleanup: prune merged remote branches — `git branch -r --merged origin/development | grep -v 'development\|production' | sed 's#origin/##' | xargs -n1 git push origin --delete` (review the list first).

**Standing cadence (prevent recurrence):**
1. **One short-lived branch per slice**, named `feature/YYYYMMDD/<user>-<desc>` (per CLAUDE.md). Merge or close within days — never leave a soaking PR.
2. **Squash-merge + auto-delete branch** on merge (enable "Automatically delete head branches" in GitHub repo settings) so merged branches don't linger.
3. **Close, don't leave, superseded PRs** — if work lands another way, close the original immediately.
4. **Never reuse a ticket/PR id** for a different change (a past defect).
5. **End-of-cluster hygiene pass:** after each cluster (HOTFIX-1, Requests, F3/R4, …) lands, run `gh pr list --state open` + `git branch -r` and close/prune anything orphaned. A 5-minute step that keeps the PR list reflecting reality.

**Owner:** fold the end-of-cluster pass into the same checklist as the release flow (§4) so it happens every time, not as a periodic cleanup that itself gets deferred.
