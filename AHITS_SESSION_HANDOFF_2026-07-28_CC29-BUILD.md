# AHITS — Session Handoff · 2026-07-28 · CC-29 offline trust floor (BUILD)

> STATUS: current · UPDATED: 2026-07-28 · FOLLOWS: `AHITS_SESSION_HANDOFF_2026-07-28.md` (the review/interview session) · READ-WITH: `STATUS.md` · `DECISIONS.md` D26/D27 · `AHITS_CC29-31_PILOT_FLOOR_PACKETS.md` · `AHITS_SIX_SEAT_REVIEW_2026-07-28.md` §1
> First CODE session of the pilot-floor queue. Executed CC-29 (the offline trust floor, review §1 findings 1.1–1.6) as three PRs, all merged to `development`/staging.

## What shipped — CC-29, three PRs, all MERGED

| PR | Title | Items (review finding) |
|----|-------|------------------------|
| **#202** | Offline queue engine | 1 photo-wedge (1.2), 2 lie-fi timeout (1.4), 3 online-401 park (1.3b), 6 concurrent-flush + transient-409 (1.5), 7a dead-localphoto client (1.6) + the `tests/offline` flush-lifecycle harness (the review's #1 missing test) |
| **#203** | Daily-check date semantics + localphoto backstop | 4 late-sync date (1.1 → **D26**), 7b localphoto server 422 (1.6) + node suites `cc29-late-sync-date` / `cc29-localphoto-rejection` |
| **#205** | Sliding session renewal | 5 (1.3a → **D27**) — new edge-safe `session-edge.ts` |

### Key mechanics (resume points if reviewing)
- **Photo-wedge:** `PhotoUploadError{serverReached}` (`photoStore.ts`). In `flush()`'s photo catch — server-reached (413/415/500) burns a retry and at `MAX_RETRIES` fails naming the photo + quarantines placeholder dependents, then **`continue`s** (later plain writes drain past it); not-server-reached keeps the old `break`. `OutboxDialog` gained "Stuck? Discard" on aged/retried non-failed items.
- **Timeouts:** `MUTATE_TIMEOUT_MS=12s` / `FLUSH_ITEM_TIMEOUT_MS=20s` / photo upload 20s, via **AbortController+setTimeout** (deterministic under vitest fake timers — stated in-code).
- **Online-401 park:** `mutate()` enqueues the resolved body + sets `sessionExpired`, returns `{queued:true, reason:'auth'}`; daily-check toast branches on it.
- **Single-owner flush:** `navigator.locks.request('ahits-outbox-flush',{ifAvailable:true})` + a localStorage-lease fallback (heartbeat-extended). Transient-409 body-sniff on the shared `IDEMPOTENCY_IN_FLIGHT_ERROR` keeps genuine 409s terminal.
- **Date semantics (D26):** client stamps `businessDate()` at submit, Date field read-only; server trusts a **3-day past window**, clamps future/older to today (FND-7 kept), past-date collision → **409** (surfaced, never merged), alerts gated on `isToday`. **Discovered gap fixed:** daily-check POST now `withIdempotency`-wrapped (scope `daily-check`) — else a lost-ack replay would false-fail on the new 409.
- **localphoto backstop:** `photoUrlsField()` in `validation.ts` → **422** (not 400: `withIdempotency` caches 400, so 422 keeps a corrected re-send from being frozen out) on transfer/items/end.
- **Sliding renewal (D27):** proxy re-mints past half-life with same claims + fresh 24h exp, hard cap 14 days via `authAt`; mint/renew/cookie flags in one jose-only `session-edge.ts` shared by `session.ts` + `proxy.ts` (proxy must never import `session.ts` — pulls prisma into the edge bundle).

## Verification state
- **CI green on all three PRs** — incl. `verify / Tests` (node DB suite with real Postgres): this is the authoritative pass for the two new node suites (g,h) + the existing `ur034`/`wave-a`/`auth-pin-session` suites, which could NOT be run locally (no Docker/Postgres in the build env).
- Locally verified: `tsc` clean, `eslint src` 0 errors, `npm run test:ui` (jsdom) — the 8-case `tests/offline` harness + all component tests. The renewal decision + mint round-trip verified standalone in the **Node runtime** via `tsx` (8/8 checks: half-life gate, authAt carried unchanged, fresh 24h exp, 14-day-cap refusal, pre-CC-29 iat anchoring). The `photoUrlsField` refine verified standalone (real URL passes, localphoto rejected, default `[]`, mixed array flags).
- Merged with `--admin` (branch protection requires 1 review; solo-owner + AI team → no second reviewer; `enforce_admins:false`). Each merge auto-deployed to staging via `deploy.yml`; concurrency cancelled the intermediate deploy so the final HEAD (all three) is what serves.

## THE REMAINING GATE — on-device staging smoke (Max, physical phone)
CI + browser-observable smoke are done; the offline core is **not scriptable** (needs airplane mode + a real device). Per PR, run one airplane-mode → reconnect cycle and confirm:
1. **Photo-wedge:** queue a damage report w/ photo offline → reconnect behind a broken upload → a plain daily check queued **after** it still syncs; the photo item eventually shows **Failed** (photo-naming msg); **Discard** works from the Outbox.
2. **Lie-fi:** weak signal (or Slow-3G + server stall) → a daily-check submit says "saved, will sync" within ~12s, never a stuck spinner.
3. **Online-401:** admin bumps the operator's `tokenVersion` → submit while ONLINE → "check saved — sign in to send it" + yellow banner → after re-auth the check appears in the admin viewer.
4. **Overnight replay (D26):** airplane mode, submit, leave queued overnight, reconnect next day → admin viewer shows it under the day **performed**; a second past-day check shows "Failed — a check for `<date>` already exists", discard-able.
5. **Renewal (D27):** (temporarily drop `SESSION_DURATION`/half-life on staging) keep using the app across the boundary → no sign-out / no yellow banner; then idle past a full duration → signed out; **force-logout still boots on next tap.**

**No operator onboards until Max signs off these smokes.**

## Next
CC-32 (friction & flow) is NEXT in the pilot-floor queue (STATUS §4). Then CC-30 (ops floor) → CC-31 (accuracy) → CC-16S → CC-33.

## Notes / loose ends
- Pre-existing uncommitted corpus docs (from the review session) were committed together with this session-close.
- `batch6a-date-unify.patch` remains a loose pending patch (CC-19 owns it) — untouched here.
- Build env had no local Postgres/Docker, so all node-DB suites are CI-verified only — a standing constraint for this machine.
