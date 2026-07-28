# AHITS — CC-29 / CC-32 / CC-30 / CC-31 / CC-16S · The Pilot-Floor Packets

> STATUS: canonical (the live build queue) · UPDATED: 2026-07-28
> READ-WITH: `AHITS_SIX_SEAT_REVIEW_2026-07-28.md` (the findings these close) · `DECISIONS.md` D16–D20 · `STATUS.md`
> Produced by the 2026-07-28 six-seat review session + owner interview. **Execution order: CC-29 → CC-32 → CC-30 → CC-31 → CC-16S → CC-33** (approved by Max 2026-07-28, "all three tiers in order"; CC-32 added and slotted after CC-29 by Max's UX-priority call later the same session). The pilot start is POSTPONED to a **rolling start** — these packets are the pre-launch stability/ops/accuracy floor and land BEFORE the first operator onboards. Each packet is paste-ready for Claude Code; paste one packet per session.

---

## CC-29 · Offline trust floor (pre-launch tier 1)
**Review seats:** Antagonist + Calibration + Operator-lens.

```
CC-29 — "Offline trust floor: the queue keeps its promise." Pre-launch stability floor, TIER 1: the offline-queue P0s from AHITS_SIX_SEAT_REVIEW_2026-07-28.md §1 (findings 1.1–1.6). Pilot start is POSTPONED to a rolling start — this packet must land and smoke on staging BEFORE the first operator goes live. Follow CLAUDE.md and AGENTS.md exactly (modified Next.js — read node_modules/next/dist/docs/ first). Review seats: Antagonist + Calibration + Operator-lens. Verify gate per packet doc: make db-generate && npx tsc --noEmit && npx eslint src && npm test (and npm run test:ui) before each PR.

════════ SCOPE GUARD — read before writing code ════════
- NO schema changes. Item 4 is designed to reuse the existing DailyCheck.date column — no migration expected. If you discover one is genuinely unavoidable, it must be ONE additive nullable column, migration-safety compliant (scripts/check-migration-safety.sh), and you flag it in the PR body.
- NO UI redesigns. The only UI diffs allowed: the OutboxDialog stuck-item Discard affordance (item 1b), the daily-check Date field becoming read-only display (item 4), and toast/error copy changes named below.
- FND-14/FND-14b 401-parking in flush() (useOfflineQueue.ts:240-249) is preserved BYTE-FOR-BYTE: a flush 401 still breaks the pass, burns no retry, never marks failed, sets sessionExpired. Item 3 extends the same semantics to mutate(); it does not alter flush()'s branch.
- TERMINAL_STATUSES (useOfflineQueue.ts:20) keeps 409 terminal. Item 6's reclassification is by response-BODY sniff only — genuinely terminal 409s (e.g. transfers/[id]/accept/route.ts:39 "Transfer is no longer pending", the new item-4 duplicate-check 409) MUST stay terminal.
- Do not touch: the held W0-10 patches, the service worker, pr-staging-deploy.yml (that's CC-30, not this packet), the M1-9 placeholder-remap logic, the Q1 dedup/in-flight coalescing, prisma/seed.ts.
- Every PR to `development`; I smoke each on staging before authorizing merge; never merge without my explicit go.

════════ PR STRUCTURE — three reviewable chunks, in this order ════════
PR-1 "queue engine" — items 1, 2, 3, 6, 7-client + the harness (item 8, tests a–f).
PR-2 "daily-check date semantics" — items 4 + 7-server + node-suite tests (item 8, tests g–h).
PR-3 "sliding session renewal" — item 5.
PR-1 and PR-2 both touch the daily-check path — land PR-1 first; PR-2 rebases on it.

──────── ITEM 1 · PHOTO-WEDGE (P0, review 1.2) ────────
Closes: a persistently-failing photo upload silently blocks the ENTIRE queue forever, with no operator escape.
Files: src/lib/photoStore.ts, src/hooks/useOfflineQueue.ts, src/components/operator/OutboxDialog.tsx.
1a. In photoStore.ts, make uploadPhotoBlob() (:101-112) throw a typed error — export class PhotoUploadError extends Error with a boolean `serverReached`: fetch itself threw → serverReached=false (offline); res not ok → serverReached=true (the server saw and rejected it: 413/415/500…). resolvePhotoRefs propagates it unchanged.
In flush()'s resolvePhotoRefs catch (useOfflineQueue.ts:200-203, currently a bare `break`):
  - error NOT serverReached (or not a PhotoUploadError) → keep today's behavior exactly: break, stay pending, no retry burned (still offline — keep waiting is correct).
  - serverReached → this is a real failed attempt: increment retries and persist (mirror the transient branch :273-281); if retries >= MAX_RETRIES, set status 'failed' with lastError naming the photo (e.g. "A photo could not be uploaded (<server error>) — retry or discard this action"), and if the item has a placeholderId, quarantine dependents exactly as the terminal branch does (:260-272). Then `continue` — NOT break — so later items (plain daily checks) drain past it. State in a comment why continue is safe here (photo-bearing writes are not placeholder parents of later items except deploy-create, which the quarantine handles).
1b. OutboxDialog.tsx currently gates Retry/Discard on status==='failed' (:72, :90-101). Add: any NON-failed item with retries >= 3 OR age > 24h renders a "Stuck? Discard" button (uses the existing discardFailed — its implementation (useOfflineQueue.ts:291-298) already deletes by id regardless of status, so no hook change is needed). One-tap confirm ("This action will be permanently removed from this phone — the office never received it. Discard?"). No other layout changes.
ACCEPTANCE: grep -n "serverReached" src/lib/photoStore.ts src/hooks/useOfflineQueue.ts  AND  grep -n "continue" src/hooks/useOfflineQueue.ts (in the photo catch). Manual smoke (phone): queue a damage report with a photo while offline, then reconnect behind a broken upload (staging: temporarily oversize the photo or use the harness); confirm a plain daily check queued AFTER it still syncs, the photo item eventually shows Failed with a photo-naming message, and Discard works from the Outbox.

──────── ITEM 2 · LIE-FI TIMEOUT (P0, review 1.4) ────────
Closes: on degraded-but-not-dead signal, fetch hangs 60s+ on "Submitting…", the operator swipe-kills, and the un-queued form state is lost.
Files: src/hooks/useOfflineQueue.ts, src/lib/photoStore.ts.
Add module constants MUTATE_TIMEOUT_MS = 12_000 and FLUSH_ITEM_TIMEOUT_MS = 20_000. Use AbortSignal.timeout() (or AbortController + setTimeout if you find Safari-version reasons — say which in a comment) on: the mutate() fetch (:379-383), the flush() per-item fetch (:208-212), and the uploadPhotoBlob fetch (photoStore.ts:104) at 20s — a hung photo upload reproduces the same wedge.
- mutate(): an abort lands in the existing catch (:390-402) → the write ENQUEUES and returns { ok:true, queued:true } — the operator sees the honest "No network — check queued, will sync when online" toast (daily-check/page.tsx:221-223). Verify no code path can leave the button on "Submitting…" past ~12s + the GPS wait.
- flush(): an abort lands in the existing fetch catch (:213-216) → break, stay pending. Unchanged semantics, now bounded.
ACCEPTANCE: grep -n "MUTATE_TIMEOUT_MS\|FLUSH_ITEM_TIMEOUT_MS" src/hooks/useOfflineQueue.ts. Manual smoke (phone): put the phone in a weak-signal spot (or dev-tools "Slow 3G" + server stall), submit a daily check — within ~12 seconds the screen must say the check is saved and will sync, never a stuck spinner.

──────── ITEM 3 · ONLINE-401 PARKING IN mutate() (P0, review 1.3b) ────────
Closes: an ONLINE submit that hits a lapsed session shows bare "Unauthorized" and the write is not preserved — flush()'s 401-parking never protected mutate().
Files: src/hooks/useOfflineQueue.ts, src/types/index.ts, src/app/(operator)/operator/daily-check/page.tsx.
In mutate(), before the generic non-ok return (:388-389): if res.status === 401 → enqueue the item (same body + the already-generated idempotencyKey, same label/placeholderId), setSessionExpired(true), and return a distinguishable success: extend MutateResult's queued variant (types/index.ts:119-122) to { ok: true; queued: true; data: null; reason?: 'auth' }. If the enqueue itself fails, fall through to the existing storage-failure error (:392-400).
daily-check/page.tsx handleSubmit (:221-229): on result.queued with reason 'auth', setSubmitted(true) and toast "Session expired — check saved on this phone. Sign in to send it." The existing OfflineBanner CRITICAL banner ("Session expired — sign in to send N saved actions", OfflineBanner.tsx:48-59) then carries the operator to /login; on re-auth, flush() drains and clears sessionExpired (:239). Other mutate callers (my-deployment, scan, requests, DispositionDialog) already treat queued:true as success — verify each still reads honestly; do not redesign their copy.
ACCEPTANCE: grep -n "reason: 'auth'\|reason?: 'auth'" src/hooks/useOfflineQueue.ts src/types/index.ts. Manual smoke (phone): with the session forced expired (admin bumps tokenVersion), submit a check while ONLINE — the screen must say the check is saved (not "Unauthorized"), show the yellow sign-in banner, and after signing back in the check must appear in the admin viewer.

──────── ITEM 4 · LATE-SYNC DATE SEMANTICS (P0, review 1.1 — RECORDED PRODUCT DECISION, Max 2026-07-28: a replayed check carries its ORIGINAL business date) ────────
Closes: a day-N check replaying on day N+1 is re-dated to N+1 and silently overwrites (or is overwritten by) N+1's real check via the upsert; day N becomes a false MISSED.
Files: src/app/(operator)/operator/daily-check/page.tsx, src/app/api/daily-check/route.ts. Reuse the existing `date` field — NO new column, NO migration.
4a. CLIENT — stamp at enqueue time: in buildPayload (page.tsx:182-197), replace the `date` state value with a fresh businessDate() computed at submit-click, so a form left open overnight still stamps the day the operator actually hit Submit. Make the step-0 Date input (:318-325) read-only display (disabled TextField or plain text row, helper text "Set automatically") — the server was already ignoring edits to it; showing an editable field that lies is the review's 1.1 tail finding.
4b. SERVER — bounded past window: in POST (route.ts:85-88), replace the unconditional `const date = businessDate()` with: accept parsed.data.date IF businessDate-parseable AND within (today − PAST_WINDOW_DAYS=3) ≤ date ≤ today; otherwise clamp to businessDate() and console.warn('[daily-check] client date out of window, clamped', …). FND-7 interaction (state this in a code comment): the clamp exists to stop pre/future-dating — the bounded window MUST keep rejecting any future date (clamp it), only the bounded PAST is newly trusted.
4c. SERVER — no silent merge on late replay: BEFORE the upsert (:104-145), if the accepted date is a PAST date (≠ today's businessDate) AND a dailyCheck row already exists for (vehicleId, date, operatorId) → return 409 { error: `A check for <date> already exists for this vehicle.` }. Same-day (date === today) keeps today's upsert-update semantics untouched — same-day edit/resubmit is a feature and the idempotency layer already dedupes exact replays. 409 is in TERMINAL_STATUSES, so the queue surfaces it as 'failed' with that lastError, Discard-able in the Outbox — exactly the decided behavior (surfaced, never merged). Confirm extractError (useOfflineQueue.ts:75-90) passes the message through.
4d. SERVER — alert consistency: gate resolveActiveAlert('DAILY_CHECK_MISSED', …) (:211) and the DAILY_CHECK_FAILED pass-resolve (:207) on the check's own date === today's businessDate — a yesterday check must not clear today's missed alert or today's live failed-vehicle alert. A late FAILING check may still RAISE DAILY_CHECK_FAILED (admins should hear about it); keep the raise.
ACCEPTANCE: grep -n "already exists for this vehicle" src/app/api/daily-check/route.ts  AND  grep -n "PAST_WINDOW_DAYS" src/app/api/daily-check/route.ts. Manual smoke (phone): in airplane mode, submit a check; leave it queued overnight; reconnect next day — the admin daily-check viewer must show the check under the day it was PERFORMED, and today's real check must be untouched. Submitting a second check for a past day must show "Failed — a check for <date> already exists" in the Outbox, discard-able.

──────── ITEM 5 · SLIDING SESSION RENEWAL (P0-adjacent, review 1.3a) ────────
Closes: hard 24h JWTs minted only at login (session.ts:7, :42-48) expire mid-shift, synchronized across the whole crew.
Files: src/proxy.ts, src/lib/auth/session.ts, plus ONE new edge-safe module.
Mechanism: in the proxy's authenticated success path (proxy.ts:147-201 — the single chokepoint every page and API request crosses), after jwtVerify succeeds: if now > iat + SESSION_DURATION/2 (past half-life), re-mint the token with the SAME claims (userId, role, name, email, tokenVersion, mustChangePin — all present in the payload) and a fresh 24h exp, and set the cookie on the response actually returned (response.cookies.set on the nextWithCsp result), preserving the exact flags from setSessionCookie (session.ts:127-133): httpOnly, secure: NODE_ENV==='production', sameSite 'lax', maxAge SESSION_DURATION, path '/'.
Lifetime cap: add an `authAt` claim (epoch of original PIN entry) minted in createSession; on renewal, carry authAt through UNCHANGED and refuse to renew (let the token expire naturally) once now − authAt > MAX_SESSION_LIFETIME = 14 days. A pre-CC-29 token without authAt uses its iat as authAt.
EDGE-SAFETY (hard requirement): proxy.ts must NOT import src/lib/auth/session.ts — it pulls prisma + next/headers into the edge bundle. Put the mint/renew helpers + shared constants (SESSION_DURATION, MAX_SESSION_LIFETIME, cookie options) in a new jose-only module (e.g. src/lib/auth/session-edge.ts) imported by BOTH session.ts and proxy.ts, so there is one definition and no drift.
SECURITY TRADEOFF (record in a code comment + the PR body): fixed 24h bounds a stolen token's life to ≤24h; sliding renewal lets an actively-used stolen token live longer — bounded here to 14 days since PIN entry, never infinite. Instant revocation is unaffected: every API route still runs DB-backed getSession() (tokenVersion / isActive / role re-check, session.ts:63-77), so suspend/force-logout kill a renewed token on its next online request exactly as today. Renewal changes exp only — never claims, never mustChangePin.
ACCEPTANCE: grep -n "authAt\|MAX_SESSION_LIFETIME" src/proxy.ts src/lib/auth/session-edge.ts src/lib/auth/session.ts. Manual smoke (phone): sign in, wait past 12h (or temporarily drop SESSION_DURATION on staging to 10 min and half-life to 5), keep using the app across the boundary — no sign-out, no yellow session banner; then stop using it entirely past a full duration — signed out as before. Admin "force logout" must still boot the phone on its next tap.

──────── ITEM 6 · CONCURRENT-FLUSH SINGLE-OWNER + TRANSIENT-409 (P1, review 1.5) ────────
Closes: 3+ hook instances (AppShell.tsx:34, OfflineBanner.tsx:16, page hooks) each register online/visibility/30s triggers (useOfflineQueue.ts:445-452) with only a per-instance syncingRef (:109, :176) — concurrent flushes double-send, resurrect deleted items via stale putItem, double-upload photos, and the losing duplicate POST gets withIdempotency's TRANSIENT 409 which the queue marks terminal (false "Failed" → operator redoes the action → the real duplicate-write vector).
Files: src/hooks/useOfflineQueue.ts, src/lib/idempotency.ts, one shared constants file.
6a. Cross-instance mutex: wrap flush()'s body in navigator.locks.request('ahits-outbox-flush', { ifAvailable: true }, cb) — ifAvailable so overlapping triggers SKIP (the holder is already draining) instead of queueing a pile-up; lock not granted → return immediately. Fallback when navigator.locks is undefined (older WebKit): a localStorage lease — key 'ahits_outbox_flush_lease', value {token, expiresAt: now+30s}, taken test-and-set, re-extended each loop iteration, cleared in finally; a crashed holder self-heals via expiry. Keep syncingRef as the cheap same-instance fast-path in front of the lock.
6b. Transient-409 reclassification — CHOSEN APPROACH: response-body sniff (NOT removing 409 from TERMINAL_STATUSES — the genuinely-terminal 409s in items/vehicles/handoff/transfer-accept and item 4c must stay terminal). Export the in-flight message as a constant (e.g. IDEMPOTENCY_IN_FLIGHT_ERROR = 'Request in flight') from a client-safe module (NOT idempotency.ts itself — it imports prisma; put the constant in src/types or a new src/lib/shared-errors.ts and have idempotency.ts:146-149 build its 409 body from it). In flush()'s terminal branch (:250-252), on 409 whose extracted error starts with that constant → route to the transient/retry branch instead. RISK (state in the PR body): body-sniffing couples the client to server copy — mitigated by the single shared constant; a stale pre-deploy client that doesn't know the constant just keeps today's (safe, at-worst-noisy) terminal behavior.
ACCEPTANCE: grep -n "ahits-outbox-flush" src/hooks/useOfflineQueue.ts  AND  grep -n "IDEMPOTENCY_IN_FLIGHT" src/lib/idempotency.ts src/hooks/useOfflineQueue.ts. Manual smoke (phone): queue 3 actions in airplane mode with two app tabs open (or app + a second tab), reconnect — each action lands exactly once server-side (admin viewer / audit), no item ever shows a false "Failed".

──────── ITEM 7 · DEAD localphoto: REFS (P1, review 1.6) ────────
Closes: an ONLINE submit whose photo upload fails sends the body with `localphoto:` refs intact; routes persist the dead ref; photo evidence is lost while everything reports success.
Files: src/hooks/useOfflineQueue.ts, src/lib/validation.ts, src/app/api/deployments/[id]/{transfer,items,end}/route.ts.
7a. CLIENT: in mutate()'s resolvePhotoRefs catch (:373-377) — currently "keep original body and send anyway" — instead ENQUEUE the original body (local refs + stored blobs intact) and return { ok: true, queued: true }. flush() then owns all photo-retry semantics, which item 1 just made wedge-proof: offline waits, server-rejection counts retries and eventually surfaces "Failed" naming the photo. Never send a body containing localphoto: to the server.
7b. SERVER backstop: add a shared zod helper in src/lib/validation.ts — e.g. photoUrlsField = z.array(z.string().refine(u => !u.startsWith('localphoto:'), 'Photo not yet uploaded — retry when online')) — and use it for the photoUrls fields at transfer/route.ts:12, items/route.ts:59+:80, end/route.ts:29, so any localphoto ref → 422 (a TERMINAL_STATUS: the queue surfaces it instead of persisting garbage). Note filterAllowedPhotoUrls (photo-security.ts:91-94) already drops them at Photo-row creation — the 422 closes the transfer-row and any future route that persists the raw array.
ACCEPTANCE: grep -rn "localphoto" src/lib/validation.ts src/app/api/deployments — the refine helper appears in validation.ts and the three routes use it. Manual smoke: covered by item 1's smoke — additionally confirm in the admin transfer view that no broken-image entry ever appears.

──────── ITEM 8 · TEST HARNESS (the review's #1 missing test — "the pilot's most safety-critical function has zero direct coverage") ────────
Files: NEW tests/offline/useOfflineQueue.test.tsx (jsdom suite), NEW tests/cc29-late-sync-date.test.ts + tests/cc29-localphoto-rejection.test.ts (node DB suite), vitest.config.ui.ts, package.json.
- Add fake-indexeddb as a devDependency (it is NOT currently installed). In the jsdom suite: import 'fake-indexeddb/auto', renderHook from @testing-library/react (already a devDep), vi.stubGlobal('fetch', …) per case. Extend vitest.config.ui.ts include (:15) to ['tests/components/**/*.test.{ts,tsx}', 'tests/offline/**/*.test.{ts,tsx}'] — these run under npm run test:ui (jsdom, no DB). The two route suites follow the existing tests/*.test.ts patterns and run under npm test (vitest.config.ts, DATABASE_URL_TEST guard).
Cases (jsdom suite): (a) photo-failure no-wedge — item A has a localphoto ref whose upload 500s (serverReached), item B is a plain POST: one flush sends B, increments A.retries; at MAX_RETRIES A is 'failed' with a photo-naming lastError. Offline-throw variant: A stays pending, zero retries burned, B NOT sent (order preserved — this pins FND-14-adjacent break semantics). (b) 401-park-and-resume — flush 401: item pending, retries unburned, sessionExpired true; next flush 200: drained, sessionExpired false. (c) timeout-enqueue — mutate against a never-resolving fetch (fake timers): resolves { queued: true } at ~MUTATE_TIMEOUT_MS with the item in IDB. (d) online-401 mutate park — fetch 401 → { ok:true, queued:true, reason:'auth' }, sessionExpired true, item in IDB. (e) concurrent-flush single-drain — TWO renderHook instances flush() simultaneously (jsdom has no navigator.locks → this exercises the localStorage-lease fallback; add a second run with a stubbed navigator.locks): each queued item fetched exactly once. (f) 409 contract — body 'Request in flight …' → stays retryable; body 'A check for … already exists…' → terminal 'failed'.
Cases (node suite): (g) late-sync semantics — POST with yesterday's date lands under yesterday; with a colliding past date → 409; future date → clamped to today; 5-day-old date → clamped; past-date check does NOT resolve today's DAILY_CHECK_MISSED. (h) localphoto rejection — transfer/items/end POST with photoUrls:['localphoto:x'] → 422.
ACCEPTANCE: grep -n "fake-indexeddb" package.json  AND  ls tests/offline tests/cc29-late-sync-date.test.ts tests/cc29-localphoto-rejection.test.ts — and both npm test and npm run test:ui green in CI.

════════ MERGE GATES ════════
Per PR: full verify gate green + the item ACCEPTANCE greps in the PR body + I run the manual smokes on staging (a real phone, including one airplane-mode → reconnect cycle per PR) before giving the merge go. PR-2's smoke includes the overnight-queue replay. No operator onboards until all three PRs are merged and smoked.

════════ SESSION CLOSE (per the CLAUDE.md contract) ════════
STATUS.md: §1 state gains "CC-29 offline trust floor MERGED (PRs #…), pre-launch tier 1 complete"; §2/launch box: the rolling-start gate now reads "CC-29 smoked on staging"; §3/§4 next actions updated. DECISIONS.md: append Dn recording the item-4 product decision (late-synced check carries its ORIGINAL business date; ≤3-day past window; past-date collision → 409 surfaced, never merged; future dates still clamped — FND-7 preserved) and the item-5 tradeoff (sliding renewal, 14-day cap since PIN entry). Update the packet ledger row for CC-29 in AHITS_CLAUDE_CODE_INSTRUCTIONS.md. Handoff doc + commit/push + git ls-files sanity. Step-7 grep anchors to re-verify at close: "serverReached", "MUTATE_TIMEOUT_MS", "reason: 'auth'", "already exists for this vehicle", "authAt", "ahits-outbox-flush", "IDEMPOTENCY_IN_FLIGHT", the validation.ts localphoto refine, and tests/offline present.
```

---

## CC-30 · Staging is home — the ops floor (pre-launch tier 2)
**Review seats:** SRE (primary), Antagonist, Calibration.

```
CC-30. TIER 2 of the 2026-07-28 six-seat review (SRE seat, AHITS_SIX_SEAT_REVIEW_2026-07-28.md §2). Governing decision — D16 (Max, 2026-07-28): STAGING IS HOME. The pilot start is postponed to a rolling start; the team operates on staging indefinitely, so staging is hardened to de-facto-production posture. Every "it's only staging" assumption in the pipeline is now wrong by decision.

Structure: TWO PRs (both base development, normal PR + green CI flow per CLAUDE.md), plus a console section for Max at the end — hand him that section verbatim; none of those steps have ever been attempted.

══ SCOPE GUARD — read twice ══
- Do NOT touch application feature code except the exact files/lines named in PR-2 (useOfflineQueue.ts, cron/dispatch/route.ts). No refactors, no drive-by fixes of the Tier-1 findings (1.1–1.9 are CC-29, a separate packet).
- NO schema changes, no migrations, no prisma/schema.prisma edits.
- NO service renames: ahits-web-app-staging stays ahits-web-app-staging.
- EMAIL_SANDBOX STAYS ON for staging. The D6/D15 off-flip is a separate owner action gated on the audits — nothing in this packet flips it, and the pipeline changes below must make the ON state MORE durable, not less.
- Do NOT delete/disable deploy.yml, ci.yml, or verify.yml. pr-staging-deploy.yml is the only workflow you materially rewire.
- held/ patches: do not touch (D4).

══ PR-1 — pipeline, CI gates, guards, rollback doc ══

1. KILL THE PREVIEW-DEPLOY PATH TO THE LIVE SERVICE. .github/workflows/pr-staging-deploy.yml currently deploys ANY labeled PR onto the live service: the pull_request labeled trigger (:12-14, gated only by label name at :28-30) runs NO verify job and NO migration-safety, builds with DISABLE_SW=true (:63 — kills the offline queue's service worker for the whole fleet), runs that PR's migrations against the live DB (:81-82), and deploys with MIN_INSTANCES=0 hardcoded onto SERVICE=ahits-web-app-staging (:84-91). Fix in-repo (do not just rely on Max deleting the label):
   a. Remove the pull_request/labeled trigger entirely — workflow_dispatch only.
   b. Add a required workflow_dispatch input `service` (no default). Pass it to the deploy step instead of the hardcoded ahits-web-app-staging.
   c. Add a guard step FIRST in the job that hard-fails when the resolved service is the live one, with this exact message so it's greppable: "REFUSING: pr-staging-deploy may never target ahits-web-app-staging (D16 — staging is home)". Guard the migrate step too: PR previews must not run cloud-run-migrate against the AHITS_MIGRATE_URL DB — either drop the migrate step or gate it behind the same guard with an explicit second input. A preview service without the shared DB is a degraded preview; say so in a comment rather than quietly pointing previews at the pilot DB.
   d. Sync CLAUDE.md: its "Deployment Workflow" step 5 and the Notes bullet still instruct triggering pr-staging-deploy.yml / adding the deploy-staging label to ship to staging. Rewrite both: the ONLY path to staging is merge-to-development → deploy.yml. Leave the rest of CLAUDE.md alone.
   Acceptance: grep -n "pull_request" .github/workflows/pr-staging-deploy.yml → no hits; grep -n "REFUSING: pr-staging-deploy" .github/workflows/pr-staging-deploy.yml → the guard; grep -rn "deploy-staging label" CLAUDE.md → no hits. Smoke: actions syntax check via `gh workflow view` after merge.

2. MIGRATION-SAFETY ON THE LIVE BRANCH. Today the migration-safety + production-drop-guard jobs exist only in PR-triggered ci.yml (:5-7 pull_request only; jobs at :29-40 and :50-106) — a direct push to development skips both and deploy.yml auto-migrates the live DB (deploy.yml:32-63). And scripts/check-migration-safety.sh:106 hard-fails an acknowledged destructive migration ONLY when BASE_REF=production — for development it's a warning (:111). Three changes:
   a. deploy.yml: add a `migration-safety` job between verify and migrate; make migrate `needs: [verify, migration-safety]` (deploy.yml:32-34 currently needs verify only). fail = no deploy. On a push event there is no base_ref/labels: run the script with BASE="${{ github.event.before }}" (checkout fetch-depth: 0 — the script fails closed if the base can't resolve, check-migration-safety.sh:34-37, which is what we want), skip-with-::warning when `before` is the all-zeros SHA (branch create/force-push), and export GITHUB_BASE_REF from the branch name (development/production) with PR_LABELS empty. Consequence — intended and must be commented in the yml: an acknowledged destructive migration can now ONLY reach the live DB via a PR carrying the label; a direct push with one fails the deploy.
   b. check-migration-safety.sh:106: extend the hard-fail branch to `production|development` — same label requirement (`destructive-migration-approved`), update the :22-25 header comment with a D16 line. Development is now an environment-bearing branch; the "branch with no environment behind it" asymmetry (review §2.2) is exactly backwards.
   c. ci.yml production-drop-guard (:50-106): change the job `if:` at :53 to also run for development-targeting PRs, and parametrize BASE to "origin/${{ github.base_ref }}" (:63-64 hardcode production). Same three W0-10 objects (operatorId, assignedOperatorId, rig_operators — GUARD_RE at :79 unchanged). The held 4b'/4c drop patches are one acknowledged-comment away from the pilot DB otherwise.
   Acceptance: grep -n "migration-safety" .github/workflows/deploy.yml → the job + the needs line; grep -n 'development' scripts/check-migration-safety.sh → the hard-fail branch; grep -n "base_ref" .github/workflows/ci.yml → drop-guard no longer production-only. Smoke: run `bash scripts/check-migration-safety.sh HEAD~1` locally with GITHUB_BASE_REF=development and a scratch acknowledged-DROP migration file → exits 1 without the label.

3. SEED/RESET GUARDS. prisma/seed.ts:10-15 refuses only on NODE_ENV==='production' — a staging-pointed .env + `make db-seed` happily upserts ops@agricarbon.com and operators with PIN 123456 (seed.ts:41) into the live fleet, and `make db-reset` (Makefile:74-75, `prisma migrate reset` = drop + re-create + reseed) has NO guard at all. Two layers, one env override:
   a. seed.ts: after the NODE_ENV check, parse the host of DIRECT_URL ?? DATABASE_URL (new URL(); the Prisma client has already loaded .env by import time) and throw if it matches /supabase\.co$|pooler\.supabase\.com$/ unless process.env.AHITS_DANGEROUS_TARGET === 'yes-i-mean-staging'. Error text must name the host it refused and the exact override string.
   b. Makefile db-reset AND db-seed: prepend a shell guard that resolves the URL from the shell env first, falling back to grepping .env (^DIRECT_URL=/^DATABASE_URL=) — make does NOT see prisma's dotenv loading, so the .env fallback is the load-bearing half — and refuses on the same host patterns unless AHITS_DANGEROUS_TARGET=yes-i-mean-staging. Factor as one guard recipe both targets call.
   c. Verify you broke nothing local: docker-compose.test.yml is a localhost:5433 postgres; `make test` / test-prepare / verify.yml's CI test job use TEST_DB_URL directly and never call db-seed/db-reset — confirm by reading Makefile:81-99 and state it in the PR body. `make setup` (local dev, :197-202) must still pass against a localhost DB.
   Acceptance: grep -n "AHITS_DANGEROUS_TARGET" prisma/seed.ts Makefile → both layers; smoke: with a scratch .env pointing DATABASE_URL at db.example.supabase.co, `make db-seed` refuses; with localhost it proceeds to the prisma invocation.

4. PILOT ENV VALUES INTO THE PIPELINE. cloud-run-deploy uses --set-env-vars (Makefile:149), which REPLACES the entire env set every deploy — any console-set value dies on the next merge. deploy-staging (:173-176) hardcodes MIN_INSTANCES=0 and EMAIL_SANDBOX=true; EMAIL_SANDBOX_TO appears nowhere in the repo outside src/lib/email/resend.ts:89-92 (where its ABSENCE turns every sandboxed send into silent SKIPPED — and SKIPPED never raises EMAIL_FAILED). Changes:
   a. Makefile: `EMAIL_SANDBOX ?= false` (:26) → `EMAIL_SANDBOX ?= true`. Safe-by-default for hand-runs; deploy-prod already passes EMAIL_SANDBOX=false explicitly (:181) — that's the cutover opt-out, leave it.
   b. Add `EMAIL_SANDBOX_TO ?= maxtslater@gmail.com` and append `,EMAIL_SANDBOX_TO=$(EMAIL_SANDBOX_TO)` to the --set-env-vars line (:149). (It's an address, not a secret — env var is correct, matching EMAIL_SANDBOX itself.)
   c. deploy-staging (:176): MIN_INSTANCES=0 → MIN_INSTANCES=1. Comment it: D16 — the fleet's 6am first-open must not eat a cold start.
   d. deploy.yml: add a post-deploy "verify deployed env" step (development branch only, after the Deploy step) that runs `gcloud run services describe ahits-web-app-staging --region us-central1 --format json`, extracts the container env + the autoscaling.knative.dev/minScale annotation, and FAILS the workflow with an "env-drift" error naming each mismatched key if EMAIL_SANDBOX != true, EMAIL_SANDBOX_TO is empty, or minScale != 1. A deploy that silently reverts pilot config must go red, not green.
   Acceptance: grep -n "EMAIL_SANDBOX ?= true" Makefile; grep -n "EMAIL_SANDBOX_TO" Makefile → default + --set-env-vars; grep -n "MIN_INSTANCES=1" Makefile → deploy-staging; grep -n "env-drift" .github/workflows/deploy.yml. Smoke: first post-merge deploy goes green AND Max's console check (Max section, item e) shows min-instances=1.

5. PILOT_ROLLBACK.md — new doc, repo root, ≤1 page + the query pack. Contents, in order:
   a. THE 10-LINE PLAY: `gcloud run revisions list --service ahits-web-app-staging --region us-central1` → `gcloud run services update-traffic ahits-web-app-staging --region us-central1 --to-revisions=<prev-revision>=100`. Why this is safe: migrations are additive/backward-compatible by CI-enforced rule (check-migration-safety.sh), so the previous revision runs correctly against the newer schema. NEVER hand-revert schema — bad code is rolled back by traffic and REMOVED by a revert PR through the normal flow; the migration stays.
   b. WHAT IS SERVING RIGHT NOW: `gcloud run services describe ahits-web-app-staging --region us-central1 --format="value(status.traffic.revisionName)"` — and the image tag on that revision is the git SHA (deploy.yml passes TAG=${{ github.sha }}).
   c. LOST-WRITE RECONCILIATION QUERY PACK — "operator says they submitted X; did the server get it?" Use these real names (verified against prisma/schema.prisma):
      -- Q1 daily checks for an operator on a day (daily_checks + users):
      SELECT dc."id", dc."date", dc."submittedAt", dc."passFail", dc."odometer", v."name" AS vehicle
      FROM "daily_checks" dc JOIN "users" u ON u."id"=dc."operatorId" JOIN "vehicles" v ON v."id"=dc."vehicleId"
      WHERE u."email" = $1 AND dc."date" = $2::date ORDER BY dc."submittedAt";
      -- Q2 did ANY replay land? idempotency claims in a window (idempotency_key — NOTE: no operator column, and the cron REAPS rows >48h old (cron/dispatch/route.ts:97-100) — run this within 48h of the incident or it's gone):
      SELECT "key","scope","status_code","created_at" FROM "idempotency_key"
      WHERE "created_at" BETWEEN $1 AND $2 ORDER BY "created_at";
      -- Q3 gear actions for an operator in a window (check_logs):
      SELECT cl."action", cl."submittedAt", ii."name" AS item, cl."fromLocation", cl."toLocation"
      FROM "check_logs" cl JOIN "users" u ON u."id"=cl."operatorId" JOIN "inventory_items" ii ON ii."id"=cl."itemId"
      WHERE u."email" = $1 AND cl."submittedAt" BETWEEN $2 AND $3 ORDER BY cl."submittedAt";
      -- Q4 account-action audit trail (account_audit_log — account mgmt only, not field writes):
      SELECT a."action", a."createdAt", actor."email" AS actor, target."email" AS target
      FROM "account_audit_log" a JOIN "users" actor ON actor."id"=a."actorId"
      LEFT JOIN "users" target ON target."id"=a."targetUserId"
      WHERE a."createdAt" > NOW() - INTERVAL '7 days' ORDER BY a."createdAt" DESC;
   d. A placeholder section "## Restore drill (Max fills in after running it — see CC-30 Max checklist item a)".
   Acceptance: test -f PILOT_ROLLBACK.md; grep -n "update-traffic" PILOT_ROLLBACK.md; grep -n "idempotency_key" PILOT_ROLLBACK.md. Smoke: run Q1 against staging read-only for one known operator/day, confirm a row shape comes back.

══ PR-2 — server-side eyes on the P0 (small code, two files ONLY) ══

6. LOST-WRITE FEED (useOfflineQueue.ts). Client Sentry is init-only (SentryProvider.tsx:28-37 — init + request_id tag, zero captures anywhere in the queue). Add `import * as Sentry from '@sentry/nextjs'` and captureMessage at exactly these transitions:
   a. possibleDataLoss: where setPossibleDataLoss(true) fires (useOfflineQueue.ts:433-440) → Sentry.captureMessage('offline-queue possible-data-loss', level 'error') with tags {userId} and extra {oldHint}. This is the iOS-eviction tripwire — the P0 failing silently.
   b. item → 'failed', all THREE sites: terminal status (:250-252), dependent-quarantine (:260-272), retry-cap (:273-281) → captureMessage('offline-queue item failed', 'warning') with tags {userId}, extra {label: item.label, endpoint, method, lastError, retries}. PRIVACY: NEVER include item.body or any payload contents/photos — labels and error strings only.
   c. userId source: the hook has no auth context — read localStorage 'ahits_identity' (written by useAuth.ts:20-27) best-effort in a try/catch and tag the id ONLY (not name/email). Absent → tag 'unknown'.
   d. All captures are best-effort: Sentry no-DSN mode is already a no-op (SentryProvider bails at :31); never let a capture throw into queue logic.
7. CRON: UN-SILENCE THE INVARIANTS (cron/dispatch/route.ts). The drift block's catch (:286-288) and the INV-1..5 block's catch (:387-389) are BARE catch{} — a broken invariant QUERY is indistinguishable from a clean pass. In both catches: console.error('[cron] invariant/drift check errored', err) + Sentry.captureException(err). Do NOT touch the other non-fatal catches (:101-103, :250-252, :436-438) — reap/holds/email-scan are legitimately best-effort; the invariant checks are the monitoring itself.
8. CRON: ADVISORY-LOCK CONNECT ERROR ≠ CONTENTION. tryAcquireCronLock (:22-40) returns null for BOTH "lock held by a concurrent run" (:31-34) and "connect threw" (:36-39), and handleCron (:472-474) turns both into HTTP 200 {skipped:'advisory-lock'} — a dead DB looks green to Cloud Scheduler forever. Change the return to a discriminated result ({client} | 'contention' | 'connect-error'); handleCron: contention → 200 {skipped:'advisory-lock'} (unchanged, fine); connect-error → console.error + Sentry.captureException + HTTP 500 {error:'advisory-lock-connect-error'} so Scheduler retries AND the failure is visible in its dashboards. Keep the no-DIRECT_URL dev path (:468-470) byte-identical.
9. HEARTBEAT-ONLY-ON-FULL-SUCCESS — VERIFIED, confirm and comment. Read :440-458: the heartbeat ping + recordCronHeartbeat + CRON_SILENT re-arm are the LAST statements of run(), so an uncaught throw in any scan aborts before them — already correct. Do not restructure; add one comment line noting CC-30 verified it, and note in the PR body that item 7's catches deliberately still allow the heartbeat (a broken invariant query is now Sentry-visible instead of run-fatal — the run's other duties must continue).
   PR-2 acceptance: grep -c "captureMessage" src/hooks/useOfflineQueue.ts → ≥4; grep -n "captureException" src/app/api/cron/dispatch/route.ts → ≥2 (invariant catches + lock path); grep -n "advisory-lock-connect-error" src/app/api/cron/dispatch/route.ts → the 500 path; the new capture calls attach NO payload bodies. Smoke: `make verify` green; existing cron tests pass; one manual dev-run of the cron route returns 200 with counts.

══ MAX — LIVE-FIRE CHECKLIST (console, plain language; none of these have ever been attempted; record EACH result in STATUS.md §3) ══
a. Supabase → Settings → Database → Backups: write down the plan + retention actually in effect. Enable PITR if the tier offers it. Then run ONE restore drill (~15 min): restore a backup to a NEW throwaway project (never over the live one), open its table editor, confirm daily_checks rows exist, delete the throwaway. Write the exact click-path into PILOT_ROLLBACK.md's "Restore drill" section. → STATUS §3.
b. healthchecks.io: open the cron check — confirm a REAL ping arrived in the last hour (CC-22 shipped this but it has never been observed live) and set the grace period below 30 min so it alarms before the in-app CRON_SILENT does. → STATUS §3.
c. Cloud Scheduler: pause the cron job, wait >30 min, open the admin dashboard → the CRON_SILENT banner must appear; resume the job → next run clears it. This is the dead-man's first live fire. → STATUS §3.
d. Sentry: /admin/settings → Sentry diagnostics → trigger the client-error and server-error buttons; confirm both events arrive in Sentry WITH a request_id tag. → STATUS §3.
e. Cloud Run console → ahits-web-app-staging → after the first post-CC-30 deploy: confirm min-instances = 1 (now pipeline-set; the deploy itself fails loudly if not — this is the human cross-check). → STATUS §3.
f. GitHub → Settings → Branches: add protection on `development` — require a PR before merging + require the CI status checks green. (This is what makes packet item 2 airtight: no direct pushes at all.) → STATUS §3.
g. Delete the deploy-staging label: `gh label delete deploy-staging --yes`. One command; the in-repo guard (item 1) is the backstop, this removes the ambient invitation. → STATUS §3.
h. Mapbox: account.mapbox.com → Tokens → confirm the token mounted as AHITS_MAPBOX_TOKEN is a PUBLIC (pk.) token with URL restrictions limited to the staging domain. It is served to authed clients — URL restriction is the only fence. If unrestricted: add the restriction (no code change needed). → STATUS §3.
i. OPTIONAL-IF-CHEAP (~5 min, no IaC exists so console-only): add a second healthchecks.io-style or GCP Uptime check on GET https://<staging-url>/api/health (expect 200; it returns 503 when the DB is unreachable — src/app/api/health/route.ts). The cron heartbeat proves the CRON is alive, not that the SERVICE is; a wedged app at 5:50am is currently discovered by operator texts. → STATUS §3.

══ SESSION CLOSE ══
Standard 7-step close (STATUS.md tail): STATUS §1/§3/§4 + date line; D16 is already recorded (2026-07-28 review session) — reference it, don't re-append; handoff doc naming this packet's two PR numbers + which Max checklist items remain unticked; commit + push; git status clean; step-7 grep anchors MUST include: "REFUSING: pr-staging-deploy" · "migration-safety" in deploy.yml · "AHITS_DANGEROUS_TARGET" · "env-drift" · "advisory-lock-connect-error" · PILOT_ROLLBACK.md tracked in `git ls-files '*.md'`.
```

---

## CC-31 · Accuracy floor + pilot dashboard (pre-launch tier 3)
**Review seats:** Integration (primary — every item is a cross-system seam), Antagonist, Operator-lens.

```
Execute CC-31: the tier-3 accuracy + admin-eyes batch from the 2026-07-28 six-seat review (§3.1, §3.3, §3.5, §3.6, §3.10, §3.11, §4.5). Rolling start — operators onboard gradually, so evening deploys only, and every PR is independently shippable. Feature branches, full verify gate, staged as THREE PRs in this order. Read the six-seat review tiers 3–4 and DECISIONS.md first.

SCOPE GUARD (read before coding):
- Alert changes are RESOLVE-ONLY. resolveActiveAlert (src/lib/alerts.ts:62-68) only; never delete an alert row, never touch notifiedAt/triggeredAt, never re-notify. The dedup/activeKey mechanics (alerts.ts:36-53) are not modified.
- NO persistence sweep for EXPIRED StatusLinks. EXPIRED stays computed-at-read; do not add a cron pass that stamps state='EXPIRED' (PARKED — note it in the PR body, trigger: expired-link volume makes the computed check a real cost).
- NO secondary-operator Today rework (review §3.2) — that is its own future packet (pre-CC-17); item 4 here is ONLY the forOperatorId scope line.
- Dashboard is READ-ONLY. No writes, no new operator taps, no changes to check capture beyond item 5's timestamp move. Metrics stay observational per the charter — GPS grant rate is a coaching signal, never a target (D2 framing).
- Migration is ADDITIVE ONLY (two CREATE INDEX). Nothing that trips scripts/check-migration-safety.sh.
- Do not touch the offline queue, session, or daily-check server route — those belong to CC-29.

── PR-1 · Cron truth: INV-5 false alarms + alert auto-resolves ──

1. INV-5 FALSE-ALARM FIX (review §3.1). The inv5-custody-strands branch (src/app/api/cron/dispatch/route.ts:366-378) flags any unit IN ('CHECKED_OUT','IN_TRANSIT') with no open kit item on an ACTIVE rig — un-aged. But end-of-deployment legitimately creates exactly that state: the end route sets GOOD serialized units IN_TRANSIT awaiting hub receipt (src/app/api/deployments/[id]/end/route.ts:159-169) and TRANSFER dispositions keep kit items open on an ENDED rig until accept/decline (end/route.ts:122-124, transfer created :292-303) — so rg."endedAt" IS NULL excludes them and the unit looks strandless. The detector cries wolf on the first end-of-deployment. Fix the second OR arm of the query:
   a. AGE-QUALIFY it: add AND u."updatedAt" < NOW() - INTERVAL '72 hours' (the 14-day IN_TRANSIT arm keeps its own age).
   b. EXCLUDE units whose state is explained by an in-flight flow, via two NOT EXISTS:
      - an active un-expired HUB_RETURN link: status_links sl WHERE sl."type"='HUB_RETURN' AND sl."inventoryUnitId"=u."id" AND sl."state" IN ('ISSUED','VIEWED') AND sl."expiresAt" > NOW();
      - a PENDING transfer: transfer_items ti JOIN transfer_requests tr ON tr."id"=ti."transferRequestId" AND tr."status"='PENDING' JOIN kit_items tki ON tki."id"=ti."kitItemId", matched on (tki."inventoryUnitId"=u."id" OR ti."inventoryUnitId"=u."id") — NOTE the end route creates TransferItem rows with kitItemId only (end/route.ts:300), so matching through the kit item is the load-bearing arm; ti."inventoryUnitId" (nullable) is the belt-and-braces.
   Verify every table/column against prisma/schema.prisma (@@map names: status_links, transfer_items, kit_items, inventory_units) before writing SQL.
   ACCEPTANCE: grep -n "INTERVAL '72 hours'" src/app/api/cron/dispatch/route.ts hits inside the inv5 branch, and both NOT EXISTS subqueries appear. Test: end a deployment with one GOOD serialized unit (fresh HUB_RETURN link) and one TRANSFER disposition → cron run raises NO inv5 alert; age the unit's updatedAt past 72h and expire the link in-fixture → it raises.
   SMOKE (non-engineer): end a test deployment normally, then check the alert bell after the next cron pass — no stranded-units alert appears.

2. ALERT AUTO-RESOLVES (review §3.3 — the linger-forever set). Add resolveActiveAlert calls, mirroring the existing LOW_INVENTORY raise/clear pair (cron/dispatch/route.ts:114-125) and the EMAIL_FAILED active-alert-driven resolve pass (:419-435):
   a. PIN_LOCKED — raised at src/lib/auth/pin.ts:41 as ('PIN_LOCKED','users',userId). Resolve in PATCH /api/users/[id] (src/app/api/users/[id]/route.ts) when the update succeeds and the patch carried `pin` (:88-92) or `unlockPin` (:94-98): resolveActiveAlert('PIN_LOCKED','users',id) after the prisma.user.update at :110.
   b. MATERIAL_REQUEST — raised as ('MATERIAL_REQUEST','deployment_requests',id) at src/app/api/deployment-requests/route.ts:103 and [id]/route.ts:91. Resolve inside applyRequestTransition (src/lib/deployment-requests.ts:590-800) after any SUCCESSFUL transition that ends the request's need for attention: fulfill, complete, decline, cancel (result.ok only). Placing it in the lib means the public status-link path (status-links.ts applyReservationTransition :333) converges for free — verify with a test through that path too.
   c. EQUIPMENT_NOT_RETURNED — raised per kit item as ('EQUIPMENT_NOT_RETURNED','kit_items',ki.id) at src/app/api/daily-check/route.ts:174. Resolve in the end route (src/app/api/deployments/[id]/end/route.ts) after the transaction commits: for every kitItemId in allKitItems, resolveActiveAlert('EQUIPMENT_NOT_RETURNED','kit_items',ki.id). Best-effort (.catch), never fails the end.
   d. INVENTORY_DRIFT, all six sourceIds — currently raise-only (cron/dispatch/route.ts:279-284 per-item, :302/:317/:341/:358/:381 the INV-1..5 sentinels). Auto-resolve on the next clean pass:
      - INV-1..5: each block gets an else — when its query returns 0 rows, resolveActiveAlert with the SAME (sourceTable, sourceId) triple it raises with.
      - per-item drift (#8): a resolve pass driven off the ACTIVE alerts, exactly like EMAIL_FAILED's (:419-435): fetch alert rows where type='INVENTORY_DRIFT' AND sourceTable='inventory_items' AND resolved=false, resolve any whose sourceId is NOT in the current drift result set. (Type filter is mandatory — LOW_INVENTORY shares sourceTable 'inventory_items'; activeKey embeds the type so resolveActiveAlert is safe, but the scan query must not fetch LOW_INVENTORY rows.)
      - CRITICAL GUARD: all of 8/8b sit in try/catch (:286-288, :387-389). Resolves run ONLY in the else of a query that succeeded — a thrown/failed query must never clear alerts (a broken detector reading as "all clean" is the failure mode this guard exists for).
   ACCEPTANCE: grep -n "resolveActiveAlert('PIN_LOCKED'" src/app/api/users/[id]/route.ts · "resolveActiveAlert('MATERIAL_REQUEST'" src/lib/deployment-requests.ts · "resolveActiveAlert('EQUIPMENT_NOT_RETURNED'" src/app/api/deployments/[id]/end/route.ts · "resolveActiveAlert('INVENTORY_DRIFT'" src/app/api/cron/dispatch/route.ts — all four hit. Tests: each raise→trigger-the-clearing-event→alert resolved (resolved=true, activeKey null, notifiedAt untouched); a re-recurrence raises a FRESH alert (the dedup re-arm).
   SMOKE: lock a test operator's PIN (6 bad attempts), reset it from Team Management — the PIN_LOCKED alert leaves the bell without anyone clicking Resolve.

── PR-2 · Expired-link unjam + request scope + durationMs + indexes ──

3. EXPIRED HUB_RETURN UNJAM (review §3.5). EXPIRED is computed at read, never persisted; the hubs-inbound "awaiting receipt" list doesn't filter expiresAt (src/app/api/hubs/inbound/route.ts:18-24 — expired ISSUED/VIEWED rows sit there forever), and admin Mark-received 409s because the receive route (src/app/api/status-links/[id]/receive/route.ts:17) goes through applyTransition, which gates on isLinkActionable (src/lib/status-links.ts:184-188, :235-237) — expiry fails it. The unit stays IN_TRANSIT with no escape. Minimal fix, two halves:
   a. Admin receive BYPASSES the expiry clock only: add an opts param to applyTransition (e.g. { bypassExpiry?: boolean }) honored ONLY where the expiry-time check would fail — the state gate (REVOKED/COMPLETED stay refused) is unchanged. Pass it solely from the admin receive route, with this comment at the call site: "Admin authority supersedes link expiry: the link's clock limits the EXTERNAL recipient, not the admin confirming on the hub's behalf — an expired link must not strand a unit IN_TRANSIT." Public /api/s/[token]/transition keeps the full gate untouched.
   b. Inbound list surfaces expiry: expiresAt is already in the payload (inbound/route.ts:29,:97) — in the admin hubs page (src/app/(admin)/admin/hubs/page.tsx), render an "Expired link" chip (StatusChip, warning tone) when expiresAt < now, next to the existing per-unit actions, and make sure Reissue (handler exists, :218-231; buttons :552/:565) is offered on those rows — reissue already revokes-and-mints (src/app/api/status-links/[id]/reissue/route.ts).
   DO NOT build a persistence sweep (see scope guard).
   ACCEPTANCE: grep -n "supersedes link expiry" src/app/api/status-links/[id]/receive/route.ts (or status-links.ts) hits; grep -n "Expired link" src/app/(admin)/admin/hubs/page.tsx hits. Test: expired ISSUED HUB_RETURN link → admin receive returns 200, unit flips IN_TRANSIT→AVAILABLE, siblings complete; the same expired link via the PUBLIC transition route still 409s.
   SMOKE: on a unit whose return link has expired, Hubs → Inbound shows an "Expired link" chip and Mark received works on the first click.

4. forOperatorId SCOPE (review §3.6). listRequests' operator branch scopes requestedById OR fulfillerOperatorId only (src/lib/deployment-requests.ts:177), while Awaiting-Pickup cards (getAwaitingPickupForOperator :977) and the hold-TTL notification (cron/dispatch/route.ts:221-247) target forOperatorId — an admin-filed reservation FOR operator X gives X a pickup card and a "held items returned" notification pointing at a Requests page where the request has never existed. Fix: add OR r."forOperatorId" = ${requestedById} to the WHERE at :177 (matching the claim-path predicate at :839). Then VERIFY Today inherits it: src/lib/operator-today.ts:71 calls listRequests(userId) — confirm the admin-filed-for-X request now appears in X's Today request list and Requests page, and that X does NOT gain edit/cancel powers they shouldn't have (check the requests page's action gating against requestedById before assuming read-only is automatic — report what you find).
   ACCEPTANCE: grep -n 'forOperatorId' src/lib/deployment-requests.ts hits inside listRequests. Test (extend tests/new3-request-for-operator.test.ts): admin creates a request with forOperatorId=X → listRequests(X) returns it; listRequests(unrelated Y) does not.
   SMOKE: file a reservation "for" a test operator from the admin side; that operator's Requests page shows it.

5. durationMs HONESTY (review §3.10 / charter metric 2). handleSubmit awaits captureLocation() — up to a 10s GPS wait (src/app/(operator)/operator/daily-check/page.tsx:37-53, awaited at :209) — BEFORE mutate builds the payload, and buildPayload computes durationMs at call time (:192), so the GPS wait inflates every timed check. Fix: stamp the duration in handleSubmit BEFORE the captureLocation() await (const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined) and pass it through buildPayload instead of recomputing there. Additive, no schema, no server change; keep the startedAtRef reset in handleReset (:241) working.
   ACCEPTANCE: grep -n "durationMs" src/app/(operator)/operator/daily-check/page.tsx shows the stamp lexically before the captureLocation() await in handleSubmit, and buildPayload no longer calls Date.now() for it.
   SMOKE: submit a check while denying location slowly (let the prompt sit ~10s) — the check's duration in the viewer reads the form time, not form time + 10s.

7. CHEAP INDEXES (review §3.11). deployment_requests is queried by requestedById/forOperatorId on every Today load but @@index has only status/requestType/fulfillerHubId. Add @@index([requestedById]) and @@index([forOperatorId]) to DeploymentRequest, plus a hand-written additive migration (prisma/migrations/<timestamp>_cc31_request_scope_indexes/migration.sql) with the two CREATE INDEX statements matching Prisma's default names. Additive-only — passes check-migration-safety.sh untouched. Ships in this PR because item 4 adds the second predicate that makes forOperatorId hot.
   ACCEPTANCE: grep -rn "requestedById" prisma/migrations/*cc31*/migration.sql hits CREATE INDEX; grep -n "forOperatorId" prisma/schema.prisma hits an @@index.
   SMOKE: none needed (invisible); deploy is the smoke — migrate job green.

── PR-3 · Pilot-metrics dashboard (the biggest piece) ──

6. /admin/pilot (review §3.10 + §4.5 — Max's daily 5-minute watch, priced at zero clicks today). GET /api/admin/pilot-metrics exists with no UI (src/app/api/admin/pilot-metrics/route.ts, src/lib/pilot-metrics.ts). Build the page + extend the API:
   a. API/lib extensions (src/lib/pilot-metrics.ts + the route): accept a date range (?from/?to, default the pilot fortnight to date) returning a per-day array; add GPS grant rate (% of the day's checks with "gpsLat" IS NOT NULL); add a durationMs distribution (bucketed) alongside the existing avg; add the day's checks list (id, operatorName, vehicleName, submittedAt, durationMs, passFail, hasGps) for the drill-down. Admin-only via requireAdmin, unchanged.
   b. DENOMINATOR HONESTY: getDailyCheckAdoption computes eligibility from rigs active NOW for ANY queried date (pilot-metrics.ts:27-31 — WHERE r."endedAt" IS NULL), so history shifts retroactively every time a deployment ends. Snapshot eligibility per queried day: rigs whose "startedAt" <= end-of-day AND ("endedAt" IS NULL OR "endedAt" >= start-of-day), and rig_vehicles rows with "addedAt" <= end-of-day AND ("removedAt" IS NULL OR "removedAt" >= start-of-day). Day boundaries in APP_TIMEZONE via the FND-7 helpers (src/lib/business-date.ts) — the same discipline the cron uses.
   c. Breakdown: per day, the operator+vehicle grid — each active rig's PRIMARY operator (the same resolver the cron uses, D3 isAdminHeld flag included) with its vehicles and which were checked. Show adoption as done/eligible with the raw numbers, never just the percentage.
   d. Page /admin/pilot: MUI + tokens theme (src/theme/tokens.ts); StatCard for the headline tiles (adoption, avg duration, GPS grant rate); StatusChip for pass/fail/flags; DetailDrawer if a row needs depth. Flag durationMs < 20s rows visibly — the pencil-whip signal the charter's variance check needs (frame it as "worth a look", not an accusation). Each check row links to the existing CC-26 viewer via /admin/vehicles?check=<checkId> (the D12 deep-link contract) — the Monday variance check stops being a click-safari.
   e. Nav: add { label: 'Pilot', href: '/admin/pilot' } to NAV_ITEMS (src/components/admin/AdminNav.tsx:22-35). Admin-only: do NOT add it to OPERATOR_VIEW_HREFS (:40-48) or proxy.ts's OPERATOR_VIEW_ADMIN_PATHS.
   ACCEPTANCE: grep -n "admin/pilot" src/components/admin/AdminNav.tsx hits; grep -n "gpsGrantRate" src/lib/pilot-metrics.ts hits; the eligibility SQL no longer contains a bare endedAt-IS-NULL for historical days. Tests (extend tests/cc14-pilot-metrics.test.ts): a rig ended yesterday still counts eligible for yesterday and not today; grant rate math; the <20s flag threshold; operator-scoped page access denied.
   SMOKE: open Pilot from the admin nav — today's adoption, average check time, and GPS grant rate are on screen, and tapping a check row opens that exact check in the viewer.

MERGE GATES: I smoke each PR on staging before authorizing merge (evening deploys only — anyone already onboarded reloads after each, per launch rule 5). PR-1's smoke includes one full cron force-run watched in the bell. Never waive a smoke.

SESSION CLOSE: standard 7 steps per STATUS.md — update STATUS §1/§3/§4; add CC-31 to the AHITS_CLAUDE_CODE_INSTRUCTIONS.md packet ledger; note the parked persistence-sweep and the §3.2 secondary-operator packet (pre-CC-17) as the explicit non-goals; step-7 grep anchors = the ACCEPTANCE greps above (one per item); handoff + commit + git-tracked sanity.
```

---

## CC-16S · Public-surface security step-0 (split from CC-16 — the rest is PARKED, D18)
**Review seats:** Antagonist (primary — public surface), SRE.

```
Execute CC-16S: ONLY step 0 of the CC-16 packet, split out per D18 (Max, 2026-07-28) and six-seat review §3.4/§6.3 — security fixes on a live public surface ship now; CC-16-proper (public QR daily check) is PARKED conditional. ONE PR, feature branch, verify gate, evening deploy.

SCOPE GUARD (this is the whole point of the split):
- NOTHING else from CC-16. No lib/daily-check.ts extraction, no StatusLink.vehicleId column, no DAILY_CHECK link type, no sentinel user, no public form, no QR printing, no chase-email wiring. Zero schema.
- PARK TRIGGER (recorded in D18): CC-16-proper builds only on named evidence of a specific user who won't or can't sustain the installed app (or the missed-check chase needing a no-auth path). Adoption holding without it = stays parked.
- Two files of substance: src/app/api/s/[token]/route.ts and src/app/s/[token]/page.tsx, plus the test file. Touch nothing else.

1. REVOKED/EXPIRED READ-AFTER LEAK (review §3.4). GET /api/s/[token] builds the full subject payload regardless of state (src/app/api/s/[token]/route.ts:26-85) — a dead RESERVATION link still serves live hub inventory: availableUnits and substitutableItems ride every line (:80-81, built by getLineChecklist), and dead WORK_ORDER/HUB_RETURN links leak asset/problem/hub details the same way. Only the UI says "no longer active." Fix: when !actionable (isLinkActionable false — REVOKED, COMPLETED, or clock-expired, src/lib/status-links.ts:184-188), return a minimal body: { type, state, actionable: false, allowedActions: [], subject: {} } plus a human label string (e.g. "Rig Reservation Request" / "Hub Return") — NO subject payload, and skip the getRequest/getLineChecklist queries entirely (don't build-then-strip). Keep the 404-for-unknown-token and markViewed behavior as-is.
   Then read the portal page's not-actionable rendering (src/app/s/[token]/page.tsx:205-213 reservation, :268-275 generic) and keep it working against the minimal body — the header cards already fall back ('Rig Reservation' :199, 'Equipment' :261) when subject fields are absent; verify no crash and the state-specific copy (COMPLETED/EXPIRED/REVOKED) still selects correctly.
   ACCEPTANCE: grep -n "subject: {}" src/app/api/s/[token]/route.ts hits in the not-actionable branch, and neither "availableUnits" nor getLineChecklist is reachable on that path. SMOKE (non-engineer): open a revoked reservation link — the page says the link is no longer valid and shows NO item list, quantities, or unit serials.

2. FND-6 FINAL SHARD — stable per-line idempotency key. The per-line action key still embeds Date.now() (src/app/s/[token]/page.tsx:164: `${token}:line:${lineId}:${action}:${Date.now()}`), so double-tap dedup never fires — every tap is a fresh key. The link-level keys were already stabilized as content keys (`${token}:${action}` :106, `${token}:PREPARED` :180); match that discipline, with one wrinkle: withIdempotency is body-hash-bound, and a hub can legitimately act on the same (line, action) twice with different data (edit qty 2, then edit qty 3), so a pure content key would 409/422 the second intent. Fix: a per-intent nonce held in a ref — mint once per (lineId, action) intent on first use (name it lineActionNonce so it greps), reuse it for every retry/double-tap of that intent (dedup fires), clear it on success so the NEXT intent mints fresh. Key shape: `${token}:line:${lineId}:${action}:${nonce}`.
   ACCEPTANCE: grep -n "Date.now()" src/app/s/[token]/page.tsx has NO hit inside the Idempotency-Key template; grep -n "lineActionNonce" hits. SMOKE: double-tap Confirm on one line at the hub portal — one event lands, no duplicate row, no error flash.

3. RATE LIMITS + TESTS. Confirm (report, don't rebuild) that rate limiting still covers both public routes: GET at src/app/api/s/[token]/route.ts:10-14 and transition at src/app/api/s/[token]/transition/route.ts:38-40 — both on the `statuslink:${ip}` bucket, 60/5min. Extend tests/fnd6-public-link-gate.test.ts (keep its existing four cases green): (a) GET on a REVOKED link returns the minimal body — assert subject is empty and the response text contains no availableUnits/serial data; (b) GET on an expiresAt-past link likewise; (c) GET on an ISSUED link still returns the full reservation subject (the control); (d) the stable-key behavior — two identical line-action POSTs with the same Idempotency-Key apply once (idempotency replay, not a second write).
   ACCEPTANCE: grep -n "minimal" tests/fnd6-public-link-gate.test.ts hits a new describe/it; suite green.

MERGE GATE: I smoke on staging before merge — one dead link, one live link, one double-tap. Public surface: nothing merges on green CI alone.

SESSION CLOSE: standard 7 steps per STATUS.md, PLUS: (1) D18 is already recorded (2026-07-28 review session) — reference it; (2) update the CC-16 entry in AHITS_CLAUDE_CODE_INSTRUCTIONS.md's ledger (step 0 → CC-16S SHIPPED, remainder 🅿 PARKED per D18) so no future session re-runs step 0 or builds the rest unprompted; (3) step-7 grep anchors: "subject: {}", "lineActionNonce", and the D18 reference.
```

---

## CC-32 · Friction & flow — the operator-experience floor (slots after CC-29)

**Review seats:** Operator-lens (primary) · Antagonist (mandatory sign-off on PR-2 item 5 — the one accuracy-adjacent change) · Calibration (friction-budget tables + copy honesty).
**Provenance:** built from the 2026-07-28 six-seat Operator-lens review (findings P1-2, P1-4, P1-5, P1-6, P2-1..P2-5, the B) friction-budget list, and the D11 glossary evidence). Deferred elsewhere: secondary-operator model (own pre-CC-17 packet), lie-fi timeout + online-401 + queue internals (**CC-29**), pilot dashboard + `durationMs`-excluding-GPS + `forOperatorId` (**CC-31**). D19: nothing money-related is touched here.

