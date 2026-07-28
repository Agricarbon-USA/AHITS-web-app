# AHITS — Six-Seat Critical Review · Pilot Day 2 (2026-07-28)

> STATUS: current (pilot-fortnight review) · UPDATED: 2026-07-28
> READ-WITH: `STATUS.md` · `AHITS_LAUNCH_HANDOFF_2026-07-27.md` · `DECISIONS.md`
> Produced by the six-seat review (Antagonist, Calibration, Operator-lens, SRE, Integration, Fable) run against the full repo + corpus on day 2 of the CUL005 pilot. Every code finding carries file:line evidence; confidence is marked where it matters. **This doc feeds the 2026-07-28 owner interview; dispositions land in the workplan, not here.**

---

## 0 · The headline

The architecture praise in the corpus is earned — the idempotency layer, the 401-parking design, the inventory invariants, and the deploy pipeline are genuinely good. But the review found that **the pilot's own P0 ("zero lost writes") has at least three live mechanisms that can lose a write while the outbox reads empty, no server-side eyes at all, and a launch gate (the iOS A6-Lite pass) with no recorded result.** Separately, **staging stopped being staging on Monday and half the pipeline doesn't know it** — the preview-deploy workflow, the seed/reset targets, and the env-wiping deploy flags all still treat the pilot's environment as disposable. And strategically, **the pilot as designed measures compliance, not preference** — it cannot answer "does the app beat texting," and its outcome currently changes nothing in the CC-16→17→18 queue.

Nothing here says "stop the pilot." Most of the P0s have cheap mitigations landable inside the fortnight. But the trust floor has holes exactly where the charter says it can't.

---

## 1 · TIER 1 — Write-loss & accuracy defects in the offline path (Antagonist + Operator + Calibration seats)

**1.1 · Late-synced daily check is re-dated at sync time and can destroy (or be destroyed by) the same-day check. CONFIRMED.** `src/app/api/daily-check/route.ts:85-88` clamps the date to `businessDate()` **at sync time**, then upserts on `(vehicleId, date, operatorId)` (`:104-145`). A check queued/401-parked on day N that replays on day N+1: (a) records under N+1 — day N becomes a false MISSED, and the stale check wrongly clears N+1's missed alert; (b) **collides with N+1's real check via the upsert** — whichever replays second overwrites the other's checklist/odometer/GPS. One check's data is gone, the outbox is empty, nobody is told. This is the P0 tripwire failing *silently by design*. Composes with 1.3 (the 24h JWT) into a realistic pilot scenario. The UI also displays/echoes a date field the server ignores (`daily-check/page.tsx:318-325`).

**1.2 · A persistently-failing photo upload wedges the entire queue forever, with no operator escape. CONFIRMED (wedge mechanics).** In `useOfflineQueue.ts:193-203`, a photo-resolve failure (including server-reached 413/415/500 from `/api/uploads`) `break`s before the fetch: retries never increment, the item never becomes `failed`, and — FIFO head-of-line — **every later item including plain daily checks is blocked behind it on every pass**. The OutboxDialog offers Retry/Discard only for `status==='failed'` (`OutboxDialog.tsx:90-101`), so the operator sees "Waiting" with no way out. Queue never empties; no self-heal.

**1.3 · The 24h JWT cliff fires mid-shift, synchronized across the crew, and the online-401 path is not parked. CONFIRMED.** Sessions are hard 24h (`session.ts:7`), no sliding renewal. Everyone signed in ~Monday morning → **expiry lands ~mid-shift Tuesday and every day after, roughly synchronized**. Two failure shapes: (a) SWR revalidate-on-focus 401 → `router.replace('/login')` mid-stepper, in-progress check destroyed (`useAuth.ts:89-94`); (b) an **online** submit that gets a server 401 is returned as a bare `"Unauthorized"` error — the 401-parking only protects already-queued items in `flush()`, not `mutate()` (`useOfflineQueue.ts:388-389`) — no sign-in guidance, no preservation.

**1.4 · Lie-fi defeats the queue: no fetch timeout anywhere. CONFIRMED mechanics; field-frequency to verify.** `mutate()` only enqueues when fetch **throws** (`useOfflineQueue.ts:346-410`). On degraded-but-not-dead signal the fetch hangs for the OS timeout (60s+); the Submit button sits disabled on "Submitting…" with no reassurance; the universal operator move is swipe-kill — **form state gone, nothing queued**. This is the most common rural-signal condition, and airplane-mode-clean offline (which A6 tests) never exercises it.

