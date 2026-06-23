# AHITS — Roadmap to Complete Through Phase 3

_Prepared 2026-06-23 (Session 7). A single prioritized sequence to take AHITS from its current state to a complete Phase-3 product. Reconciles the PRD's Phase 1/2/3 (`AHITS_PRD_v2.md`) and the Wave A–H scheme into one ordered plan, grounded in a full PRD re-read, the past roadmaps, and the current codebase. Supersedes the forward-plan sections of the prior roadmap docs; the Consolidated Tracker remains the risk-register source until refreshed._

---

## 0. How to read this

The plan is organized into **eight milestones, M0 → P3**, in execution order. Earlier milestones gate later ones. Within each milestone, items are listed **highest priority first**. Each item carries a tag:

- **[GATE]** — blocks a field pilot; do before any real operators use the app.
- **[FObundation]** marker **[FND]** — load-bearing; later work builds on it, so do it before the screens that depend on it.
- **[KPI]** — directly moves one of the PRD §7 success metrics (noted which).
- **[NEW]** — a net-new opportunity not in the original PRD; where it slots is called out.
- **[P3]** — Phase-3 capstone.

The **one rule that orders everything**: finish pilot infrastructure, then **unify the presentation layer before building more screens**, then complete the loops the business case depends on, then the model refactor, then the Phase-3 capstones. Building new screens on drifted patterns (today's biggest latent debt) is the failure mode this ordering prevents.

---

## 1. Where we are (Session-7 snapshot)

The inbound operator loop is built and hardened; the first **outbound** leg (tokenized shop/hub status links) is live and verified on staging; the consumable-accounting and integrity-race edges are closed; production secret-isolation is done in code.

| Phase (PRD) | Status |
|---|---|
| Phase 1 · Foundation | ~92% |
| Phase 2 · Core Operations | ~60% |
| Phase 3 · Scale & Polish | ~3% (mileage trigger shipped early; map GPS not seeded) |
| **Pilot readiness** | **3 gates left: prod DB standup, A6 device pass, shared-store rate limiting** |

What's genuinely left clusters into: **pilot infrastructure** (M0), **presentation-layer unification** (M1), **admin completeness incl. the cost report** (M2), **notification completion** (M3), the **security/data-hygiene tail** (M4), **maintenance & daily-check depth** (M5), the **deployment-model refactor + requests + hub fulfillment** (M6), and the **three Phase-3 capstones** (P3).

---

## 2. The sequence

### M0 — Pilot readiness (do first; nothing else ships to real operators until these are green)

1. **[GATE] Production database standup + per-env secrets (PIPE-2).** Code is done (Makefile `SECRET_NS`); execute the runbook: provision a separate Supabase prod project, create the eleven `AHITS_PROD_*` secrets (fresh session/cron secrets), apply migration history, first `development→production` promotion, verify isolation. _Ref: `AHITS_PIPE2_PROD_DB_RUNBOOK.md`._
2. **[GATE] Migrate-on-deploy automation (A2).** Point `AHITS_PROD_DIRECT_URL` at Supabase's IPv4 session pooler and add a `make cloud-run-migrate` step to the release job before deploy — retiring the manual-migration tax that bit three times.
3. **[GATE][KPI: alert-response, 15-min] Shared-store rate limiting + trusted XFF (CR-3/CR-4).** The public `/s/` status-link endpoints are now the only unauthenticated write surface; the in-memory per-instance limiter must move to a shared store (Postgres table or Redis) and pin the client IP to the trusted-proxy position before shops use the links heavily. _Was WF-1; now pilot-relevant because the surface is public._
4. **[GATE][KPI: zero-missing-24h, adoption] A6 real-device offline pass.** Full operator loop offline on real iOS + Android, deliberately stressing: Safari private-mode/eviction (the silent IDB-loss risk), offline deployment-create, queued-photo upload-on-reconnect, transfer-blocked-offline messaging.
5. **Confirm the CSP shipped in Wave A is enforcing and complete** (Session 6 found it absent before; verify the headers are live and not Report-Only-only), and decide on **damage-photo-required enforcement** (plumbing exists; flip the gate on for the pilot).

_Exit criteria: a prod environment with its own data, automated migrations, a real rate limiter, and a signed-off device pass. **This is the pilot line.**_

### M1 — Presentation-layer unification (Wave C) — [FND] do before building more screens

6. **[FND] One notification/toast system.** Route admin Deployments/Users/Settings through the app-wide `ToastProvider`; retire the 4+ divergent patterns. _Ref: UX-4._
7. **[FND] One shared transfer/deployment dialog + one disposition dialog.** Extract the duplicated inline dialogs (my-rig + admin) and the 3× copy-pasted unit-picker into shared components. _Ref: UX-5._
8. **[FND] One equipment-condition vocabulary.** Collapse the three different "damaged / fixable?" UIs (scan / DispositionDialog / my-rig) into one; route all status display through `lib/status` + `StatusChip`. Rename **"My Rig" → "My Deployment"** consistently.
9. **[FND] Dependent-write id-remapping for offline replay.** `pending-` ids break dependent writes on replay; remap on the queue so multi-step offline sequences (create deployment → add items) survive sync.
10. **[NEW][KPI: adoption] Operator ergonomics:** bottom-nav tab bar (thumb-reachable), ≥44px touch targets on daily-check toggles / per-item actions / photo controls, iOS safe-area padding in the app shell. _Slots here because every operator screen benefits and M2+ shouldn't re-introduce small targets._
11. **[NEW] Operator queue/outbox + freshness UI.** Surface pending/old/failed queued writes and a "data as of HH:MM" indicator, turning the silent IDB-eviction risk into a visible, recoverable state. SW update prompt instead of silent `skipWaiting`.

_Exit criteria: a single consistent presentation layer the remaining screens can be built on once._

### M2 — Admin completeness (Wave E)

12. **[KPI: 25% repair-spend] Reports page = Equipment Cost & Utilization report (E-R).** Build the Reports stub into the report that makes the headline metric observable: per-asset check-out frequency, days-out, utilization rate, maintenance spend, cost-of-downtime; filterable; CSV→PDF export. _This is the scoreboard for the whole business case._
13. **Vehicles admin page.** Build the stub (fleet list, detail, insurance/registration, maintenance + daily-check history) — and **fix the broken promise**: insurance/registration expiry alerts currently deep-link to this dead stub.
14. **Projects admin page.** Build the stub (project CRUD, assigned deployments) — minimal until the Deployment↔Project M2M lands (M6), then expand.
15. **[KPI: alert-response] Dashboard operational feeds + pinned alert banner + clickable cards.** Missed checks today; maintenance due ≤14 days; checked-out + overdue; last-10 activity; pinned red-alert banner; make the 6 non-clickable stat cards drill through.
16. **Audit-log viewer** (the `AccountAuditLog` is written but never surfaced) and **inoperable-review surfacing** from Maintenance/alert (vs buried 4 clicks deep).

### M3 — Notification completion (Wave F tail)

17. **[KPI: alert-response, preventative-maintenance] Low-inventory alert + per-item threshold config.** The dispatcher exists; add the alert type and its Settings threshold config — an explicitly-specified alert with no current home.
18. **[KPI: alert-response] Operator notifications.** Operator notification bell + pending-transfer nav badge (operators currently learn of transfers only by polling My-Rig), and **[NEW] operator Web Push (iOS 16.4+ PWA)** for incoming-transfer and overdue-return — the cheaper alternative to a native wrapper and the path to the PRD's "push is primary" requirement.
19. **Admin alert-configuration surface:** daily-check cutoff time, which alert types are enabled, per-admin/per-type routing. Converges on Settings.

### M4 — Security & data-hygiene tail (Wave D)

20. **[KPI: adoption] Operator self-service PIN-change screen + enforce `mustChangePin`.** Currently no change-PIN endpoint exists at all — both a broken control and a missing core feature. _Ref: N-PIN._
21. **Hash invite tokens at rest (H2);** idempotency body-hash binding (CR-2); uniform soft-delete + cascade rules across inventory/vehicles/maintenance (CR-8, fixes the hard-delete 500s); QR-reuse-on-retire; idempotency-key reaper; migration-history baseline.
22. **Photo security:** private bucket + signed-download URLs, `Photo.url` origin validation. (Damage-photo-required gate handled in M0.)
23. **CSP nonce-strict** (tighten the M0 CSP from `'unsafe-inline'` to nonce-based script-src once a middleware nonce is wired).

### M5 — Maintenance & daily-check depth (Wave G tail)

24. **[KPI: 95%-on-time, preventative-maintenance] Full ~16-item daily checklist + required failing notes + richer pass-review echo.** The condensed 9-item list is a live gap against the spec.
25. **Per-vehicle-type / per-project custom checklists + admin checklist editor** (add/remove/reorder items).
26. **Full maintenance resolution-path picker** (per-case return-destination, `repairMethod`, `returnDestinationType/Id`, expanded `Disposition` enum) — completes the Addendum §A state machine the backend already partly expresses.
27. **[NEW] Maintenance prediction nudge.** "This asset is approaching its service interval / has cost \$X in the last 90 days" on the dashboard — a cheap step toward proactive-not-reactive using the cost history E-R now exposes.
28. **Photo gallery + lightbox** (capture is built; the viewing surface with damage badge isn't).

### M6 — Deployment model refactor + requests + hub fulfillment (Wave H)

29. **[FND] Deployment model refactor.** Deployment↔Project many-to-many (`DeploymentProject`); `DeploymentAssignment` operator-handoff history (PRIMARY/SECONDARY, start/end) folding in `RigOperator`; operator-side **secondary-operator UI** and **self-service handoff** (transfer-accept pattern, admin can force, audit-logged).
30. **Hub fulfillment / full F-R.** `HubAssignment` (per-hub fulfiller pool) → **email-to-hub** for the HUB_RETURN links built this session (currently created but not auto-delivered); **hub receive/inbound view** ("what's at / inbound to this hub") with per-item condition check at the door.
31. **Deployment Requests** (request → stage [hard-reserve + per-item operable+presence check] → check-out; `RESERVED` status; `DeploymentRequestLine`; lifecycle `DRAFT/REQUESTED/STAGED/CANCELLED`).
32. **[NEW] H-A condition acknowledgment on hand-off** (receiving operator signs off on condition before a handoff closes) — reuses the tokenized-link primitive.
33. **Re-evaluate trusted-device / 30-day-idle sessions (§10.1).** The revocation goal is already met by the 24h JWT + per-request re-check; decide whether the device model is still worth building or can be retired from scope.

### Phase 3 — Capstones (P3)

34. **[P3] Deployment Map** (smallest; do first). GPS opt-in on daily-check submit (three new `DailyCheck` fields: `gpsLat/gpsLng/gpsAccuracy`), Mapbox GL admin map, recency-colored pins, click-tooltip. _Seed the GPS opt-in earlier (M1/M5) so data accrues before the map ships._
35. **[P3][KPI: 25% repair-spend adjacency] Time Tracking, Invoicing & Availability** (heaviest). 7 models (`TaskType`, `OperatorRate`, `TimeEntry`, `Expense`, `Invoice`, `InvoiceLineItem`, `Availability`); clock in/out linked to deployment+project; expenses + receipts; invoice PDF Draft→Submitted→Approved→Paid; **invoice→processor auto-email reuses the notification dispatcher** built in Wave F; admin availability grid. _`User.hourlyRate` already seeded._
36. **[P3][NEW-primitive-ready] No-app QR web form.** Daily check via any phone camera → tokenized mobile web form, no install — **reuses the exact tokenized-link primitive built for the Wave F shop link**, so this capstone is now much cheaper.
37. **[P3] Advanced cost analytics + admin mobile optimization;** contractor self-onboarding (reuses the invite primitive).
38. **[P3 / de-scope candidate] React Native wrapper.** Recommend **not** building unless iOS Web Push (M3) proves insufficient — a wrapper buys app-store presence at the cost of a second codebase the PWA doesn't need.

---

## 3. Net-new opportunities and where they slot (summary)

| Idea | Why | Slots into |
|---|---|---|
| Operator Web Push (iOS 16.4+) | Satisfies PRD "push is primary"; avoids a native wrapper | M3 |
| Queue/outbox + freshness UI | Makes the silent IDB-eviction loss visible/recoverable | M1 |
| Operator bottom-nav + ≥44px targets | Phone-first ergonomics; adoption KPI | M1 |
| Maintenance prediction nudge | Proactive-not-reactive using E-R cost history | M5 |
| GPS opt-in seeded early | Map data accrues before the capstone ships | M1/M5 → P3 |
| Tokenized-link reuse (hub email, invoice, no-app form, H-A) | The primitive is built once (Wave F) and pays off four times | M3/M6/P3 |
| Bulk QR printing onboarding | Smooths the 100+-contractor scale-up | M2/M5 (optional) |

The strategic point: **the tokenized status-link primitive shipped this session is leverage** — it's the same mechanism behind hub-receipt confirmation, the invoice→processor loop, the no-app QR form, and condition-acknowledgment. Sequencing those to reuse it makes several later items materially cheaper.

---

## 4. Governance decisions to lock before sequencing M6/P3

The scope has been disciplined (nothing new pulled into v1), but four expansion items still need an explicit **in-for-pilot / defer** call so M6 and P3 don't drift:

1. **Deployment Requests** — confirmed post-pilot (M6). Keep there unless a hub-staging workflow becomes a pilot requirement.
2. **Trusted-device sessions** — decide retire-vs-build (§2 item 33); the security need is largely already met.
3. **React Native wrapper** — decide de-scope-for-Web-Push (item 38).
4. **Time/Invoicing/Availability** — confirm it's a true Phase-3 deliverable vs. an earlier business need (it's the heaviest item; 7 models).

### Parked items (logged)

- **Operator Web Push (iOS 16.4+ PWA)** — **parked / deprioritized (2026-06-23).** The M3 notification loop is complete without it: admin email + in-app bell, the dispatcher with admin alert-config, low-inventory + expiry scans, and the operator notification bell + pending-transfer badge all shipped. Web Push remains valuable for the PRD's "push is primary" goal, but it needs VAPID keys (infra), a push-subscription model + endpoint, service-worker push handlers, and **real-device verification** — which overlaps the **M0 A6 device pass**. Build it alongside A6 rather than as standalone, unverifiable code. Until then, operator awareness is covered by the in-app bell + 45s polling.

Plus the standing **process fixes** (Session 6 §8.3): make the Consolidated Tracker the single status doc and refresh it (it's stale post-today), freeze the PRD as spec, fix the README to match reality, never reuse ticket IDs, date-stamp risk rows "verified from source," and remove/baseline the empty `sprint7_schema_gaps` migration. Archive the legacy roadmap docs into `docs/archive/`.

---

## 5. Success-metric mapping (which work moves which KPI)

| PRD §7 metric | Primary work |
|---|---|
| **25%+ repair-spend reduction (6 mo)** | M2 E-R cost/utilization report (the scoreboard) · M5 prediction nudge · the outbound shop loop (shipped) |
| **95%+ daily checks on time** | M5 full checklist + custom checklists · M1 operator ergonomics |
| **Zero equipment missing >24h** | M0 A6 device pass · M6 hub receive/return-receipt · transfers (shipped) |
| **0 missed scheduled maintenance ≤14d** | Wave G recurrence (shipped) · M5 resolution paths · M3 low-inventory + config |
| **90%+ operator adoption (2 wk)** | M1 ergonomics + queue UI · M4 PIN-change screen · M0 offline reliability |
| **Admin notified ≤15 min** | M3 notification completion + Web Push · M0 shared-store rate limit · dispatcher (shipped) |

---

## 6. The shortest honest path to "done"

**Pilot:** finish **M0** (prod DB, migrate-on-deploy, rate limiter, device pass). That's the line.

**Credible v1:** **M0 → M1 → M2 → M3**. After these, every role has complete screens on a unified UI, the business metric is observable, and the notification loop is whole. This is the realistic "feature-complete v1."

**Through Phase 3:** add **M4 → M5 → M6 → P3**, with the three Phase-3 capstones sequenced Map → No-app form → Time/Invoicing (smallest-to-largest), and the React Native wrapper de-scoped in favor of Web Push unless proven necessary.
