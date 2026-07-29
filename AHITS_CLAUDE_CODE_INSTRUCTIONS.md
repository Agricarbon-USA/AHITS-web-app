# AHITS — Claude Code Instruction Packets
### The canonical packet doc — every packet, one voice, one order

> STATUS: canonical · UPDATED: 2026-07-12 · SUPERSEDES: `AHITS_CLAUDE_CODE_INSTRUCTIONS_2026-07-10.md` + `_2026-07-12.md` · READ-WITH: `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`, `STATUS.md`, `DECISIONS.md`

*How to use this: each queued packet below is a self-contained instruction you paste directly into Claude Code (CC) in your repo. They're written so you don't need to be technical — you copy the block, paste it, and let CC do the engineering. Each names the review seats that must sign off before the patch lands. Executed packets are compressed to a record of what they delivered — do not re-run them. Every packet assumes the standing rules in your `CLAUDE.md` (feature branch → change → `make db-generate && npx tsc --noEmit && npx eslint src && npm test` → PR to `development` → staging deploy; nothing to prod except through the PR flow; the held W0-10 patches stay held).*

**The golden rule to paste at the top of any session:** "Follow CLAUDE.md and AGENTS.md exactly. This is a modified Next.js — read the relevant guide in node_modules/next/dist/docs/ before writing code. Build on a feature branch, run the full verify gate (make db-generate && npx tsc --noEmit && npx eslint src && npm test) before opening a PR to `development`, and do NOT touch the held W0-10 patches (batch5-pr4b, batch5-pr4c) or merge anything to `production` unless I explicitly say so."

**The one authoritative landing order:** CC-10 merge → CC-11 → CC-22 → CC-23 → CC-24 → CC-25 → CC-12 → CC-14 → CC-26 → **pilot fortnight** (CC-27 as filler; the slot assumes D5 = Option A — if Max initials Option B, CC-28 (reserved) is inserted after CC-26) → CC-15/16/17/18. Unscheduled: **CC-19** (tidiness, rolling — land whenever convenient), **CC-20 remainder** (parked-with-trigger), **CC-21** (design spike, no build).

> **A note on the ⟲ pre-flight.** The 2026-07-12 findings were grounded on a working-tree snapshot that was behind `origin/development` — CC-07/08/09 had merged after it. Several fixes in CC-23/24/26 may already be done. Packets that touch that overlap open with a ⟲ pre-flight: verify against current `origin/development` before writing code, skip anything already landed, and report in the PR body what you skipped.

---

## Packet ledger

