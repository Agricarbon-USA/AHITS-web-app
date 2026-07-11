# AHITS — Session 11 Handoff (START HERE for the next session)

_Prepared 2026-06-25. Single entry point to resume. Everything below is live on the one environment (`ahits-web-app-staging-…run.app`) unless noted. Read this first, then the per-item doc it points to._

---

## 1. One-paragraph status
The entire day-of-use feedback list (F1–F10, S1–S6) plus the Requests/hub workstream (R1–R3, R4, F3), multi-hub inventory (expand/migrate/MH-2), the consumable-checkout + hydration hotfixes, project filters (F8), grouped checklists (F9), Hub-address/Shippo groundwork (F2), org-wide operator read-only (all 7 surfaces), and the A2 migrate-on-deploy automation are **all merged to `development` and live on staging**. **One build item remains: #29 slice 3c → 4** (retire the legacy `Rig.operatorId`/`projectId`/`rig_operators` columns) — fully planned and gated, not yet started. Pilot gates left: **A6** (real-device offline pass). One open verification: the **F10 UI click-through** (now unblocked since the hydration fix).

## 2. Environment & how we work (decisions locked this session)
- **TWO environments — Option A (decision REVISED 2026-06-26, supersedes the 2026-06-25 "one environment" call).** Max chose a **separate production environment**: a new Supabase project + the eleven `AHITS_PROD_*` secrets + a `production`-branch deploy, so real operator/asset data is isolated from staging QA. **Execution is DEFERRED to late Phase 3 / immediately before go-live** with real operators — until then all Phase 3 work continues on the single staging env (`ahits-web-app-staging`). `AHITS_PROD_STANDUP_CHECKLIST.md` (+ the PIPE-2 runbook) is the **executable runbook, un-shelved**; run it at cutover. (Aligns with `AHITS_ROADMAP_THROUGH_PHASE3.md`, which already lists the prod-DB standup as a gate.)
- **Release flow (post-A2):** create the change incl. any committed migration + `make db-generate` locally → green CI → quick smoke → merge to `development` → pipeline runs **verify → migrate (auto-applies) → deploy**. No manual `make db-migrate`. (Prereq already in: `AHITS_MIGRATE_URL` secret.)
- **Build cadence:** small slices, one per PR; CC builds from a written script; squash-merge + auto-delete branch; end-of-cluster hygiene pass. Details: `AHITS_SESSION11_REVISED_WORKPLAN_AND_PROMOTION.md` §4–§6.
- **Raw-SQL discipline:** new tables/columns reached via `$queryRaw`/`$executeRaw` (no client-regen needed in-sandbox). See `lib/inventory-stock.ts`, `lib/deployment-assignments.ts` as the pattern.
- **`CLAUDE.md` §3 is stale** — it still describes the old manual `make db-migrate`. Update it to the A2 auto-migrate flow when convenient.

