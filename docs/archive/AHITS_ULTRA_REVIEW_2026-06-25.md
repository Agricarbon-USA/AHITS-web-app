# AHITS — Ultra-Review: State of the App Before Phase 3 & Production

_Prepared 2026-06-25 (Session 12). A full read-only interrogation of the AHITS codebase **and** the live staging app, anchored to the stated goal: enter Phase 3 and production without losing functionality, with consistent logic, clean code, and a fluid cross-role / cross-platform experience. Method: five parallel specialist code-review agents + central static analysis (type-check, lint, dead-code) + a live click-through of staging as Admin and both Operators. Every claim below is grounded in `file:line` evidence or a live observation; the companion **`AHITS_ULTRA_REVIEW_ISSUE_REGISTER.xlsx`** is the sortable worklist with the same finding IDs._

---

## 0. How to read this

- **Scope of this engagement:** assess and report only. No code was changed. Nothing was deployed. The companion register is a worklist for you to action.
- **Severity scale:** **Critical** (data corruption / security / blocks a core loop) · **High** (breaks an intended flow or a pilot/prod gate) · **Medium** (real defect or inconsistency, has a workaround) · **Low** (polish, hygiene, deferred-by-design).
- **Anchor:** the latest planning baseline is the **Session-11 handoff** + **`AHITS_ROADMAP_THROUGH_PHASE3.md`**. Findings are mapped to roadmap milestones (M0–P3) so nothing here is net-new scope creep; it's "is what we said we built actually correct, consistent, and prod-ready."
- **One-line verdict up front:** The app is **substantially built, genuinely well-engineered, and far ahead of where its own older docs imply** — but it is **not yet production-ready**. There is **one Critical data-integrity bug**, a small cluster of **High** items (one security gate, one core offline flow, one session/identity bug), and an unresolved **strategic decision about what "production" even means** that must be settled before the cutover.

---

## 1. Executive summary & verdict

### 1.1 The headline

AHITS is an offline-first PWA (Next.js 16 App Router, MUI v6, Prisma 5 / Supabase Postgres, iron-session-style JWT auth, Serwist service worker) for tracking field equipment across operators, hubs, vehicles, and maintenance. The expensive, load-bearing parts are built and hardened: a durable IndexedDB offline queue with idempotent replay, single-source inventory truth with race-safe per-hub stock math, revocable PIN/password auth with per-account lockout, a full maintenance lifecycle, a notification dispatcher, tokenized external status links, multi-hub inventory, and a deployment-requests/hub-fulfillment workstream.