```
CC-32 · FRICTION & FLOW — strings, copy honesty, and small flow wins on operator surfaces.
Feature branch per PR, full verify gate each (make db-generate && npx tsc --noEmit && npx eslint src && npm test
&& npm run test:ui). Three PRs, landed in order. Tag every change with a `// CC-32 (<item>)` comment — the
session-close greps key off these.

━━ SCOPE GUARD (read first, applies to all three PRs) ━━
• Strings / UI / small client flow ONLY. NO schema, NO migrations, NO DB-enum or API-status-value changes —
  every rename below is a DISPLAY label; `REQUEST_STATUS` keys, zod enums, and route payloads are untouched.
  The single API change permitted is the additive read-side field in PR-2 item 2 (named there; nothing else).
• NO offline-queue-engine changes. CC-29 owns src/hooks/useOfflineQueue.ts internals (timeouts, 401 handling,
  photo resolution). CC-32 may only ADD the banner→OutboxDialog open path and copy strings (PR-2 items 8–9).
  If you find yourself editing flush()/mutate()/enqueue(), stop — wrong packet.
• NO admin-surface redesigns. Admin strings change ONLY where PR-1's glossary table names them; admin layout,
  drawers, dashboards untouched. Operator-only for the ergonomics pass (PR-3 item 12).