## 3. Shipped this session (merged to `development`)
HOTFIX-1 consumable checkout + inventory divergence (#92) · HOTFIX-2 dashboard hydration #418 (#93) · hydration fix all operator routes (#96) · Requests cluster F5/F6/F1/F4/F7 (#95) · multi-hub MIGRATE MH-1 (#89) · MH-2 admin per-hub stock (#90) · R4 hub-stock hard-reserve (#91) · A2 migrate-on-deploy (#36) · F3 mandatory hub loading checklist (#97) · F9 grouped checklists (#98) · F8 project filters from deployment graph (#99) · S2/S5/S6 hub mgmt + home-hub default + operator requests feed (#100) · F2 Hub addresses + ship-to + Shipment stub (#101) · read-only remaining 6 surfaces (#102).

## 4. THE remaining build item — #29 slice 3c → 4
**Plan: `AHITS_29_SLICE3C_4_PLAN.md` — read its top banner + §6/§7/§8/§9 before doing anything.** Key points:
- **Slice 3c** (medium blast radius, reversible): migrate every legacy READ onto `deployment_assignments`/`deployment_projects`; KEEP all writers. Hand CC the **§5 block** (the executable, corrected version).
- **The completeness bar is the §8.E compile gate**, NOT manual enumeration — 4 review passes each found more reads; the file lists are a map, the pruned-schema `prisma generate`+`tsc` is the arbiter. Build 3c, fix every error the gate surfaces.
- **The crux (§7.F):** two read shapes — open-assignment for authz, latest-regardless-of-`endedAt` for display/history. Conflating them regresses ended/historical deployment views.
- **Slice 4** (small, IRREVERSIBLE): only after 3c is vitest-green + soaked. Run `docs/prepared/slice4_precheck.sql` (all zero rows) + the reassignPrimary smoke + **Supabase snapshot**, then the gated `docs/prepared/slice4_drop_legacy.sql` + the schema/test/seed edits (§3, §8). A2 auto-applies on merge — irreversible, so snapshot first.

## 5. Open verifications & gates (your hands)
- **F10 UI click-through (re-verify):** as an operator, Start Deployment → add a consumable → pick source hub → Launch submits; admin Inventory "Available" matches the picker. Was blocked by the dead-button hydration bug (now fixed #96); worth a live confirm.
- **Live smoke of the new flows:** F3 hub loading checklist (file a reservation → hub token link → confirm/edit/deny each line → stage → requester sees the diff); R4 reserved-stock; read-only as a real operator across all 7 surfaces.
- **A6 (pilot gate):** full operator loop offline on real iOS + Android (Safari private-mode IDB eviction, offline create, queued-photo upload-on-reconnect). Not code; the last standing pilot gate.

## 6. Backlog beyond #29 (not yet scripted)
- **Shippo integration** (the stub from #101 is ready): register tracking + HMAC webhook + cron reconcile + tracking chips/alerts. Prereqs at that point: `AHITS_SHIPPO_API_TOKEN`/`_WEBHOOK_SECRET` secrets + Makefile `--set-secrets` mapping. Track-only first cut (label-buy deferred). See `AHITS_SESSION10_ANALYSIS_AND_PLAN.md` §5.
- **Phase-3 capstones:** Deployment Map (Mapbox + GPS on daily-check), Time/Invoicing/Availability (7 models, heaviest), no-app QR web form (reuses the tokenized StatusLink). See `AHITS_ROADMAP_THROUGH_PHASE3.md`.
- **Optional cleanup:** prune merged remote branches; update `CLAUDE.md` §3.

## 7. Document index (what to open for what)
- **This file** — start here.
- `AHITS_29_SLICE3C_4_PLAN.md` — the one remaining build item (the §5 block is the CC handoff).
- `AHITS_SESSION11_REVISED_WORKPLAN_AND_PROMOTION.md` — env decision, release flow, repo-hygiene cadence, build queue.
- `AHITS_FEEDBACK_FINDINGS_REGISTER.md` — the day-of-use feedback + the live-smoke findings, all root-caused (now shipped, kept for history).
- Per-slice scripts (all shipped; kept as the build record): `AHITS_HOTFIX_SCRIPTS.md`, `AHITS_REQUESTS_CLUSTER_SCRIPT.md`, `AHITS_MULTIHUB_MIGRATE_DESIGN.md`, `AHITS_F3_SCRIPT.md`, `AHITS_F9_SCRIPT.md`, `AHITS_F8_SCRIPT.md`, `AHITS_S_ITEMS_SCRIPT.md`, `AHITS_F2_SHIPPO_GROUNDWORK_SCRIPT.md`, `AHITS_READONLY_REMAINING_SCRIPT.md`.
- `AHITS_REQUESTS_REDESIGN_DESIGN.md` — the Requests/hub fulfillment design (R1–R5).
- `AHITS_SESSION11_RECORD.md` / `AHITS_SESSION11_SLICE4_READINESS.md` / `AHITS_SESSION11_READONLY_AND_AUDIT.md` — earlier-in-session records.
- `docs/prepared/slice4_*.sql` — the gated precheck + drop migration for slice 4.
- `AHITS_PROD_STANDUP_CHECKLIST.md` — SHELVED (one-environment decision); ignore unless a 2nd env is ever wanted.

## 8. First moves for the next session
1. Skim §1–§5 of this file.
2. Decide: take on **#29 3c** (hand CC the `AHITS_29_SLICE3C_4_PLAN.md` §5 block; build against the §8.E gate), or close the **F10/A6 verifications** first.
3. If anything was merged after this handoff, `git log --oneline` on `development` to catch up; the queue in §4/§6 is the source of truth.
