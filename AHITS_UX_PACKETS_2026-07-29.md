# AHITS — UX Packets (UXP-1…5) · build specs from the 2026-07-29 six-seat UX review

> STATUS: current (build queue) · UPDATED: 2026-07-29
> READ-WITH: `AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md` (evidence + finding IDs cited below) · `DECISIONS.md` · `CLAUDE.md` (deploy flow)
> ORDER (Max ruled 2026-07-29): **UXP-1 → UXP-2 → UXP-3**, then UXP-4/UXP-5 paced/demand-pull. One packet per session, PR-per-item-cluster, evening merges only (D16 discipline). Every packet: strings/UI only unless an item says otherwise; NO schema changes anywhere in this queue; each PR carries its component tests (`npm run test:ui`) and the smoke rows listed.
> House rules for the build sessions: read the finding's evidence in the review doc before coding; re-verify the cited file:line against HEAD (the tree moves fast); explicit-path staging, never `git add -A`; if an item's fix collides with a Dn, stop and flag — do not improvise around a decision.

---

## UXP-1 · NAV TRUST (ships first — kills the "app glitches" perception)

Goal: an operator can never lose navigation — not from tab overflow, not from an update prompt, not from rotation, not from a cold load, not from a crash, not from the back button. Findings: A1/B-1/C1/D-01, A2/B-2/C3/E2/F-01/D-03, A3/C4, A4 + critic-G2, A5, C2, E1.