• D2/D14 language preserved: every map/GPS surface keeps its "last-known, not live" framing; GPS capture
  remains resolve-or-skip and NEVER blocks a submit (PR-2 item 6 changes WHEN capture starts, not whether).
• D9 conventions HOLD: "Fulfill" reserved for stock-moving actions; "Mark Handled" for MATERIAL complete;
  "Staged"; "Dismissed". Do not re-litigate them; PR-1 builds on them.
• The Date-field change on the daily check is owned by CC-29 — do NOT touch the date input here; if CC-29's
  merged state already made it read-only, leave it exactly as found.
• Required section in EVERY PR body: a friction-budget table — one row per changed interaction, columns
  "taps added / taps-texts-calls removed". A required interaction that removes nothing does not ship (North
  Star v3 §3 rule 3).

━━ ⟲ PRE-FLIGHT ━━
This packet lands AFTER CC-29 (offline trust floor). Rebase on CC-29's merged state before writing code —
shared files: src/app/(operator)/operator/daily-check/page.tsx, src/components/operator/OfflineBanner.tsx,
src/components/operator/OutboxDialog.tsx. All line refs below were verified against pre-CC-29
origin/development (2026-07-28); treat them as anchors to re-locate, not gospel — re-grep each string before
editing, and report in the PR body anything CC-29 already moved or fixed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PR-1 · THE D11 GLOSSARY SWEEP — strings only, zero logic, zero DB enums
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 0 — MAX CONFIRMS THE WORD LIST (do this before any edit; 5 lines to text him):
  "Locking app vocabulary. One word per action: taking gear from the hub = 'Pick Up'; creating/launching a
  deployment = 'Start Deployment'; giving gear back = 'Return to Hub'; equipment custody stays 'Check Out /
  Check In' (scan surfaces only, always in that order); a reservation waiting at the hub reads 'Staged at
  <hub> for pickup'. Sanity-check against the words operators actually use in their texts to you — reply
  with any word they say differently and that word wins."
