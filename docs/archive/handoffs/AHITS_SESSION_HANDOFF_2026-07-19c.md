> ⤴ **ARCHIVED (superseded) — moved 2026-07-22.** Historical record; current state lives in `STATUS.md` + the newest handoff. Kept for provenance only — do not act on it.

# AHITS — Session Handoff · 2026-07-19c (session 12)

> STATUS: canonical · UPDATED: 2026-07-19 · READ-WITH: `STATUS.md`, `DECISIONS.md`

## What shipped — CC-26: the read-only daily-check viewer (the pencil-whipping falsifier)

Pulled forward from **CC-20 #1**, a pilot-fortnight gate: today no admin surface reads a submitted check's full contents, so a diligent check and a pencil-whipped one are indistinguishable. One PR (**#195**), **no migration** (alert `metadata` is already `Json?`), live on staging.

**PRE-FLIGHT.** The vehicle drawer already lists recent checks (date/operator) — **extended** that list into clickable deep-links rather than building a duplicate.

**The viewer.** `GET /api/daily-check/[id]` (admin any / operator own) + `DailyCheckViewer` (Dialog) / `DailyCheckDetails` (presentational): checklist answers with **failures highlighted**, odometer, site, issues, time-to-complete, photos via `PhotoGallery`, and a clearly-marked **GPS slot** — check-level **absent-safe** (CC-15 adds the columns later; the viewer renders them when present), per-photo `gpsLat/lng` surfaced today. Nothing writable.

**The one write.** `checkId` added to `DAILY_CHECK_FAILED` alert metadata, and `createAlert`'s dedup `update: {}` → `update: { metadata }` so a **re-raise points the link at the latest check**. Metadata-only → `notifiedAt`/`triggeredAt` untouched → **no re-notify**. Verified safe across all alert types (grepped the suite; every caller passes current-state metadata, none freeze first-occurrence data).

**Deep-links** — the single `alertLink` chokepoint (dashboard "View" + bell + email): **FAILED → `/admin/vehicles?check=<id>`** (graceful fallback for stale/pre-CC-26 ids), **MISSED → `/admin/deployments?operator=<id>`** (opens that operator's rig drawer — a MISSED alert has no vehicle record). Every other `alertLink` branch **byte-identical** — CC-20 #6 stays PARKED.

**Reachability** — vehicle drawer check rows now clickable (+ pass/fail chip); deployment drawer per-vehicle "View checks" → the vehicle's history → viewer.

## Notable this session

- **The deployment-drawer "reach" is transitive by design (D12).** The packet says the deployment drawer reaches the viewer; my path is deployment drawer → per-vehicle "View checks" → the vehicle drawer's history list → a check → the viewer. Chosen deliberately to honor the pre-flight's no-duplicate-list rule — the history list lives only in the vehicle drawer. Recorded as **D12** so a future session doesn't "fix" it into a direct open. Flagged in the PR body for Max's acceptance.
- **MISSED landing chosen by Max (D12).** A MISSED alert is per-operator with no vehicle, so "the vehicle's check history" can't target one vehicle. Max picked: land on the operator's deployment drawer (`?operator=`), from which each vehicle's history is one click.
- **Applied the CC-14 #194 lesson.** Before pushing, read `ur034-daily-check-failed-alert.test.ts` and grepped the whole DB suite for alert-metadata/dedup assertions (ur034 mocks `createAlert` with `expect.anything()`; cc10 tests a single-raise `DAMAGE_REPORTED`) — confirmed no existing DB test breaks. Added `cc26-alert-metadata-refresh.test.ts` (DB) to lock the one acceptance the component test can't cover ("a re-raised alert points at the latest check"), and **waited for CI green before merging** rather than admin-merging blind.

## Decisions

- **D12 (ACTIVE)** — CC-26 alert deep-link targets (FAILED → `?check=`, MISSED → `?operator=`) + the deliberately-transitive deployment-drawer reach + the metadata-refresh/no-re-notify dedup change. Scope guard held: only the two check alerts carry a record id; CC-20 #6 stays PARKED.
- Parked registry updated: **CC-20 #1 = SHIPPED (CC-26)**; #2–#6 still PARKED.

## Resume points

1. **Pre-pilot code gates are DONE** — CC-26 was the last must-land-before-pilot packet. Next: **pilot fortnight** (CC-27 filler) → CC-15/16/17/18.
2. **Remaining pilot-start blockers are human, not code:** Max to **initial D5**, **sign the charter**, and run the **A6 device pass**. Plus the standing device-pass/eyeball backlog in STATUS §3 (now including a ~2-min CC-26 authenticated click-through of the alert deep-links).
3. **CC-15** later adds check-level GPS columns — the CC-26 viewer's GPS slot is already absent-safe and will render them with no further change.
4. **D6/D7** (EMAIL_SANDBOX flip, second pilot-hours contact) still PENDING before the fortnight.
