# AHITS — Consolidated State, Risk & Roadmap Tracker

_Prepared 2026-06-22. Synthesizes a full code-risk audit, a UX & cross-role audit, the planning-doc trail (PRD v2.4, addendum, independent assessment, Wave 1/Wave 2/Session 4 records, QA staging issues), and live build verification. Intended as the single canonical status doc — the ~22 prior markdown docs should be archived read-only behind this one._

---

## 1. Current state

The expensive, load-bearing half is built and now hardened: an offline-first PWA with a durable IndexedDB queue and idempotent replay, single-source inventory truth, revocable PIN/password auth with per-account lockout, a rebuilt consumable model, a maintenance lifecycle, and schema hardening. What remains is the **outbound half** (nothing reaches shops/hubs/processors), the **admin half** (four screens are stubs), **photo capture** (plumbed everywhere, no UI control), **multi-operator sync-conflict handling**, and a **delivery pipeline** that is close but not yet pilot-safe.

| Phase | Status |
|---|---|
| Phase 1 · Foundation | ~90% |
| Phase 2 · Core Operations | ~50% |
| Phase 3 · Scale & Polish | 0% |
| **Pilot readiness** | **1 gate left (A6 real-device offline pass)** |

### Build verification (run live, 2026-06-22)

- **Type-check** — PASS, `tsc --noEmit` exit 0, clean.
- **Lint** — PASS, 0 errors / 20 warnings (all `react-hooks/set-state-in-effect`; perf/cosmetic).
- **Prisma client** — generates cleanly; 11 linear migrations, no folder drift.
- **Tests** — 7 spec files (auth/PIN/invite-RBAC, transfers, consumable scoping, Wave-A correctness); run in CI against a Postgres service container (couldn't execute in the analysis sandbox — no Docker).
- **CI/Deploy** — `verify.yml` = lint + type-check + real build + tests; `deploy.yml` gated on it. No `main` branch; `development`→staging, `production`→prod.

**No Critical code defects found** — no unauth'd mutating routes, no service-role key on the client, no SQL-injection surface, no committed secrets.

### The central loop — now closed ✅

An operator reports an item inoperable → backend writes a `maintenanceTask` (shop name/PO/repair-type) + a `DAMAGE_REPORTED` alert → **the admin Maintenance screen (Wave E) receives it, the dashboard alert deep-links to it (UX-12), and the notification dispatcher (Wave F) emails admins + drops it in the in-app bell.** As of this session the field→admin loop is wired end to end. Remaining outbound gap: **external** delivery to shops/processors (emails currently go to admins only — deliberately scoped that way for the first cut).

---

## 2. Issue backlog

> ### ✅ Shipped this session (all merged to `development`, staging-verified)
>
> - **PR #39 — UX-6 + CR-1 + UX-10(partial).** DispositionDialog (end-deployment / bulk-return) routed through the offline queue; transfers blocked-with-message offline. Consumable `InventoryItem.quantity` drawn down on checkout, restored on genuine good returns, floored at 0; a `consumed` flag separates daily-usage from returns.
> - **PR #40 — Wave B (UX-3): offline photo capture.** Camera capture + thumbnails in NotePhotoDialog & DispositionDialog; client-side compression; uploads online or stashes IndexedDB blobs offline and uploads on reconnect via `resolvePhotoRefs` in the queue. Backend persists `Photo` rows on all damage paths.
> - **PR #42 — Wave E (UX-1) + UX-12.** Admin **Maintenance** page: damage-report/scheduled inbox, shop/hub assignment, repair tracking, photos, status lifecycle. Dashboard alerts deep-link to the task, which auto-opens. Maintenance/priority added to the shared status vocabulary.
> - **PR #43 — Wave F: notification dispatcher.** Cron-driven (`/api/cron/dispatch`, secret-gated) dispatch of unresolved alerts → **admin email (Resend) + in-app notification center** (bell + unread badge + deep-link), idempotent via `Alert.notifiedAt`. **CR-5 fixed** (createAlert uses the `activeKey` upsert; resolve nulls it). New `Notification` model (migration `20260622000000`). Also landed: A3 `/api/health` committed, `proxy.ts` PUBLIC_PATHS for `/api/cron` + `/api/health`. **Infra live:** `AHITS_CRON_SECRET` mounted (PR #44), Cloud Scheduler `ahits-dispatch` posting every 10 min, verified `ok:true`.
> - **Wave G — maintenance recurrence.** `complete` endpoint reschedules recurring tasks (nextDue/nextOdometer roll-forward) and terminates damage reports (returns unit to service, resolves alerts). Daily-check odometer flips mileage tasks Due-Soon/Overdue.

> ### 🔧 Session-5 consolidation audit — follow-up changeset (verified `tsc` 0, lint 0; not yet a PR)
>
> A 3-front adversarial review found and **fixed**: partial-TRANSFER double-decrement (matched `end/route.ts` guard); offline-photo partial-batch data-loss (defer blob deletes until full resolve); notification double-send under overlapping cron (claim-first + `@@unique([alertId,userId])`); pre-CR-5 `activeKey` backfill; cron constant-time auth + header-only; PER_DEPLOYMENT alert-loop guard; `intervalValue` min(1); consolidated alert labels/links (dashboard now deep-links all types); zod error shapes; dashboard error handling; `items` POST 409→500 for transient errors; PhotoCapture object-URL leak. **Migration `20260622120000`** (activeKey backfill + Notification unique). See `AHITS_SESSION5_RECORD.md` §3 for the full ledger.

Severity order. Source citations are real `file:line` refs or the originating doc.

### Deferred audit follow-ups (new tickets)

| ID | Sev | Title | Note |
|---|---|---|---|
| CR-1a | Med | Consumable stock can **overshoot** the true total in the stale-stock path (checkout floored at 0, HUB restore unconditional) | Correct fix is a stored `KitItem.drawnQuantity` (restore exactly what was drawn) — a schema change. Normal path is symmetric; do next after CR-1. |
| CR-17 | Low | Concurrent single-item return could double-restore (no row lock) | Add a row lock / delta-based restore. Narrow (near-simultaneous double-submit). |
| CR-18 | Low | `lib/idempotency.ts` time-boxed fallback can double-apply under contention | Pre-existing; replace the 200ms poll with a DB advisory lock. |
| CR-19 | Low | `maintenance` GET creates OVERDUE alerts as a fire-and-forget side-effect | Now redundant with the cron scan; remove the side-effect from the read path. |
| F-2 | Low | Email transient-failure permanently drops the email (notifiedAt set anyway) | Conscious trade-off; optionally distinguish transient vs permanent send failures. |
| PROC-8 | Low | Three near-identical `relativeTime` helpers | Extract one shared util. |

### Code risk

### Code risk

| ID | Sev | Title | Source | Fix |
|---|---|---|---|---|
| CR-1 | High | Consumable inventory never decremented on checkout (unlimited double-spend; LOW_INVENTORY alerts unreliable) | `inventory.ts:12-13,99`, `deployments/route.ts:183-185` | Decrement in checkout txn via guarded `updateMany` (qty ≥ requested); re-increment on HUB return |
| CR-2 | High | Idempotency cache key ignores request body (replayed key w/ different payload returns first response) | `lib/idempotency.ts:32-37,87-99` | Bind a body hash; reject/410 on mismatch |
| CR-3 | High | Rate limiter in-memory, per-instance, resets on deploy (weak brute-force ceiling on multi-instance Cloud Run) | `lib/rate-limit.ts:15-17` | Back with Postgres/Redis (Wave D / SEC-6) |
| CR-4 | High | `clientIp()` trusts spoofable last X-Forwarded-For entry | `lib/rate-limit.ts:55` | Pin to the trusted-proxy position Cloud Run sets |
| CR-5 | Med | `createAlert` TOCTOU race — abandoned findFirst-then-create path; `activeKey` unique column never written | `lib/alerts.ts:11-17`, `schema.prisma:581-585` | Write `activeKey`, upsert/catch P2002, null on resolve |
| CR-6 | Med | Transfer accept doesn't row-lock pending kit items (overlapping-transfer double window) | `transfers/[id]/accept/route.ts:75-91,130-175` | `SELECT … FOR UPDATE` / version column |
| CR-7 | Med | Audit-log FK has no `onDelete`; admin can suspend/force-logout own session | `schema.prisma:639-651`, `users/[id]/route.ts` | Explicit cascade/restrict; block self-suspend |
| CR-8 | Med | Hard DELETEs on inventory/vehicles/maintenance throw FK errors or orphan history | `inventory/[id]:127`, `vehicles/[id]:61`, `maintenance/[id]:55` | Uniform soft-delete (`deletedAt`) + cascade rules |
| CR-9 | Med | Non-serialized unit returns can free the wrong/orphaned unit (FIFO take) | `items/route.ts:300-316`, `check-log-helpers.ts:17-31` | Explicit unit selection on return; reconcile orphans |
| CR-10 | Med | Transfer to inactive/nonexistent operator orphans items & stalls source rig | `deployments/[id]/transfer/route.ts:62-114`, `end/route.ts:222` | Validate `toOperatorId` exists/active/OPERATOR |
| CR-11 | Med | POST routes spread parsed data with `as never` (mass-assignment risk) | `maintenance:71-76`, `vehicles:49`, `inventory:156-162` | `.strict()` create schemas; drop the cast |
| CR-12 | Low | Invite PIN schema allows 6+ chars then generic 400 | `users/invite/complete/route.ts:10,34` | Align schema & regex |
| CR-13 | Low | Decimal money fields accept `z.number()` (float drift) | `users/route.ts:29`, `inventory/route.ts:139` | String-validated decimals |
| CR-14 | Low | No constraint preventing two active rigs per operator | `transfers/[id]/accept/route.ts:94` | Partial unique index `(operatorId) WHERE endedAt IS NULL` |
| CR-15 | Low | `DailyCheck.date` timezone fragility (`new Date(date)` UTC midnight) | `daily-check/route.ts:37` | Date-range compare / stored operator date |
| CR-16 | Low | `getSession` DB round-trip every request (throughput cost) | `lib/auth/session.ts:48-62` | Optional short-TTL cache keyed on `tokenVersion` |

### UX / cross-role

| ID | Sev | Title | Source | Fix |
|---|---|---|---|---|
| UX-1 | High | Admin Maintenance/Vehicles/Projects/Reports are stub pages, linked live; operator→admin maintenance loop has no destination UI | `admin/{maintenance,vehicles,projects,reports}/page.tsx`, `AdminNav.tsx` | Build Maintenance list (recipient inbox) first; disable dead nav |
| UX-2 | High | Transfers notify nobody (recipient or initiator) — only visible if recipient opens My Rig | `deployments/[id]/transfer/route.ts`, `my-rig:663,1112` | Email + in-app alert + nav badge; notify initiator on accept/decline; add `transferRequestedEmail` |
| UX-3 | High | Photo capture fully plumbed but **zero UI control** — damage records reach shops with no evidence | `/api/uploads`, `NotePhotoDialog.tsx`, `DispositionDialog` | Add camera capture control → `/api/uploads`, queued offline (= Wave B) |
| UX-6 | High | Primary offline paths use raw `fetch` and fail offline (end-deployment, bulk-return, transfers) | `DispositionDialog.handleSubmit:110`, `my-rig` transfer handlers | Route through `useOfflineQueue.mutate()`; disable transfers clearly when offline |
| UX-7 | Med | QR scan needs a live round-trip; new code offline shows misleading "not recognised" | `scan/page.tsx`, `sw.ts:44` | Distinguish offline vs unknown; pre-cache active-deployment codes; live scanner |
| UX-8 | Med | iOS PWA storage eviction can silently drop queued writes; `enqueue` swallows IDB errors | `useOfflineQueue.ts` | Detect IDB-unavailable & warn; surface queue age |
| UX-4 | Med | Four different toast/notification patterns | `useToast`, `deployments:1356`, `settings:60`, `users:274,336` | Standardize on `ToastProvider/useToast` |
| UX-5 | Med | Transfer & deployment dialogs duplicated and drifting | `my-rig:132`, `deployments:123` | Extract shared dialog w/ normalized toast callback |
| UX-12 | Med | Dashboard alerts offer only "Resolve" — no path to the record | `dashboard:124`, `alerts/[id]/resolve` | Link alert → unit/task + resolution note |
| UX-13 | Med | Inoperable review buried in inventory item detail, unreachable from alert | `inventory:131,430,621`, `review-inoperable` | Surface from Maintenance screen + alert |
| UX-14 | Med | Field-critical touch targets below 44px (`size="small"` IconButtons) | `my-rig` per-item actions | Bump to ≥44px |
| UX-9 | Low | Checkout entry is a bare redirect to Scan; nav omits checkout | `operator/checkout/page.tsx` | Build checkout flow or relabel; reconcile entry points |
| UX-10 | Low | Consumable "Log Daily Usage" is a disguised return/DELETE | `my-rig:759` | Give usage its own event type |
| UX-11 | Low | Daily-check empty state when no active deployment; deep-link can preselect missing vehicle | daily-check vehicle select | Add empty-state CTA; guard deep-link |
| UX-15 | Low | Manifest lacks screenshots/shortcuts | `public/manifest.json` | Add screenshots + shortcuts |
| UX-16 | Low | `setup-account` dead `inputType` ternary | `setup-account/page.tsx` | Remove/correct |

### Pipeline / deploy

| ID | Sev | Title | Source | Fix |
|---|---|---|---|---|
| PIPE-1 | High | Migrate-on-deploy (A2) pending — migrations applied by hand; deploy can ship code ahead of migration | `deploy.yml`, CLAUDE.md §3 | Create `AHITS_MIGRATE_URL` + grant SA; merge A2 redo; update CLAUDE.md |
| PIPE-2 | High | Production not deployed; would share staging's DB (same `AHITS_*` secrets per service) | Session 4 §9 | Stand up prod DB + per-env secrets **before** touching `production` branch |
| PIPE-3 | High | A6 real-device offline pass outstanding — last pilot gate | Session 4 §9,§10 | Full operator loop offline on real iOS + Android; fix UX-6/7/8 findings |
| PIPE-8 | Med | A3 `/api/health` & A5 auth tests built, PRs pending | Session 4 §9 | Land both; wire health into deploy smoke-check |
| PIPE-4 | Med | Confirm rotated DB password fully propagated | Session 4 §9 | Verify secrets + redeploy + `/api/health` 200 |
| PIPE-5 | Med | Migration history not baselined vs prod; residual index drift; empty `sprint7_schema_gaps` | Session 4 §4B,§9 | Baseline history; clean drift; remove/justify empty migration |
| PIPE-6 | Low | CSP is Report-Only | WAVE2 §4 | Observe reports, flip to enforcing (Wave D) |
| PIPE-7 | Low | Ownership transfer incomplete (GCP/billing, DNS, GitHub, Resend) | Session 4 §9 | Complete transfers; document access |

---

## 3. Forward roadmap (one ordered scheme)

Collapses the PRD's `0/1/2A–2D/3` and Session 4's `Waves A–H` into a single sequence by leverage & dependency.

- **Wave A — close-out (in progress).** Land pending PRs (#37, A3, A2, A5); stand up prod DB; confirm password rotation; **A6 real-device offline pass** = last pilot gate.
- **Wave B — Photos end-to-end (High).** Capture → compress (1200px/JPEG-85) → offline blob → signed upload to private bucket → validated `Photo` rows; damage-photo-required. Wire into NotePhotoDialog/DispositionDialog. _(UX-3)_
- **Wave E — Admin completeness (High).** Build the four stub pages (Maintenance first = recipient inbox); clickable dashboard feeds + pinned-alert banner; link alerts → unit/task; audit-log viewer; live operator dashboard + transfer badge. **E-R** equipment utilization & cost report (serves the 25% repair-spend metric).
- **Wave F — Notification dispatcher (High, highest business leverage).** One escaped channel for all six alert types over email + push; cron overdue/not-returned/expiry; in-app center; per-admin routing; **external delivery** to shops (work orders) + invoice→processor loop. **F-R** hub receive view + return-receipt handshake.
- **Wave C — Sync integrity & consistency (Med).** Near-term: id remapping for dependent writes; unify mutation pipeline + toasts + dialogs; `lib/status` everywhere; "My Rig"→"My Deployment"; freshness indicator; mobile bottom nav; SW update prompt. _Deferred:_ full optimistic concurrency (updatedAt/If-Match→409) for the two-offline-operators-on-one-rig case — a real but workable-around corner case; revisit only if it surfaces in the field.
- **Wave D — Security & data-hygiene tail (Med).** Hash invite tokens (H2); admin password strength (H3); `mustChangePin` screen; shared-store rate limiting + XFF (CR-3/4); CSP enforce; idempotency reaper; migration baseline; uniform soft-delete (CR-8).
- **Wave G — Scheduled maintenance loop (Med).** Mark-complete → recalc nextDue → history → next task; odometer → Due-Soon/Overdue.
- **Wave H — Deployment Requests & Hub fulfillment (Low).** Deployment↔Project M2M; DeploymentAssignment; request→stage→checkout lifecycle; RESERVED; HubAssignment; hub UI. **H-A** condition acknowledgment on hand-off. Trusted-device sessions.
- **Phase 3 capstones (Future).** Deployment Map (Mapbox) + GPS on daily-check; Time tracking/Invoicing/Availability (7 models, auto-email invoices); QR-only no-app web form; live camera scanner; React Native wrapper; contractor self-onboarding.

---

## 4. Process & scope drift (fix how the project runs)

The product is healthy; the **delivery process** is where the real risk lives.

- **High — `db push` against shared DBs caused a staging outage** (enums + `Alert.activeKey` deployed but never migrated → re-work to reconcile). Process fix: migrations via PR only; never `db push` shared DBs. The single most expensive recurring pattern.
- **Med — ~22 overlapping docs across ≥3 baselines** produce contradictory status numbers. Collapse to one canonical living doc; archive the rest read-only.
- **Med — two parallel wave-numbering schemes** (0/1/2A–2D/3 vs A–H). Pick one; map the other once.
- **Med — branch-reconciliation churn** repeatedly named the top risk. Short-lived branches on the documented `feature/<date>/<user>-<desc>` convention; merge or close.
- **Med — `mustChangePin` set & returned but never enforced.** Admin PIN resets don't force rotation. Build the screen (Wave D).
- **Med — scope expansion beyond v1 PRD** (Deployment Requests, F-R, E-R, H-A). Reasonable, but each needs an explicit in-for-v1 / defer decision before sequencing C–H.
- **Low — reused ticket ID "C1"** = two different defects. Never-reuse-IDs rule + single registry.

---

## 5. Recommended path forward

**Immediately (close Wave A → pilot):** land the four pending PRs; stand up a real prod DB with its own secrets (PIPE-2 is a genuine footgun); confirm the password rotation propagated; run the A6 real-device offline pass on iOS + Android. **Do not pilot until green** — ending a deployment offline currently fails (UX-6) and consumables never decrement (CR-1).

**Next two builds, in order:** Wave B (photos — plumbing's done, only the control is missing) → a thin slice of Wave E + Wave F together (admin Maintenance inbox + notification dispatcher) to close the operator→admin→shop loop that turns AHITS from an inbound log into a coordination system.

**Then:** Wave C (sync conflict handling), D (security tail), G (maintenance loop), H (Deployment Requests/hub), Phase 3.

**Deprioritized:** the "two operators editing the same rig while both offline" scenario is real but a corner case, and can be worked around for quite a while. So the heavyweight optimistic-concurrency work in Wave C drops down the list; the near-term Wave C value is the id-remapping for dependent writes plus the consistency unification (toasts, dialogs, vocabulary). Revisit full OCC only if the conflict scenario starts showing up in the field.