Max's reply overrides any survivor below. Record his confirmation (or overrides) in the PR body.

The measured cluster (2026-07-28 review, section B) — one physical act, seven names. Changes:

1.1  ONE verb for creating a deployment → "Start Deployment".
     src/app/(operator)/operator/my-deployment/page.tsx:554 — "Launch Deployment" → "Start Deployment",
     "Launching…" → "Starting…" (same ternary; the pickup branch keeps "Pick Up"). Line :323 dialog title
     "Pick Up Reservation" / "Start Deployment" — keep both (correct per-context titles). Grep-sweep
     "Launch" as a deployment verb repo-wide (buttons/toasts/comments-facing-UI only).
1.2  ONE custody pair order → "Check Out · In".
     src/app/~offline/page.tsx:35 — "Scan / Check In · Out" → "Scan / Check Out · In" (match
     src/app/(operator)/operator/dashboard/page.tsx:138). "check out, check in, or look up equipment"
     subtext (:139) stays.
1.3  Staged, said the same way to the operator.
     src/app/(operator)/operator/requests/page.tsx:243-247 — caption "Stock reserved at {hub}" →
     "Staged at {hub} for pickup" (one word with the chip; chip labels in src/lib/status.ts:84-92 are
     UNTOUCHED — Requested/Staged/Forwarded/Fulfilled/Denied/Cancelled stay, D9's accepted chip
     inconsistency stands).