**1.5 · 3+ concurrent `useOfflineQueue` instances flush the same IndexedDB queue simultaneously. CONFIRMED structural.** AppShell + OfflineBanner + page hooks each register their own online/visibility/30s-interval flush; `syncingRef` is per-instance. Consequences: same item POSTed twice with the same key → the loser gets `withIdempotency`'s **transient** 409, which the queue classifies **terminal** (`TERMINAL_STATUSES` includes 409) → false "Failed" ghost for an applied write; item resurrection via stale `putItem`; duplicate photo uploads → 422 body-hash mismatch, or a write sent **with the photo silently dropped**. The trained non-engineer response to a false "failed" — redo the action — is the real duplicate-write vector.

**1.6 · Online partial photo failure persists dead `localphoto:` refs. CONFIRMED.** `mutate()`'s catch assumes offline, but upload errors throw too (`useOfflineQueue.ts:370-377`): the mutation succeeds carrying `photoUrls:["localphoto:<uuid>"]`; routes validate `z.string()` and persist it; the viewer renders a broken image; nothing reconciles. Photo evidence permanently lost while everything reports success.

**1.7 · FND-35 is only half-fixed ("confirmed already-fixed" overstates it).** The array-identity re-run is dead, but on the QR-scan preselect path (and any slow template response for the selected vehicle) a late resolve still calls `setChecklist(...)` and wipes in-progress answers to all-Yes (`daily-check/page.tsx:103-159`). A distracted operator submits a false all-pass — poison in the pencil-whipping dataset. Related: **"Start New Check" after a submit re-seeds the DEFAULT checklist and never re-fetches the admin template** (`:232-243`) — check #2 of the day runs the wrong checklist.

**1.8 · Shared-device identity bleed.** Logout clears the cookie only; the queue carries no userId; SW caches identity/today for 7 days. Operator B on A's phone replays A's parked writes under B's session — A's check recorded as B's (`daily-check/route.ts:109` stamps `session.userId`). Fires only if devices are shared — interview question.

**1.9 · Ended-rig transfer decline/cancel restores ARBITRARY units org-wide.** The no-`inventoryUnitId` fallback flips the first `take: quantity` CHECKED_OUT units **for that item across the whole org** to AVAILABLE (`transfers/[id]/decline/route.ts:100-110`, `[id]/route.ts:86-97`) — phantom availability → double-checkout downstream.

**Verified clean under adversarial reading:** claimHeldStock hold-race, double-transfer guard, proxy 401-for-API, invite revoke-deadness at `/complete`, idempotency body-binding, SW caches-only-200s, businessDate-aware recency, QrScannerDialog lifecycle, cron secret gating + advisory lock.