The live walkthrough **contradicts the pessimism in the older docs**: the four "stub" admin pages the roadmap lists as M2 work — **Reports, Vehicles, Projects, and the audit-log viewer — are all fully built and functional on staging today.** Reports is a complete Equipment Cost & Utilization report with KPIs, filters, a sortable per-asset table, and CSV export. The dashboard has its pinned alert banner, operational feeds, and clickable cards. The inoperable-review surface is at the top of Maintenance. Operator read-only access to admin surfaces (#102) works and is enforced server-side. The app loaded **every page with zero application console errors**.

So the question is not "is it built" — it largely is. The question is **"is it correct, consistent, and safe enough to put real equipment and real money behind."** On that bar there are specific, fixable gaps.

### 1.2 Verdict by readiness line

| Line | Status | What stands between here and the line |
|---|---|---|
| **Pilot (real operators, single env)** | 🟡 **Close** | Fix the Critical stock bug (UR-001), the `mustChangePin` server gate (UR-004), and the offline deployment-create flow (UR-006); run the A6 real-device offline pass. |
| **Production (money/assets, durable data)** | 🔴 **Not yet** | All of pilot, **plus** resolve the unsettled one-environment-vs-prod-DB decision (UR-021), private photo bucket (UR-005), the session/identity SWR bug (UR-003), and align the Node runtime skew (UR-016). |
| **Phase 3 capstones** | ⚪ **Not started** | Map, Time/Invoicing, no-app QR form — correctly sequenced behind the consistency sweep; don't start until M1 unification lands. |

### 1.3 The five things to fix first (in order)

1. **UR-001 · Critical · Consumable bulk-return corrupts per-hub stock.** The bulk "Return items" disposition restores the cross-hub total but never restores the per-hub `inventory_stock`, so per-hub counts silently drift down after every bulk return — corrupting the exact multi-hub accounting the recent MH work delivered. Two sibling endpoints already do it correctly; this is a one-branch mechanical fix.
2. **UR-004 · High · `mustChangePin` is not enforced server-side.** An operator whose PIN was admin-reset (a security event) can skip the change-PIN screen and call every operator API directly. The control is cosmetic against a scripted client.
3. **UR-006 · High · Creating a deployment offline is silently lost.** `NewDeploymentDialog.launch` posts via raw `fetch`, bypassing the offline queue; and the dependent-write id-remap that the roadmap thinks is done (`offline-remap.ts`) is **never invoked by any caller**. The PRD's flagship offline flow — "create deployment → add items offline → replay" — cannot occur.
4. **UR-003 · High · Identity is cached across logins (shared-device risk).** After sign-out + re-login in the same browser, the UI shows the **previous user's name** until a hard reload (live-confirmed: admin's "Ops Admin" persisted into Operator 1's dashboard; corrects on reload). Root cause: the `/api/auth/me` SWR cache is never invalidated on login/logout. On a shared field tablet this is a real privacy/correctness problem.
5. **UR-021 · High (decision) · "Production" is undefined.** The Session-7 roadmap's first gate is "stand up a separate prod DB + `AHITS_PROD_*` secrets," but the Session-11 handoff explicitly **shelves** that and declares "ONE environment." You cannot "enter production" without choosing: promote the single staging env to prod-grade (and accept no test/prod data isolation), or execute the prod-standup runbook. This blocks the whole cutover and must be decided by a human, not inferred.

### 1.4 What is genuinely solid (the don't-break list)

Auth/authz is **production-grade**: per-request DB re-validation (instant suspend/force-logout/demote), bcrypt-12 with lockout, hashed-at-rest invite **and** status-link tokens (256-bit), atomic TOCTOU-safe invite claiming, mass-assignment-proof admin edits with last-admin guards, a **shared-store** rate limiter with trusted-XFF pinning (CR-3/CR-4 are done), constant-time cron-secret comparison, and an enforcing CSP. Every API route's auth was mapped — **no route is missing its check.** The multi-hub `drawFromHub`/`reserveAtHub` primitives are genuinely race-safe. Idempotency is correctly body-hash-bound. TypeScript hygiene is excellent (effectively zero `any`, no `@ts-ignore`, no stray `console.log`/`debugger`, zero inline TODO debt), type-check is clean, lint has 0 errors, and CI gates every PR and deploy on lint + type-check + build + tests.

---

## 2. Methodology & scope

**Codebase:** `~170` source files (121 `.ts`, 50 `.tsx`), Next.js 16.2.9, on branch `development` at commit `ab892f6`. **Live target:** `ahits-web-app-staging-…run.app` (the single environment).

**What was done:**

- **Five parallel specialist review agents**, each with a tight anti-drift brief and a required evidence-cited output: (1) data layer & migrations, (2) API/auth/security, (3) operator frontend & PWA/offline, (4) admin frontend & presentation layer, (5) cross-cutting code quality / dead code / hygiene.
- **Central static analysis:** `tsc --noEmit` (clean, exit 0), `eslint .` (0 errors, 33 warnings — all `react-hooks/set-state-in-effect`, several of them the intentional hydration-mount guards), dead-code/dependency sweeps.
- **Independent verification** of the two headline code findings against source (UR-001 and UR-006 were both confirmed at `file:line`, not taken on the agent's word).
- **Live walkthrough** of staging as **Admin** (`ops@`), **Operator 1**, and **Operator 2**: every admin page, the operator surfaces, the read-only browse surfaces, console-error capture, network inspection, and the identity/session probes that surfaced UR-003.
- **Document reconciliation** against the PRD v2 + addendum, the consolidated tracker, the QA staging-issues log, the feedback register, and the Session-11 handoff.

**Honest limits of the live pass:** (a) Active Deployments was **0** on staging, so live end-to-end deployment/transfer flows could not be exercised against real data — those are covered instead by the code-level review and the prior QA log. (b) The browser-automation harness intermittently failed to deliver synthetic clicks/keystrokes to the MUI app (form fields and some nav links didn't register), so a few interactive paths — notably the operator nav's footer buttons — **could not be reliably exercised**; where that happened I have **not** asserted a defect (see §4.4). This is called out so you can trust the findings that *are* asserted.

---

## 3. State of the app, by layer

### 3.1 Data layer & migrations — _mostly sound, one Critical bug_

The schema is coherent, all raw SQL is uniformly parameterized (tagged templates + `Prisma.join()`; **zero** `$queryRawUnsafe`/`$executeRawUnsafe` — no injection surface), and the concurrency primitives are correct.

- 🔴 **UR-001 (Critical):** Bulk consumable return (`deployments/[id]/items/route.ts:339-348`) restores `InventoryItem.quantity` (cross-hub total) but never calls `restoreToHub`, while the two sibling return paths (`end/route.ts:101`, `items/[kitItemId]/route.ts:119`) both do. Result: `SUM(per-hub stock) < item total` drifts after every bulk return, falsely firing per-hub low-stock alerts and under-reporting hub availability. **Verified.**
- 🟠 **UR-002 (High):** The `#29` legacy-column retirement (`rigs.operatorId/projectId/rig_operators` → `deployment_assignments/deployment_projects`) is in a **consistent but half-migrated dual-write state** — safe to run today, but slice 4 (the irreversible column drop) must stay gated behind the plan's compile-against-pruned-schema gate, precheck, and a Supabase snapshot, and must not run until the one-active-PRIMARY partial unique index lands. This is the single largest piece of "in-flight" structural debt.
- 🟡 **UR-009 (Medium):** Missing indexes on heavily-filtered FK/status columns of `MaintenanceTask`, `Alert`, and `Photo` — fine at pilot volume, degrades as rows accrue (the dispatch cron re-scans `Alert` every run).
- 🟡 **UR-010 (Medium):** R4 hard-reserve releases stock at *fulfill* but the draw happens later at *checkout*, leaving a window where a competing checkout can take "reserved + fulfilled" stock — a real consumable race to UX-handle.
- 🟡 **UR-011 (Medium):** Raw-SQL readers for the new tables are **type-decoupled** from the schema — a future column rename breaks them only at runtime (`tsc` won't catch it). Migrate them to the typed client (the models exist) or add an integration test before Phase 3.
- ⚪ **UR-012/013 (Low):** Dead `EquipmentStatus.IN_TRANSIT` enum value (defined, never written), and two migration folders share the identical timestamp `20260625060000` (deterministic today, latent footgun). The empty `sprint7_schema_gaps` migration is a harmless historical marker of a past `db push`.

**Positives to preserve:** idempotency keys (body-hash-bound, TOCTOU-guarded), invite + status-link tokens hashed at rest, QR-on-retire is collision-free, `drawFromHub`/`reserveAtHub` are race-safe guarded updates.

### 3.2 API, auth & security — _production-grade core, a short hardening tail_

Every route under `src/app/api/**` was enumerated and its auth requirement verified **server-side** (the full map is in the register). **No route is missing its check.** Operator read-only (#102) is genuinely enforced by `requireAdmin` on writes, not just hidden in the UI.

- 🟠 **UR-004 (High):** `mustChangePin` is enforced **client-side only** (`PinChangeGate.tsx` redirect); no operator mutation route checks it. A forced PIN reset is cosmetic against a direct API caller. Add a `requireAuthActive()` guard returning 403 on mutations when `mustChangePin` is true (exempt `change-pin` + `me`).
- 🟡 **UR-005 (Medium):** Equipment photos upload to a **public** Supabase bucket (`uploads/route.ts:45`, `getPublicUrl`) with **client-trusted MIME** (`file.type` only). Damage/serial/site imagery is world-readable via enumerable URLs (and embedded into external shop status links), and an SVG mislabeled `image/png` is a stored-XSS vector on the storage origin. This is the tracked O1/S6 item — close before prod with a private bucket + signed URLs + magic-byte sniffing.
- ⚪ **UR-014 (Low):** CSP is enforcing but retains `'unsafe-inline'`/`'unsafe-eval'` on `script-src` (nonce-strict is the tracked follow-up). Cron `run()` is exposed on GET as well as POST (auth is solid either way).

**Resolved debt confirmed in code (no longer issues):** guessable/unthrottled invite tokens, mass-assignment on admin edits, the duplicate transfer handler, the in-memory rate limiter, and the blind-XFF trust are all **fixed**. The change-PIN endpoint the older docs doubted **exists and works**.

### 3.3 Operator frontend & PWA / offline — _the real risk surface_

The offline plumbing that is wired is well-engineered (idempotent `mutate`, retry/terminal handling, `navigator.storage.persist()` against iOS eviction, an offline photo store with safe partial-batch replay, transfers correctly blocked-with-message offline). The #418 hydration "dead button" class of bug is **genuinely fixed** (consistent `mounted`-gating). But the most important offline flow is broken:

- 🟠 **UR-006 (High):** Creating a deployment offline is **lost** — `NewDeploymentDialog.launch` (`my-rig/page.tsx:281`) uses raw `fetch`, not the queue; and the dependent-write id-remap (`offline-remap.ts`) is **never invoked** by any production caller (`placeholderId` appears only in the lib, the hook, and its unit test). **Verified.** The PRD's flagship "create → add items offline → replay" cannot work.
- 🟡 **UR-007 (Medium):** Daily-check submit (`daily-check/page.tsx:108-141`) also bypasses the durable queue, queues **only** on a thrown network error (not on a 5xx), and carries **no idempotency key** — so the compliance-gating daily check can be silently lost on a 5xx or **double-submitted** on replay.
- 🟡 **UR-008 (Medium ×3 — A6 ergonomics):** No bottom-nav tab bar (hamburger drawer only), missing iOS `safe-area-inset` padding in the app shell despite `viewport-fit: cover` (notch/home-indicator clipping in the installed PWA), and a silent `skipWaiting: true` service worker with no "update available" prompt (controller can swap under an operator mid-form).
- ⚪ **UR-015 (Low):** Sub-44px touch targets on per-item actions / daily-check toggles / photo controls; residual duplication (three jsQR capture copies, two kit/unit pickers, one inline condition `<select>` that bypasses the shared `ConditionSelect`).

### 3.4 Admin frontend & presentation layer — _functionally done; consistency sweep outstanding_

Live-confirmed: **no stubs, no dead links, every admin page real and wired.** The hard M2 work is effectively complete. What remains is the "load-bearing consistency" the roadmap (M1/Wave C) flagged:

- 🟡 **UR-017 (Medium):** Toast unification is **half-done** — Users, Settings, Hubs, and Deployments still use ad-hoc `setToast` + top-of-page `<Alert>` + `setTimeout`, diverging from the shared bottom-center `useToast` Snackbar used by Inventory/Requests/Maintenance/Projects. (Roadmap M1 #6.)
- 🟡 **UR-018 (Medium):** The **"My Rig" → "My Deployment"** rename (roadmap M1 #8) is **not started**; "Rig" also leaks into the admin Deployments drawer ("No vehicles in this rig," etc.). Operators see "My Rig," admins see "Deployments" — a vocabulary split for new contractors.
- 🟡 **UR-019 (Medium):** A **third** ad-hoc equipment-condition picker (`deployments/page.tsx:996-1000`) hardcodes GOOD/IN_MAINTENANCE/INOPERABLE instead of the shared `ConditionSelect` — the last instance of the roadmap's "three condition UIs."
- ⚪ **UR-020 (Low):** Two of seven dashboard StatCards aren't clickable; loading state is `Skeleton` on some pages and `CircularProgress` on others; admin tables are desktop-first (P3 admin-mobile item). None blocking.

**Already unified (preserve):** `TransferDialog`, `DispositionDialog`, `RepairReviewDialog`, `ConfirmDialog`, `KitItemSelectRow`, and `lib/status` + `StatusChip` are shared and consumed correctly.

### 3.5 Code quality, infra & hygiene — _clean, with one infra skew_

- 🟡 **UR-016 (Medium):** **Node runtime skew** — Dockerfile builds/runs on `node:24-alpine`, CI validates on Node 22, and there is no `engines` pin. A green pipeline does not guarantee the Node-24 prod build behaves identically. Align them and pin `engines` before prod.
- ⚪ **UR-022 (Low):** Small, safe dead-code surface — `lib/shipments.ts` (intentional Shippo groundwork, currently unused), 7 unused email templates, several superseded `deployment-assignments` exports, dead `utils.ts`/`types` exports, and 5 unused deps (`iron-session`, `@emotion/cache`, `@emotion/server`, `@mui/x-data-grid`, `html5-qrcode`). A ~30-minute cleanup that shrinks the bundle without touching functionality.
- ⚪ **UR-023 (Low):** Test-coverage gaps on the **highest-value untested surfaces** — the tokenized `/s/[token]` external endpoints, `rate-limit`, `idempotency`, the `proxy.ts` auth gateway, and email-escaping. Strong coverage elsewhere (auth/PIN, stock math, offline replay, transfers).
- ⚪ **UR-024 (Low):** ~34 `AHITS_*.md` docs at repo root with contradictory status baselines; a `docs/archive/` exists but the root pile hasn't been swept into it. `.deploy-marker` is a committed churning artifact. (Process hygiene; the roadmap §4 already calls for this.)

---

## 4. Live walkthrough — what the running app actually does

### 4.1 Admin (`ops@agricarbon.com`)

Logged in cleanly to a fully-populated dashboard (Active Vehicles 13, In Maintenance 1, operational feeds rendering). Walked all 11 surfaces:

| Page | Result |
|---|---|
| **Dashboard** | Real. Stat cards, pinned-alert capability, feeds (missed checks, maint ≤14d, long-running, maint watch). |
| **Reports** | **Real** — full Equipment Cost & Utilization report: From/To filter, ALL/VEHICLES/UNITS toggle, KPI cards (Maint Spend, Events, Avg Utilization, Downtime, **Tracked Assets 79**), sortable per-asset table, **Export CSV**. |
| **Vehicles** | **Real** — fleet grouped by type, Search/Type/Status/Hub/Project filters, insurance/registration columns, Checks/Maint counts, Add Vehicle. |
| **Projects** | **Real** — CRUD list (Smith Ranch Baseline Survey), edit/delete, Add Project. |
| **Inventory** | Real — All/Consumables/Serialized, Category/Hub/Operator/Project filters, grouped, Available/Out/Total, edit/retire, low-stock warning icon. |
| **Maintenance** | Real — **"Inoperable units — needs review (2)"** banner with Send-for-repair/Retire (the previously-buried review, now surfaced); Damage Reports / Overdue / In Progress / Completed / All tabs; work-order "Sent" chip. |
| **Hubs** | Real — Hubs + **Inbound(1)** tabs, Add Hub, edit/delete. _Email column empty → hub-email delivery not wired (matches F2/Shippo backlog)._ |
| **Requests** | Real — Active/Closed, Type/Status/Hub/Requester filters, empty state. |
| **Users** | Real — 3 members, **Activity (audit-log) viewer present**, Invite Member, edit/deactivate. |
| **Settings** | Real — notification config (daily-check cutoff 6:00 PM + 6 alert toggles), Daily-Check Checklists with "built-in 16-item default." |

**Zero application console errors** across the entire admin pass (only two warnings, both from a MetaMask browser extension, not the app).

> Note the **16-item default** claim in Settings sits against the QA log's observation of a condensed **9-item** operator checklist (roadmap M5 lists the full 16-item list as an open gap). Worth a definitive reconcile — see UR-025.

### 4.2 Operator (read-only browse)

Operator 1 logged in to the "AHITS Field" shell: operator nav (Daily Check, My Rig, Scan QR, Requests) **plus** a "Browse (view only)" section exposing Dashboard/Inventory/Deployments/Maintenance/Hubs/Projects/Vehicles. Navigating to `/admin/inventory` as the operator rendered the page with a **"View only" chip, no Add Item button, an empty Actions column**, and the non-admin header — i.e. #102 read-only works in the UI, and the API agent confirmed the writes are server-gated. My Rig (clean "No active deployment" CTA), Requests (tabs + New Request + empty state), and Daily Check (3-step wizard) all rendered correctly. The operator notification bell carried an unread badge — the operator notification center is wired.

### 4.3 Cross-cutting live findings (new this session)

- 🟠 **UR-003 (High) — identity cached across logins.** After sign-out + re-login in the same tab, the operator dashboard greeted **"Good evening, Ops"** with footer **"Ops Admin"** (the *previous* admin user) while `/api/auth/me` correctly returned `Field Op 1`; a hard reload corrected it to "Field Op 1." Root cause in `useAuth.ts`: `useSWR('/api/auth/me')` is never invalidated on login/logout, so the prior user's identity is served from cache until the SWR key revalidates. On a shared field tablet, operator B sees operator A's name (and could act believing they're the right user). **Fix:** call SWR `mutate('/api/auth/me')` (or clear cache) inside `logout` and after a successful login.
- 🟡 **UR-026 (Medium) — daily-check date defaults to tomorrow.** With the device clock at the evening of **June 25**, the Daily Check date field defaulted to **06/26/2026** — the UTC-midnight date-default bug (the CR-15 timezone family). An operator submitting "today's" check stamps tomorrow's date, breaking the on-time/missed-check accounting.
- ⚪ **UR-027 (Low) — `/login` doesn't redirect an authenticated user.** Navigating to `/login` while already signed in renders the login form instead of bouncing to the dashboard. Minor, but combined with UR-003 it muddies session handoff on shared devices.

### 4.4 Explicitly **not** asserted (tooling-limited)

The operator nav's footer **"Sign out"** and **"Change PIN"** buttons did not respond to automated clicks, and no `/api/auth/logout` request fired. **However**, the same harness intermittently failed to deliver clicks/keystrokes elsewhere on this MUI app (form fields, some nav links), there were **no console errors**, and the `logout` handler is standard shared code identical to the Admin one (which did work). I therefore treat the operator sign-out as **unverified by automation, not confirmed broken** — it warrants a 30-second manual human check on a real device, but I will not record it as a defect on this evidence.

---

## 5. Roadmap reconciliation & the production question

### 5.1 Where the app actually is vs. the roadmap

The Session-11 handoff is accurate: the day-of-use feedback (F1–F10, S1–S6), the Requests/hub workstream, multi-hub inventory, grouped checklists, hub-address/Shippo groundwork, org-wide operator read-only, and the A2 migrate-on-deploy automation are all merged and live. The one named remaining build item — **#29 slice 3c → 4** (legacy-column retirement) — is correctly **not yet started** and correctly gated (UR-002). The pilot gate the handoff names — **A6 real-device offline pass** — is still open, and this review adds three concrete things the A6 pass must catch: UR-006 (offline create), UR-007 (daily-check queue), and UR-008 (safe-area/bottom-nav/SW-prompt).

**Net:** the roadmap's *forward* sequence is sound and this review does not redirect it. What it does is surface **correctness/consistency defects inside already-"done" work** — which is exactly the "turn it inside out before Phase 3" goal.

### 5.2 The unresolved contradiction you must settle (UR-021)

The single biggest strategic risk is a **documented contradiction about what "production" is**:

- `AHITS_ROADMAP_THROUGH_PHASE3.md` (Session 7), milestone **M0**, gate #1: _"Production database standup + per-env secrets (PIPE-2) … provision a separate Supabase prod project, create the eleven `AHITS_PROD_*` secrets … first development→production promotion, verify isolation. This is the pilot line."_
- `AHITS_SESSION11_HANDOFF.md` (Session 11), §2: _"**ONE environment.** … No separate production; do **NOT** create `AHITS_PROD_*` secrets or deploy the `production` branch. (`AHITS_PROD_STANDUP_CHECKLIST.md` is shelved.)"_

These cannot both hold when "entering production." **This is a human decision, not something to infer.** The trade-off:

- **Promote the single env to prod-grade** (the Session-11 direction): cheapest, but **staging == production** — no data isolation, test actions hit the same DB real operators use, and the earlier staging-outage class of risk (a `db push` against the shared DB) recurs with real stakes. The data-layer review also flags that, on a single env, you should *verify* `_prisma_migrations` matches the migration folder set with no `db push` drift before declaring it prod (the `IF NOT EXISTS` guards can mask divergence).
- **Execute the prod-standup runbook** (the Session-7 direction): real isolation and the safer answer for "money/assets," but it's the shelved `AHITS_PIPE2_PROD_DB_RUNBOOK.md` work plus per-env secret ceremony.

Until this is chosen and one of the two docs is retired, "Phase 3 and production" has no defined finish line. **Recommendation:** if real customer equipment/money will flow, do the standup; if this remains an internal pilot tool, promote-in-place is defensible — but write the decision down and delete the losing doc so the next session isn't whipsawed.

### 5.3 Governance hygiene (process, not product)

The product is healthier than the paper trail. ~34 root `.md` docs carry contradictory status baselines (Session 6 tracker says "Reports is a stub"; the live app says it's done). Sweep completed session records/scripts into `docs/archive/`, freeze the PRD as spec, keep the Session-11 handoff + roadmap + this review as the live set, and update `CLAUDE.md §3` (still describing the old manual `make db-migrate`). This is the recurring "delivery process is the real risk" theme from the consolidated tracker, and it's cheap insurance against re-litigating settled work.

---

## 6. Cross-platform & connectivity assessment

You asked specifically about desktop / Android / iOS / installed-app / offline. Summary:

- **Desktop & Android Chrome:** the strongest case. QR uses `<input capture>` (not `getUserMedia`), so it works on both; the permanent sidebar and dialogs are fine on desktop. No platform-specific defects found here.
- **iOS Safari / installed PWA:** the weak spot. `viewport-fit: cover` is set but the app shell lacks `safe-area-inset` padding (UR-008) → notch/home-indicator clipping in standalone mode; iOS is also the platform most prone to silent IndexedDB eviction, which the offline queue partially defends (`storage.persist()`) but the freshness/outbox UI to make eviction *visible* is still absent (roadmap M1). Web Push for "push is primary" remains parked.
- **Offline (any platform):** the durable queue is good where used, but the two flows that matter most for field work are gaps — **UR-006** (offline deployment create is lost) and **UR-007** (daily-check not durably queued, no idempotency). These, plus the silent `skipWaiting` SW (UR-008), are precisely what the still-open **A6 real-device pass** must stress before any operator relies on the app without signal.

---

## 7. Prioritized action plan

**Before pilot (real operators on the single env):**

1. UR-001 — fix bulk consumable-return per-hub restore (Critical; one-branch change + widen the `kitItem` select).
2. UR-004 — server-side `mustChangePin` gate (High).
3. UR-006 — route offline deployment-create through the queue + wire `placeholderId` (High).
4. UR-007 — route daily-check through `mutate` with an idempotency key (Medium, but compliance-critical).
5. Run the **A6 real-device offline pass** on real iOS + Android, deliberately stressing UR-006/007/008 and UR-026.

**Before production (money/assets):**

6. **UR-021 — decide and document what "production" is** (blocks the cutover).
7. UR-003 — invalidate the auth SWR cache on login/logout (High; shared-device privacy).
8. UR-005 — private photo bucket + signed URLs + magic-byte validation (Medium-High).
9. UR-016 — align Node runtime + pin `engines` (Medium).
10. UR-009 — add the missing FK/status indexes (Medium; scale).

**M1 consistency sweep (do before building Phase-3 screens):**

11. UR-017 toast unification · UR-018 "My Rig → My Deployment" rename · UR-019 the third condition picker · UR-008 bottom-nav + safe-area + SW-update prompt.

**Hygiene (anytime, low-risk):**

12. UR-022 dead-code/dep cleanup · UR-023 tests for tokenized links + proxy + rate-limit · UR-024 doc archive + `CLAUDE.md §3` · UR-002 keep slice-4 gated.

**Then** the Phase-3 capstones in the roadmap's order (Map → no-app QR form → Time/Invoicing), with the React Native wrapper de-scoped in favor of Web Push unless proven necessary.

---

## 8. Bottom line

This is a well-built application that its own documentation undersells. The engineering discipline — auth, idempotency, race-safe stock math, type hygiene, CI gating, the genuinely-finished admin surfaces — is the hard part, and it's largely done and done well. What stands between AHITS and Phase 3 is **not a long build**; it's a **short, specific list of correctness and safety fixes** (one Critical, a handful of High), a **session/identity bug only a live pass would catch**, and **one strategic decision about what production means** that only you can make. Fix the five in §1.3, run the A6 pass, settle the environment question, and the consistency sweep + capstones become a clean runway rather than building on drift.

_Full finding-by-finding detail, severities, locations, fixes, and roadmap mapping are in the companion **`AHITS_ULTRA_REVIEW_ISSUE_REGISTER.xlsx`**._