1.4  Pick Up stays the one taking-verb; verify no rivals.
     src/components/shared/AwaitingPickupCard.tsx:44,48,89 ("Ready for Pickup" ×2, "Pick Up") — keep.
     Grep for "Collect", "Claim", "Grab", "Checkout" as taking-verbs; the review found ZERO operator-facing
     "Claim" strings (code-only: session claims, claim-first DB comments) — CONFIRM with
     `grep -rn "Claim" src --include=*.tsx` and record the result; if any UI "Claim" surfaces, it becomes
     "Pick Up".
1.5  Return verb → "Return to Hub" everywhere gear goes back.
     src/app/(operator)/operator/scan/page.tsx:322 is the survivor. Sweep DispositionDialog /
     DeploymentCards ("Return item" tooltip, src/components/operator/DeploymentCards.tsx:170) and any
     "Return"-family labels to agree with it where they mean hub return.
1.6  Admin strings — verify-only, no renames: "Fulfill" (src/app/(admin)/admin/requests/page.tsx:420,474),
     "Mark Handled" (:439 and operator requests/page.tsx:264), "Stage (admin)" (:385), "✓ Ready to stage"
     (src/components/shared/FulfillmentChecklist.tsx:393), "Forward → Hub"/"Forward → Operator" (:423,426).
     These are D9-settled; confirm one word per state HOLDS and list them in the PR body as checked.