**1a · Five-tab bottom bar (records D30, supersedes D28).** `src/components/operator/OperatorBottomNav.tsx`
- Remove the Map ITEM (route stays live; `/operator/map` remains reachable from the drawer — restore its drawer entry in `OperatorNav.tsx` if CC-32 removed it).
- Add the width fix REGARDLESS of count (5 × MUI's 80px floor = 400px > 390px): on the `BottomNavigation`, `sx={{ '& .MuiBottomNavigationAction-root': { minWidth: 0, px: 0.5 } }}`.
- Acceptance: at 320/375/390/430 portrait, all five tabs fully visible, no negative-x tab rect, each hit target ≥ 44px tall and ≥ 56px wide (measure via getBoundingClientRect in the component test's jsdom where feasible + the smoke row). "My Deployment" may wrap to 2 lines at 320 — acceptable; do NOT rename it without a Max-approved word (D11 protocol).
- Test: RTL render at narrow container widths asserting 5 actions and the override class; snapshot the ITEMS array so a future 6th tab fails loudly with a pointer to D30.

**1b · Update UX goes quiet + auto-apply (records D31).** `src/components/shared/ServiceWorkerUpdater.tsx` (single file)
- Guard first install: capture `const hadController = !!navigator.serviceWorker.controller` at effect start; only `setShow(true)` on `controllerchange` if `hadController` was true.
- Lift + humanize the Snackbar: bottom offset exactly like `useToast.tsx:47` (`calc(80px + env(safe-area-inset-bottom,0px))` at xs); add `onClose` + an X action (keep Reload primary); `autoHideDuration` ≈ 8000 with re-offer on next `visibilitychange`-visible if an update is still waiting; action color `inherit` (white on #303030 = 13.1:1) fixing D-03.
- Do NOT touch `sw.ts` (`skipWaiting`/`clientsClaim` stay — auto-apply on next launch is the existing behavior; D31 is UI-layer only). Ops note (review §7): evening-deploy rule remains the guardrail against mid-shift chunk swaps.
- Acceptance: fresh profile first visit shows NO toast; simulated `controllerchange` with prior controller shows a dismissible, auto-hiding toast that never overlaps the tab bar at 320–430px; taps on all five tabs land while it is visible.
- Test: RTL — no-controller mount fires nothing; mock controllerchange fires the toast; dismiss works.

**1c · Phone = phone, always (records D32).** `src/components/ui/AppShell.tsx`, `src/app/(operator)/layout.tsx`, `public/manifest.json`
- Operator shell: replace instantaneous-width mobile detection with a device-class heuristic — `useMediaQuery('(pointer: coarse)')` OR width `down('lg')`, whichever the session finds cleaner, exposed as an AppShell prop (`mobileBreakpoint`/`forceMobile`) so the **admin shell keeps `down('md')` unchanged**.
- `manifest.json`: `"orientation": "portrait-primary"` (installed PWA; browser tabs unaffected — that's what the heuristic covers).
- Acceptance: 932×430 and 926×428 (Pro Max/Plus landscape) render bottom-nav shell with NO permanent drawer; 1280×800 admin unchanged; iPad 768×1024 still gets the desktop shell for admin, and for operator follow the heuristic chosen (document which in the PR body).
- Coordination (C-seat rider): ONE heuristic governs shell + any typography that keys off "mobile" — do not ship two different breakpoints.

**1d · Cold load renders the mobile shell; failures get branded exits.** `AppShell.tsx` + new `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, minimal `loading.tsx` for the two route groups
- Invert the pre-mount default: when `!mounted`, render the MOBILE composition (bottom nav present, temporary-drawer variant, no permanent drawer). Desktop upgrades after mount. Phones stop flashing/fossilizing desktop (A4); desktops get one harmless mobile-shaped frame. Keep the hydration-mismatch note (#418 comment) intact — verify no mismatch warning in dev console after the flip.
- Boundaries: branded, tokens-sourced, offline-tolerant pages with two escapes each — "Reload" and "Go to Home" (operator) / "Dashboard" (admin); `not-found.tsx` must render INSIDE the shell where possible. No Sentry coupling beyond what `SentryProvider` already does.
- Acceptance: JS-blocked load at 390×844 shows bottom nav + hamburger (rendered HTML, even if inert); `/operator/nonexistent` shows the branded 404 with working escapes; a thrown render error in a leaf page shows the branded error page, and the app recovers on Reload.

**1e · Back button stops destroying work.** New `src/hooks/useHistoryGuard.ts`; adopt in `daily-check/page.tsx` (wizard steps), `DetailDrawer.tsx`, the transfer/handoff respond dialogs, `RequestComposer`
- Push a history entry on dialog/drawer open and wizard step-advance; on `popstate`, close the overlay / step back instead of navigating. Scope tightly: the FIVE surfaces named; no global router patching.
- Acceptance: daily-check step 2 + hardware Back → step 1 with answers intact; Back again → step 0; Back with transfer dialog open → dialog closes, page stays; drawer open + Back → drawer closes.
- Test: jsdom popstate simulations for the hook; one integration test on the wizard.

**1f · Admin drawers above the AppBar, with a real close.** `src/components/ui/DetailDrawer.tsx` (all five adopters inherit)
- Paper below the bar (`top:{xs:56,sm:64}`, height `calc(100% - top)`) or z-index above it — pick one, verify the OTHER drawers/dialogs stack sanely; add a built-in 44px close X to DetailDrawer's header row so all five adopters get it for free (kill the two page-local X's that hit-test to the bell — `admin/vehicles/page.tsx:478` and the maintenance twin).
- Acceptance: at 390×844 open deployments/inventory/vehicles/maintenance/users drawers — header fully visible, X visible, `elementFromPoint` on X returns the X.

**1g · Silence the phantom sync (E1 rider — 2 guards, no queue semantics).** `useOfflineQueue.ts` `flush()` returns before `setSyncing(true)` when no non-failed items; `OfflineBanner.tsx` queue banner requires `pending > 0 || isOffline` (never `syncing` alone).
- Acceptance: 90s idle on Today with empty outbox → zero banner flashes, zero header-spinner blinks, zero layout shifts (re-run the E1 instrumentation script pattern); a real queued item still shows the full sync theater.

Smoke (staging, evening, ~10 min): five tabs fully visible on one iOS + one Android phone (portrait + rotate — shell must NOT swap on rotate); deploy-triggered update toast is dismissible and sits above the bar; airplane-mode cold open still renders nav; type a URL typo inside the PWA → branded 404 → Home escape works; daily-check step 2 → hardware Back → answers intact; open/close all five admin drawers on a phone. Rollback: every item is UI-layer; a bad deploy rolls traffic back per `PILOT_ROLLBACK.md` with zero data implications.

---

## UXP-2 · SUNLIGHT & TOUCH (pure presentation; lowest regression class)

Findings: D-02, D-04, D-05, D-06, D-07, D-08, D-10, D-11, D-12, C6, C8, C13, D-13 + C5-interim, B-5, C14.

- **2a · Tokenize info.** `tokens.ts` gains `color.info` (#01579b or #0277bd-dark — must be ≥4.5:1 under white text; add it to the tokens test if one exists); `providers.tsx` sets `palette.info`. Recolors all 8 offline trust toasts + Review CTA at once. Spot-check filled chips after.
- **2b · Daily-check selected states + focus.** Yes → `color="success"` (mirror No's red treatment) + optional ✓ glyph in the selected segment; theme-level `Mui-focusVisible` outline (2px primary, offset 2) for ToggleButton/ButtonBase.
- **2c · Operator map legend + shape redundancy.** Render the admin chip legend row above the operator map (`CrewMapView.tsx`); differentiate recency by more than hue in `DeploymentMap.tsx` markers (fresh=solid / aging=ring / stale=hollow-slash, ≥24px markers). D2 untouched (no live tracking).
- **2d · Type floor & labels.** Failure-note placeholder → real label "What's wrong?" + persistent helperText (D-06); promote meaning-bearing 12px captions to 13–14px ("In repair —" caption, unit serials, Data-as-of; bell timestamps text.disabled → text.secondary) (D-07); PhotoGallery hand-rolled chip → StatusChip badge mode (D-10); portal: restore the two lost `${color.border}` interpolations (`s/[token]/page.tsx:267,315`) and bump portal inputs to 16px (kills iOS focus-zoom) (B-5/C14) — the portal's full re-palette stays parked with CC-23 item 1.
- **2e · Glyph honesty.** Log-usage vs Return get different icons (± counter vs return-arrow), colors stay as reinforcement (D-08); "Report a problem" row icon becomes icon+label compact button or a labeled overflow entry (F-07 — pulled forward from UXP-3 because it's the same row-surgery).
- **2f · Remaining 44px pass.** daily-check Back/Next, requests Cancel + Active/Closed toggles, composer add/remove/qty controls, preset chips get 44px hit areas via padding (C6) — exact CC-32 sx precedent.
- **2g · Input modes.** Odometer `inputMode:'numeric', pattern:'[0-9]*'` (C8).
- **2h · Small-screen seams.** Daily-check stepper `alternativeLabel` (or icon-only) at xs — kills the 3px page jiggle at 320 (C13); admin table headers 12–13px + a right-edge fade/chevron scroll affordance on the three clipped tables (C5 interim; full card conversion stays D10).
- **2i · Names for machines.** aria-labels on the 7 naked IconButtons incl. both hamburgers (D-11).
- Acceptance bundle: a contrast script re-run (Sunlight seat's method) shows zero <4.5:1 text pairs on operator surfaces; every operator-flow control ≥44px hit area; screenshots at 320/390 attached to the PR.

Smoke: morning-light phone check of daily-check (selected states readable in sun), map legend visible, admin tables show the scroll cue. Riders droppable individually; 2a/2b are NOT droppable (they anchor the packet).

---

## UXP-3 · FLOW CLOSERS (the loops that feed the ledgers; two server-touching items)

Findings: F-02, critic-G1, F-04, F-10 + builder, F-05, F-06, F-08, F-09, F-11, A9, builder items, F-03 strings rider, critic photo items as PRE-FLIGHT.

**PRE-FLIGHT (Max, before the session):** photo policy — (a) may operators attach an existing photo (drop `capture="environment"` so the OS offers camera OR library)? (b) should unit report-problem accept submit-with-photo-pending when no camera is available (server currently hard-requires)? Answer both in the packet kickoff; item 3g implements accordingly.

- **3a · GPS can never hold a check hostage (NOT droppable).** `daily-check/page.tsx` handleSubmit: `Promise.race` the awaited coords with a hard 8–12s ceiling resolving `{}` — or enqueue-first + attach coords opportunistically. Granted/denied paths byte-identical. Test: permission-limbo simulation → submit enqueues within the ceiling; DB row exists after navigate-away.
- **3b · Lockout tells the truth (server-touching: strings + one boolean).** `lib/auth/pin.ts` distinguishes locked (already tracked — `pinLockedAt`) from wrong; `login/route.ts` returns a locked flag; login card renders "Too many attempts — locked until HH:MM. Contact <ops lead> if urgent." Threat-model note for the PR: this reveals lock state to a guesser; on a PIN-lengthened internal tool the operator-trust win outweighs it — flag for sign-off in the PR body. Keep 429 rate-limit copy separate. (Parking-lot sibling — IP-keyed limiter — is NOT this packet; correctness queue.)
- **3c · Fulfill notifies (server-touching: one notification.create).** Mirror the `complete` arm's notification in the MATERIAL `fulfill` success path ("Your material request was handled", link `/operator/requests`) — `deployment-requests/[id]/route.ts:93-106` / `lib/deployment-requests.ts:770-778`; upgrade the admin toast from "Done." to name the outcome ("Marked handled — {operator} notified"). Rider (strings-only, D9-blessed): the MATERIAL+REQUESTED button label "Fulfill" → "Mark Handled" (F-03) — it moves no stock; "Fulfill" stays reserved for the stock-moving reservation flow.
- **3d · Deployments get projects.** Optional Project select in admin stepper step 0 (projects already fetched on the page; kill the dead `useState('')` at `deployments/page.tsx:169`) AND in the operator Start-Deployment dialog; PATCH passthrough already exists. Plus the builder's review step: the final stepper step shows a compact summary (operator · vehicles · kit counts) above the note presets. Plus B-14: stepper `alternativeLabel` at xs so "Start" stops clipping.
- **3e · Post-action truth.** F-06: fire a recount after transfer accept/decline (CustomEvent or shared SWR key into `useIncomingPendingCount`) and broadcast flush completion so badges clear in ≤2s; F-05: on validation reject, scroll to the first failing item and set field-level error; F-08: "Done" chip → tappable read-only summary of today's check (reuse the CC-26 viewer components) with a "Redo check (replaces today's)" deep-link — M effort, droppable to its own follow-up if the session runs long.
- **3f · Composer meets the common case.** Default mode = MATERIAL when the operator has an ACTIVE rig (else RESERVATION); remember last-used mode (F-09 — the line-type merge idea stays parked).
- **3g · Photos meet reality (per PRE-FLIGHT answers).** Drop/keep `capture="environment"`; surface the max-5 limit instead of silently dropping (critic G-5).
- **3h · Drafts survive.** Daily-check drafts to sessionStorage keyed vehicle+businessDate (answers/odometer/site/step), restored on mount with a one-line "Restored your in-progress check" notice (F-11). This also softens the critic's interrupted-auth finding (G-3) — a post-401 re-login lands back on a restorable draft. 401-mid-form UX itself (return-to-where-I-was) stays parked unless trivial.
- **3i · Banner diet.** Offline-storage banner: persist dismissal per device (localStorage, long TTL) + collapse to one line (A9/builder).
- **3j · Wrong-vehicle autopilot guard (builder).** Daily-check preselect = most-recently-checked-today-absent vehicle (or the only unchecked one) instead of first-in-list; if all checked, no preselect.

Smoke: file a check in permission-limbo (enqueues, never hangs); lock a PIN then read the card; admin Fulfill → operator bell rings; create a deployment WITH a project through the stepper review step; accept a transfer → badge clears ≤2s; kill the app mid-check → reopen → draft restored.

---

## UXP-4 · ONE DESIGN SYSTEM (paced; strings + wrappers; ride-along per session)

Findings: B-3 census (the 12 deviants list lives in the review §4.1), B-4, B-6/A8 + F-13, B-7, B-8, B-9, B-10, B-11, B-12, B-15, C7, C9, C10/B-13 (D10-gated), C12, A7, C11, critic-G7.
Shape: (i) `DialogShell` wrapper codifying the majority pattern (title, actions padding, busy-guarded backdrop, optional X) + `MuiDialog`/`MuiDialogActions`/`MuiToggleButton`/`MuiTab` theme defaults (kills ALL-CAPS drift); migrate deviants packet-by-packet, `window.confirm` in OutboxDialog dies first (B-11). (ii) Nav vocabulary sweep — **needs the Max word list (D11 protocol)**; proposal on the table: Home · Daily Check · My Deployment · Requests · Scan · Map(drawer) with "Check Out · In" reserved for the Scan card/dialog verbs; plus casing rule (sentence case), verb-mismatch confirms (title verb == button verb), Fulfill/Handled done in 3c. (iii) Substrate adoption: EmptyState on the two hand-rolled sites; StatusChip stragglers; admin banner slot; `PaperProps component=form` fix in the five admin dialogs (C7); fullScreen safe-areas (C9); `usePageTitle` hook (A7); admin 44px pass (C11); toolbar-clearance mixin (C12); settings subtitle copy (G7). My-Deployment freshness indicator waits for the D10 split packet (B-13/C10) — do not refactor that monolith for a timestamp.

## UXP-5 · WATTMETER (paced; independent, each item its own PR)

Findings: E3 (Serwist exclude for the mapbox chunk — also shortens UXP-1d's hydration window; ship early if trivial), E4 (Sentry lazy-init when DSN present), E5 (merge the two 45s pollers into one badges aggregate — small API addition), E6 (defer My-Deployment's four dialog-feeding fetches to first tap), E7 (hoist useOfflineQueue to one provider — sequence AFTER the D10 my-deployment split per parking-lot note), E8 (dynamic-import qrcode), E9 (field-reads SW timeout 5s→3s). Acceptance: re-run the Wattmeter measurement script set; precache <2.5MB; idle-phone request rate halved; no behavior change in the offline harness (`tests/offline` must stay green — it is the pilot's safety net).

---

### A6-UX device rider (10 min, one iOS + one Android, after UXP-1 lands)
Rows: (1) keyboard up on daily-check — nav behavior intentional, field visible; (2) Safari TAB mode — bottom bar vs Safari toolbar; (3) fresh install — no update toast on first open; (4) rotate mid-check on a Pro Max — shell stable; (5) branded 404 inside installed PWA — escapes work; (6) portal link on iOS — no focus-zoom (after UXP-2d). Record results in the checklist file per house ritual.

### Effort map (single-session sizing)
UXP-1: one full session (1a–1g; 1e is the only M among S's — droppable to a rider if the session runs long, but 1a/1b/1d are NOT droppable). UXP-2: one session, all S. UXP-3: one session with the two server-touching items first (3a–3c NOT droppable; 3e's F-08 and 3g droppable). UXP-4/5: ride-alongs and fillers, 1–3 items per session, never a standalone sweep (their own house rule).
