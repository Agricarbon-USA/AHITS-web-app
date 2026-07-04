# AHITS — Phase 3 Workplan v2 · State-of-the-App Review & Build Plan

_Prepared 2026-07-02 (finalized 2026-07-03). **This document supersedes `AHITS_PHASE3_DETAILED_WORKPLAN.md` (2026-06-30).** The prior plan remains valid history and is quoted where still accurate; every place this review disagrees with it is flagged with **[Δ v1]**. This is the canonical Phase-3 entry document._

---

## 0. How this was produced & how to read it

**Production.** This review ran, in parallel, eight specialist deep-audits of the codebase at git HEAD `b66c1af` on `development` — (1) docs/PRD/history reconciliation, (2) data-model & API, (3) operator frontend, (4) admin frontend & external recipients, (5) security & auth, (6) code-quality with a full toolchain run in a sandbox copy, (7) infra/CI-CD/release, plus (8) a first-hand live walkthrough of `ahits-web-app-staging` as **Admin, Operator 1, and Operator 2**. Every load-bearing claim was re-checked against source with `file:line` evidence; several v1 claims were confirmed, a few were corrected, and this round surfaced **new** issues the v1 audit did not (notably a live admin crash reproduced by ending a deployment, a broken bulk-invite path, and a consumable-stock leak across transfers).

**Reconciliation rule (unchanged).** Where docs and reality disagree, **live + git HEAD win** and the drift is flagged.