1.7  THE STRAGGLER SWEEP (required): after edits, grep the repo for every retired word in its retired sense
     — "Launch", "Check In · Out", "Stock reserved", "Prepared", "Collect", "Claim" — across *.tsx, *.ts
     toast strings, and tests. Paste the (empty) result into the PR body. A rename that leaves one stale
     toast is worse than no rename.

ACCEPTANCE (PR-1): `grep -rn "Launch Deployment" src` → 0 hits · `grep -rn "Check In · Out" src` → 0 hits ·
`grep -rn "Staged at" src` → ≥1 hit (operator requests caption) · component tests still 100% (label-asserting
tests updated in the same commit, byte-diff limited to strings).
PHONE SMOKE (non-engineer, 1 line each): the offline fallback page and the dashboard scan card say the same
thing; starting a deployment says "Start Deployment" at both ends; a staged reservation reads "Staged at
<hub> for pickup" under a "Staged" chip.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PR-2 · FLOW & FRICTION — small logic, each change states its tap math
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2.1  One-time failure entry. src/app/(operator)/operator/daily-check/page.tsx — a failed check currently
     demands the same information twice: per-item "No" notes (required, :178,:201) AND a required overall
     "Issue summary" (:414-425). PREFILL the summary from the per-item notes, joined as "<item label>:
     <note>" per line, when the operator reaches the review step with the summary still empty; fully
     editable after prefill; per-item notes stay required (they feed the viewer's per-item display).
     Never overwrite a summary the operator already typed.
     [taps added 0 / removed: one full re-typing of every failure, gloved]
     ANCHOR: `// CC-32 (2.1)` + grep `prefill` in daily-check/page.tsx.
     SMOKE: mark one item No with a note → review step's summary already contains it.

2.2  Site prefill. Same file, site field :327-332 — retyped every morning today. Cheapest correct source
     (read-verified): the page ALREADY fetches `/api/vehicles/${vehicleId}` for lastOdometer (:167); add an
     additive `lastCheckSite` field to that GET's response (most recent daily_checks.site for the vehicle —
     read-side only, THE one permitted API change, no schema) and default the empty site field to it when
     it arrives; editable; never overwrite typed input; offline/absent → field stays empty exactly as now.
     Do NOT use operator-today's todaySite (src/lib/operator-today.ts:81 — today-only, empty every morning).
     DO NOT touch the Date field — CC-29 owns it (see scope guard).
     [taps added 0 / removed: one typed site string per operator per morning]
     ANCHOR: grep `lastCheckSite` (route + page). SMOKE: yesterday's site appears pre-filled this morning.

