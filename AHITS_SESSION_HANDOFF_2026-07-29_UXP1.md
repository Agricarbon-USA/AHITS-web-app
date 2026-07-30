# AHITS — Session Handoff · 2026-07-29 · UXP-1 (Nav Trust)

> STATUS: handoff snapshot · WROTE: 2026-07-29 (close spilled into 07-30) · READ-WITH: `AHITS_UX_PACKETS_2026-07-29.md` (UXP-1 spec), `AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md` §1 (evidence), `STATUS.md` §3
> Owner-of-shared-docs: this session (no other session was live in the tree). STATUS §1/§3/§4 updated by this session.

## What this session did
Executed **UXP-1 (Nav Trust)** items **1a·1b·1g (PR-1)** and **1c·1d·1f (PR-2)** per `AHITS_UX_PACKETS_2026-07-29.md`. **1e (back-button history guard) was dropped** — the designated-droppable item; it is deferred to its own next session (see below). Both PRs are **open + green on `development`, awaiting Max's evening staging smoke and merge** (D16 discipline). **UI layer only — no schema, no `sw.ts` change, no new deps** across both PRs.

## PR-1 — #232 `feature/20260729/Agricarbon-USA-uxp1-nav-trust-pr1` (tip `1d7b4d2`) · CI GREEN
The small, pure wins.
- **1a — five-tab bottom bar (records D30, supersedes D28).** `OperatorBottomNav.tsx`: removed the Map tab (route stays live; `OperatorNav.tsx` already had the "Crew Map" drawer entry — CC-32 did not remove it, so no restore needed). Added the `minWidth:0 / px:0.5` override — required even at five tabs (5×80px MUI floor = 400px > 390px). Test snapshots the ordered label set + count so a 6th tab **fails loudly** citing D30.
- **1b — quiet + auto-apply update prompt (records D31).** `ServiceWorkerUpdater.tsx` ONLY (`sw.ts` untouched). `hadController` guard kills the first-install toast; snackbar lifted above the tab bar (exact `useToast.tsx` offset); dismissible (X + `onClose`) + `autoHide≈8000` + re-offer on next `visibilitychange` while an update is still pending (keyed on an in-memory flag, NOT `reg.waiting` — that's null after clientsClaim); action color `inherit` (fixes the 2.43:1 amber contrast).
- **1g — phantom-sync guards (E1).** `useOfflineQueue.ts` `flush()` returns before `setSyncing(true)` when no non-failed items (read-only DB probe; falls through on read error). `OfflineBanner.tsx` queue banner requires `pending>0 || isOffline` (never `syncing` alone). Kills the "Syncing 0 action(s)…" + header-spinner + layout-shift flash on the 30s tick / app-return. (The flush guard kills the header spinner — `AppShell.tsx:81` consumes `syncing`; the banner guard kills the banner.)

## PR-2 — #233 `feature/20260729/Agricarbon-USA-uxp1-nav-trust-pr2` (tip `fc5b0f2`) · CI GREEN (verify Tests + Lint/type-check/build + migration-safety + DROP guard all pass)
The shell work. Branched independently off `development` (files disjoint from PR-1).
- **1c — phone = phone (records D32).** `AppShell.tsx` gains `shellMode`; operator layout passes `"device"` → coarse pointer OR `down('lg')` (admin keeps `down('md')`, default). `manifest.json` → `portrait-primary`. One heuristic — 0 `useMediaQuery` in operator components, so no typography breakpoint to unify.
- **1d — mobile-first cold load + branded exits.** Pre-mount default flips to the mobile composition (SSR + first client render both mobile → hydration matches, #418 note kept; desktop upgrades post-mount). New `error.tsx`, `not-found.tsx` (shared `BoundaryScreen`, inside `<Providers>`), self-contained `global-error.tsx` (own html/body, inline token styles), minimal `loading.tsx` ×2. Reload + Home/Dashboard escapes. `next build --webpack` compiles (`/_not-found` in manifest).
- **1f — DetailDrawer below the AppBar + built-in 44px close X.** Paper `top`-offset + reduced height so the header is never hidden; built-in close X resolves to itself. Removed the two page-local X's that hit-tested to the bell (**vehicles**, **maintenance**) AND a third found during review (**projects** — it also had one, would have doubled). All five DetailDrawer adopters (vehicles/maintenance/projects/inventory/deployments) inherit the close.
  - **Acceptance-line correction:** §1.6 names a "users" drawer, but `admin/users` has **no drawer** — it's `Dialog`-based (z=1300, already above the bar). The real 5th adopter is `admin/projects`. Flagged, not invented.

## Decisions — DO NOT let anyone but Max write these to DECISIONS.md
D30 (five-tab nav, supersedes D28), D31 (quiet update prompt), D32 (device-class operator shell) are **cited in code comments + the PR bodies only**. Max pastes the `DECISIONS.md` entries himself after his smoke (his explicit instruction). D28 is superseded by D30 once Max writes it.

## Deferred — 1e (back-button history guard) · still a P1
`useHistoryGuard` (hardware/browser Back closes open dialogs/drawers and steps the daily-check wizard back) was **not built** — the designated drop. It remains **P1 (review finding 1.5)**: Android operators' reflexive back-swipe on daily-check step 3 throws away the whole check. Owner: its own next session (scope: daily-check wizard + DetailDrawer + transfer/handoff respond dialogs + RequestComposer — no global router patching). Do NOT fold it into "UXP-1 done." It was dropped because its risk concentrates in `popstate` handling of the daily-check wizard, which jsdom can't verify well — rushing it at session tail is the D11 anti-pattern.

## Smoke-owed (Max, staging evening — jsdom/no-local-DB could not cover these)
- **1a:** five tabs fully visible at 320/375/390/430 portrait on one iOS + one Android (measure `getBoundingClientRect`); "My Deployment" may wrap to 2 lines at 320 (acceptable).
- **1b:** fresh profile first visit shows NO toast; a deploy-triggered update shows a dismissible toast above the bar, and all five tabs stay tappable while it's up.
- **1c:** 932×430 + 926×428 render the bottom-nav shell with NO permanent drawer; 1280×800 admin unchanged; rotate mid-use → shell must NOT swap.
- **1d:** JS-blocked load at 390×844 shows bottom nav + hamburger in rendered HTML; **no hydration-mismatch warning in the dev console** after the pre-mount flip; `/operator/nonexistent` → branded 404 → Home escape works; thrown leaf render error → branded error page, recovers on Reload.
- **1f:** open all five admin drawers at 390×844 — header visible, X visible, `elementFromPoint` on X returns the X (not the bell); on a **long** drawer confirm the X is still reachable (absolute X scrolls with content on paper-scroll drawers — same as the old page-local X, not a regression; `position: sticky` is the fix if wanted).
- **1g:** 90s idle on Today with an empty outbox → zero banner flashes / spinner blinks / layout shifts; a real queued item still shows the full sync theater.

## Next actions
1. **Max:** evening staging smoke of both PRs (rows above) → merge #232 then #233 on `development` (order-independent; files disjoint) → paste D30/D31/D32 into `DECISIONS.md`, mark D28 superseded-by D30.
2. **Next UXP-1 session:** build **1e** (the sole remaining UXP-1 item, P1).
3. Then **UXP-2 (Sunlight & Touch)** per the packet order (Max ruled UXP-1 → UXP-2 → UXP-3).

## Rollback
Every item is UI-layer; a bad deploy rolls traffic back per `PILOT_ROLLBACK.md` with zero data implications.