**Fresh ID namespace.** The project has accumulated four overlapping ID schemes (UR-#, B#/H-/M-/C#, Wave 0/1/2A–D, A–H, M0–M6). To stop the collisions the docs audit flagged, this plan mints one namespace and freezes the rest as aliases:

- **`SOA-#`** — state-of-app facts (§3).
- **`FND-#`** — findings in the consolidated register (§5), severity-tagged, each carrying its v1 alias (e.g. `FND-12 [=B2/M-DATA3]`).
- **`W0-#`** — revised Wave-0 items (§6).
- **`P3-*`** — Phase-3 capstone/feature items, carried verbatim from the PRD contract (§9) so coverage is provable.
- **`CARRY-#`** — long-standing PRD promises no prior plan ever adjudicated (§9.2).

Read §1 → §3 → §5 → §6 first if you have ten minutes. Read the whole thing before writing Phase-3 feature code.

---

## 1. Executive summary — state of the app entering Phase 3

**The product is genuinely strong and close to a pilot, and it is in better shape than the accumulated docs imply — but it is not as "green" as the June-30 plan concluded.** Phase 1 and Phase 2 are functionally complete under the agreed descopes; the admin surface is broad and polished; the operator loop works end-to-end; auth, the tokenized external-link primitive, and the durable offline queue are production-grade; and the toolchain is clean (0 TypeScript errors, 0 ESLint errors, build passes, zero `TODO`/`any`/`@ts-ignore` across ~27k LOC). That much v1 got right and this review confirms.

**What v1 under-weighted, and this review makes explicit:**

1. **A routine admin action still crashes the app — reproduced live this session.** Ending a deployment throws the whole admin Deployments page to the error boundary (`TypeError: Cannot read properties of null (reading 'id')`). The June-30 "B1 fix" (#128) fixed the ended-deployments *list*, but not the single-rig `GET /api/deployments/[id]` that the drawer refetches on End — so the crash simply moved. The end succeeds server-side (no data loss), but the operator/admin sees a dead page. **A minimal fix is written, verified (`tsc` clean), and staged on a branch this session** (§16).
2. **Two data-integrity bugs the v1 audit did not catch.** (a) **Bulk invites are broken *and* store raw account-minting tokens in plaintext** — the bulk path saves an unhashed token while validation hashes before lookup, so every bulk invite link 404s and the DB holds live secrets at rest. (b) **Consumable stock leaks across the transfer lifecycle** — `drawnQuantity`/`drawnHubId` aren't carried onto the destination kit item, so returning a transferred consumable restores `min(qty, 0) = 0` and the stock drawn at checkout is permanently lost from inventory. Both are High and both threaten the numbers Phase-3 invoicing/analytics will bill and report on.
3. **The three security branches are still unmerged** (CSP nonce, PIN-hardening, upload rate-limits), and one of them fixes a **real brute-force hole at HEAD**: the PIN lockout counter is non-atomic, so parallel guesses can outrun the 5-attempt lockout. All three are merge-clean; land PIN-hardening first.
4. **A latent release-safety defect will bite the first prod promotion:** `make cloud-run-migrate` hardcodes the *staging* migration secret, so merging to `production` would migrate **staging** and serve prod against an unmigrated schema. Plus `EMAIL_SANDBOX` is coded but **not mounted** on staging, so staging can still email real shops/hubs today.
5. **The pilot gate is unchanged and still open:** the **A6 real-device offline pass** has never been run on real hardware since the offline-nav fix landed. It is now a **22-row × 5-target** matrix (v1 said 18). It remains the single thing between today and a real-operator pilot.

**The most valuable pre-Phase-3 work (revised Wave 0):** run A6; fix the live crash (done, pending your push); land the three security branches; fix the bulk-invite token and the consumable-transfer leak; correct the migrate-secret + `EMAIL_SANDBOX` release bugs; fix the UTC/timezone "business-date" split-brain (observed live — a daily check submitted at 11:49 pm Central was dated *tomorrow*); and put the shared API/data hygiene in place so ~25 new Phase-3 routes don't copy today's gaps. Then build **Map → No-app QR → Time/Invoicing** on a clean base, gated by the legacy-column retirement (invoicing attribution) and email reliability (the invoice email).

**Bottom line [Δ v1]:** v1's sequencing (Wave 0 → Map → QR → Invoicing) is correct and retained. What changes is the **contents and weight of Wave 0**: it is larger than v1 implied, because the live crash, the two new data bugs, the still-unmerged security branches, and the release-safety defects are all must-fix, and several v1 "done" items were only half-done.

---

## 2. Methodology & evidence base

| Stream | Scope | Key output |
|---|---|---|
| Docs/PRD/history | All ~40 `AHITS_*.md`, PRD v2 + Addendum (frozen spec), the `.xlsx` register, `docs/archive/*` | PRD Phase-3 contract (§9), open-items ledger, 6 documented contradictions, doc-hygiene plan |
| Data-model & API | `schema.prisma`, 40 migrations, all 80 `/api` handlers + libs | Route table, Wave-0 delta-verification, new stock/invite/tz findings, Phase-3 schema readiness |
| Operator frontend | `(operator)/**`, `useOfflineQueue`, `sw.ts`, storage-health | Offline capability matrix, reconnect/JWT queue findings, rename inventory, monolith map |
| Admin frontend + external | `(admin)/**`, `/s/[token]`, email templates, dispatcher | Per-page inventory, B1-drawer residual, bare-"Item"/duplicate-row root causes, external-recipient audit, notification matrix |
| Security & auth | `proxy.ts`, auth libs, public surface, headers, secrets | Branch merge-readiness, authz matrix, PIN-lockout/CSP/idempotency/cost-leak findings |
| Code quality (ran toolchain) | Sandbox copy: `npm ci`, `tsc`, `eslint`, `vitest`, `next build` | Green toolchain confirmed; ~350–400 LOC dead code; duplication/envelope/test-gap inventory |
| Infra / CI-CD / release | 4 workflows, Dockerfile, Makefile, runbooks | Migrate-secret CRITICAL, `EMAIL_SANDBOX` unmounted, PR-preview gaps, no error tracking, migrate-on-deploy design |
| Live walkthrough | Staging as Admin + Op1 + Op2 | **Reproduced the ended-deployment crash**; hub-inbound growth 13→15; bare-"Item" ×4; both hubs email-less; UTC-date bug live; rename cosmetic-only confirmed |

Evidence is `file:line` or a live observation throughout. Console was clean across every screen except a pre-existing benign React #418 hydration warning and the reproduced crash.

---

## 3. Verified state since Wave 0 (delta vs the June-30 plan)

### 3.1 What actually merged to `development` (confirmed at HEAD `b66c1af`)

`SOA-1.` Wave-0 PRs **#128–#136 + #140** are merged and verified against source: B1 list-fix + B3 rig-less transfer + pagination clamp (#128); `EMAIL_SANDBOX` guard code (#129); `writeOr404` P2025→404 (#130/#132); `DAILY_CHECK_MISSED` alert + `APP_TIMEZONE` cron fix (#131/#133); 14 indexes across 9 models (#134, PR title said 13); dead-dep + `ADMIN_EMAIL`-mapping removal (#135); C1 offline queued-state (#136); H-OFF1 storage-safety module + banners (#140). **[Δ v1]** the index count is **14** not 13, and `EMAIL_SANDBOX` is code-only (see `SOA-6`).

### 3.2 Still open that v1 said were open — confirmed still open

`SOA-2.` **Legacy-column retirement (H-DB1): zero progress, and slightly deepened.** `Rig.operatorId` is still `NOT NULL`, `rig_operators` + `Vehicle.assignedOperatorId` still live, still dual-written by ~8 writers, still read by every ownership check + cron + feeds. No one-active-PRIMARY partial-unique index; **no `DROP COLUMN` migration exists.** The B1 fix (#128) and the crash fix this session both *add* a legacy-column read (fallback hydration), so the retirement now additionally requires an assignment-history roster for ended rigs before the column can drop. **This is the single largest data risk and the hard prerequisite for invoicing attribution.**

`SOA-3.` **Still open, confirmed:** H-API2 (maintenance GET runs a `createAlert` loop on every read), H-API3 (reports/equipment aggregates the whole fleet in JS), H-NOTIF1 (email failures swallowed, no retry/log), M-API3 (hubs/categories hand-rolled validation), M-OFF1 (`Date.now()` idempotency key on `/s/[token]`), and the migration-hygiene tail (duplicate timestamp `20260625060000_*`, empty `sprint7_schema_gaps`).

### 3.3 v1 "done/won" claims this review corrects

`SOA-4. [Δ v1]` **B1 is only half-fixed.** #128 fixed the ended-deployments *list*; `GET /api/deployments/[id]` still returns `operator: null`, so ending a deployment crashes the admin page (reproduced live, §4). Fix staged this session (§16, `FND-1`).

`SOA-5. [Δ v1]` **The three security branches are still unmerged** (`csp-nonce`, `pin-hardening`, `rate-limit-uploads-photos`). v1's own §6.1 next-session queue listed them; they did not land. All three are 1 commit behind `development` and **merge-clean**. `pin-hardening` fixes a real atomic-counter brute-force hole at HEAD — land it first.

`SOA-6. [Δ v1]` **`EMAIL_SANDBOX` is inert on staging.** The guard code merged (#129), but the variable is **not** in the Makefile `--set-secrets`/`--set-env-vars`, and `--set-env-vars` *replaces* the env set on each deploy — so even a console-set flag is wiped next deploy. Staging can email real shops/hubs today. Both staging hubs happen to have no email, which is the only reason nothing has fired.

`SOA-7. [Δ v1]` **M-UX2 rename is cosmetic-only — confirmed live.** The page title and nav read "My Deployment," but the route is still `/operator/my-rig`, the component is `MyRigPage`, the bottom tab says "Deploy" (a third name), and six API routes persist notification deep-links to `/operator/my-rig`. Any Phase-3 Map deep-link must wait for the real rename + a permanent redirect.

`SOA-8.` **A6 device pass:** unrun; matrix is now **22 rows × 5 targets** (v1 said 18 — rows 19–22 were added for C1/#136 and H-OFF1/#140). Still the pilot gate.

### 3.4 Architecture health (verified this round)

`SOA-9.` Next.js 16.2.9 (App Router; middleware is `src/proxy.ts`), React 19, MUI v6, Prisma 5.22, Supabase, Serwist PWA. Sandbox toolchain run: **`tsc` 0 errors; ESLint 0 errors / 32 warnings** (all one deliberately-downgraded `set-state-in-effect` rule; v1 said 33 — one was fixed); **`next build` passes** (63/63 static pages); **all runnable unit suites pass** (24 DB-free tests green; 17 suites need Postgres and run in CI against a `postgres:16` service). Hygiene: **0** `TODO`/`FIXME`, **0** `@ts-ignore`, effectively **0** `any`, 3 scoped `eslint-disable`. This is an unusually disciplined pre-pilot codebase — the debt is architectural and localized, not sloppy.

---

## 4. Live walkthrough — what was exercised and seen (staging, this session)

Full interaction as all three logins. Highlights:

**Confirmed working:** admin dashboard feeds + clickable stat cards + 90-day maintenance-spend nudge; the **"Show ended" deployments list renders correctly** (B1 list-fix live-confirmed — operator names intact, no crash); ended-deployment drawer shows team + full check-in/out history; Reports cost/utilization scoreboard (83 tracked assets); Users/Team, Settings (16-item default checklist note, alert toggles incl. Daily-check-missed, 6 pm cutoff), Maintenance inoperable-review + damage tabs; the full operator loop — phone-first dashboard, daily-check stepper, **My Deployment** (vehicles + kit + transfer/hand-off/end), Requests, Scan, Change PIN; the live **Op1→Op2 pending transfer**.

**Reproduced live (new or sharpened this round):**

`SOA-10.` **Ending a deployment crashes the admin page.** Opened an active deployment's drawer → End Deployment → chose destination hub → confirmed. The end **succeeded server-side** (list dropped from 2 active to 1 on reload), but the client threw straight to the "This page couldn't load" error boundary: `TypeError: Cannot read properties of null (reading 'id')` in an `Array.filter` on the deployments page. Root cause = `SOA-4`. This is a **High**, high-frequency, user-facing break. → `FND-1`.

`SOA-11.` **Hub Inbound has grown 13 → 15 "awaiting receipt" rows**, and **Garmin Glo2 01 appears twice** — the no-dedupe/no-expiry accumulation is happening in real time. Both staging hubs have **no email**, and the Inbound tab has **no** mark-received / copy-link / dismiss control, so these rows can never clear. → `FND-9`, `FND-10`.

`SOA-12.` **Bare "Item" request lines confirmed live** — the "Peter picking up etc" reservation shows 4 lines rendered as a bare "Item" with "Requested ×1" and no name. → `FND-11`.

`SOA-13.` **UTC "business-date" split-brain confirmed live.** At ~11:49 pm America/Chicago on Jul 2, the Daily Check date field pre-filled **07/03/2026** (tomorrow) — the client builds the date via `toISOString()` (UTC), while the missed-check cron matches Central-time dates. A check submitted in that evening window is stored under tomorrow's date and can trigger a false "missed" alert. → `FND-7`.

`SOA-14.` **Consumable accounting smell, visible in the UI:** "Cardboard Box (16x12x6)" shows **×74 in an operator kit** while admin Inventory shows **0 available / 0 total** for it — consistent with the drawn-quantity leak (`FND-2`) and the low-inventory alert firing on it.

**Not testable via this tooling (defer to A6 / on-device):** true offline behavior, camera QR scan, and true ≤430 px width (the automation window floors well above phone width). Exactly the A6 concerns.

---

## 5. Consolidated findings register (severity-ranked)

Each finding: **ID [aliases] · severity · one-line evidence · fix pointer.** "New" = surfaced this round, not in v1.

### 5.1 Critical / High (fix in Wave 0)

`FND-1 [=SOA-4/SOA-10; extends v1 B1] · HIGH · NEW manifestation.` Ending a deployment crashes the admin page; `GET /api/deployments/[id]:92` returns `operator:null` for ended rigs (roster reads open assignments only), and the drawer/page dereference `.operator.id/.name` on refetch. **Fix staged this session** (hydrate operator from legacy `Rig.operatorId`, mirroring #128) — §16. Follow-up: also add client optional-chaining as belt-and-suspenders, and fold into the `SOA-2` roster work so ended attribution is correct not just non-crashing.

`FND-2 · HIGH · NEW.` **Consumable stock leaks across transfers.** `transfers/[id]/accept/route.ts:169-176` creates the destination kit item with `drawnQuantity:0`, no `drawnHubId`; on later return every path restores `min(qty, drawnQuantity=0)=0` (`items/route.ts:362`, `[kitItemId]:104-126`, `end:112-118`) → stock drawn at checkout is **permanently lost** from `inventory_stock` and `inventory_items.quantity`. Partial-transfer `end` conversely restores the **full** original `drawnQuantity` uncapped → over-credit. Decline of an ended-rig transfer never restores hub stock at all. **Fix:** carry `drawnQuantity`/`drawnHubId` (split proportionally) onto the destination kit item at accept and decrement the source, mirroring the correct `[kitItemId]` DELETE path. Add regression tests. **Gate for invoicing/analytics** (they will bill/report against these balances).

`FND-3 · HIGH · NEW.` **Bulk invites are broken and store raw tokens at rest.** `users/bulk/route.ts:42` persists an **unhashed** `randomBytes(32)` token and emails it, but validate/complete hash before lookup (`invite-token.ts:14-16`) → every bulk-invite link 404s **and** the DB holds live account-minting secrets in plaintext (violates the hashing posture the single-invite flow follows). **Fix:** use `generateInviteToken()`/`hashInviteToken()` exactly as `users/invite/route.ts:54-64`. (Also relevant to Phase-3 contractor self-onboarding, which will lean on invites.)

`FND-4 [=v1 H-1 / pin-hardening branch] · HIGH.` **PIN lockout counter is non-atomic** — `lib/auth/pin.ts:30` computes `failedPinAttempts + 1` from a stale read; parallel wrong guesses under-count and can outrun the 5-attempt lockout. **Fix:** merge the `pin-hardening` branch (atomic `{increment:1}` + trivial-PIN rejection at set-time). **Land first — clean, no caveat.**

`FND-5 [=v1 M-SEC1 / csp-nonce branch] · HIGH.` `script-src` allows `'unsafe-inline' 'unsafe-eval'` (`next.config.ts:31`). Must close before the public No-app QR form widens the anonymous surface. **Fix:** merge `csp-nonce` **after** a staging smoke-test (it forces dynamic rendering + must play with the Serwist SW bootstrap and MUI/Emotion; v1's own record shows a login-hydration regression it already had to patch).

`FND-6 [=v1 M-OFF1/H-3; new severity] · HIGH.` **Public `/s/[token]` line-actions bypass link state + idempotency.** (a) `api/s/[token]/transition/route.ts:45-78` routes on `body.lineId` **before** `isLinkActionable` runs and joins on `tokenHash` with no state/expiry predicate → a **revoked or expired** reservation link can still confirm/edit/deny lines (defeating the "resend revokes the old link" guarantee). (b) Idempotency keys embed `Date.now()` (`s/[token]/page.tsx:100,158,174`) → double-taps generate fresh keys, so `withIdempotency` never dedupes public back-writes. **Fix:** resolve+`isLinkActionable`-gate line actions; key idempotency on stable content. **Prerequisite for the QR capstone.**

`FND-7 [=SOA-13; partial v1 tz] · HIGH · NEW (client half).` **UTC "business-date" split-brain.** Client writes check dates via `toISOString()` UTC (`daily-check/page.tsx:45,166`); cron + cutoff match Central dates (#133 fixed only the cron half). Evening-window checks are dated tomorrow → false `DAILY_CHECK_MISSED` alerts + admin email, and the `(vehicleId,date,operatorId)` unique key is keyed on the skewed date. **Also** affects dashboard "today" counts. **Fix:** one authoritative `businessDate(APP_TIMEZONE)` helper used by client payload, cron, and feeds. **Gates the time-clock** (payroll day-bucketing inherits the same skew).

`FND-8 [=v1 H-NOTIF1] · HIGH.` **Email has no retry, no delivery log, failures swallowed** (`resend.ts` throws; callers catch-and-drop). A failed shop/hub/invite/alert send just disappears; alert emails are dropped *after* `notifiedAt` is claimed, so they're never retried. **Hard blocker for the invoice→processor email.** **Fix:** delivery-log + retry (or at minimum persist `emailed:false` and surface it), plus the `EMAIL_SANDBOX` mount (`FND-16`).

`FND-9 [=v1 M-DATA2; root-caused + live] · HIGH (was Med).` **Duplicate HUB_RETURN "awaiting receipt" rows that can never clear** (`SOA-11`). `issueHubReturnLinks` (`status-links.ts:93-124`) issues a fresh link per return event with **no revocation** of prior active links for the same unit, the unit stays AVAILABLE (re-returnable), receipt completes only the tapped link, and nothing ever sweeps expired links. Live count is climbing (13→15). **Fix:** revoke-prior-active on issue (mirror WORK_ORDER); complete sibling links on receipt; exclude past-expiry from `totalPending` + a cron `EXPIRED` sweep.

`FND-10 [=v1 §8 loose end; live] · HIGH (blocks the hub loop).` **Hub Inbound is 100% read-only for email-less hubs** (`hubs/page.tsx:224-313`) — no mark-received, no copy/reissue link, no dismiss, while literally rendering "No contact email — share links manually" with nothing to share. Both staging hubs are email-less, so the entire hub-return loop is currently un-closable from the UI. **Fix (`C3` design):** per-row **Mark received** (reuse the RECEIVED branch with an "Admin: <name>" actor), **Reissue+copy** (revoke-then-issue → return `url`), and wire the already-existing `status-links/[id]/revoke` (zero UI callers today) as **Dismiss**.

`FND-11 [=v1 M-DATA1; root-caused + live] · HIGH (was Med).` **Bare "Item" request lines** (`SOA-12`). `getLineChecklist` (`deployment-requests.ts:407-423`) — used for every RESERVATION in both admin and the public `/s` GET — **omits the vehicles join**, so a specific-vehicle line has no name and the label chain falls through to `'Item'`; type-only lines show the raw enum on the hub page. **Fix:** add the `specificVehicleName` join + a `vehicleType` label map; change the terminal fallback from `'Item'` to a lineType-derived label. ~3 lines + 1 interface field.

`FND-12 · HIGH · NEW.` **Error toasts render as green "success" on Users and Deployments.** `users/page.tsx:308,340` hardwires `<Alert severity="success">` and `patchUser` failures aren't propagated, so the last-admin-guard and lockout messages are overwritten by a green "X deactivated"; `admin/deployments/page.tsx:532,594,629` omit the severity arg (local default is success). Admins get false confirmations on failed writes. **Fix:** thread severity + propagate failures. Small, high-trust-impact.

`FND-13 · HIGH · NEW.` **Two admin "success" no-ops.** (a) Inventory **"Retire item"** PATCHes `InventoryItem.status='RETIRED'` which nothing reads and no unit changes, while the confirm promises "all available units will be marked retired" (`inventory/page.tsx:995`, route `:103-123`). (b) **First-stock dead-end** — a consumable with no stock row can never be stocked (empty state says "use the edit controls"; Move Stock is disabled at zero rows) (`inventory/page.tsx:399-462`). **Fix:** make Retire actually retire units (or remove it); add an "Add stock" affordance to the zero-state.

`FND-14 · HIGH · NEW.` **Operator offline queue can be silently poisoned twice.** (a) **Reconnect after an offline launch** doesn't re-run `load()`, so `pendingDeployCreate` flips false and the UI shows "Start Deployment" against a now-existing rig → Start yields a 409 → the operator sees failure for a deployment that exists (fails A6 row 19 as written). (b) **24h JWT + `401 ∈ TERMINAL_STATUSES`** — an operator offline >24h has every queued write marked `failed` on reconnect (401), surfaced only as a dismiss-to-discard banner → **field data loss** to a credential technicality. **Fix:** re-`load()` after a drained deploy-create; treat 401 as retry-after-reauth (park, don't fail). **Both gate the offline time-clock.**

`FND-15 [=infra CRITICAL] · HIGH.` **`make cloud-run-migrate` hardcodes the staging secret** (`Makefile:148-152`), and `deploy.yml` calls it for both branches → a merge to `production` migrates **staging** and serves prod against an unmigrated schema; the standup checklist's `SECRET_NS=AHITS_PROD` is silently ignored. **Fix:** parameterize `MIGRATE_SECRET=$(SECRET_NS)_MIGRATE_URL`, create `AHITS_PROD_MIGRATE_URL` (prod session pooler, 5432, IPv4), branch on ref in `deploy.yml`, and guard against a `:6543`/`pgbouncer` URL. (Flagged in the CLAUDE.md correction this session, §16.)

`FND-16 [=v1 H-NOTIF3; still inert] · HIGH.` **`EMAIL_SANDBOX` not mounted on staging** (`SOA-6`) → staging can email real external parties (HUB_RETURN auto-fires with no send click). **Fix:** add `EMAIL_SANDBOX`(+`_TO`) to the Makefile `--set-env-vars` so it persists across deploys; set it on `ahits-web-app-staging`.

`FND-17 · HIGH · NEW (infra).` **No error tracking anywhere** (no Sentry/OTel; ad-hoc `console.error`, no request IDs). For a field pilot with offline sync — where client failures are invisible by design — this is a real gap. **Fix:** add an error tracker + minimal structured logging before pilot.

`FND-18 [=infra] · HIGH.` **`pr-staging-deploy.yml` has no concurrency guard and no verify gate** — unreviewed PR migrations land permanently in the shared staging DB, and a preview deploy can race the `development` auto-deploy on the same service. **Fix:** add a `staging-deploy` concurrency group + require `verify` before the preview migrate.

### 5.2 Medium (Wave 0 where cheap; else early Phase 3)

`FND-19 [=v1 B2/M-DATA3] · MED.` Transfer-accept renders stale until reload. Endpoint already commits-before-200; the fix is to **return the updated deployment+kit** and apply it client-side (avoid the refetch race), not a UI refetch tweak. Add a regression test.

`FND-20 · MED · NEW.` **Requests composer bricks its pickers for the session.** `requests/page.tsx:82-105` sets `dialogDataLoaded=true` even when all five picker fetches fail (offline/500); reopening never refetches → reservation mode is unsubmittable for the rest of the session. **Fix:** gate the flag on success; retry on open.

`FND-21 · MED · NEW.` **`POST /api/deployment-requests` is not idempotency-wrapped** → a flaky offline replay creates duplicate requests. (Deploy-create is guarded by the CR-14 409; requests have no guard.) **Fix:** wrap with `withIdempotency`.

`FND-22 · MED · NEW.` **Unserialized concurrent mutations double-apply stock.** Bulk disposition reads kit items pre-transaction then updates unconditionally (`items/route.ts:314-346`); end-deployment checks `endedAt` pre-tx then sets it unconditionally (`end:80/91`) → two tabs (admin+operator) can run dispositions twice. **Fix:** port the claim-first `updateMany(...WHERE removedAt/endedAt IS NULL)` pattern already used by `[kitItemId]` and `accept`.

`FND-23 · MED · NEW.` **Missing DB-level "one active X" invariants.** One-active-rig, one-open-RigVehicle-per-vehicle, one-active-PRIMARY are all app-level read-then-write checks; two concurrent transfer-accepts to a rig-less operator create **two active rigs**. The team already uses a partial-unique for handoffs — extend the pattern. **Ship with the `SOA-2` retirement.**

`FND-24 [=v1 H-API2] · MED.` `maintenance` GET runs a `createAlert` loop on every read and is unbounded (all photos included). **Fix:** move overdue-alerting to cron (already there); paginate; drop the read-side write.

`FND-25 [=v1 M-1 cost leak] · MED · sharpened.` **`/api/vehicles` leaks rental cost + VIN/plate/insurance + `rentalAgreementUrl` to operators** (`vehicles/route.ts:51` blanket-spreads; the rig `RIG_INCLUDE` selects `rentalAgreementUrl` for any rig member) — violates the app's own admin-only-cost rule that inventory/maintenance follow. **Fix:** strip cost/PII for `role!=='ADMIN'`. **Do before the operator-facing analytics/time work multiplies cost exposure.**

`FND-26 [=v1 H-API3] · MED.` `reports/equipment` loads the whole fleet + all history into memory and aggregates in JS. Fine now; push the window filter into SQL as part of the Phase-3 analytics capstone (also fixes utilization >100% + unweighted averages). 

`FND-27 [=v1 M-API1 residual] · MED.` `writeOr404` didn't reach `hubs/[id]` PATCH, `admin/alerts/[id]/resolve`, or `users` POST (P2002 dup-email) → unhandled 500s; ~12 fall-through catches still return raw `err.message` (M-API2 unaddressed). **Fix:** finish the `wrapWrite` coverage + generic fall-through message.

`FND-28 · MED · NEW.` **`createAlert` runs on the global Prisma client inside interactive transactions** (`items:459`, `end:205`) → an alert can commit for a rolled-back task (dangling `sourceId`) and a second pooled connection is held under lock. **Fix:** make `createAlert` accept a `tx`, or move after commit. **Do before invoice-side alerts are added.**

`FND-29 · MED · NEW.` **Empty-note 400 wipes selections.** Add/Remove Vehicles requires a note server-side (`vehicles/route.ts:38,50`) but `NotePhotoDialog` doesn't enforce it, and my-rig clears selection before checking the result → the operator loses the picked set to a validation error. **Fix:** enforce the note client-side or don't clear on failure.

`FND-30 · MED · NEW.` **Per-item Return has no loading state** (`my-rig:1790`, `admin/deployments` per-item) → double-tap fires two DELETEs with two idempotency keys → possible double consumable return. **Fix:** disable-on-submit.

`FND-31 · MED · NEW.` **Infinite-spinner dead-ends** on `my-rig:956` and `requests:159` (failed/offline-cold load leaves `rig`/`requests` unset, no error, no retry). Same class on admin hubs/maintenance/settings via the `/api/hubs` bare-array-vs-error-object shape (`FND-33`). **Fix:** a shared "couldn't load — Retry" state; normalize `/api/hubs` to `{data}`.

`FND-32 · MED · NEW.` **Offline end-deployment has no queued-state** (mirror of C1) — cached rig still shows active; a second End queues a second end → replay noise. **Fix:** generalize the C1 `pendingByEndpoint` idiom to end + (later) clock writes.

`FND-33 · MED · NEW.` **`/api/hubs` returns a bare array on success but an object on error**, and several admin consumers `.map` it unguarded (`hubs:188`, `maintenance:221`, `settings:53`) → crash or stuck spinner on any error JSON. **Fix:** normalize the envelope or guard every consumer.

`FND-34 · MED · NEW.` **Scan offline misdiagnoses** — a network failure during QR lookup shows "Failed to process image" (`scan:113`); and several read endpoints (`/api/hubs|projects|categories|checklist-templates|transfers|handoffs|deployment-requests|notifications`) aren't in the SW field-reads matcher, so offline they silently empty or spin. **Fix:** correct the message; extend the SW cache list (esp. the hub picker that blocks offline end-deployment).

`FND-35 · MED · NEW.` **Daily-check template/rig late response wipes in-progress answers** (`daily-check:99-113` re-runs on `vehicles` identity change) — exactly the flaky-network condition. **Fix:** capture at submit-tap, don't reset on later-arriving responses. **Collides with GPS capture** (`P3-MAP-2`) — fix first.

`FND-36 · MED · NEW.` **WORK_ORDER "Submit invoice #" saves numberless** — the note field only relabels to "Invoice number" *after* the shop taps the button (`s/[token]:277,284`), and the INVOICED write no-ops when the note is empty (`status-links.ts:260`). **Fix:** label the field up front.

`FND-37 [=v1 M-NOTIF2] · MED.` `EQUIPMENT_NOT_RETURNED` only fires when an operator submits a check on a >90-day rig — a silent operator never triggers it. **Fix:** move the scan into cron.

`FND-38 · MED · NEW.` **No UI to create a scheduled maintenance task** (`POST /api/maintenance` has zero callers; `DELETE` orphaned) though the page promises "scheduled service." **Fix:** add the create form (or descope the promise).

`FND-39 · MED · NEW.` **Project/Lead can't be set from the UI** — admin New-Deployment has no project field (`deployments:146` hardcodes `''`), and the Projects form has no Lead field though the API + table support both. **Fix:** add the fields.

`FND-40 · MED · NEW.` **Reports CSV ignores the asset-type filter + sort**, and KPI cards are global while the table is filtered (`reports:92-108,164-174`) — export and scoreboard silently disagree with the view. **Fix:** pass the filter to export; annotate or scope the KPIs.

### 5.3 Low (cleanup tail — batch into Wave 0 or pre-go-live)

`FND-41 · Dead code (~350–400 LOC, verified):` `lib/shipments.ts` (97 LOC, 0 importers), `checkout` GET + 410-stub POST + its dead zod schema (~63 LOC), 6/8 `lib/utils.ts` fns, 8 orphaned `email/templates.ts` builders (~74 LOC), unused `types/index.ts` types, `lowStockByHub` (now fully dead — lost its test), the two orphaned `supabase/client.ts`+`server.ts` (pre-PIN-auth vestiges), ~20 unused exports across libs. **[Δ v1]** the count is higher than v1's "~150" — the two Supabase files, the checkout route, and `lowStockByHub`'s regression weren't listed.

`FND-42 · Dead deps:` `@emotion/cache`, `@emotion/server` (unimported), `@mui/x-date-pickers` (mounts a `LocalizationProvider` with zero picker components). Remove.

`FND-43 · Duplication:` the transfer/handoff **respond dialog exists 4×** (worse than v1's 2× — the B3 fix added a third my-rig copy that drifted), `NewDeploymentDialog` 2× (operator/admin diverging on consumable rules), a hand-rolled auth-preamble in 47 routes, 5 private date-format helpers while `lib/utils.ts` formatters sit dead, a 3-dialect success envelope. **Fix:** extract `RespondDialog`/`useRespondAction`; a `withAuth`/`withAdmin` wrapper; one `formatDate`; one response envelope **before** ~25 Phase-3 routes multiply it.

`FND-44 · Monoliths:` `my-rig/page.tsx` **2014 LOC / 58 `useState`** (v1 said "~1939 / ~35"), `admin/deployments` 1516, `admin/inventory` 1239. Split seams are already marked internally. Do the my-rig extraction **before** the SWR migration or the GPS/clock additions.

`FND-45 · Test gaps (highest-risk):` the unauthenticated `POST /s/[token]/transition` + `status-links`/`idempotency`/`rate-limit` libs + cron dispatcher = **zero coverage**; vehicles handler boundary untested; `useOfflineQueue` orchestration untested. The global destructive `afterEach` couples every suite to Postgres so pure suites can't run DB-less. **Fix:** cover the public surface first (it's the widening attack surface for QR).

`FND-46 · Schema/migration hygiene:` `deployment_requests.requestType` `@@index` exists in schema with **no migration** (fresh DB diverges); dead `EquipmentStatus.IN_TRANSIT` (the HUB_RETURN receipt flip matches 0 rows by construction); duplicate migration timestamp; empty `sprint7_schema_gaps`; `photos` has **zero indexes** (every photo include is a seq scan). **Fix:** generate the missing index migration; drop or wire `IN_TRANSIT`; add photo FK indexes.

`FND-47 · a11y:` 5 `aria-label`s across ~111 IconButtons; sub-44px targets on the daily-check toggle group (the most-used control), kit-row icons, FulfillmentChecklist (32px); dashboard cards are click-only (no keyboard); `/s` labels not `htmlFor`-associated. Batch into the polish pass.

`FND-48 · IA:` filters are never URL params (`useSearchParams` appears **zero** times in admin) → no bookmarkable state and cross-entity deep-links are impossible (the dashboard already emits a `?vehicle=` link no page reads). Adopting query-param filters unlocks ~10 dead-end links at once. Foundational for admin-mobile + analytics drill-through.

`FND-49 · Infra tail:` Cloud Run flags (memory/CPU/concurrency/timeout/max-instances/startup-probe) are **unpinned** in the Makefile (live config is whatever was last clicked); `make deploy-prod` can deploy prod from a laptop (no CI guard); Docker bakes **no** `NEXT_PUBLIC_*` (survivable only because all consumers are server-side today — a trap for a `NEXT_PUBLIC_MAPBOX_TOKEN`); `RATE_LIMIT_TRUSTED_HOPS` unmounted (fine bare, wrong behind an LB). Pin the flags; keep Mapbox server-side or pass as a build-arg.

`FND-50 · Notification presentation:` `DAILY_CHECK_MISSED` is anonymous everywhere (no `presentAlert` case; dashboard reads `itemName/taskName/name` but meta has `operatorName`) → email/bell/dashboard all say "Daily check missed" with no operator; `DAMAGE_REPORTED` is reused as the hub-receipt notification type (a receipt arrives labelled "Damage reported"). One-line fixes each.

---

## 6. Wave 0 (revised) — pre-Phase-3 hardening & pilot gate

Wave 0's job is unchanged from v1: **reach the pilot line** and **tidy the base so ~25 new Phase-3 routes don't copy today's gaps.** What changed is the contents — it now must also clear the live crash, the two new data bugs, the unmerged security branches, and the release-safety defects. Suggested order:

**W0-1 — Reach the pilot line (gating).** Run the **A6 22-row × 5-target device pass** exactly per `AHITS_A6_DEVICE_CHECKLIST.md` (drop the old SW on each device → open online, wait ~10 s to warm routes → go offline). Include the overnight iOS eviction watch-item and the add-items-to-offline-rig row. **Clean pass = pilot line.** Do **W0-2**/**W0-3** first so the crash and queue-poisoning don't taint the run.

**W0-2 — The live crash + the two new data bugs.** `FND-1` (staged this session — push/PR/verify/deploy, then re-test End Deployment on staging), `FND-2` (consumable-transfer stock leak — with regression tests), `FND-3` (bulk-invite token hashing). These are the must-fix correctness items before a pilot handles real equipment counts.

**W0-3 — Land the three security branches.** `FND-4` `pin-hardening` first (atomic lockout + trivial-PIN), then `rate-limit-uploads-photos`, then `FND-5` `csp-nonce` **after** a staging smoke-test. Also `FND-25` (strip vehicle cost/PII for operators).

**W0-4 — Offline integrity for the pilot.** `FND-14` (reconnect re-`load()` + 401-park-don't-fail — the field-data-loss guards), `FND-32` (offline end queued-state), `FND-20`/`FND-21` (requests picker latch + idempotency), `FND-34` (scan message + SW cache list). These make the A6 pass trustworthy and are prerequisites for the offline time-clock.

**W0-5 — Business-date correctness.** `FND-7` — one `businessDate(APP_TIMEZONE)` helper across client payload, cron, and feeds. Small, and it gates both the missed-check KPI and payroll day-bucketing.

**W0-6 — Email reliability + staging guard.** `FND-16` (mount `EMAIL_SANDBOX` so it persists; set it on staging — do this **now**, it protects real hubs/shops), then `FND-8` (delivery-log + retry, or at minimum persist+surface `emailed:false`). Required before the invoice email.

**W0-7 — Release safety.** `FND-15` (migrate-secret parameterization + `AHITS_PROD_MIGRATE_URL`), `FND-18` (PR-preview concurrency + verify gate), `FND-17` (error tracker + structured logs). Do `FND-15` before any prod promote.

**W0-8 — Systemic API/data hygiene (so new routes start clean).** `FND-27` (`wrapWrite` coverage + generic errors + zod for hubs/categories), `FND-24` (maintenance GET), `FND-22`/`FND-23` (claim-first + partial-unique invariants), `FND-28` (`createAlert(tx)`), `FND-33` (`/api/hubs` envelope), the shared list-pagination clamp on the remaining routes, `FND-46` (missing index migration + photo indexes + `IN_TRANSIT`). Establish the **one response envelope** + `withAuth` wrapper now (`FND-43`).

**W0-9 — The hub loop + request labels + admin trust.** `FND-10` (Inbound mark-received/reissue/dismiss), `FND-9` (HUB_RETURN dedupe + expiry sweep), `FND-11` (bare-"Item" labels), `FND-12` (toast severity/failure propagation), `FND-13` (Retire no-op + first-stock). These are small, high-visibility, and directly serve the "known location & status" KPI.

**W0-10 — Legacy-column retirement groundwork.** `SOA-2`/`FND-23`: migrate readers onto `deployment_assignments`/`inventory_stock` (including an ended-rig roster that replaces the `FND-1` fallback), add the one-active-PRIMARY partial-unique index, **snapshot first**, then the irreversible `DROP COLUMN` — sequenced to land **before** invoicing builds on attribution. Per the non-negotiable DB rules, apply the migration before the code that needs it.

**W0-11 — Consistency + freshness foundation.** The real `/operator/my-rig`→`/operator/my-deployment` rename **with a permanent redirect + the six persisted notification-link updates + the bottom-tab name** (`SOA-7`/`FND-43`); extract the 4× respond dialog; introduce **SWR** for list reads (retires the infinite-spinner dead-ends `FND-31` for free via `revalidateOnReconnect`, powers a "data as of HH:MM" indicator) + an itemized outbox; split the my-rig monolith (`FND-44`) in the same PR **before** the data-layer swap. Decide the FulfillmentChecklist design-system story.

**W0-12 — Cleanup tail (batch).** `FND-41`/`FND-42` (dead code + deps), `FND-45` (test the public token surface — highest-risk gap), `FND-47` (a11y + 44px), `FND-48` (URL-param filters — foundational), `FND-49` (pin Cloud Run flags), `FND-50` (notification presentation), doc hygiene (§15).

> **Wave-0 exit criteria [Δ v1]:** A6 signed off; the live crash + `FND-2`/`FND-3` fixed; the three security branches merged; business-date unified; email guard live + reliability landed; the migrate-secret fixed; and the shared API/data/consistency primitives in place. After this, capstones are largely additive.

---

## 7. Phase 3 capstones & polish — build specs

Sequencing (unchanged from v1, smallest→largest, max reuse): **Map → No-app QR → Time/Invoicing**, analytics/admin-mobile/onboarding interleaved. The tokenized `StatusLink` primitive and the durable queue are the leverage; the `W0-10` legacy retirement unblocks invoicing attribution; `FND-8` email reliability unblocks the invoice email.

### Capstone 1 — Deployment Map (`P3-MAP-1…7`) · smallest, do first

**Model.** 3 additive nullable columns on `DailyCheck`: `gpsLat/gpsLng/gpsAccuracy Float?` (mirror `Photo.gpsLat/Lng`). One additive migration, no new model. **Readiness (verified):** `DailyCheck` is clean for this; the POST is a zod upsert — extend schema + persist; offline replays converge via the existing unique key, no idempotency work. **Caveats:** the same-day upsert overwrites GPS on re-submit (document as last-write-wins); **fix `FND-7` first** or the pin's recency coloring inherits the 6-hour date skew; **fix `FND-35` first** or the checklist-race can drop the fix.

**Capture (`P3-MAP-2`).** `navigator.geolocation.getCurrentPosition` in `buildPayload()` (`daily-check:123`); **resolve-or-skip before enqueue** (never block submit on a fix; denied → submit without coords). `Permissions-Policy: geolocation=(self)` already set.

**Admin map (`P3-MAP-3…6`).** Mapbox GL JS. **Keep the token server-side or pass as a Docker build-arg** — a `NEXT_PUBLIC_MAPBOX_TOKEN` would silently be `undefined` in staging/prod (`FND-49`); add `AHITS_MAPBOX_TOKEN` to Secret Manager **and** the Makefile `--set-secrets` before the deploy that mounts it (non-negotiable rule). One pin per active deployment at latest check coords; recency colors (green <24h / amber 24–48h / red >48h); tooltip → the **renamed** stable route (`W0-11`). CSP `connect-src`/`img-src` updated for Mapbox tiles (coordinate with `FND-5`).

**Out of scope:** route history, real-time tracking, operator-facing full map. **Tests:** gps round-trip, denied-permission submit, recency buckets. **Effort:** small. **Risk:** low.

### Capstone 2 — No-app QR daily-check form (`P3-QR-1…5`) · reuses the token primitive

**Reuse.** New `StatusLinkType='DAILY_CHECK'` + an additive `vehicleId` subject on `StatusLink` (it has no vehicle subject today — one column + index); an `ALLOWED_ACTIONS` entry; an `applyTransition` branch that **creates a `DailyCheck` and runs the same side-effects the authed route does** — but those side-effects are inline today (`daily-check:117-177`), so **extract them to `lib/daily-check.ts` first** or the public path drifts from the authed path.

**Hard schema decision:** `DailyCheck.operatorId` is **required**; a no-app submit has no user. Either make it nullable (touches the `(vehicleId,date,operatorId)` unique + every consumer) or mint a sentinel "external" user. Decide before the migration.

**Security (non-negotiable, must precede this capstone):** `FND-5` CSP nonce, `FND-6` link-state gate + stable idempotency key, `rate-limit-uploads-photos` for any unauthenticated photo, and `FND-45` tests for the public transition handler (zero coverage today). Treat the token exactly like a status-link token (256-bit, sha256-at-rest, expiry, single-use, least-privilege payload).

**Pairing:** the `DAILY_CHECK_MISSED` scan already exists (#131/#133) — wire the form into it. **Effort:** small-medium. **Risk:** medium (widens the unauthenticated write surface — the Wave-0 security items must land first).

### Capstone 3 — Time Tracking, Invoicing & Availability (`P3-TIME-1…10`) · the heavy one

**7 models** per PRD §11.12/§18: `TaskType`, `OperatorRate`, `TimeEntry`, `Expense`, `Invoice`, `InvoiceLineItem`, `Availability` + `Settings.milesReimbursementRate`. `User.hourlyRate` exists but is **not seeded** — seed it.

**Critical prerequisites (verified against schema):**
- **Attribution from `deployment_assignments`, never legacy `rig.operatorId`** — `W0-10` must land first; `getActivePrimary()` already exists unused as the read-side hook. `TimeEntry` carries its **own `projectId`** (snapshot at clock-in) — resolving project via the rig is ambiguous now that `deployment_projects` is many-to-many.
- **One rate source** — `User.hourlyRate` vs `OperatorRate`/`TaskType`: pick the precedence now (don't create a third dual-write). Money via `validation.money()`; compute invoice totals in SQL, not the JS-float-summing the reports route uses.
- **Offline-first clock** over `useOfflineQueue.mutate()` + idempotency (`POST /api/time-entries` **must** be `withIdempotency`-wrapped from day one — the two existing queueable creates forgot it). **`FND-14` (queue poisoning) and `FND-7` (date skew) must be fixed first** — a lost clock-out or a mis-bucketed day is a payroll incident. Prefer server timestamps + a "missed clock-out" reconciliation report over trusting client wall-clock.
- **Invoice email** reuses the dispatcher: the `INVOICE` `StatusLinkType` + `ALLOWED_ACTIONS` exist but issuer/template/back-write are absent, and `applyTransition` has **no INVOICE branch** (a seeded link would log an event but never advance). Build all three, on top of **`FND-8` email reliability**. Recipients from a server-side allowlist (no recipient-supplied URLs → SSRF).

**Clock-in flow (`P3-TIME-3`):** verbatim from the PRD — clock in anytime; >48h → "new deployment?"; <48h → "same as last?" (yes → link + prompt the daily checklist before recording). **Availability (`P3-TIME-8`):** operator monthly calendar + admin filterable grid ("who's free next week?"); `@@unique(operatorId, date)`.

**Tests:** rate resolution (3 sources), duration/total math, offline clock round-trip, money-email retry/log. **Effort:** large. **Risk:** medium-high — gated by `W0-10` + `FND-8`.

### Polish 4–7 (carried from v1, still valid)

- **`P3-AN-1` Advanced cost analytics** — build on the shipped Equipment Cost & Utilization report; spend-trending + prediction nudge; push aggregation into SQL (fixes `FND-26`, utilization >100%). Moves the 25%-repair-spend KPI.
- **`P3-MOB-1` Admin-mobile** — 13 raw `<Table>`s need card fallbacks at `xs`; the two fixed-width drawers (`deployments` 560px, `inventory` 540px) clip the close affordance off-screen at 390px and are reached by read-only operators — fix those first; adopt URL-param filters (`FND-48`) to unlock drill-through. Moves adoption.
- **`P3-ONB-1` Contractor self-onboarding** — reuse the invite primitive (fix `FND-3` first) + `mustChangePin` gate; pair with trivial-PIN rejection.
- **`P3-RN-1` React Native wrapper — DESCOPE** (governance §10); scope iOS 16.4+ PWA Web Push instead if "push is primary" must hold for pilot.

---

## 8. Cross-platform & offline readiness matrix

| Surface | Desktop | Android (web/PWA) | iOS (web/PWA) | Offline | Phase-3 note |
|---|---|---|---|---|---|
| **Operator loop** | ✅ | ✅ phone-first, bottom-nav | ✅ safe-area handled; **PWA cold-launch + overnight eviction unverified (A6)** | ⚠️ check/create/return queue; **reconnect + >24h JWT poison queue (`FND-14`)**; end-offline no queued-state (`FND-32`) | GPS + clock land here; fix `FND-14`/`FND-7`/`FND-35` first |
| **Admin console** | ✅ broad | ⚠️ tables scroll-not-clip; **2 drawers clip off-screen at 390px** | ⚠️ same | n/a | Admin-mobile (`P3-MOB-1`); URL-param filters (`FND-48`) |
| **External `/s/` portal** | ✅ best touch sizing | ✅ | ✅ | ❌ live-only by design | QR form + invoice extend this; `FND-6` state-gate + stable key first |
| **Ended-deployment review (admin)** | ❌ **list OK, but ENDING one crashes the page (`FND-1`, live)** | ❌ | ❌ | — | fix in W0-2 |
| **Hub-return loop** | ❌ **un-closable for email-less hubs (`FND-10`); rows accreting (`FND-9`)** | ❌ | ❌ | — | fix in W0-9 |

**Net:** the live-online experience is solid for both roles except the ended-deployment crash and the hub loop. The genuine cross-platform risk is concentrated in **iOS-PWA offline** (A6 + `FND-14`). Do not declare the pilot line on emulators.

---

## 9. PRD Phase-3 coverage matrix

Every PRD Phase-3 promise and every carry-forward, with a disposition. **This is the coverage proof the plan must maintain.**

### 9.1 Capstone/feature items

| ID | Item | Disposition |
|---|---|---|
| `P3-MAP-1…7` | Deployment Map (GPS on DailyCheck, Mapbox admin card, recency pins, tooltip) | **Build** — Capstone 1; gated on `FND-7`/`FND-35` |
| `P3-TIME-1…10` | Time/Invoicing/Availability (7 models, PDF, lifecycle, auto-email) | **Build** — Capstone 3; gated on `W0-10` + `FND-8` |
| `P3-QR-1…5` | No-app QR daily-check | **Build** — Capstone 2; gated on `FND-5`/`FND-6`/`FND-45` |
| `P3-AN-1` | Advanced cost analytics + prediction nudge | **Build** — Polish 4 (report already shipped) |
| `P3-MOB-1` | Admin-mobile | **Build** — Polish 5 |
| `P3-ONB-1` | Contractor self-onboarding | **Build** — Polish 6 (fix `FND-3` first) |
| `P3-RN-1` | React Native wrapper | **Descope** — governance §10 |
| `P3-MAINT-1` | Mileage-triggered maintenance status | ✅ **Already shipped** (Wave G) — claim as done |
| `P3-NOTIF-1` | Push primary for time-sensitive | **Decide** — Web Push vs accept 45s polling for pilot (§10) |
| `P3-NOTIF-2` | Overdue alert "repeats daily until resolved" | **Decide** — impl notifies once (`notifiedAt` dedupe); adjudicate |
| `P3-NOTIF-3/4` | Exact alert timing / per-admin routing | **Verify or descope** — cron scans exist; second-reminder + per-admin routing unconfirmed |
| `P3-NOTIF-5/6/7` | Not-returned cron / hub-email / email reliability | `FND-37` / `FND-10`+`FND-16` / `FND-8` |

### 9.2 Carry-forward PRD promises no prior plan adjudicated

| ID | Item | Recommendation |
|---|---|---|
| `CARRY-1` | Conflict-resolution prompt + ">4h foreground full-sync" (§11.9) | Descope the prompt (LWW is shipped); or a small Phase-3 slot. **Decide.** |
| `CARRY-2` | Trusted-device / 30-day session (§10.1) | **Retire** (revocation met by 24h JWT + per-request re-check) — formalize |
| `CARRY-3` | Bulk QR label registration (§15.1 P2) | Never shipped/never descoped — **build small or descope** |
| `CARRY-4` | Per-project checklists (§15.1 P2) | Descoped to optional (per-vehicle-type shipped) — record it |
| `CARRY-5` | Photo fine-print (thumbnails, per-context caps, in-app-only damage, no operator-delete) | **Verify conformance** or list as gaps |
| `CARRY-6` | Admin bulk-location override + return-date override (§11.5) | Not evidenced — **build or descope** |
| `CARRY-7` | Admin-configurable PIN length (§10.1) | Not evidenced (pin-hardening adds trivial-PIN only) — **decide** |
| `CARRY-8` | Backups (daily/30-day) + 3-year retention + uptime/latency NFRs (§13) | **Verify + document** in the pre-go-live runbook (`FND-17` adjacent) |
| `CARRY-9` | `MaintenanceTask.kind` enum + in-field quick-log (Addendum §A.6) | Verify absorbed by the shipped `resolutionPath` work, or build |
| `CARRY-10` | Requests §F state machine (unit-level RESERVED, rig templates, HubAssignment) | **The built system deliberately redesigned §F** (`AHITS_REQUESTS_REDESIGN_DESIGN.md` is operative). Declare the redesign as superseding §F; enumerate residual §F items (unit reserve, templates) as build-or-descope |
| `CARRY-11` | V1 out-of-scope list (Airtable, QuickBooks, real-time GPS, payroll, SMS, …) | Keep listed so nobody re-litigates |
| `CARRY-12` | Dashboard "total inventory value" card | Verify presence |
| `CARRY-13` | Shippo track-only integration (`lib/shipments.ts` stub) | **Wire or delete** (`FND-41`) — decide |
| `CARRY-14` | S3/S4 cosmetics (raw cuids in Reports, "Requests" naming) | Batch into polish |

---

## 10. Governance decisions to lock

| # | Decision | Recommendation |
|---|---|---|
| 1 | Deployment Requests §F vs the built redesign | **Declare the redesign authoritative** (`CARRY-10`); enumerate residual §F items as build-or-descope. Not "confirm §F complete" — it was intentionally replaced. |
| 2 | Trusted-device / 30-day session (`CARRY-2`) | **Retire** — revocation goal already met. Formalize so §10.1 stops reopening. |
| 3 | React Native wrapper (`P3-RN-1`) | **Descope** — favor iOS 16.4+ PWA Web Push if push must be primary. Sign off. |
| 4 | Time/Invoicing timing | Confirm as the P3 capstone; **gate behind `W0-10`** (attribution) + `FND-8` (email). |
| 5 | "Push is primary" for pilot? (`P3-NOTIF-1`) | If yes → scope operator Web Push (bell data already exists); if no → state 45s polling as the accepted pilot mechanism. |
| 6 | Overdue "repeats daily" (`P3-NOTIF-2`) | Adjudicate the once-vs-daily deviation. |
| 7 | Email sandbox + reliability | Approve `FND-16` **now** + `FND-8` as Wave 0 (blocks invoice email; protects real hubs/shops today). |
| 8 | Prod environment | Option A (separate prod) reaffirmed; execution pre-go-live; **`FND-15` migrate-secret is a hard prerequisite.** |

---

## 11. Sequenced milestone plan

```
WAVE 0  Pre-Phase-3 hardening (gate + base) ── §6
  W0-1  A6 device pass .......................... [GATE = pilot line]
  W0-2  Live crash (FND-1, staged) + data bugs (FND-2 stock, FND-3 invite)
  W0-3  Security branches: pin-hardening → rate-limit → csp-nonce; vehicle cost strip (FND-25)
  W0-4  Offline integrity: reconnect/JWT (FND-14), end queued-state, requests latch/idempotency, scan+SW
  W0-5  Business-date unification (FND-7)
  W0-6  Email sandbox mount (FND-16, now) + delivery-log/retry (FND-8)
  W0-7  Release safety: migrate-secret (FND-15), PR-preview gate (FND-18), error tracking (FND-17)
  W0-8  API/data hygiene: wrapWrite, maintenance GET, claim-first + partial-uniques, createAlert(tx),
        hubs envelope, index migration + photo indexes; one envelope + withAuth
  W0-9  Hub loop (FND-10/9) + request labels (FND-11) + admin trust (FND-12/13)
  W0-10 Legacy-column retirement (snapshot → DROP)  [prereq for Invoicing]
  W0-11 Rename my-rig→my-deployment (+redirect+notif links); SWR+freshness+outbox; split monolith; respond dialog
  W0-12 Cleanup: dead code/deps; test /s/ surface; a11y/44px; URL-param filters; pin Cloud Run flags; notif presentation; docs

M-MAP    Capstone 1 — Deployment Map ............ (after W0-5/W0-11; seed GPS early)
M-QR     Capstone 2 — No-app QR daily-check ..... (after W0-3 security + FND-6; pair DAILY_CHECK_MISSED)
M-INV    Capstone 3 — Time/Invoicing/Availability (after W0-6 email + W0-10 retirement)  [heaviest]
M-POLISH Analytics (P3-AN-1), Admin-mobile (P3-MOB-1), Onboarding (P3-ONB-1); Web Push if chosen
PRE-GO-LIVE  Prod-DB standup (Option A) + FND-15 migrate-secret; prod cron scheduler; backups/PITR (CARRY-8);
             migration-baseline; Cloud Run flag pinning; RN descope sign-off
```

**Three honest lines [Δ v1 — now with the crash + data bugs folded in]:** **Pilot** = W0-1 (+ W0-2/W0-4 strongly recommended). **Credible Phase-3 v1** = Wave 0 → Map → QR. **Full Phase 3** = + Invoicing + polish, then pre-go-live. All Phase-3 work ships on staging until the deferred prod cutover.

---

## 12. KPI mapping (PRD §7 → work)

| PRD §7 metric | Work that moves it |
|---|---|
| **100% known location & status** | Map (GPS) · `FND-1` ended-attribution · `FND-9`/`FND-10` hub loop · transfers (shipped) |
| **95%+ daily checks on time** | 16-item check (live) · `DAILY_CHECK_MISSED` (shipped) + `FND-7` date fix + `FND-50` naming · No-app QR · operator ergonomics |
| **Zero equipment missing >24h** | A6 · `FND-14` (no field-data loss) · `FND-2` (no phantom stock loss) · `FND-19` transfer read-after-write |
| **0 missed maintenance ≤14d** | recurrence + mileage (shipped) · `FND-24` move alerting to cron · `FND-38` scheduled-task UI |
| **25% repair-spend reduction** | Reports scoreboard (live) · `P3-AN-1` analytics + nudge · `FND-26` SQL aggregation |
| **90%+ operator adoption (2wk)** | A6 + `FND-14` offline reliability · freshness/outbox (`W0-11`) · admin-mobile · Change-PIN (done) |
| **Admin notified ≤15 min** | dispatcher + bell (shipped) · `FND-8` email retry/log · `FND-16` sandbox · optional Web Push · `FND-17` error visibility |

---

## 13. Risk register (top risks)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Ended-deployment crash reaches pilot** | **High if unfixed** (live now) | High (dead admin page on a routine action) | `FND-1` staged this session — push/verify/deploy + re-test; fold into `W0-10` roster |
| **Consumable stock silently lost across transfers** (`FND-2`) | High over normal use | High (inventory + future invoicing/analytics wrong) | Carry drawnQty/hub at accept; regression tests; **before** invoicing |
| **Bulk-invite raw tokens at rest** (`FND-3`) | Med | High (plaintext account-minting secrets) | Hash on issue; audit existing rows |
| **First prod promote migrates staging** (`FND-15`) | High at cutover | High (prod serves unmigrated schema) | Parameterize migrate secret before any prod promote |
| **Irreversible legacy-column drop loses/forks data** (`W0-10`) | Med | High | Snapshot; finish reader migration incl. ended roster; drop after invoicing attribution settled |
| **iOS eviction / >24h JWT drops queued field data** (`FND-14`, H-OFF1) | Med (iOS ITP) | High | park-don't-fail 401; storage warnings (shipped); server reconciliation for clock; A6 overnight row |
| **Widened public QR surface exploited** | Low-Med | High | `FND-5` CSP + `FND-6` state-gate + rate-limit + `FND-45` tests **before** M-QR |
| **Billing email fails silently** (`FND-8`) | Med | High | retry + delivery log + `emailed:false` surface; `FND-16` sandbox now |
| **Staging emails real hubs/shops during QA** (`FND-16`) | Med today | Med | mount `EMAIL_SANDBOX` now (persist via Makefile) |
| **A6 never re-run on hardware** | Med | High | Hard gate with recorded sign-off across 5 real targets |
| **New routes copy today's gaps** | Med | Med | `W0-8` shared helpers + one envelope land before capstone routes |

---

## 14. Test & verification strategy

- **Highest-risk untested code (close before/with Phase 3):** the unauthenticated `POST /s/[token]/transition` + `status-links`/`idempotency`/`rate-limit` (zero coverage — `FND-45`); the cron dispatcher; vehicles handler boundary; `useOfflineQueue` remap/replay. Split vitest into unit vs integration projects so the 24 pure tests can run DB-less (they can't today — the global destructive `afterEach` couples every suite to Postgres).
- **Regression tests for this review's bugs:** `FND-1` (ended-deployment renders + End doesn't crash), `FND-2` (transferred consumable returns restore correct stock; partial-transfer end doesn't over-credit), `FND-3` (bulk invite completes), `FND-7` (evening check dated correctly), `FND-19` (accept reflects moved item without reload).
- **Per-capstone:** Map (gps round-trip, denied-permission, recency buckets); QR (public handler, idempotency dedupe, failing-check side-effects from the public path); Invoicing (rate resolution ×3 sources, duration/total math, offline clock round-trip, money-email retry/log).
- **Device matrix (A6):** the 22-row × 5-target sheet incl. the SW-drop+warm ritual, add-items-to-offline-rig, and overnight iOS eviction.
- **High-stakes verification:** for irreversible/money-adjacent work (legacy drop, invoicing, `FND-2`) run a dedicated adversarial verification pass against source before merge, as done for this review. CI already gates lint/type-check/build/test on every PR — keep it green; add `prisma migrate diff --exit-code` to catch schema/migration drift (`FND-46`).

---

## 15. Doc hygiene & namespace

- **Correct the actively-misleading docs (partly done this session, §16):** CLAUDE.md migration section (migrate-on-deploy is live; flag `FND-15`), README branch/workflow/env drift, dead `ADMIN_EMAIL`. **Applied on the fix branch this session.**
- **Freeze the `.xlsx` register** and treat this plan's `FND-#` register as its successor (the xlsx is stale for #128–#140). Fold Wave-0 outcomes in or tombstone it.
- **Commit the two untracked canonical docs** (`AHITS_PHASE3_DETAILED_WORKPLAN.md`, `AHITS_SESSION_RECORD_2026-06-30_WAVE0.md`) + this plan on a docs branch. **Archive** the ~20 superseded session/analysis docs (list in the docs-audit output) with tombstone banners; delete the root duplicate of `AHITS_WAVE1_ANALYSIS_AND_ROADMAP.md` (identical copy already in `docs/archive/`).
- **Namespace:** use `FND-#`/`W0-#`/`P3-*`/`CARRY-#` going forward; freeze UR-#/B#/H-/M-/C# as aliases (mapped inline here). Never reuse an ID.
- **Restate the earned process rules** (never `db push` a shared DB; migration-before-code; secret-before-deploy + Makefile mapping — applies imminently to `AHITS_MAPBOX_TOKEN`).

---

## 16. Appendix A — fixes applied this session

On branch **`feature/20260702/maxwellslater-fix-ended-deployment-crash`** (working tree of the connected repo; see the note below on the commit):

1. **`FND-1` — ended-deployment crash fix.** `src/app/api/deployments/[id]/route.ts` GET now hydrates `operator` from the retained legacy `Rig.operatorId` when the roster returns none (ended deployments), mirroring the #128 list fix. Guarantees a non-null operator so the drawer/page can't crash on End. **Verified `tsc --noEmit` clean** in a sandbox copy. No schema change, no migration.
2. **Doc drift (verified-safe):** README branch names (`development`/`production`, no `main`), `make deploy-staging` (no `make deploy` target), workflow list, env table; removed dead `ADMIN_EMAIL` from `.env.example`; corrected CLAUDE.md migration guidance (migrate-on-deploy is live) and added a prominent warning about the `FND-15` prod-secret bug — **all safety rules kept intact.**

A ready-to-apply patch is also saved as **`ahits_ended_deployment_fix_and_docs.patch`**.

> **Commit note:** the sandbox hit a stuck `.git/index.lock` on the mounted repo (a filesystem quirk — the lock couldn't be removed from the sandbox), so the changes are **applied to the working tree on the branch but not yet committed.** To finish: remove the stale lock and commit, then follow the normal PR flow.
>
> ```bash
> cd "<repo>"
> rm -f .git/index.lock            # stale 0-byte lock from the sandbox
> git add "src/app/api/deployments/[id]/route.ts" README.md CLAUDE.md .env.example
> git commit -m "fix(deployments): hydrate operator on single-rig GET (B1 completion) + doc drift"
> git push -u origin feature/20260702/maxwellslater-fix-ended-deployment-crash
> gh pr create --base development --title "Fix ended-deployment crash + doc drift" --body "…"
> ```
>
> CI `verify` (lint/type-check/build/tests) must pass before merge. After merge auto-deploys to staging, **re-test End Deployment** on the drawer to confirm the crash is gone, then re-run the A6 pass.

---

## 17. Appendix B — the honest one-paragraph state of the app

AHITS is a disciplined, near-pilot PWA whose hard architectural problems are mostly solved: auth, the tokenized external-link primitive, the durable offline queue, and a clean toolchain are all production-grade, and Phases 1–2 are functionally complete. It is closer to a pilot than most codebases at this stage — but it is one A6 device pass, one live admin crash, two data-integrity bugs, three unmerged security branches, and a handful of release-safety defects away from *deserving* that pilot. None of those are deep; all are enumerated above with fixes; several are already written. Do Wave 0 honestly — especially the crash, the consumable-stock leak, the security merges, and the business-date fix — and Phase 3 (Map → QR → Time/Invoicing) becomes the largely-additive feature program the June-30 plan correctly envisioned, built on a base that finally matches the quality of its own foundations.

_End of workplan v2._