2.3  Handoff note → optional with presets. src/app/(operator)/operator/my-deployment/page.tsx:1849
     ("Note (required)"), :854 + :1859 (guards) — make optional, add the CC-24 one-tap preset Chip row
     (NOTE_PRESETS pattern, see :523-527) with handoff-appropriate presets ("End of shift", "Heading home —
     covering handoff"). CHECK THE SERVER: if the handoff POST zod requires note min(1), relax it in the
     same PR (the CC-24 item-4 precedent) — otherwise the client change 400s.
     [taps added 0 / removed: mandatory typing at every end-of-day handoff]
     ANCHOR: grep `Note (optional)` in the handoff dialog. SMOKE: hand off with zero typing (one preset tap).

2.4  Deployment builder 4 → 2 steps. Same file, NewDeploymentDialog stepper :325-330 — steps "Details"
     (only an optional label, :334-337) and "Launch" (only an optional note, :519-538) carry nothing
     required. Fold the label field into the top of the "Build Rig" step and the note+presets into the
     bottom of "Build Kit" (below the UR-006 blocker alert, :509-515, which must stay on that step).
     Stepper becomes 2 steps; ALL validation, UR-006 gating, 409-reselect behavior (:303-314), pickup
     preset seeding, and the final button behavior are byte-preserved. Update the NewDeploymentDialog
     component test for the new step count in the same commit.
     [taps added 0 / removed: 2 guaranteed "Next" taps per deployment start]
     ANCHOR: stepper renders exactly 2 <Step> in the dialog. SMOKE: hub departure = pick vehicles → pick
     kit → Start Deployment, no empty screens.

2.5  ⚠ ANTAGONIST SEAT — second-check template correctness (the accuracy-adjacent item).
     src/app/(operator)/operator/daily-check/page.tsx — TWO defects, fix both:
     (a) handleReset (:232-243) re-seeds DEFAULT_CHECKLIST and re-selects the same vehicle, so the template
         effect (:143-159, keyed [vehicleId, selectedVehicleType]) never re-fires → check #2 of the day
         silently runs the built-in 16 items instead of the admin template. Fix: reset must re-trigger the
         template resolve (a fetch-nonce in the effect key, or an explicit re-fetch in handleReset — pick
         one, name it in the PR body).
     (b) A late template response must NEVER wipe non-pristine answers (the FND-35 family, scan-path
         ?vehicleId= race): before applying a fetched template, check whether the operator has touched ANY
         row (value !== 'yes' || note !== '') or moved past step 0; if pristine → apply silently; if
         touched → keep their answers and show a dismissible one-line notice ("A newer checklist for this
         vehicle exists — finish this check; the next one uses it."). Do not build a merge UI.
     Antagonist must sign off on: the pristine predicate, the reset path re-fetching, and a component test
     covering BOTH races (late-resolve-after-touch; reset-then-same-vehicle).
     [taps added 0 / removed: a redone check + the admin phone call when the wrong checklist is discovered]
     ANCHOR: `// CC-32 (2.5)` + the two new component tests green. SMOKE: submit a check, tap Start New
     Check on the same vehicle → the admin template's items appear (not the default 16).

2.6  GPS wait, felt not suffered. Same file — captureLocation (:37-53, 10s high-accuracy timeout) currently
     runs only after the Submit tap (:209), stacking up to 10 silent seconds behind "Submitting…". Change:
     when the REVIEW step mounts (step===2), start captureLocation() once and hold the promise in a ref;
     handleSubmit awaits the warmed promise if present, else falls back to the existing submit-time capture
     (vehicle unchanged since warm — else re-capture). Resolve-or-skip semantics, the D2 no-tracking caption
     (:441-445), and never-block are UNCHANGED; the OS permission prompt now fires while the operator reads
     the review summary instead of mid-spinner. Add ONE priming line on step 1 (inspection): "Location is
     grabbed once at submit — you can say no." COORDINATE: CC-31 owns stamping durationMs to exclude GPS
     wait; do not touch the durationMs math here regardless of whose branch lands first.
     [taps added 0 / removed: up to 10 dead seconds per submit — the whole check takes ~11]
     ANCHOR: `// CC-32 (2.6)` warm-capture ref. SMOKE: Submit tap → success toast in ~1s with location on.

2.7  Pickup deadline shown. src/components/shared/AwaitingPickupCard.tsx — holdExpiresAt is received (:19)
     and never rendered. Add one caption line when non-null: "Held until <formatDate>" (use the existing
     formatDate util); amber emphasis if within 24h. Nothing else on the card changes.
     [taps added 0 / removed: the "is my stuff still at the hub?" call]
     ANCHOR: grep `Held until` src. SMOKE: a staged reservation card shows its hold date.

2.8  Outbox openable while merely pending (P0-3, operator half). src/components/operator/OfflineBanner.tsx —
     the queue banner (:124-142, "N action(s) waiting to sync.") is dead text; the OutboxDialog opens ONLY
     from the failed-banner "Review" (:87-98). Add the same `action={<Button…>View</Button>}` to the queue
     banner → setOutboxOpen(true). OutboxDialog (src/components/operator/OutboxDialog.tsx) ALREADY renders
     pending rows read-only with Waiting/Sending chips — no dialog logic changes beyond copy: empty state
     :66-68 "Nothing queued — everything has synced." → "All caught up — everything sent." Failed-item
     actions stay exactly as CC-29 leaves them. SCOPE: this is the ONLY OfflineBanner/OutboxDialog change;
     queue engine untouched.
     [taps added 0 (the View tap is optional) / removed: the "did my check go through?" text — the one text
     this app exists to delete]
     ANCHOR: grep `All caught up — everything sent.` SMOKE: airplane mode → submit a check → tap View on the
     banner → see "Daily check · Waiting".

2.9  Copy honesty pass (operator surfaces):
     (a) src/app/(operator)/operator/dashboard/page.tsx:73 — "Pull to refresh, or check your connection."
         is a lie on installed iOS PWAs (no such gesture). → "Couldn't load your day. Tap the refresh
         arrow above, or check your connection."
     (b) Same file :127-128 — the empty state currently misdirects ("When you pick up a rig, your day shows
         up here" → invites a second-seat operator to start a duplicate deployment). → title "No deployment
         assigned to you yet", body "If you're riding with a crew today, your crewmate's rig carries the
         checks for now — see My Deployment for anything waiting on you. You can still scan equipment
         below." (Honest under the deferral; the secondary-operator MODEL fix is its own pre-CC-17 packet —
         do not touch getActiveRigForOperator.)
     (c) Sweep operator surfaces for other named-but-nonexistent gestures/affordances ("swipe", "pull",
         "long-press", references to buttons not on that screen) — `grep -rin "pull to refresh\|swipe\|long-
         press" src/app/\(operator\) src/components/operator src/components/shared` — fix what you find,
         list it in the PR body.
     [taps added 0 / removed: one dead-end gesture attempt + one wrong deployment start]
     ANCHOR: `grep -rn "Pull to refresh" src` → 0 hits. SMOKE: kill the network, open Today → the error
     text names a button that exists on the screen.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PR-3 · REACH & ERGONOMICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3.1  Crew map out of the hamburger. src/components/operator/OperatorBottomNav.tsx:19-24 currently holds 5
     tabs (Home / Check / My Deployment / Requests / Scan); the pilot's marquee trust surface is drawer-only
     (OperatorNav.tsx:27). DECISION (state it in the PR body; Max can override in review): add Map as a 6th
     tab. Tradeoff weighed: 6 tabs ≈ 65px each at 390px — tight but within MUI BottomNavigation's showLabels
     spec and every label here is one short word; the alternative (swallow Requests into the drawer) demotes
     a surface CC-14 just promoted for cause. PICK: 6 tabs, `label="Map"`, MapIcon, href /operator/map, no
     badge. If Max overrides, the swap candidate is Requests — nothing else moves.
     Offline: add `pathname === '/api/map/crew'` to the SW field-reads matcher (src/app/sw.ts:37-56 — exact
     match, NOT startsWith('/api/map'), keeping the admin map endpoints out of the operator cache), and give
     CrewMapView (src/components/operator/CrewMapView.tsx:33-41 plain fetch, :52 red error) the useFreshList
     + FreshnessIndicator treatment so offline shows last-cached pins with "Data as of HH:MM" instead of
     "Failed to load crew map". D2 language on the page (:48-50 "last-known, not live") is PRESERVED
     VERBATIM.
     [taps added 0 / removed: hamburger + drawer-hunt every map open; the offline red-error dead end]
     ANCHOR: grep `'/api/map/crew'` src/app/sw.ts · Map tab in OperatorBottomNav. SMOKE: map is one thumb
     tap from Today; airplane mode → map still shows yesterday's pins with a freshness stamp.

3.2  44px pass on the Today components (the CC-23 discipline never reached CC-14's new leaves):
     src/components/operator/today/VehicleChecks.tsx:48 ("Check", size="small") ·
     src/components/shared/AwaitingPickupCard.tsx:85-89 ("Pick Up", size="small") ·
     src/components/operator/today/WaitingOnMe.tsx:49 ("Review", size="small") ·
     src/components/shared/FreshnessIndicator.tsx:28 (refresh IconButton size="small" — now the ONLY honest
     refresh affordance per 2.9a; give it a 44px hit area via padding, icon can stay small).
     Pattern: minHeight 44 / minWidth 44 + fontSize 16 per the CC-23 daily-check toggle precedent
     (daily-check/page.tsx:373). Visual density may stay compact; the HIT AREA must not.
     [taps added 0 / removed: every gloved mis-tap + re-tap on the morning surface]
     ANCHOR: `// CC-32 (3.2)` on each. SMOKE: with a gloved thumb (or thumb-pad, not tip) each of the four
     targets hits first try at 390px.

3.3  Residual sub-44px sweep, operator surfaces ONLY (admin out of scope): grep operator pages + shared
     components rendered in the operator shell for size="small" Buttons/IconButtons that are PRIMARY actions
     (not dense-list secondaries), LIST every finding in the PR body with a fix/leave call each, and fix the
     fixes. Known candidates from the review to check: the my-deployment incoming transfer/handoff
     Accept/Decline (already 44px via the CC-23 sx at :1044,:1078,:1213,:1246 — verify, don't duplicate),
     scan-page "Log fixed issue"/"Report damage" (:381-396), OutboxDialog Retry/Discard (CC-29 may have
     touched — check after rebase).
     ANCHOR: the PR-body table itself. SMOKE: none beyond 3.2's.

━━ ACCEPTANCE ANCHOR SUMMARY (session-close greps, all must hold on the merged branch) ━━
  PR-1: "Launch Deployment"→0 · "Check In · Out"→0 · "Staged at"≥1
  PR-2: lastCheckSite≥2 · "Note (optional)" in handoff dialog · 2-step NewDeploymentDialog test green ·
        CC-32 (2.5) tests ×2 green · "Held until"≥1 · "All caught up — everything sent."≥1 ·
        "Pull to refresh"→0 · `// CC-32 (2.6)`≥1
  PR-3: '/api/map/crew' in sw.ts · Map tab in OperatorBottomNav · `// CC-32 (3.2)` ×4

━━ SESSION CLOSE (the 7-step durability contract — do all 7) ━━
1. STATUS.md — §1 one-paragraph state + §2 environments gain CC-32 (PR numbers), §3/§4 updated, date line.
2. DECISIONS.md — mark **D11 EXECUTED (CC-32 PR-1, <date>)** with a one-line note naming the locked
   vocabulary and Max's word-list confirmation (or overrides); append the bottom-nav 6-tab call if Max
   ruled on it.
3. 00_START_HERE.md / docs/INDEX.md — no doc moves expected; verify anyway.
4. Handoff doc — what shipped, the 2.5 Antagonist sign-off outcome, any refs that had drifted post-CC-29.
5. Commit + push all docs.
6. git status clean; new docs appear in `git ls-files '*.md'`.
7. Verify every merge claimed via the ACCEPTANCE ANCHOR SUMMARY greps above — an absent anchor means the
   claim is wrong; correct STATUS before closing.
```

---

## CC-33 · Simplify & unify (post-CC-16S)

**Review seats:** Antagonist (primary on PR-1 — independently re-verify every zero-importer claim before deletion) · Operator-lens (primary on PR-2 flow) · Calibration.
**Provenance:** the 2026-07-28 simplification review + Max's owner interview, recorded as **D21** (forward→operator removal + portal reservation-forwarding freeze + dead-code list), **D22** (unified Transfer entry — client-flow only), **D23** (NS-9 resurrection trigger MET: 5+ carrier shipments/month; `Shipment` table now stays dormant, tracking built fresh post-CC-17). These D-entries already exist — reference them, never re-append.
**Sequencing:** LAST in the pilot-floor queue — lands after CC-16S. Two PRs, in order.

```
CC-33 · SIMPLIFY & UNIFY — delete what is dead, remove the never-used forward→operator branch, and merge
the two operator-facing "gear moves to someone else" entry points into one Transfer flow. Follow CLAUDE.md
and AGENTS.md exactly (modified Next.js — read node_modules/next/dist/docs/ first). Feature branch per PR,
full verify gate each: make db-generate && npx tsc --noEmit && npx eslint src && npm test && npm run test:ui.
Tag every change with `// CC-33 (<item>)` — session-close greps key off these.

════════ SCOPE GUARD — read twice ════════
- NO schema, NO migrations. The Shipment TABLE + ShipmentStatus enum (prisma/schema.prisma:1190-1220) STAY
  dormant — D23: the resurrection trigger is met, a future packet builds tracking fresh against them. The
  FORWARDED enum value, the fulfillerOperatorId column, and every other DB shape are untouched.
- Server-side diffs are LIMITED to: (a) deleting the two dead GET handlers named in item B, and (b) the
  forward→operator WRITE-arm removal in src/app/api/deployment-requests/** + lib (item E). Nothing else
  server-side changes. The READ side of forwarded rows is byte-untouched (listRequests SQL incl. its
  fulfillerOperatorId WHERE-arm at src/lib/deployment-requests.ts:177, the GET auth arm at
  src/app/api/deployment-requests/[id]/route.ts:28, the RequestRow field) — a stale FORWARDED-to-operator
  row MUST still render read-only for both parties, and admin "Mark Handled" (admin/requests/page.tsx:434-440)
  remains the way such a row gets closed.
- The handoff/transfer SERVER models, libs, and their POST/accept/decline routes are BYTE-UNTOUCHED
  (src/lib/deployment-handoffs.ts, api/handoffs/**, api/transfers/**, api/deployments/[id]/{handoff,transfer}).
  D22 is a CLIENT-FLOW unification only; the model merge is explicitly out of scope (post-CC-17 at earliest,
  if ever). If you find yourself editing an accept/decline route — stop, wrong packet.
- src/app/s/[token]/** and src/app/api/s/** UNTOUCHED — CC-16S owns them. D21's freeze wording, precisely:
  the RESERVATION-FORWARDING channel of the portal is frozen (no new features, ever — all hub staff have
  accounts; admin/requests is the maintained path). The WORK_ORDER (external repair shops) and HUB_RETURN
  channels are REAL and stay fully maintained. Security hardening (CC-16S) is NOT a feature — it applies to
  all portal types including RESERVATION. Do not encode the freeze in code; it lives in D21.
- Nothing owned by CC-29/30/31/32 is re-done here. PR-2's admin string changes are strings-only and do NOT
  trigger D10's demand-pull split of admin/deployments — say so in the PR body.
- Every PR to `development`; Max smokes on staging before authorizing merge; never merge without his go.

════════ ⟲ PRE-FLIGHT ════════
This packet lands AFTER CC-16S, i.e. after CC-29/32/30/31 too. Rebase before writing code — known collisions:
CC-32 PR-2 item 2.3 edits the handoff dialog note (my-deployment/page.tsx:1849) and CC-32 PR-1 sweeps
deployment verbs; CC-29 rewrote useOfflineQueue internals (PR-1 here never touches that file). All line refs
below verified against 2026-07-28 origin/development — anchors to re-locate, not gospel; re-grep each before
editing and report drift in the PR body. PR-2's vocabulary must not collide with Max's CC-32-confirmed word
list — read the CC-32 PR-1 step-0 record first; if "Transfer" was overridden there, HIS word wins here too.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PR-1 · DEAD CODE + FORWARD→OPERATOR REMOVAL (mechanical)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Work in the item groups below, IN ORDER. After EACH group: npx tsc --noEmit + npm test + npm run test:ui.
A deletion that breaks a test or tsc is REPORTED in the PR body and reverted — never forced — EXCEPT the one
planned test rewrite in item E (named there). Antagonist seat re-verifies each zero-importer claim with its
own grep before sign-off.

──── ITEM A · DEAD LIB CODE ────
A1. DELETE src/lib/shipments.ts entirely (97 lines, 0 importers across src/tests/scripts/prisma). The
    Shipment model/enum in prisma/schema.prisma STAY (D23 — scope guard). Do not touch the schema comment.
A2. src/lib/deployment-assignments.ts — DELETE exactly these 7 functions (each verified: definition is its
    only occurrence): getActivePrimary (:239), listDeploymentProjects (:180), listProjectDeployments (:192),
    removeProjectLink (:212), listAssignments (:227), addAssignment (:351), endAssignment (:378).
    DO NOT delete getDeploymentRosters (:43) — no external importer but called internally by
    getDeploymentRoster (:93); this trap is also recorded at AHITS_CLAUDE_CODE_INSTRUCTIONS.md:331.
A3. src/lib/inventory-stock.ts — DELETE lowStockByHub (:242) + LowStockHubRow (:228); superseded by
    allHubStockForScan (the cron's import at api/cron/dispatch/route.ts:8 is the live path — untouched).
A4. src/lib/deployment-auth.ts — DELETE getAuthorizedRig (:25); its sibling above it stays.
A5. src/lib/email/templates.ts — DELETE the 8 caller-less templates: maintenanceOverdueEmail (:31),
    equipmentNotReturnedEmail (:40), damageReportedEmail (:49), dailyCheckFailedEmail (:58), pinLockedEmail
    (:67), lowInventoryEmail (:76), insuranceExpiringEmail (:85), registrationExpiringEmail (:94). KEEP
    genericAlertEmail, workOrderEmail, hubReturnEmail, inviteEmail — each has live callers (alert dispatch,
    send-to-shop, status-links, the three invite routes).
A6. src/lib/utils.ts — DELETE fromNow (:15-18), capitalize (:20-22), snakeToTitle (:24-26), generateQrData
    (:28-31), AND the now-orphaned relativeTime plugin lines (:2-3) — the only .fromNow() caller was the
    deleted helper (admin/dashboard/page.tsx:40 has its own local relativeTime function; leave it alone).
    capitalize's only caller is snakeToTitle; both go together. formatDate/formatDateTime/clamp/groupBy stay.
ACCEPTANCE: git log shows shipments.ts deleted; grep -rn "lowStockByHub\|getAuthorizedRig\|snakeToTitle" src
returns nothing; grep -n "getDeploymentRosters" src/lib/deployment-assignments.ts still hits (the keeper).

──── ITEM B · DEAD ROUTES ────
B1. DELETE src/app/api/inventory/stock/route.ts (whole file, 21 lines — 0 client callers; the UI uses
    /api/inventory/[id]/stock; the file's "used by checkout dialogs" comment has been false since Wave-0).
B2. src/app/api/checkout/route.ts — DELETE the GET handler (:25-53) and the now-unused zod `schema` +
    `parsePagination`/`NextRequest` imports it strands. KEEP the POST 410 tombstone (:18-23) byte-identical —
    it protects stale PWA clients.
ACCEPTANCE: grep -n "export async function" src/app/api/checkout/route.ts → POST only;
ls src/app/api/inventory/stock 2>&1 → not found.

──── ITEM C · DEAD DEPS + ASSETS ────
C1. package.json — REMOVE @emotion/cache and @emotion/server (0 imports; no CacheProvider anywhere).
    @emotion/react and @emotion/styled STAY — MUI peer dependencies.
C2. REMOVE @mui/x-date-pickers + its only usage: the LocalizationProvider/AdapterDayjs imports
    (src/app/providers.tsx:6-7) and the <LocalizationProvider> wrapper (:44-46 — children render directly).
    No DatePicker/TimePicker/DateCalendar exists anywhere in src (verified). dayjs itself STAYS (utils.ts,
    maintenance.ts).
C3. DELETE public/icons/icon-192.svg and icon-512.svg (0 references; manifest.json uses the PNGs).
    Run npm install so package-lock.json shrinks in the same commit.
ACCEPTANCE: grep -n "emotion/cache\|emotion/server\|x-date-pickers" package.json → nothing;
grep -rn "LocalizationProvider" src → nothing; next build green.

──── ITEM D · BATCH6A RESIDUE (land by hand, then kill the patch) ────
D1. src/app/(admin)/admin/hubs/page.tsx:71 — replace the locale-dependent
    `new Date(iso).toLocaleDateString(undefined, {...})` helper with formatDateTime from '@/lib/utils'
    (the deterministic 'MMM D, YYYY h:mm A' — same intent, hydration-safe; that line is the last unconverted
    DATE call-site the stale patch was written for). Number .toLocaleString() sites (odometer/cost) are NOT
    dates — leave every one alone.
D2. DELETE batch6a-date-unify.patch from the repo root (pending since 07-10; superseded by D1). The held/
    directory and its patches are deliberate — untouched.
ACCEPTANCE: grep -n "toLocaleDateString" "src/app/(admin)/admin/hubs/page.tsx" → nothing;
git ls-files "*.patch" → only held/*.patch remain.

──── ITEM E · FORWARD→OPERATOR REMOVAL (D21 — Max: never used, didn't know it existed) ────
Write side goes; read side stays (scope guard). Map, all re-verified 2026-07-28:
E1. src/app/(admin)/admin/requests/page.tsx — DELETE ForwardOperatorDialog (:156-195), the
    "Forward → Operator" button (:425-427), the dialog mount (:499-501), and narrow the dialog union
    (:239) to 'hub' | 'decline' | null. KEEP the stale-row display: opName (:293) and its
    `Operator: <name>` chip (:344) still render. "Forward → Hub" and its dialog are UNTOUCHED.
E2. src/app/(operator)/operator/requests/page.tsx — DELETE the forwarded-to-me "Mark Handled" branch
    (:250-266 — the `req.status === 'FORWARDED' && req.fulfillerOperatorId === user?.userId` ternary arm;
    the Cancel arm it guarded becomes the sole branch), handleFulfill (:132-149 incl. its CC-24 comment),
    and the fulfillingId state. The FORWARDED chip (lib/status.ts:89 'Forwarded') keeps rendering stale
    rows read-only.
E3. src/app/api/deployment-requests/[id]/route.ts — add 'complete' to ADMIN_ONLY_ACTIONS (:11); DELETE the
    operator-fulfiller complete block (:65-70), the PATCH auth escape `... || result.request.
    fulfillerOperatorId === session.userId` (:58-62 — PATCH only; the GET arm at :28 STAYS), the
    fulfillerOperatorId field from patchSchema (:17), and the forward-to-operator notification arm
    (:97-105 — the `else if (extra.fulfillerOperatorId)` branch; the hub-link branch stays).
E4. src/app/api/deployment-requests/route.ts — DELETE fulfillerOperatorId from bodySchema (:44) and pass
    `fulfillerOperatorId: null` at :80 (no client ever sent it — RequestComposer verified).
E5. src/lib/deployment-requests.ts — in the 'forward' case (:774-785), set `"fulfillerOperatorId" = NULL`
    (clears any stale value on re-forward) and drop the field from TransitionExtra. listRequests, getRequest,
    RequestRow: BYTE-UNTOUCHED.
E6. PLANNED TEST REWRITE (the one allowed): tests/requests-complete-auth.test.ts pins the old contract
    ("assigned fulfiller operator may complete"). Rewrite to the new one: admin completes a FORWARDED
    MATERIAL request (200); the formerly-designated operator now gets 403; requester 403; unrelated 403.
    Keep the hub-forwarded (fulfillerOperatorId null) cases. No other test may need changes — if one does,
    report, don't force.
ACCEPTANCE: grep -rn "ForwardOperatorDialog" src → nothing; grep -n "ADMIN_ONLY_ACTIONS"
src/app/api/deployment-requests/[id]/route.ts shows 'complete'; grep -c "fulfillerOperatorId"
src/lib/deployment-requests.ts is LOWER than before but NOT zero (read side alive). MAX SMOKE (staging,
5 min): create a MATERIAL request as an operator → as admin see Fulfill / Forward → Hub / Decline and NO
"Forward → Operator"; forward one to a hub → it shows Forwarded and admin "Mark Handled" closes it; if any
old operator-forwarded row exists on staging, it still displays (chip + operator name), read-only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PR-2 · UNIFIED TRANSFER ENTRY (D22 — one word for gear moving to a person)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Client-flow only. Server byte-untouched (scope guard). my-deployment/page.tsx is at 1,914 lines — the
ANTI-REGROWTH RULE applies: every NEW component in this PR goes in a NEW FILE; net lines in page.tsx must
go DOWN, and the PR body states the before/after count.

1. NEW FILE src/components/operator/TransferEntryDialog.tsx — a two-option choice dialog opened by the one
   "Transfer" button. Options (radio-card or two large buttons, 44px+ targets):
     · "Entire rig" — helper text, exact sentence: "Hands the whole deployment to them. Once they accept,
       they become the operator of record — daily checks, gear custody, and pay all move to them."
     · "Selected gear" — helper text: "Send specific vehicles or kit items. You keep the deployment."
   Props: open, onClose, onEntireRig, onSelectedGear. No fetches, no business logic — pure router.
2. src/app/(operator)/operator/my-deployment/page.tsx — the action row (:1336-1344): replace the TWO buttons
   "Transfer Equipment" + "Hand Off Deployment" with ONE outlined "Transfer" button (SwapHorizIcon) opening
   TransferEntryDialog; onEntireRig → today's handoff initiate flow exactly (setHandoffOpen(true) + the same
   resets); onSelectedGear → setTransferOpen(true). End Deployment untouched. The handoff initiate dialog
   (:1834-1866) is retitled "Transfer — Entire Rig", its body copy replaced by the item-1 exact sentence
   (keep the CC-32 note-preset work found on rebase), button label "Send Transfer Request". TransferDialog's
   title (components/shared/TransferDialog.tsx:162) → "Transfer — Selected Gear".
3. INCOMING side — cards keep their structure, copy unifies under one vocabulary:
   · my-deployment :1039 "Deployment Handoff from {name}" → "Incoming transfer — entire rig — from {name}";
     :1071 "Incoming Transfer from {name}" → "Incoming transfer — selected gear — from {name}".
   · Respond dialog titles (:1125/:1868 handoff, :1154 transfer): "Accept Transfer (Entire Rig)" /
     "Decline Transfer (Entire Rig)" / "(Selected Gear)" variants. The accept body line "You will become the
     primary operator for this deployment." stays — it is the honest consequence.
   · Today view: src/components/operator/today/WaitingOnMe.tsx:37 "Transfer from" → "Transfer (selected
     gear) from"; :44 "Handoff from" → "Transfer (entire rig) from".
4. ADMIN labels (strings only — does NOT trigger the D10 split): admin/deployments/page.tsx:725 "Outgoing
   Pending Transfers" → "Outgoing Transfers — selected gear"; the row Tooltip "Transfer" (:1510) →
   "Transfer selected gear". The admin "Reassign Primary Operator" dialog (:1225-1240) KEEPS its name — it
   is the admin force-path, not an operator transfer; add one helper line "(the admin version of an
   entire-rig transfer — takes effect without acceptance)".
5. Component tests (tests/components/TransferEntryDialog.test.tsx, npm run test:ui): renders both options
   with the exact entire-rig sentence; clicking each fires the right callback; plus one my-deployment-level
   test (or extend an existing one) proving Transfer → Entire rig opens the retitled handoff dialog and
   Transfer → Selected gear opens TransferDialog.
6. OPTIONAL PR-2b (propose, don't assume): if cheap while in the file, extract the handoff-initiate and the
   two respond dialogs from my-deployment/page.tsx into src/components/operator/ files (DeploymentCards.tsx
   pattern — behavior-identical, component tests). Separate PR, only if PR-2 lands clean; skip without guilt.
ACCEPTANCE: grep -rn "TransferEntryDialog" src hits the new file + one my-deployment import; grep -n
"Hand Off Deployment" src → nothing; grep -n "entire rig" -i src/components/operator/TransferEntryDialog.tsx
hits; wc -l my-deployment/page.tsx < 1914. MAX SMOKE (two phones, staging): tap Transfer → both choices
appear with plain-language descriptions; "Entire rig" → send → second phone sees "Incoming transfer — entire
rig", accepts, becomes the deployment holder; "Selected gear" → send one item → second phone sees "Incoming
transfer — selected gear", accepts, item moves, deployment stays with phone one. Nothing anywhere says
"Handoff" to an operator anymore.

════════ MERGE GATES ════════
Per PR: verify gate green + ACCEPTANCE greps in the PR body + Max's smoke on staging before the merge go.
PR-1 additionally requires the Antagonist seat's independent zero-importer confirmation, item group by item
group, recorded in the PR body. PR-2 additionally requires the friction line: taps to send an entire-rig
transfer must be ≤ the old Hand Off path + 1 (the choice step) — state the count.

════════ SESSION CLOSE (7-step per STATUS.md) ════════
STATUS §1: "CC-33 simplify & unify MERGED (PR-1 #…, PR-2 #…) — dead code out (~450 LOC + 3 deps),
forward→operator removed (D21), one Transfer entry (D22)". DECISIONS.md: D21/D22/D23 already exist —
mark EXECUTED with PR numbers, do NOT re-append. Update the CC-33 ledger row in
AHITS_CLAUDE_CODE_INSTRUCTIONS.md (and note batch6a landed — its pending-flags clear).
Handoff doc + commit/push + git ls-files sanity. Step-7 grep anchors: "TransferEntryDialog" ·
"Incoming transfer — entire rig" · ADMIN_ONLY_ACTIONS containing 'complete' · POST-only checkout/route.ts ·
no "x-date-pickers" in package.json · getDeploymentRosters still present · Shipment still in schema.prisma.
```