**Most-wanted missing regression tests:** (1) an offline-queue flush lifecycle harness (fake-indexeddb): photo-failure must not block later items; 401 parks and resumes; two concurrent flushes can't double-send/resurrect — **the pilot's most safety-critical function has zero direct coverage**; (2) late-sync daily-check semantics (replay on N+1 must not overwrite N+1's fresh check); (3) the withIdempotency×queue 409 transient-vs-terminal contract.

---

## 2 · TIER 2 — Pilot ops & release safety (SRE seat): "staging stopped being staging on Monday"

**2.1 · `pr-staging-deploy.yml` deploys unverified code + its migrations onto the live pilot service.** Triggered by `workflow_dispatch` or **adding the `deploy-staging` label to any PR**; no verify job, no migration-safety job; runs `make cloud-run-migrate` against the pilot DB and replaces the serving revision with a `DISABLE_SW=true`, `MIN_INSTANCES=0` build. Cheapest fix: `gh workflow disable pr-staging-deploy.yml` + delete the label for the fortnight.

**2.2 · The migration-safety gate does not cover the branch the pilot runs on.** `migration-safety`/`production-drop-guard` live only in PR-triggered `ci.yml`; a direct push to `development` skips them and auto-migrates the pilot DB. The `acknowledged` waiver is a **warning** on development; hard-fail only guards `production` — a branch with no environment behind it. The held 4b′/4c drop patches are one acknowledged-comment away from the pilot DB. Fix: add migration-safety to `deploy.yml`; treat `development` as production-grade for the fortnight; branch protection.

**2.3 · No verified backup/PITR and no restore drill for the pilot database.** The corpus's own state-of-the-app says backups "exist only as unchecked checklist boxes… no restore drill ever run"; CARRY-8 is parked under PRE-GO-LIVE — but go-live effectively happened Monday. If the tier is free, retention could be ~nothing. **Today's cheapest P0 mitigation: check Supabase → Backups, enable PITR, run one 15-minute restore drill.**

**2.4 · Seed/reset can still fire at the pilot DB from any laptop.** `prisma/seed.ts:10` guards only `NODE_ENV==='production'` (staging-pointed `.env` + `make db-seed` = upserts `ops@agricarbon.com` + operators with PIN `123456` into the live fleet); `make db-reset` has **no guard**. Fix: hostname allowlist refusing `*.supabase.co` in both.

**2.5 · Every pipeline deploy wipes the console-set pilot config.** `cloud-run-deploy` uses `--set-env-vars` (replaces the whole set); `deploy-staging` hardcodes `MIN_INSTANCES=0` and `EMAIL_SANDBOX=true`; `EMAIL_SANDBOX_TO` appears nowhere in the Makefile. The first mid-fortnight merge silently reverts min-instances (6am cold-start returns) and kills the sandbox redirect (sends become silent SKIPPED — and SKIPPED never raises EMAIL_FAILED). If the D6 flip was done in-console, email silently stops. Fix: commit the fortnight values into `deploy-staging`.

**2.6 · Cron liveness has a silent-skip shape and the dead-man has never fired.** Any advisory-lock **connect error** returns HTTP 200 `{skipped}` — Scheduler green forever, alerts/TTL/reap/heartbeat dead. CRON_SILENT deliberately no-ops when `cronLastRunAt` is NULL, so a cron that never completed in this env raises nothing. CC-22's three live-fire checks (healthchecks ping seen, CRON_SILENT raise/resolve, Sentry test event) remain unrecorded. 10-minute verification play in the interview.

**2.7 · No rollback play for the pilot service.** The only rollback docs are prod-scoped. Needed: a 10-line `PILOT_ROLLBACK.md` — `gcloud run revisions list` → `update-traffic --to-revisions=<prev>=100` (safe because migrations are additive); never hand-revert schema.

**2.8 · "Zero lost writes" is unobservable server-side.** Queue state, `possibleDataLoss` (the iOS-eviction tripwire), and terminal failures live only in device IndexedDB and render only on that phone. Client Sentry is init-only. **Cheapest high-value code change of the fortnight: `Sentry.captureMessage` on `possibleDataLoss` and on any item entering `failed`, tagged by user (~1 hour) — a fleet-wide lost-write feed.** Interim: a written lost-write reconciliation query pack (idempotency_key + audit + daily_checks per operator).

**2.9 · Hygiene:** `cloud-run-deploy` defaults `EMAIL_SANDBOX=false` (hand-run = real email pre-audit); no uptime monitor on `/api/health` (cron heartbeat ≠ service liveness; a wedged service at 5:50am is discovered by operator texts); Mapbox token passed to authed clients — fine only if URL-restricted (unverified); INV invariant blocks wrapped in bare `catch {}` — a broken query also goes silent; long-lived `GCP_SERVICE_ACCOUNT_KEY` with no rotation play; anyone with repo write can deploy over the pilot mid-day (make "evening deploys only" binding).

**Runbook gaps (incidents likely this fortnight with no written play):** staging rollback · DB restore · lost-write reconciliation ("operator says they submitted X — did the server get it?") · dead/lost phone with non-empty outbox (answer: unrecoverable; needs a re-entry play) · cron down (console path, force-run, 401 vs skipped vs paused) · accidental deploy-over-pilot (which revision is serving + undo) · Supabase outage (what operators see, when to text the fleet) · post-deploy env re-check (2.5) · Sentry noise flood.

---

## 3 · TIER 3 — Cross-system seams (Integration seat)

**3.1 · INV-5 "custody strand" contradicts the designed flows: false INVENTORY_DRIFT alarms from the first end-of-deployment, and no INV alert ever auto-resolves.** End-of-deployment legitimately sets units IN_TRANSIT with closed kit items (`end/route.ts:122-169`) and TRANSFER dispositions legitimately leave kit items open on an ended rig — both match INV-5's un-aged branch (`cron/dispatch/route.ts:366-386`) immediately. No `resolveActiveAlert` exists for any INV-1..5 sourceId; the stale alert then **masks real strands** (dedup suppresses re-notify while unresolved). The drift detector cries wolf on day one.

**3.2 · Secondary operators: three different answers to "is the check done."** Today is per-operator + PRIMARY-only (`operator-today.ts:61-79`, `deployment-assignments.ts:309-316`) → a SECONDARY sees **"No active deployment"** while My-Deployment (any-role, `deployments/route.ts:117-131`) shows the full rig one tab over — and they can even End it. The missed-check cron asks only "did the PRIMARY submit any check today" (`cron/dispatch/route.ts:181-204`) → if the secondary checks the shared truck, **the primary still gets a MISSED alert**; a primary who checks 1 of 3 vehicles gets none while Today shows 2 due. With 9 operators on one project this is probably live *now*. (Operator seat: the empty-state copy actively misdirects — "when you pick up a rig…" reads as "go start your own deployment" = double-claim; the secondary's only check path is the untaught Scan→check detour; and the primary's Today shows the truck "due" even after the secondary checked it → duplicate checks / "did you do the truck?" texts.)

**3.3 · Linger-forever alerts confirmed:** PIN_LOCKED (PIN-reset doesn't resolve), MATERIAL_REQUEST (**one per request, accretes all fortnight**; fulfill/deny/cancel never touch alerts), EQUIPMENT_NOT_RETURNED, and all six INVENTORY_DRIFT sourceIds have raise paths and no auto-resolve. Because dedup suppresses re-notify while unresolved, a second consecutive missed day sends **no new bell/email**. The bell degrades into noise the cohort learns to ignore — the manager's product (North Star §2.2) dying quietly. Deep-links themselves: all verified landing on real handlers.

**3.4 · `s/[token]` REVOKED/EXPIRED read-after leak is live on a public surface.** `GET /api/s/[token]` builds the full subject payload regardless of state (`route.ts:25-94`) — a revoked/expired reservation link still serves live hub inventory, availableUnits, substitutables; only the UI says "no longer active." Plus the FND-6 shard: the per-line idempotency key still embeds `Date.now()` (`s/[token]/page.tsx:164`) — line-action double-tap dedup never fires. Docs correctly park this as CC-16 step 0, but it guards a live pilot surface **today**. Recommendation (Fable concurs): split out and ship now, independent of the CC-16 decision.

**3.5 · Expired HUB_RETURN links jam both confirm paths.** EXPIRED is computed at read, never persisted; hubs-inbound "awaiting receipt" doesn't filter `expiresAt` (stuck row forever), and admin Mark-received 409s because the receive route reuses `isLinkActionable` (fails on expiry). Unit stays IN_TRANSIT; escape is reissue-then-reconfirm or a manual unit edit whose enum omits IN_TRANSIT.

**3.6 · `forOperatorId` scope split.** Awaiting-pickup cards and the hold-TTL notification target `forOperatorId`, but `listRequests` (Today + Requests page) scopes `requestedById OR fulfillerOperatorId` — an admin-filed reservation *for* operator X gives X a pickup card and a "held items returned" notification pointing at a Requests page where the request **has never existed**.

**3.7 · HUB_RETURN DISCREPANCY is bell-only** — Notification rows (mistyped as DAMAGE_REPORTED), no Alert, no email; the custody loop closes only if an admin reads the bell. Backstop is INV-5's 14-day branch — currently drowned by 3.1's noise.

**3.8 · Offline surface gaps:** `/api/map/crew` uncached → **the crew map is blank offline** (the surface pitched for field coordination); `/api/operators` deliberately excluded → can't initiate a transfer offline; `/api/projects`+`/api/categories` uncached → request form loses its dropdowns; `/api/checklist-templates` uncached → offline operators on a custom-template vehicle **silently answer the wrong (default) checklist** — a data-quality seam, not a blank screen.

**3.9 · W0-10 duality residuals (pre-4b′ gate):** cron comment claims a legacy fallback that doesn't exist — a rig with zero open PRIMARY is **silently dropped from the missed-check scan** (fail-open); `getRequiredPrimaryForRig` throws → kit add/remove 500 on the same corrupt state; two legacy readers remain (admin `operatorId` filter on deployments GET; `assignedOperatorId` write in vehicles route) that will silently break after 4b′. **The deployment-attribution duality has no drift assertion — add the cron check (`rigs.operatorId <> open PRIMARY` → alert) before un-holding 4b′.** CC-17's attribution hook reads the right side.

**3.10 · Metric integrity:** map pins/route-history are **not bounded to the deployment window** — a redeployed vehicle carries the previous rig's trail; `getDailyCheckAdoption` computes eligibility from rigs active **now** for any queried date (history shifts retroactively) and counts any-operator checks (inconsistent with Today's per-operator due); **`durationMs` includes the up-to-10s GPS wait** (capture runs between submit-tap and buildPayload) — charter metric 2 is quietly inflated, and its "trending down" reading is confounded.

**3.11 · Schema hygiene:** `request_line_events` write-only; `Vehicle.assignedOperatorId` a write-only shadow (4b′ fodder); `deployment_requests.requestedById`/`forOperatorId` unindexed yet on every Today load (cheap additive migration); Shipment confirmed dead; NotificationConfig "phantom" actually resolved/wired.

---

## 4 · TIER 4 — Operator & admin experience (Operator-lens seat)

**Credit first:** minimal happy-path daily check is 4 taps from Today; honest distinguished scanner failures; 44px/16px toggles; the floor is high.

**4.1 · The P0 promise is a number the operator can't open and the admin can't see.** OutboxDialog is reachable **only** via the failed-actions banner's Review button; "3 action(s) waiting to sync" is not tappable — the operator cannot see *which* actions, so they text the admin "did my check land?" — the app generating the text it exists to kill. Fleet-side: nothing (see 2.8). The week-1 daily watch ("outbox empty across the fleet") is physically unexecutable.

**4.2 · Friction-budget violations:** duplicate failure narration (per-item note AND mandatory issue summary — prefill one from the other); mandatory handoff note (everything else went optional-with-presets in CC-24); 2 of 4 deployment-builder steps hold only optional fields; site free-text retyped every morning (yesterday's value exists in `operator-today.ts` as `todaySite`); editable Date field on an attestation (server ignores it — pure confusion, invites the FND-7 class); the 10s GPS wait rides every submit with priming copy only on the review step.

**4.3 · The glossary cluster, measured (D11 now urgent):** one physical act ("get my stuff") traverses **Requested → Fulfill → Ready to stage → Stage → Staged / "Stock reserved" → Ready for Pickup / Pick Up → (the same dialog labelled Start/Launch Deployment) → Fulfilled**, while gear is "Checked Out," the dashboard card says "Scan / Check Out · In," the offline fallback flips it to "Check In · Out," and returning is "Return to Hub." Operators must learn that *Staged* = "come get it," *Fulfilled* = "you already have it," *Pick Up* = secretly *Launch Deployment*. Every "what does Staged mean?" text is a friction-budget debit. The sweep is strings-only and precondition-met (D11).

**4.4 · Smaller but real:** crew map buried in the hamburger (bottom nav has no Map) after onboarding sold it hard — plus blank offline (3.8) and no per-pin age copy; iOS error copy says "Pull to refresh" — installed iOS PWAs have no such gesture (copy that lies teaches copy-distrust); `size="small"` tap targets cluster on the new Today components (VehicleChecks/AwaitingPickup/WaitingOnMe) — the 44px discipline didn't reach them; hold expiry (`holdExpiresAt`) received by AwaitingPickupCard and never rendered — "Ready for Pickup" with no deadline, then silent lapse.

**4.5 · Pilot-admin tooling gaps (Max's daily 5-minute watch, priced):** fleet outbox state — no surface (2.8); `GET /api/admin/pilot-metrics` is raw JSON with no UI; GPS grant rate computed nowhere; the variance check is a per-check click-safari (no "today's checks" list, no all-Yes-under-N-seconds flag — the data exists: `durationMs` + answers); adoption denominator contamination-prone (one forgotten test rig or never-ended deployment permanently deflates the ≥90% target, invisibly); no last-seen/who-has-installed view after account creation.

---

## 5 · TIER 5 — Calibration: claims vs code

Full verification table in the seat report; the deltas that matter:

- **Every CC packet claim VERIFIED in the tree** (CC-01..15, 22..27, W0-INT-*, copy-link) — the durability contract is real. Exceptions and caveats:
- **The launch gate has no recorded result.** The A6 checklist's iOS boxes are unticked (`<< Max to run + sign >>`); the corpus ends 07-22; the pilot is live. Either the gate passed unrecorded (the durability contract broke at its most important moment) or the pilot launched through its own only gate. **Interview item #1.**
- **"FND-35 confirmed already-fixed" overstates** (see 1.7). **"Revoke-deadness verified"** is about invite links and can be misread as covering StatusLinks (3.4 — it doesn't).
- **The offline-queue drain engine has zero automated coverage** — helpers-only tests; every component test mocks the hook. The pilot's central promise rides on code no test exercises.
- **CC-22 alerting shipped but never live-fired** (the handoff says so itself).
- **batch6a-date-unify.patch is stale-but-labeled-pending**: 12 of 13 files converged via later rewrites; the real residue is one site (`admin/hubs/page.tsx:71`). Hand-apply, don't `git am`.
- **Open verification debts going into the live pilot** (no recorded result): iOS A6-Lite; Android re-verify 2/19/29; CC-22 live-fires ×3; ops preflight (min-instances, pooling, Mapbox quota); test-artifact sweep approval/deletion; weekend runbook items (CUL005 staging, cards printed, dry-run, Sunday invite send); CC-12 PR3 device parity + CC-23/24 eyeball lists; D6/D15 email chain state.

---

## 6 · TIER 6 — Strategy (Fable seat)

**6.1 · The pilot measures obedience, not preference.** Metric 1 is a compliance rate (checked/eligible) that can't distinguish "beats texting" from "9 people humored the boss for two weeks"; Max is 1 of 9 (owner, admin, reviewer, cohort member — ~11% of the numerator that cannot fail to adopt); Stewart is UK-side; honest independent n≈7. Metric 2's "trending down" is simultaneously the success and the pencil-whip signal (the North Star says so itself); metric 3 is unobservable (2.8). **Nobody baselined the group text** — the incumbent has no control arm. Week-2 readout should add: who *initiated* opens; did the text thread shrink; check `createdAt` vs `date` (right-time vs evening backfill — answerable server-side today); interventions-per-operator (the 9→90 support number); and the exit question ("would you object if it disappeared Monday?") asked as a conversation, n=7.

**6.2 · The pilot is not empowered to change anything.** CC-16→17→18 is written in four documents with no branch on pilot outcome. No decision rule exists for "60% adoption" or "operators loved X, ignored Y." If it's a launch, say so and stop calling the metrics success criteria; if it's a pilot, attach decision rules before the readout.

**6.3 · Queue-order recommendation:** split CC-16 **step 0** (the FND-6 shard + revoked-link leak — security on a live public surface) and ship it now regardless. Make **CC-16-proper conditional on the week-2 readout** (trigger to build: an operator who refused/failed the installed app, or the missed-check chase needs a no-auth path; trigger to park: adoption held without it). Start **CC-17's non-code critical path immediately** (the full A6 matrix — human-run, parallelizable; the Settings/rate-precedence/TaskType decision meeting). CC-18 third, but don't commit its quarter until the manager-persona question is answered.

**6.4 · CC-17's friction-budget test has no facts on the remove side.** The money loop adds the largest required-tap load ever proposed (daily clock-in/out) against an incumbent payroll process **no document describes**. If today's process is "text Max your hours, get paid reliably," the clock is net-added friction for the same money — and the earnings *view*, not the clock, is the retention feature. Interview before the migration, not after.

**6.5 · Under-considered (ranked):** D1's go-live trigger is undefined in the one case that now exists (real users are on staging *today*; the fortnight ends Aug 7 — do the 9 keep working in the app Aug 8?); pilot data's fate (evidence-thesis product silently discarding its first real evidence?); **the manager persona is a ghost** (Loop 2's customer is never named; if ops lead = Max, the week board's falsifier is self-refereed); the second *admin* (D7 named a phone, not a person who can regenerate invites/reset PINs/approve — every admin verb conjugates through Max; becomes a money-path SPOF at CC-17); iOS-PWA as a structural bet with no pre-committed consequence attached to a bad full-A6 result (mitigation menu: MID-5 day-pack, sync-before-end-of-shift, reopen the wrapper); training decay + mid-pilot device churn (a new phone orphans a queue; the onboarding ritual should become a one-pager anyone can run — also the first 9→90 artifact); NS-13 stays deferred but the charter needs a one-line "someone gets hurt" play on the card, and NS-13 should merge with CC-17's Incident TaskType rather than exist twice.

**6.6 · Over-considered (thin, with credit):** the discipline is why a solo owner + AI team hasn't lost work — DECISIONS.md, the grep-anchor step, the launch-handoff pattern, and park-with-trigger are keepers. Thin: five overlapping strategy docs each needing banner maintenance (freeze Master Roadmap + workplan-v2 as reference; living set = STATUS + DECISIONS + current handoff); STATUS §1 is a ~2,000-word "one-paragraph state" — the most expensive read in the repo (thin to ~10 lines + pointers); the session-close contract says 6 steps in CLAUDE.md and 7 in STATUS.md (collapse to one list; keep step 7); freeze the ID namespaces (no new ones; CONV-# retires with its host doc); seat count should scale with blast radius (CC-17 gets all six; strings-only sweeps get one adversarial pass); the compendium is frozen — never patch it again.

---

## 7 · The recommended fortnight response (proposed, pending interview dispositions)

**This week (stability floor, smallest possible diffs):**
1. Disable `pr-staging-deploy.yml` + delete the label (2.1). Verify Supabase backups + one restore drill (2.3). Guard seed/reset (2.4). Commit pilot env values into `deploy-staging` (2.5). Live-fire the cron/heartbeat/CRON_SILENT/Sentry loop once (2.6). Write `PILOT_ROLLBACK.md` (2.7). ~Half a day total, mostly console work.
2. The two Sentry `captureMessage` calls (lost-write feed, 2.8) + a fetch timeout/AbortController in `mutate()`/`flush()` (1.4) + park-online-401s-into-the-queue in `mutate()` (1.3b) + photo-failure must mark-failed-not-wedge (1.2). One focused CC packet; each is a small, testable diff in the same two files.
3. Decide the late-sync semantics (1.1): proposed — replay carries its original businessDate; server rejects (409) a second same-day check instead of upserting over it, queue surfaces "needs review" rather than silent merge. Needs Max's product call on what a day-late check *should* mean.
4. Sliding session renewal (1.3a): refresh the JWT on any authenticated request past half-life. Small diff, kills the synchronized mid-shift cliff for the rest of the pilot.

**Next week (accuracy + bell trust):** INV-5 age-qualifier + auto-resolve for INV alerts (3.1); MATERIAL_REQUEST resolve-on-transition (3.3); secondary-operator Today (3.2 — at minimum: any-role rig resolution + per-rig (not per-operator) check state + honest empty-state copy); expired-link unjam (3.5); `forOperatorId` in `listRequests` (3.6); pilot-metrics UI + GPS grant rate + durationMs excluding the GPS wait (3.10/4.5).

**Parked to the readout:** CC-16-proper (conditional), D11 glossary sweep (strings-only — schedule it), crew-map nav promotion, the friction-budget one-liners (4.2), NS-13 charter line.

---

## 8 · Interview agenda (run 2026-07-28)

Round 1 — pilot ground truth: iOS gate; day-1/2 reality; shared rigs; preflight live-fires.
Round 2 — offline behavior in the field: session-expiry timing, photo usage, outbox observations, device sharing.
Round 3 — strategy: payroll incumbent; manager persona; go-live definition + data fate; crew-map origin; decision rules for the readout; CC-16 conditionality.
Round 4 — process: doc-corpus thinning; second admin; seat-count scaling; what gets built into the workplan.

Dispositions from the interview land in `AHITS_PHASE3_WORKPLAN_2026-07-10.md` (new workstream section) + `DECISIONS.md` (new Dn entries) + `STATUS.md`, per the session-close contract.