| ID | Name | One-line scope | Status |
|----|------|----------------|--------|
| CC-01 | Release-safety guards | CI drop-guard, migration-safety hardening, cron advisory lock | ✅ MERGED |
| CC-02 | Data-integrity fixes | Hold race, ended-rig transfer restores, IN_TRANSIT custody, drift alerts | ✅ MERGED |
| CC-03 | Offline & trust one-liners | API 401s (queue parking), idempotency hardening, SW cache, date clamp | ✅ MERGED |
| CC-04 | Prod cutover runbook | Stand up production (operator steps) | 🅿 DEFERRED-D1 |
| CC-05 | Held 4b′/4c landing | W0-10 legacy-column DROP completion | 🅿 DEFERRED-D1 |
| CC-06 | Dashboard fix + vehicle enum | Operator "—" KPI bug; BOBCAT enum; one type→label map | ✅ MERGED |
| CC-07 | Mobile quick-win triage | Leaf-level drawer/search/filter/table fixes | ✅ MERGED |
| CC-08 | Hubs discrepancy + bulk verify | Discrepancy review view, deliberate Dismiss, bulk select | ✅ MERGED |
| CC-09 | Awaiting-Pickup thread | Fulfilled-reservation visibility → seeded checkout | ✅ MERGED |
| — | Wave-0 patches | EmailLog-FAILED alert ✅, URL-filters rollout ✅ — **batch6a date-unify still PENDING** (loose patch; CC-19 owns landing it) | ⚠️ PARTIAL |
| CC-10 | Field-fix logging | Fixed-in-field log + vehicle damage path | ✅ MERGED (PR #180) |
| CC-11 | Admin-as-operator | Admin holds rigs; excluded from money loop (D3) | ✅ MERGED (PR #181) |
| CC-12 | Batch 6b + perf | Monolith split, SWR, outbox view, 401 prompt | ✅ MERGED (PRs #187–#189) |
| CC-13 | Documentation hygiene | — | ⛔ SUPERSEDED → `AHITS_DOC_CLEANUP_INSTRUCTIONS.md` |
| CC-14 | NS-10 Today view | Operator front door + NS-5 + operator IA | ✅ MERGED (PRs #190–#194) |
| CC-15 | Deployment Map | Attestation-GPS pins + route history + crew visibility (D2) | ✅ MERGED (PRs #197/#198, D14) |
| CC-16 | No-app QR daily-check | Public per-vehicle QR check form | 📋 QUEUED — **NEXT (live queue)** |
| CC-17 | Time/Invoicing/Availability | The money loop | 📋 QUEUED (full A6 matrix required first — D13) |
| CC-18 | N-5 Week board | Read-only manager's week | 📋 QUEUED |
| CC-19 | Consistency & dead-code | Envelope/fetchJson/withAuth, verified deletions; land `batch6a-date-unify.patch` | 📋 QUEUED (rolling, unscheduled — batch6a still pending) |
| CC-20 | Dead-end record readers | Remainder only — #1 moved to CC-26 | 🅿 PARKED (trigger: first pilot dispute needing history) |
| CC-21 | Mounted collection units | Design spike, decision first, no build | 🧪 SPIKE |
| CC-22 | Pilot ops rider | Cron dead-man heartbeat + Sentry wiring | ✅ MERGED (PR #182) |
| CC-23 | Tokens + quick fixes + 3 primitives | Design substrate: tokens.ts, contrast, 44px, DetailDrawer/StatusChip/BannerStack | ✅ MERGED (PR #183) |
| CC-24 | Subtraction + glossary | Delete duplicates, one verb per state, optional notes | ✅ MERGED (PRs #184/#185) |
| CC-25 | Live-camera QR scanning | Viewfinder decode loop, one shared QrScannerDialog | ✅ MERGED (PR #186) |
| CC-26 | Daily-check admin viewer | The pencil-whipping falsifier — pre-pilot gate | ✅ MERGED (PR #195) |
| CC-27 | FulfillmentChecklist rebuild | MUI + tokens re-skin, behavior parity | ✅ MERGED (PR #196) |
| CC-28 | Today-lite bridge | ~~RESERVED — exists only if D5 = Option B~~ | ⛔ MOOT (D5 = Option A; never built) |
| — | Copy-link invites | Email-independent onboarding (delivery: EMAIL/LINK) | ✅ MERGED (PR #200) |
| CC-29 | Offline trust floor (pre-launch tier 1) | Photo-wedge, lie-fi timeout, online-401 park, concurrent-flush mutex + transient-409, dead-localphoto, late-sync date semantics (D26), sliding session renewal (D27), flush-lifecycle test harness | ✅ MERGED (PRs #202/#203/#205) — on-device staging smoke = last pre-first-operator gate |
| CC-32 | Friction & flow (operator-experience floor) | D11 glossary sweep, one-time failure entry, site prefill, 2-step builder, template-race fix, GPS warm-capture, openable Outbox, honest copy, Map bottom-nav tab (D28), 44px pass | ✅ MERGED (PRs #209/#210/#211/#212) — #210/#211 shepherded to merge by CC-31 |
| CC-30 | Ops floor (D16 staging-is-home) | Pipeline hardening (no preview onto live, migration-safety gates development, seed/reset guards, env-drift check) + server-side eyes (Sentry on data-loss/failed, cron catches, advisory-lock 500) | ✅ MERGED (PRs #204/#206) |
| CC-31 | Accuracy floor + pilot dashboard | INV-5 false-alarm fix + alert auto-resolves (PR-1, on `development`); expired-link unjam + forOperatorId scope + durationMs + indexes (PR-2 #215); /admin/pilot dashboard + metrics API (PR-3 #214) | ⏳ CODE COMPLETE — PR-1 on `development`; #215/#214 OPEN + green, awaiting Max's staging smoke. Green-fix #213 MERGED. |
| CC-16S | Public-surface security (CC-16 step 0) | s/[token] REVOKED/EXPIRED read-after leak + FND-6 Date.now() idempotency shard | 📋 QUEUED — NEXT (D18) |
| CC-33 | Simplify & unify | Dead-code sweep, Forward→Operator removal (D21), one unified Transfer entry (D22) | 📋 QUEUED |

> **Landing order superseded by the 2026-07-28 re-baseline (STATUS §4 / D17):** the live queue is **CC-29 (✅) → CC-32 → CC-30 → CC-31 → CC-16S → CC-33**. The CC-16 "NEXT" flag above is stale — CC-16 was split (CC-16S ships the step-0 security now; CC-16-proper is PARKED, D18).

---

## Executed — record only, do not re-run

**CC-01 · Release-safety guards — ✅ MERGED.** Held W0-10 patches moved to `held/` with README; CI hard-fail on destructive prod migrations without the `destructive-migration-approved` label; `check-migration-safety.sh` hardened (comment-strip, multi-line, wider destructive patterns, per-statement waivers); `EMAIL_SANDBOX=true` on preview deploys; W0-10 recovery-SQL backfill + zero-NULL guard; FND-23 partial-unique indexes under test; pg_try_advisory_lock on the cron dispatch.

**CC-02 · Data-integrity fixes — ✅ MERGED.** The hold race is dead (atomic cancel + locked `releasedAt` re-check in claimHeldStock); ended-rig transfer decline/cancel restore consumable stock; ended-rig double-transfer claimed conditionally; TRANSFER dispositions leave RigVehicle open; return condition maps to unit status; atomic decrements + resyncItemTotal; disposition coverage required at end; IN_TRANSIT custody loop written for real; drift cron raises INVENTORY_DRIFT alerts.

**CC-03 · Offline & trust one-liners — ✅ MERGED.** Expired-session API requests return real 401s (the offline queue's parking works for the first time); idempotency claim-losers never execute the handler (409/425 instead) and `maintenance/[id]/complete` is wrapped; SW field-reads cache extended; daily-check `date` clamped to business date server-side; OfflineBanner mounted in the admin layout.

**CC-06 · Dashboard fix + vehicle-type enum — ✅ MERGED.** Operator KPI "—" bug fixed (requireAuth + res.ok guard); BOBCAT added; one shared vehicle type→label map.

**CC-07 · Mobile quick-win triage — ✅ MERGED.** Responsive 540/560 drawers; debounced inventory search; duplicate Team filter removed; "Loading checklist" heading fixed; mobile card fallbacks on the worst tables.

**CC-08 · Hubs discrepancy + bulk verify — ✅ MERGED.** Discrepancy review view with resolution verbs; deliberate Dismiss (confirm, status reset, viewable behind a filter); bulk select-many on Inbound as the first shared multi-select consumer.

**CC-09 · Awaiting-Pickup thread — ✅ MERGED.** Operator Awaiting-Pickup cards; pickup seeds checkout with held lines; TTL-sweep pause and residual-hold release were acceptance criteria — ⟲ confirm both shipped, and whether the optional `Rig.requestId` landed (CC-14's pre-flight depends on it).

**Wave-0 patches — ⚠️ PARTIAL.** EmailLog-FAILED alert ✅ and URL-filters rollout ✅ are merged; **`batch6a-date-unify.patch` is still PENDING** (verified 2026-07-22: `admin/hubs/page.tsx` still has an unconverted `toLocaleDateString` date site). The loose patch lives at repo root; CC-19 owns landing it.

**CC-10 · Field-fix logging — 🔄 IN REVIEW (PR #180).** Operators log a fixed-in-field issue on any vehicle or unit (COMPLETED task, no alert, no status flip) or report vehicle damage (IN_PROGRESS, vehicle → IN_MAINTENANCE, DAMAGE_REPORTED alert); admin maintenance close handles vehicle repairs. Merge on CI green + staging smoke — first item in the landing order.

**CC-13 · Documentation hygiene — ⛔ SUPERSEDED.** Absorbed into `AHITS_DOC_CLEANUP_INSTRUCTIONS.md` (the 6-agent doc pass). Run that instead; this row remains so the CC-13 reference resolves.

---

## ⛔️ Deferred — prod cutover (CC-04 / CC-05). Do not run; retained for go-live.

> **Postponed by D1 (see `DECISIONS.md`).** Production does not exist yet; standing it up is a full from-scratch job for actual go-live. It gates nothing — the pilot and the money loop run on staging. Leave the held W0-10 patches held. At go-live, follow `PROD_CUTOVER_RUNBOOK.md` (new Supabase project → 11 secrets → migrations → first admin → prod cron → isolation checks), not these condensed steps.

**CC-04 · Prod cutover (condensed, SRE primary).** Confirm `AHITS_PROD_MIGRATE_URL` ENABLED + accessor; run the two prod invariant queries (one open PRIMARY per active rig; legacy `operatorId` matches assignment PRIMARY) — both zero rows, capture a PITR anchor; only then merge the prod PR, watch the migrate job, smoke. Stop for human confirmation between every step.

**CC-05 · Held 4b′ → 4c (condensed, explicit go only).** Apply `held/batch5-pr4b-writers-nullable.patch`, verify, stage, smoke, promote; then — only on explicit go, invariants re-run zero, archive + PITR confirmed — apply `held/batch5-pr4c-drop.patch` (drop its already-committed prisma/recovery hunk). The irreversible DROP; see D4.

---

## The queue — in landing order

### CC-11 · Admin-as-operator (with money-loop exclusion)
**Review seats:** Antagonist, SRE, Fable.

```
Allow an admin to hold a rig and accept transfers/handoffs, implemented against the deployment_assignments model (post-W0-10), with admin-held rigs EXCLUDED from the money loop per D3. Feature branch, verify gate.

1. Relax the role gates that block ADMIN as a transfer recipient (src/app/api/deployments/[id]/transfer/route.ts ~line 84) and handoff target (.../handoff/route.ts ~line 47), and include admins in the /api/operators destination roster (role: { in: ['OPERATOR','ADMIN'] }).
2. Add admins to the admin deployment-builder dropdowns (if an admin can hold a rig they must be selectable).
3. An admin holding a rig writes a PRIMARY assignment (not the legacy column). Surface a clear message if accepting a transfer would create a second open PRIMARY (the FND-23 index A 409) rather than a confusing dead-end.
4. POLICY (required): admin-held rigs must be EXCLUDED from payroll attribution and flagged distinctly in missed-check scans and dashboards. Implement the exclusion in the cron missed-check scan now, and leave a clearly-commented hook in the attribution logic so the Time/Invoicing capstone inherits the exclusion. Do not let admin-held rigs enter the money loop.
```

### CC-22 · Pilot ops rider — cron heartbeat + Sentry
**Review seats:** SRE (primary), Antagonist.

```
Two operability fixes so the pilot isn't flying blind. Feature branch, full verify gate. Neither may email real people from a sandbox and neither may fail closed when its secret is absent.

1. CRON HEARTBEAT (dead-man ping). Staging's dispatch cron (src/app/api/cron/dispatch/route.ts) is now the pilot's production heartbeat — TTL release, alerts, drift watchdog all ride it — and nothing alarms if it silently stops. Two signals, external primary + in-app secondary:
   - PRIMARY (external, LIVE code): after a successful run, `fetch(process.env.CRON_HEARTBEAT_URL)` with a 3s timeout and `.catch(() => {})` — never let the ping fail the run. When the env var is absent this is a true no-op (no fetch, no log spam). Max points it at a healthchecks.io check that alarms on silence — the alarm channel must not depend on the app or the cron being alive.
   - SECONDARY (in-app): persist a `lastRunAt` timestamp every time the dispatch handler completes a run (a single-row table/settings key — propose the simplest durable spot). Add a read-side check that raises a CRON_SILENT Alert when `now - lastRunAt` exceeds 30 minutes, evaluated on admin dashboard/aggregate load — NOT dispatched by the possibly-dead cron itself.
   - RE-ARM (required): the dispatch handler must call resolveActiveAlert('CRON_SILENT') on every successful run — the activeKey dedup means the alert can never re-raise after a recovery otherwise.
   - MIGRATION: CRON_SILENT needs an additive AlertType enum migration (precedent: 20260711000000_add_inventory_drift_alert_type).

2. SENTRY WIRING (FND-17). Wire the Sentry SDK server-side AND client-side:
   - Read the DSN from `AHITS_SENTRY_DSN` (env / Secret Manager). When it is ABSENT the SDK must initialize to a no-op — no crash, no network, sandbox-safe.
   - ACTIVATION (be honest about the steps): create the Secret Manager version ENABLED first, then add the --set-secrets mapping in the deploy config in the same change (or `gcloud run services update --set-secrets`), then redeploy. The secret must exist ENABLED before the deploy that mounts it.
   - CLIENT DSN + REQUEST-ID: the root layout is already dynamic — pass the DSN and the `x-request-id` (already set in src/proxy.ts) server→client via a provider, and tag both server and client Sentry events with it so a captured error joins the request trace. NO NEXT_PUBLIC_ DSN, no hardcoded DSN anywhere.
   - CSP: add the Sentry ingest host to connect-src in the CSP built in src/proxy.ts (or route events through a same-origin tunnel) — without this, client events are silently blocked and the wiring only LOOKS live.

ACCEPTANCE: with no DSN and no CRON_HEARTBEAT_URL set, tsc + tests + a local run are clean and no outbound call fires. With a dummy DSN set, a thrown server error and a thrown client error both capture with the request-id attached (client event passes CSP). Stopping the cron for >30 min raises a visible CRON_SILENT alert, and the next successful run resolves it.
```

### CC-23 · Design tokens + quick fixes + first 3 primitives
**Review seats:** Design / Operator-lens (primary), Antagonist, Calibration.

```
The design-system substrate: one set of rules where there are currently five. This is incremental — NO visual redesign, behavior stays identical. Feature branch, full verify gate. Propose a PR breakdown (tokens → quick fixes → primitives) before writing code if it helps review; one staging deploy is fine if kept coherent.

⟲ PRE-FLIGHT (do this first, report findings): CC-07/08/09 merged after our snapshot. Against current origin/development, verify which of these are ALREADY fixed and SKIP them: the admin/deployments (560) + admin/inventory (540) clipping drawers; the duplicated Team-page project filter; the static "Loading checklist" heading on s/[token]; the Dismiss/Revoke rename; the discrepancy review view. State in the PR body what you skipped.

SCOPE NOTE: the full per-surface density standard (44px floor + 16px actionable text across all operator surfaces) is PARKED — owner: CC-12/CC-14, demand-pull as those packets touch each surface. CC-23 fixes the named offenders below and applies 44px/16px to ANY control it touches.

TOKENS:
1. Create one exported src/theme/tokens.ts (color palette, type scale, spacing, density constants). Consume it from the MUI theme AND from the rogue files that re-implement the brand by hand: the ~offline color file and the s/[token] public portal (which may stay raw-HTML but must pull palette/type from tokens.ts — CC-23 owns this; CC-27 does not). FulfillmentChecklist is NOT re-colored here — CC-27 owns its rebuild; lint-except it until then. Snapshot count for calibration: 96 hex literals across 14 files. Add real type-scale tokens.
2. CONTRAST: the secondary amber #ff8f00 on white is 2.3:1 (WCAG fail) and warning-outlined chips are 3.6:1 at the smallest font. Pick an AA-passing amber for text/outlined use (keep a darker token for text-on-amber where needed) and route warning/secondary text + outlined chips through it.
3. DENSE CHIP: add a theme `dense` chip variant (height 20 / fontSize 11) and replace the 15+ hand-rolled height:18/fontSize:10 sites (they clip descenders).
4. TOUCH TARGETS: 44px minimum on operator routes — daily-check Yes/No ToggleButtons to size="medium" + fullWidth; PhotoCapture remove button moved inside bounds at 44px.
5. StatCard alpha bug: the icon tint uses a `${color}18` string on theme paths → invalid CSS → transparent icon. Replace with alpha(theme.palette[x].main, 0.09).
6. ESLint: add a no-hex-outside-tokens rule (forbid raw hex literals in src except tokens.ts), shipped WITH an explicit allowlist: email templates.ts (30 hexes — HTML emails need literals or token-constant interpolation), s/[token] until CC-27, FulfillmentChecklist until CC-27. The 9 single-hex files get fixed in this packet, not allowlisted.

REMAINING QUICK FIXES (all small):
7. Alert action-slot pairs → move buttons into the body; kill the five `mt:-0.5` hacks.
8. Add minWidth:0 + wrap on the kit-row and vehicle-row Stacks so long content can't overflow.
9. Table minWidths on the worst admin tables + truncate the vehicles `join(',')` cell with a Tooltip for the full list.
10. Snackbar: offset above the bottom nav and route through a SINGLE Snackbar host; kill the 3 inline toast systems (hubs/users/settings → the shared useToast).
11. OfflineBanner: collapse the up-to-7 stacked alerts to 1 visible, priority-ordered, in a true full-bleed AppShell slot.

FIRST 3 PRIMITIVES (build + adopt as part of this packet):
12. DetailDrawer ({ xs:'100%', sm:480 }) — adopt on all 5 drawers (this is what finally kills the 540/560 clippers if the pre-flight found them unfixed).
13. StatusChip v2 (dense + semantic badges) — replace the hand-rolled chip sites.
14. BannerStack — the priority-collapse host the OfflineBanner fix (11) mounts into. Priority order (specified — the pilot triage card depends on it): auth/parked-work banners > offline > informational.

ACCEPTANCE: hex-literal count outside tokens.ts drops to the declared allowlist (email templates.ts + the two CC-27-pending files) and the ESLint rule passes; every control this packet touched on operator surfaces meets 44px targets AND ≥16px actionable text; no visual regression on the 5 drawers (they now use DetailDrawer); tokens.ts is the single source for palette/type, including s/[token]. Ship component tests for DetailDrawer, StatusChip v2, and BannerStack.
```

### CC-24 · Simplicity by subtraction + glossary
**Review seats:** Operator-lens (primary), Fable (scope), Calibration.

```
Delete, don't improve. Every deletion here removes a way to be confused without removing a capability — and each deletion MUST name, in the PR body, where the capability lives afterward. Feature branch, full verify gate.

⟲ PRE-FLIGHT: CC-08 may have already unified part of the Dismiss/Revoke verb, and CC-09 #5 already locked some glossary terms — verify against origin/development and sweep only the residue.

1. Merge the dashboard's two cards that go to the same place — "Check Out / Check In" and "Scan QR" both route to /operator/scan → collapse to ONE card, one name. The deletion target is the duplicate CARD, not the /operator/checkout redirect: KEEP the redirect unless the PR proves zero inbound references (bookmarks, notifications, deep links). (Capability preserved: scanning/checkout still lives at /operator/scan.)
2. ONE verb for Dismiss/Revoke everywhere — pick the survivor term and use it on every button/badge/toast for that action.
3. Merge the two remove-gear flows in my-deployment into one: the per-row remove and the bulk DispositionDialog path currently diverge. Pick the simpler survivor (route per-row through the same DispositionDialog, or vice versa) and delete the other. Name the survivor in the PR body. ACCEPTANCE — tap parity: the surviving single-item remove must MATCH OR BEAT the current 2-tap per-row count (DispositionDialog pre-filtered to the one item, all defaults live). (Capability preserved: both single and multi removal still work through the one path.)
4. Make the REQUIRED typed note optional, with one-tap presets, at deployment launch AND kit mutations. Presets: "Picked up from hub", "End of day return". Free text stays available; it's just no longer mandatory. NOTE: the requirement is enforced server-side too (zod min(1) in the deployments API) — relax BOTH client and server or the client change 400s.
5. Rename material-request "fulfill" honestly — it moves no stock. Label it "Mark handled" (or similar) pending the future stock wiring, and note in the PR body that the honest wiring is deferred. SCOPE GUARD: rename on MATERIAL-REQUEST surfaces ONLY. Never rename reservation/hub fulfillment (the "Fulfilled" state, FulfillmentChecklist, the operator "Mark Fulfilled") — that flow really moves stock. Rule: "Fulfill" is reserved for stock-moving actions.
6. Glossary sweep — one term per state, full list: Staged/Prepared, Fulfilled, Pick up, Check out, Claim, Received, Deactivate, Dismiss/Revoke. Lock one word per state on every surface (button/badge/header/toast). SEQUENCING: the Fulfill / Pick-up / Check-out / Claim cluster WAITS for CC-14's Rig.requestId model fix (renaming before the model joins the states forces a second rename pass) — sweep the rest now and note the deferred cluster in the PR body.

CONSTRAINT (acceptance): nothing deleted may lose functionality. The PR body must list each deletion with the surviving home of its capability. Add/adjust component tests for the merged remove-gear flow and the now-optional note.
```

### CC-25 · Live-camera QR scanning
**Review seats:** Operator-lens (primary), SRE (perf/battery), Antagonist.

```
Replace photo-capture→decode with a live viewfinder — the most-repeated hardware gesture and the single biggest felt-friction kill. Feature branch, full verify gate.

1. Replace the photo-capture→jsQR flow with a continuous getUserMedia viewfinder + decode loop: BarcodeDetector where available (may run at native rate), else jsQR CAPPED at ≤8 decodes/sec on a downscaled frame (≤640px on the long edge) — never full-res jsQR on every rAF (battery/thermal). The <video> element MUST carry playsinline muted autoplay (iOS goes fullscreen/black without them). Add a torch toggle where the track supports the torch constraint — note torch AND BarcodeDetector are unsupported on iOS Safari, so the jsQR path is the real iOS path; test it there.
2. Build ONE shared <QrScannerDialog> and consume it in THREE places: operator/scan AND the two embedded scanners in my-deployment. No copy-paste of the decode loop.
3. Retain the manual-entry fallback (typed code) in the shared dialog.
4. DEGRADE HONESTLY: permission-denied and no-camera paths fall back to the current photo-capture flow (don't dead-end). Offline: decoding is LOCAL — only the resolve/lookup call needs network. On the lookup, DISTINGUISH the two failures: "code not found" (server said no) vs "can't verify right now" (offline/network error) — today both wear the "Failed to process image" lie; fix both strings.
5. Stream lifecycle: stop the camera on dialog close / unmount / tab-hidden, and RESUME it on visibility-regained while the dialog is still open (an operator switching apps mid-scan must not return to a dead viewfinder). No stream left running in the background.
6. Add live-scan rows to AHITS_A6_DEVICE_CHECKLIST.md (iOS Safari + Android: live decode, torch where supported, permission-denied fallback).

ACCEPTANCE: on a phone, a code decodes live from the viewfinder with no shutter tap in operator/scan and both my-deployment scanners (verified on iOS Safari via the jsQR path); denying camera permission falls back to photo capture, not a blank screen; offline shows "can't verify right now", a bad code shows "not found" — never "failed to process image"; the stream stops on close and resumes on app-switch-back. Ship a component test for QrScannerDialog (mocked decode, permission-denied path, manual-entry path).
```

### CC-12 · Batch 6b + Performance & Feel (structural)
**Review seats:** SRE, Operator-lens, Antagonist.

```
The structural performance workstream. Feature branch(es); this is large — propose a PR breakdown before writing code. Verify gate on each.

1. Split the my-deployment monolith (src/app/(operator)/operator/my-deployment/page.tsx, ~2025 lines / ~58 useState) along its component seams so a state change doesn't re-render the whole page. Do the same triage for admin/deployments (~1521) and admin/inventory (~1355) if time allows.
2. Introduce SWR (or an equivalent query cache) for list reads, with revalidateOnReconnect, powering a "data as of HH:MM" freshness indicator across cached views.
3. Add an OUTBOX view: render the offline queue's existing per-item labels and lastError, with per-item retry/discard, replacing the current blind bulk "Dismiss" of all failed items.
4. Add a 401-parked-queue prompt: when a flush hits 401 with pending items > 0, show "Session expired — sign in to send N saved actions" with a login link (instead of the queue silently reading "waiting to sync" forever).
5. Profiler pass on the worst offenders: memoize/virtualize large lists, cut redundant fetches.
6. ACCEPTANCE: every split/new component ships with a component test. Component-level tests are currently absent app-wide (lib/API only) — this packet starts closing that gap for the surfaces it touches.
7. The remaining 5 design primitives — MobileCardTable, EntityCard, EmptyState, PageHeader, FilterBar — are built DEMAND-PULL inside CC-12/CC-14 as the split surfaces need them, NEVER as a standalone sweep. (The first 3 — DetailDrawer, StatusChip v2, BannerStack — land in CC-23.)
```

### CC-14 · NS-10 Today view + NS-5 + operator IA
**Review seats:** Operator-lens (primary), Integration, Fable.

```
Build the operator's "Today" front door, replacing the static 4-card dashboard. Feature branch, verify gate. Read the North Star v3 NS-10 spec first.

0. ⟲ PRE-FLIGHT: verify whether `Rig.requestId` (the nullable reservation→deployment link) shipped with CC-09. If it did NOT, adding it is REQUIRED here — it is the load-bearing model fix that lets the Awaiting-Pickup cards and the deployment they became be joined without the operator's memory. Do not build the pickup cards on this view until that column exists.
1. Add one GET /api/operator/today aggregate (pure read-side over Rig/RigVehicle/DailyCheck/TransferRequest/DeploymentHandoff/DeploymentRequest — every query already exists somewhere). Add it to the SW field-reads cache matcher.
2. Replace the dashboard with the operator's day: current deployment + project (with DailyCheck.site + access notes read-only), per-vehicle daily-check state (done/due, one tap in), transfers/handoffs waiting on ME, my open requests + the Awaiting-Pickup cards from CC-09, and a slot for today's clock state (post-Time/Invoicing). One contextual primary action: before check → "Start daily check"; after → "You're set."
3. NS-5 odometer sanity: on the daily-check odometer field, show an inline warning if the entered value is less than the vehicle's last known reading or an implausibly large jump — never block submit.
4. Operator IA fixes: add Requests to the bottom nav (the redundant "Check Out / Check In" card was already merged into the single scan card by CC-24 — do NOT delete the surviving scan card); put the pending-transfer badge on the bottom-bar tab (not just the drawer); add a confirm dialog on the operator request Cancel action; replace the flat roster/item dropdowns with a searchable Autocomplete as a shared component.
5. Instrument daily-check time-to-complete (client timing, no new capture).
Falsifier to note in the PR: if session analytics show operators deep-linking past Today into the old flows, we redesign.
Acceptance: split/new components ship with component tests (not lib/API tests only). Also instrument the pilot adoption denominator (eligible daily checks / deployments) — Pilot Charter metric 1 is assigned to this packet.
D5 outcome: << placeholder — if D5 chose the Today-lite bridge (CC-28), that bridge is superseded by this full Today view; if D5 held the pilot for Today, this packet IS the gate. Fill from the Pilot Charter §5. >>
```

### CC-26 · Daily-check admin viewer
**Review seats:** Integration (primary), Operator-lens.

```
The pencil-whipping falsifier. Today NO admin surface reads a submitted daily check's full contents — so diligent and pencil-whipped checks are indistinguishable, which makes the whole data-quality plan unfalsifiable. This must land BEFORE the pilot fortnight. Feature branch, full verify gate. (Pulled forward from CC-20 #1.)

⟲ PRE-FLIGHT: the vehicle drawer ALREADY lists recent checks (date/operator/passed) — EXTEND that list into deep-links to the new viewer; do not build a duplicate list next to it.

1. Read-only daily-check viewer: a surface that shows a submitted check's FULL contents — checklist answers, odometer reading, site, photos. Leave a clearly-marked slot for GPS-when-present (CC-15 adds the coords later; the viewer should render them if the columns exist, absent-safe otherwise).
2. Reachability — three entry points: (a) the vehicle drawer's existing check list (extended per the pre-flight); (b) the deployment drawer; (c) the check alerts. FAILED-check alerts deep-link to the specific check; MISSED-check alerts have no record to open — they land on the vehicle's check history instead.
3. A per-vehicle check-history list (most-recent-first) as the extension of the existing drawer list, so an admin can see the trail and open any entry.
4. THE ONE SMALL WRITE this packet owns: add checkId to the metadata of the two check alerts (DAILY_CHECK_FAILED / DAILY_CHECK_MISSED where applicable) so the deep-link can carry it. Dedup semantics: createAlert's update:{} freezes metadata at the FIRST failure — change the re-raise path to UPDATE metadata so the link points at the latest relevant check. SCOPE GUARD: carry the record id on the two check alerts ONLY; the rest of CC-20 #6 (deep-links everywhere else) stays PARKED.
5. Otherwise pure read-side — no new capture. Reuse the aggregate/query patterns; add the route to the SW field-reads cache matcher if an admin offline read is plausible (optional).

ACCEPTANCE: from a failed-check alert, one click opens that exact check showing answers + odometer + site + photos; a missed-check alert lands on the vehicle's check history; the vehicle AND deployment drawers reach the viewer; a re-raised check alert points at the latest check, not the first; nothing on the viewer is writable. Ship a component test for the viewer render (with and without photos/GPS).
```

### CC-27 · FulfillmentChecklist rebuild (pilot-fortnight filler)
**Review seats:** Design, Calibration (behavior parity).

```
Scheduled as pilot-fortnight filler. FulfillmentChecklist is an entire parallel UNTHEMED design system rendered inside the themed admin app (raw system-font buttons next to MUI buttons on the same screen — the most visible "two apps in one page" spot, inside admin/requests). Rebuild it on MUI + tokens. Feature branch, full verify gate.

1. Rebuild the raw-HTML FulfillmentChecklist on MUI components consuming tokens.ts (from CC-23). Behavior identical — same actions, same states, same outcomes; this is a re-skin on the real component system, not a redesign. Remove the file's CC-23 lint-allowlist entry as part of this packet. (The s/[token] re-palette is NOT here — CC-23 item 1 owns it.)

MERGE GATE: this lands mid-pilot and touches the pilot's critical hub path — its merge is gated on a hub-flow staging smoke (fulfill a request end-to-end through the rebuilt checklist on staging) before it goes in, not just CI green.

ACCEPTANCE: FulfillmentChecklist renders with themed MUI controls and no raw hex/system-font literals; every existing action produces the same result it did before (behavior parity is the review bar — Calibration verifies old vs new step-by-step); the hub-flow staging smoke passes pre-merge.
```

> **CC-28 · Today-lite bridge — RESERVED.** This packet exists only if Max initials D5 = Option B (Pilot Charter §5): a minimal bridge on the existing dashboard — check-done chip + transfers-waiting-on-me row + Awaiting-Pickup cards — inserted after CC-26 so the pilot doesn't launch onto the static menu. If D5 = Option A (recommended), CC-28 is never written.

### CC-15 · Capstone 1 — Deployment Map (+ route history + crew visibility)
**Review seats:** Fable (scope — this carries the D2 anti-goal override), Antagonist, SRE, Operator-lens.

```
Build the Deployment Map capstone. IMPORTANT SCOPE NOTE: per an explicit product decision, this includes route history and crew visibility, but NEVER real-time tracking — all positions come from GPS captured on daily-check attestations the operator already submits. Read the workplan §7A and the Master Roadmap §7.2A first. Feature branch, verify gate.

1. Migration: 3 additive nullable columns DailyCheck.gpsLat/gpsLng/gpsAccuracy Float?. Merge early.
2. Capture: getCurrentPosition in the daily-check buildPayload(); resolve-or-skip before enqueue (never block submit; denied permission → no coords). Confirm FND-35 (late-response answer wipe) is fixed first since it's the same file.
3. Secrets: AHITS_MAPBOX_TOKEN server-side only (NOT NEXT_PUBLIC_); create the Secret Manager version ENABLED before the deploy that mounts it and add the --set-secrets mapping in the same change.
4. Admin map v1: one pin per active deployment at latest-check coords; recency colors (green <24h / amber 24-48h / red >48h, businessDate-aware); tooltip deep-links to the deployment drawer via URL params.
5. ROUTE HISTORY (per decision): a read-side per-rig trail connecting that rig's daily-check GPS points over time — "where has this rig been," from check-ins. This is historical only, NOT live position. Render as a point-sequence/polyline on the admin map and in the deployment drawer.
6. CREW VISIBILITY (per decision): an operator-facing map showing other operators' LAST-KNOWN positions (from their most recent attestation), framed for coordination (swap gear / request help). No live tracking, no continuous location, zero new operator taps.
7. After Map ships: NS-4 weather stamps (nightly server job stamps deployment-day weather from GPS + businessDate; zero operator taps).
Anti-goal guard: no real-time tracking anywhere; positions are last-known from attestations only.
```

### CC-16 · Capstone 2 — No-app QR daily-check
**Review seats:** Antagonist (public surface), SRE, Integration.

```
Build the no-app QR daily-check web form. Security preconditions must be true first: CSP nonce (done), rate limits (done), and FND-6's last shard — close it as step 0. Feature branch, verify gate. Read Master Roadmap §7.2B.

0. Close the FND-6 residual: in src/app/s/[token]/page.tsx ~line 158, replace the Date.now()-based line-action idempotency key with a stable content key (`${token}:${lineId}:${action}`). Also fix the read-after-revoke leak: src/app/api/s/[token]/route.ts serves the full subject payload (including live hub inventory) for REVOKED/EXPIRED links — when the link is not actionable, return only { type, state, actionable:false }.
1. Extract the authed daily-check side-effects (createAlert DAILY_CHECK_FAILED / resolveActiveAlert / EQUIPMENT_NOT_RETURNED chain) into lib/daily-check.ts so the public path can't drift from the authed path.
2. Schema: add StatusLink.vehicleId subject column + index and StatusLinkType='DAILY_CHECK'. Use a sentinel "external" user for DailyCheck.operatorId (keeps the unique key intact). The missed-check cron and resolveActiveAlert must key on the presence of ANY DailyCheck row for (vehicleId, businessDate), operatorId ignored, so either path resolves the alert.
3. API: ALLOWED_ACTIONS entry + applyTransition branch calling lib/daily-check.ts (same alerts, same photos via the rate-limited upload path).
4. UI: printable per-vehicle QR (qrCodeId already on Vehicle) → public mobile form; token treated exactly like every other status-link token.
5. Wire the DAILY_CHECK_MISSED chase email/notification to include the QR-form link.
6. Tests: public auth-less path, idempotency dedupe, failing-check side-effects from the public path, revoked/expired token denied.
```

### CC-17 · Capstone 3 — Time/Invoicing/Availability (the money loop)
**Review seats:** ALL SIX (this is the long pole and the money-and-data path). Break into sub-PRs.

```
Build the Time Tracking / Invoicing / Availability capstone — the money loop. This is un-gated now (W0-10 readers landed; the DROP is elective). Gates that DO apply: FND-8 email verified in staging before the invoice email; FND-7/FND-14 (offline dates/queue) proven by the A6 pass; and admin-held rigs excluded from attribution (D3). Read Master Roadmap §7.2C and the workplan §7C first. Propose the sub-PR breakdown before coding. Verify gate on each.

DECISIONS TO CONFIRM WITH ME BEFORE THE MIGRATION:
- A real single-row Settings model (not extending NotificationConfig) for milesReimbursementRate, invoice numbering, processor allowlist.
- Rate precedence: OperatorRate (per-operator, per-task-type, effective-dated) > TaskType.defaultRate > User.hourlyRate. ONE SQL-computed resolver; never JS float summing.
- TaskType seed including exception types: Weather Delay, Breakdown/Repair Wait, No Access, Travel, Sampling, Maintenance, Training, Incident — each with payable + productive booleans. Incident is its OWN task type (liability-separable), not folded into Breakdown.

MIGRATION (one additive PR): TaskType, OperatorRate (immutable snapshots, effective-from), TimeEntry (with its OWN projectId snapshot at clock-in), Expense, Invoice, InvoiceLineItem, Availability (@@unique(operatorId,date)), the Settings model, and a nullable region column on the money models.

API (~8-10 routes on the existing primitives): clock-in/out with withIdempotency from day one (server timestamps authoritative; businessDate bucketing); the clock-in >48h/<48h "new deployment?/same as last?" flow per the PRD; GET time-entries (mine/admin); missed-clock-out reconciliation; expenses CRUD + mileage; availability CRUD; invoice lifecycle (SQL-summed lines = time × resolved-rate snapshots + expenses) → INVOICE StatusLink + email template + applyTransition INVOICE branch + PDF + VIEWED→PAID back-write with audit; recipients from a server-side allowlist (SSRF guard). ATTRIBUTION via deployment_assignments only, and EXCLUDE admin-held rigs.

OFFLINE: clock writes ride useOfflineQueue.mutate() + idempotency; the Today view shows queued clock state ("clock-out saved, will sync").

OPERATOR UI: clock-in from Today; task-type picker with exception states one tap deep; NS-11 close-out ritual as clock-out (confirm hours → surface unfinished items as optional one-tap fixes → "Day closed — you logged 9.5 h"); MID-3 earnings view ("you've earned $X this period") — part of the definition of done.

ADMIN UI: time review/approval, invoice pipeline (draft→issued→viewed→paid with EmailLog + StatusLink state inline), availability grid, missed-clock-out exceptions.

ACCEPTANCE: one pilot payroll period runs clock → approve → invoice → emailed → PAID with zero manual corrections; an operator answers "how much did I earn this week?" in ≤2 taps.
```

### CC-18 · N-5 Week board
**Review seats:** Integration, Operator-lens, Fable.

```
Build the read-only week board (manager's week). Read Master Roadmap §7.2D / North Star N-5 first. Feature branch, verify gate. Requires the URL-param filter rollout to be in place first.
1. No schema. One GET /api/week-board?start= aggregate returning deployment-rows × day-cells with typed annotations.
2. UI: timeline grid, deployments as rows, days as columns; annotation chips per the layer registry; every chip click-throughs via URL-param filters to the owning page (the board is a lens, not a copy — no new detail surfaces).
3. v1 scope = layers L1-L5 + L8-L9 only (deployment bars, maintenance due, rental windows, request deadlines, missed/failed checks, in-transit/awaiting-receipt, people events) — all sources exist today. L6 Availability and L7 exception days light up only after Time/Invoicing is adopted and producing rows.
4. Anti-goal guard: no drag-to-reschedule, no auto-assignment, read-only v1.
```

---

## Unscheduled — rolling, parked, and spike

### CC-19 · Consistency & dead-code pass (rolling — land whenever convenient)
**Review seats:** Calibration (primary), Antagonist, SRE.

```
A tidy-without-losing-functionality pass. Feature branch, verify gate; run tsc + tests after each deletion to prove nothing broke.
1. Adopt the ok()/fail() response envelope and a shared fetchJson guard across the loaders that currently skip res.ok; land the withAuth/withAdmin wrapper (FND-43) to replace the ~75 hand-rolled auth preambles incrementally.
2. Land batch6a-date-unify.patch (unifies ~30 toLocale* date sites to formatDate/formatDateTime; leaves numeric formatting alone).
3. Extract the 2-3 near-duplicate accept/decline "respond" dialogs into one shared RespondDialog.
4. Delete verified dead code (run tsc after EACH deletion). The exact 7 unused exports in lib/deployment-assignments.ts are: getActivePrimary, listDeploymentProjects, listProjectDeployments, removeProjectLink, listAssignments, addAssignment, endAssignment. IMPORTANT: do NOT delete getDeploymentRosters — it has no external importer but IS called internally by getDeploymentRoster, so it is not dead. Also delete: GET /api/inventory/stock (its "used by checkout dialogs" comment is false — the frontend uses /api/inventory/[id]/stock); GET /api/checkout (keep the POST 410 tombstone); the dead lib/shipments.ts (but KEEP the Shipment model dormant — it's reserved for the Shippo trigger); remove the @emotion/cache and @emotion/server deps; evaluate removing @mui/x-date-pickers (only a LocalizationProvider wrapper in providers.tsx, no picker rendered).
5. Fix the stale/false comments: the PR-4a-contradicting comments at cron/dispatch ~line 134 and transfers/route.ts ~line 31-32, and the false comment at lib/deployment-auth.ts ~line 9-10 claiming the legacy columns "were dropped in PR-4" (they were not — 4c is held).
```

### CC-20 · Dead-end record readers — 🅿 PARKED (remainder only)
**Review seats:** Integration (primary), Operator-lens.

```
STATUS: PARKED (except #1, moved to CC-26). Trigger to un-park items 2–6: the first pilot dispute that needs history a surface can't show (e.g. "did this transfer resolve?", "who confirmed this request?"). Until then these are legibility nice-to-haves, not blockers.

1. MOVED → CC-26. The admin daily-check viewer is pulled forward and must land before the pilot fortnight (it's the pencil-whipping falsifier). See the CC-26 packet.
2. Resolved transfer/handoff history views (today every surface fetches ?status=PENDING only).
3. Surface RequestLineEvent (the hub Confirm/Edit/Deny audit trail) in the request drawer.
4. Persist StatusLink EXPIRED (add a cron sweep) so pending counts stop overstating and someone is told when a hub never acted.
5. Wire auto-resolve for the linger-forever alerts: PIN_LOCKED on PIN reset, MATERIAL_REQUEST on fulfill/deny, EQUIPMENT_NOT_RETURNED on return.
6. Fix notification deep-links to carry record ids where they don't (alert-display.ts), and point HUB_RETURN discrepancy/receipt notifications at the Hubs Inbound tab, not /admin/inventory. (The two CHECK alerts' record ids are CC-26's — don't double-build.)
```

### CC-21 · Mounted collection units — design spike (decision first, no build)
**Review seats:** Fable (scope), Integration, SRE.

```
DESIGN SPIKE ONLY — do not build yet. Produce a short design doc (not code) evaluating how to represent mounted collection units (Giddings on Bobcat, Wintex on Can-Am) — the sampling equipment that generates revenue and currently has no model representation.
1. Compare three options: (a) a non-motorized Vehicle subtype, (b) reuse of the Equipment/InventoryUnit model, (c) a new MountedUnit table. For each, list what re-plumbing it costs across the four subsystems keyed to Vehicle/InventoryUnit today (daily-check, maintenance, QR, alerts) and whether it collides with any W0-10 or money-loop assumptions.
2. Design the combined operator flow: the operator now runs TWO checks per deployment (carrier vehicle + mounted collection unit) — these must be ONE guided sequence ("check rig → check collection unit"), dead-simple on mobile, or operators skip one. Sketch that flow.
3. Recommend one option with rationale, and estimate the build. I'll make the call before any build packet is written.
```

---

## Manual (no Claude Code) — run in parallel

**A6 device pass.** Still the pilot line — follow `AHITS_A6_DEVICE_CHECKLIST.md` on real iOS + Android hardware: the 22-row × 5-target matrix (SW-drop → warm → offline ritual; the overnight iOS eviction row; the add-items-to-offline-rig row; the CC-25 live-scan rows once added). Record signed results. Hard date THIS WEEK per the Pilot Charter — a failure redirects the remaining work, so earlier is better.

**Sentry DSN + heartbeat URL.** CC-22 lands the wiring sandbox-safe with both env values absent. Your side: create the `AHITS_SENTRY_DSN` Secret Manager version ENABLED and set up a healthchecks.io check for `CRON_HEARTBEAT_URL` — then the activation deploy (secret mapping + redeploy, per the CC-22 packet) turns both on.

**Pilot Charter fill-in.** Open `AHITS_PILOT_CHARTER.md` and fill the placeholders: pilot operators + project + start date, initial **D5** (hold for Today vs Today-lite bridge — Option A recommended), run the **D6** two-part audit before the global sandbox flip, and name the **D7** second human. Put the variance check on a calendar with an owner. Then append D5/D6/D7 outcomes to `DECISIONS.md`.
