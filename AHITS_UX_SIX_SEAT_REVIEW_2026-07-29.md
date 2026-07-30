# AHITS — Six-Seat UX/UI & Performance Review · 2026-07-29

> STATUS: current (UX audit) · UPDATED: 2026-07-29
> READ-WITH: `AHITS_UX_PACKETS_2026-07-29.md` (the build specs) · `DECISIONS.md` (D30–D32 proposed below) · `STATUS.md`
> Produced by a six-seat UX review — **Wayfinder** (navigation/IA), **Consistency** (visual language), **Thumb** (mobile ergonomics), **Sunlight** (outdoor legibility/a11y), **Wattmeter** (performance/battery), **Stopwatch** (friction budget) — plus a state-builder that walked the admin UI, three adversarial verifiers, and a completeness critic. 11 agents · 74 findings + 7 gap-check findings + 9 builder observations · every P0/P1 adversarially re-derived: **22 CONFIRMED, 4 ADJUSTED, 0 REFUTED** · ~194 rendered captures of the **production build** (real DB, seeded fleet state) at 320/375/390/430/768/1280px, both orientations, keyboard-up. Method & fidelity limits in §9 — read it before treating any PLAUSIBLE item as fact.
> **Dispositions land in `AHITS_UX_PACKETS_2026-07-29.md`, not here.** Owner interview (two rounds) already ran — outcomes in §8.

---

## 0 · The headline

**The "disappearing navigation bar" is not one bug and not a ghost — it is four stacked, confirmed mechanisms**, each sufficient on its own to read as "the nav vanished," and every pilot phone hits at least two of them daily:

1. **The six-tab bar has never fit any phone.** MUI enforces an 80px minimum per labeled tab; six tabs = 480px on viewports of 320–430px. Home and Map render as 0–55px slivers — at 320px they are simply not on screen. D28's 65px-per-tab premise was arithmetically false as implemented. (§1.1)
2. **The update snackbar parks on top of the bar, forever.** No dismiss, no auto-hide, no bottom offset (the toast host has one — this surface bypasses it), fails AA contrast on its only action, **and fires on a device's first-ever visit** (`skipWaiting`+`clientsClaim` + an unguarded `controllerchange` listener). It also eats taps: a thumb aimed at Submit or a nav tab hits Reload and wipes in-progress work. Verified real app behavior, not a sandbox artifact. (§1.2)
3. **Every cold load renders the desktop shell on phones** until hydration completes — and with zero `error.tsx`/`global-error.tsx`/`loading.tsx`/`not-found.tsx` in the entire app and 5.3MB of client JS, a rural-signal chunk failure or hydration error fossilizes a nav-less desktop layout with no escape. (§1.3)
4. **Rotating a Pro-Max-class iPhone crosses the 900px breakpoint** and silently swaps the operator into the desktop shell — tabs gone, permanent drawer in. (§1.4)

Beyond the marquee bug: the **substrate is genuinely good** — the tokens/theme system, unified toasts, single-sourced status vocabulary, and the CC-23/24/32 passes all held up under adversarial audit (§6) — but **drift around that substrate creates the "clunky" feel**: ~12 dialog surfaces deviating from the app's own canonical pattern, an info-blue that was never tokenized failing AA on all eight offline trust toasts, a selected-state on the daily check that is an 8% gray wash, admin tables showing 42–47% of their columns on phones with no scroll cue, and a request loop that never tells the operator their materials were handled.

**Friction-budget verdict (Stopwatch, tap-counted):** daily check **BEATS** texting (5 taps + 5 keys, ~35s), transfer accept **BEATS** (3 taps, does what a text can't), scan-checkout **BEATS**; the **materials-request leg LOSES** today — not on entry (composer is fine) but on the reply loop: direct-Fulfill sends the operator nothing, and a text always gets a reply. Fix the loop, not the form. (§3)

Nothing here says stop the pilot. The P0/P1 set is dominated by S-effort, low-regression-risk changes — the entire Nav Trust packet is shippable in one evening session.

---

## 1 · TIER 1 — The navigation-trust cluster (Wayfinder + Thumb + all seats concurring)

**1.1 · Six-tab bottom nav overflows every phone width. CONFIRMED ×4 seats (A1/B-1/C1/D-01) · P0 · DECISION COLLISION D28.**
`src/components/operator/OperatorBottomNav.tsx:52-68` renders six `BottomNavigationAction`s with no `minWidth` override; MUI hardcodes `min-width:80px` (`BottomNavigationAction.js:43`), so the bar's content is 480px regardless of viewport, centered, clipping both edges equally. Measured live via `getBoundingClientRect`: **320px → Home and Map 0px visible; 375px → 28px; 390px → 35px; 430px → 55px.** At 390px Home's label renders as "ne". The D28 comment's premise ("6 tabs ≈ 65px each at 390px… within MUI BottomNavigation's showLabels spec", `OperatorBottomNav.tsx:20-23`) is false as implemented. Impact: on the pilot-common iPhone 14 both edge tabs are half-amputated ghost slivers on every screen — a trust-destroying visual lie — and on SE-class devices two of six destinations are unreachable from the bar. This is the mechanism behind "the daily checkout was only visible if I navigated back to home": Home itself was the clipped tab. Evidence: `A-nav-390-dashboard-clean.png`, `A-nav-320-clean.png`, `B-bottomnav-clean-390.png`. **Owner ruling 2026-07-29: five tabs — Map demoted back to the drawer (proposed D30, supersedes D28).** Note the arithmetic still requires the `minWidth:0` override: even five tabs at MUI's 80px floor = 400px > 390px.

**1.2 · The service-worker update snackbar: undismissable, nav-covering, tap-eating, contrast-failing, and fires on first-ever visit. CONFIRMED ×5 seats (A2/B-2/C3/E2/F-01, D-03 for contrast) · P0.**
`src/components/shared/ServiceWorkerUpdater.tsx:41-52`: raw `Snackbar`, bottom-center, no `autoHideDuration`, no `onClose`, only action "Reload"; z-index 1400 over the nav's 1100; **no bottom offset** — while `useToast.tsx:47` correctly lifts every toast by `calc(80px + env(safe-area-inset-bottom))`. The first-install trigger is code-real: `sw.ts:30-31` (`skipWaiting`+`clientsClaim`) claims the page on first install, firing the unguarded `controllerchange` listener (`ServiceWorkerUpdater.tsx:23`) — reproduced in a 100% fresh context (`E-fresh-first-visit-toast.png`). Hit-tested: with the snackbar up, taps on Check/My Deployment/Requests resolve to the snackbar; Scan resolves to **Reload** — mid-form, that's work destroyed (Stopwatch reproduced a RequestComposer submission eaten this way, 30s of Playwright retries then a force-click landing on Reload). The Reload label itself is #9a5b00 amber on #303030 gray = **2.43:1** (the AA-amber tuned for white backgrounds, used on the one background class it fails on). Since staging deploys near-daily during the pilot, every open operator phone gets this overlay whenever you merge. **Owner ruling: quiet + auto-apply (proposed D31).**

**1.3 · Cold loads render the desktop shell on phones; zero error/loading/404 boundaries make that state permanent under failure. CONFIRMED (A4, + critic G-2) · P1.**
`AppShell.tsx:33-42`: `mounted` starts false and `effectiveIsMobile = mounted && isMobile`, so SSR HTML and the first client render are always desktop-shaped — the 240px permanent drawer renders on a 390px phone and `bottomNav` (line 142) does not. With JS blocked (the honest simulation of a failed hydration): drawer eats 240 of 390px, content squeezed to ~150px, skeletons frozen, no nav of any kind (`A-h2-ssr-fossil-390-dashboard.png`). `find` confirms **zero** `error.tsx` / `global-error.tsx` / `loading.tsx` / `not-found.tsx` anywhere in `src/app` — an uncaught client error unmounts to Next's bare default; `/operator/anything-stale` renders an unbranded white "404" with no way back (`G-404-operator-390.png`) — in an installed PWA there is no URL bar to escape with. Every iOS tab-eviction re-open ("returning to the app") replays the desktop flash; every hydration failure fossilizes it.

**1.4 · Landscape on a Pro-Max/Plus iPhone silently swaps shells. CONFIRMED (A3/C4) · P1.**
`AppShell.tsx:31` gates on `down('md')`, MUI default md=900; Pro Max landscape is 932px, Plus 926px → permanent drawer + no bottom nav + no hamburger (`C-operator-operator-dashboard-932x430.png`); iPhone-14-class landscape (844px) keeps the mobile shell — so **fleet phones behave inconsistently with each other**. `manifest.json` sets `orientation: 'any'`. **Owner ruling: phone = phone, always — device-class heuristic + manifest portrait lock (proposed D32).**

**1.5 · Hardware/browser Back is destructive everywhere. CONFIRMED (A5) · P1.**
No `history.pushState`/`popstate` integration exists anywhere in `src`. Reproduced: daily-check step 2 → Back → dashboard, all answers gone (state is pure `useState`, `daily-check/page.tsx:85`; no draft, no confirm); transfer Review dialog open → Back → leaves the page; hamburger drawer open → Back → exits the app. Android operators use the system back gesture reflexively — one swipe on step 3 throws away the whole check.

**1.6 · Admin detail drawers render under the fixed AppBar; two close-X's hit-test to the notification bell. CONFIRMED (C2) · P1.**
`AppShell.tsx:59` AppBar z=1201 over DetailDrawer z=1200 with paper `top:0`: the drawer header (operator name/status chip) hides under the green bar on phone and desktop; deployments/inventory drawers have **no close control at all** on phones (full-width paper, no backdrop reachable, plain Drawer = no swipe); on vehicles/maintenance, `elementFromPoint` on the visible X returns the **Notifications bell**. Admin-on-phone is a stated persona; system back exiting the page (1.5) is the only exit.

Related P2s riding this cluster in the packets: keyboard-over-nav is unmanaged (A6 — hide intentionally on `focusin` rather than accidentally); the 600–899px window where toasts drop to 24px offset while the nav persists to 900 (parking lot, A-seat).

---

## 2 · TIER 2 — Sunlight, contrast, and touch (Sunlight + Thumb)

**2.1 · Info blue was never tokenized: all eight offline "queued" trust toasts are white-on-#0288d1 at 3.86:1 — AA fail. CONFIRMED (D-02) · P1.** `tokens.ts` has brand/amber/error but **no info token**; `providers.tsx` doesn't set `palette.info`, so MUI's default flows into every filled-info surface — which is exactly the set of messages a rural operator must read to trust "did my action save?" (`useToast.tsx:52` filled variant; sites grep-verified across daily-check/requests/scan/my-deployment). One token + one theme line recolors every site (#01579b = 7.4:1).

**2.2 · Daily-check Yes/N-A selected state is an 8% gray wash (1.19:1) and is byte-identical to the keyboard-focus indicator. CONFIRMED (D-04) · P1.** `daily-check/page.tsx:531-533` colors only the No toggle. The most-repeated interaction in the app (~10 rows every morning, all-Yes the normal case) encodes "already answered" in a tint that washes out first in glare; `Mui-focusVisible` has no rule at all. Fix: `color="success"` on Yes + a theme-level focus outline.

**2.3 · Crew-map recency is hue-only (green/amber/red at 1.06–1.10:1 luminance), and the operator map has no legend — the admin map does. CONFIRMED (D-05) · P1.** ~8% of males are red-green colorblind; a 9-operator crew statistically contains one. The bucket label lives only in a tap popup behind 16px dots. The outdoor surface got less redundancy than the desk surface.

**2.4 · Residual sub-36px targets on gloved surfaces. CONFIRMED (C6) · P1.** The CC-24/CC-32 passes landed where applied (verified — Today leaves, kit rows, check toggles are genuinely 44px) but missed: requests Cancel 31px, composer line controls 28–30px, note-preset chips 24px, **daily-check Back/Next 37px** (the 3×/day wizard advance). Same `sx minHeight:44` precedent applies.

**2.5 · Type & redundancy floor (P2 set, packetized together):** meaning-bearing placeholder-only prompts at ~2.55:1 (D-06: "Describe the issue…" is the only label on the failure note); 12px captions carrying state ("In repair — In Progress" is the only surface telling an operator their sampler is in the shop; bell timestamps at 2.68:1) (D-07); the identical ⊖ glyph meaning "Log usage" (amber) on one row and "Return item" (red) on the next — color as the only differentiator (D-08); px-frozen type ignoring OS large-text settings (D-09); a hand-rolled 18px/10px chip in PhotoGallery of the exact species CC-23 eliminated (D-10); 7 icon-only buttons with no accessible name, including both hamburgers (D-11); load-bearing hairlines at 1.07–1.32:1 (D-12); odometer field lacking `inputMode="numeric"` while the PIN field got it right (C8); admin 11px table headers (D-13).

**2.6 · Admin tables at phone width show 42–47% of columns, sheared mid-word, zero scroll affordance. CONFIRMED (C5) · P1.** Measured: deployments 720px table in a 342px container; inventory 603/340; maintenance 814/340. iOS overlay scrollbars are invisible until scrolled — the page reads as truncated data, and row actions live off-screen. `/admin/requests` already uses cards at phone width and reads fine — the in-house pattern exists. Interim fix is an edge fade + column priority; the full card conversion stays under D10 demand-pull (this audit is the demand signal).

---

## 3 · TIER 3 — Flow integrity & the friction budget (Stopwatch + builder + critic)

**3.1 · Daily-check Submit is held hostage by an unanswered GPS permission prompt — the check is silently lost on navigate-away. CONFIRMED (F-02) · P1, charter-relevant.** `daily-check/page.tsx:300-311` awaits `captureLocation()` **before** `mutate()`; the 10s timeout does not bound a pending permission prompt (W3C excludes permission-UI time). Reproduced twice: "Submitting…" 30s+, nothing enqueued, row absent from `daily_checks` after navigating away — **two lost submissions, outbox empty**. On the first-ever check per device (permission state `prompt`), iOS's modal prompt + glare + gloves makes "ignored the prompt" the common case. This violates the zero-lost-writes charter promise on the flagship flow, from the UX side. Fix is one function: `Promise.race` ceiling, or enqueue-first + attach coords opportunistically.

**3.2 · The materials-request loop never closes. CONFIRMED (F-04) · P1.** Direct-Fulfill of a MATERIAL request notifies nobody (`deployment-requests/[id]/route.ts:93-106` creates a notification only in the `complete` arm; verified live — operator1's `/api/notifications` byte-identical before/after admin Fulfill). The card silently moves Active→Closed. The operator who asked for bags never hears back; **texting wins this leg on guaranteed reply** — the exact comparison the flow exists to win. Admin-side feedback is a contentless "Done." toast. S-effort fix: mirror the `complete` arm's notification + name the outcome in the toast.

**3.3 · Login lockout lies to the operator. CONFIRMED (critic G-1) · P1.** After 5 bad PIN tries, the **correct** PIN also returns "Invalid credentials" for 15 minutes (`lib/auth/pin.ts:16-25` returns undifferentiated false; `login/route.ts:39/56`), and the login card offers zero recovery guidance — no "account locked, try again at HH:MM", no who-to-contact. The 6am operator retries in confusion, then texts the manager — a fail that both loses trust and generates the support text AHITS exists to prevent. (Related parking-lot item: the rate limiter keys on client IP — a crew behind one rural CGNAT/hotspot shares a single lockout bucket. That's a correctness/ops item, registered in §7.)

**3.4 · Neither deployment-creation UI can set a project. CONFIRMED (F-10 + builder) · P1-adjacent, filed P2 by seat but flagged by both independently.** `admin/deployments/page.tsx:169` is `const [projectId] = React.useState('')` — dead state, no setter, no picker in any of the four stepper steps; the operator Start-Deployment dialog has none either; `rig.project` renders read-only. Ad-hoc rigs are project-less in a project-scoped pilot, the list page filters by project, and there is no in-UI way to fix it after the fact (the state-builder had to PATCH via API).

**3.5 · The admin New Deployment stepper launches blind. Builder observation, verified.** The final "Start" step shows only note presets — not the chosen operator/vehicles/kit. The builder's scripted mis-tick attached the wrong vehicle and the launch sailed through with zero feedback; a human mis-tap is equally invisible until the deployment exists. One review summary panel fixes it. (Also: the 4-step stepper clips its last label to "St…" at phone width, B-14.)

**3.6 · Post-submit dead ends and stale counters (P2 cluster, confirmed):** the "Done" chip after a check is inert — no operator-facing view of today's own check and no typo-fix path (F-08); nav badges show "1" for up to 45s after accepting the only pending transfer (F-06); daily-check validation errors render ~1300px off-viewport so Next appears dead (F-05); the composer defaults to "Reserve a rig" for already-deployed operators — the pilot's actual traffic is MATERIAL (F-09); an in-progress check has zero interruption recovery — reload/OS-kill discards everything (F-11, pairs with the critic's interrupted-auth finding: any tokenVersion bump mid-form yanks to /login with no draft, G-3); the empty-queue flush flashes "Syncing 0 action(s)…" + header spinner + ~48px layout shift on every operator page every 30 seconds and on every app-return (E1 — two guards fix it); "Report a problem" is an unlabeled warning-triangle that reads as a status flag (F-07); the offline-storage banner consumes ~180px above the fold and re-appears every visit because dismissal is in-memory only (A9/builder).

**3.7 · Where the app already beats texting (verified, keep it that way):** transfer accept — Today says "Waiting on you (1)", Review lands on the card, sender's note rendered, 3 taps total, state consistent on both sides; the daily-check happy path — vehicle preselected, date automatic, site carried forward, odometer sanity inline, GPS warm-captured, ~35s wall including nav; End Deployment's disposition dialog — rig-level default + per-item override, clean kit closes in 2 taps. These are the North-Star §3 exemplars; the packets deliberately do not touch their mechanics.

---

## 4 · TIER 4 — Consistency & the design system (Consistency seat)

**4.1 · Dialog census: a canonical pattern exists (≈70% adherence) and ~12 surfaces deviate. CONFIRMED (B-3) · P1.** Canonical: floating `maxWidth='xs|sm' fullWidth`, plain-text title, backdrop+Esc dismiss, `DialogActions px:3 pb:2`, text-Cancel left / contained-verb right, spinner-in-button busy state. Deviations (file:line in the census): RequestComposer is the **only** fullScreen dialog while equally long forms float; backdrop-dismiss is guarded on exactly two hub dialogs and nowhere else (mid-write stray tap closes a slow rural mutation elsewhere — including every ConfirmDialog); `window.confirm` browser chrome appears exactly once, inside OutboxDialog's discard path (B-11); title/button/toast verb mismatches ("Deactivate?" → [Delete] → "deactivated", B-8); casing drift ("Start daily check" vs "Start Daily Check", B-10); ALL-CAPS ToggleButtons/Tabs vs mixed-case Buttons because the theme un-capitalizes `MuiButton` only (B-4). The fix shape is a `DialogShell` wrapper + two theme overrides + a strings sweep, migrated packet-by-packet — spec'd as UXP-4.

**4.2 · Same destinations, different names across nav surfaces (B-6/A8, P2):** Home / My Dashboard / Dashboard; Scan / Scan QR / "Scan / Check Out · In"; Crew Map / Map. Plus "checkout" — the operators' own word — appearing on the Today card but nowhere in either nav. Strings-only sweep in the CC-32 PR-1 mold, **needs your word list (D11 protocol)** — proposed list in the packet.

**4.3 · Substrate adoption gaps (P2/P3):** EmptyState used on exactly one screen while My Deployment and Requests hand-roll the same moment (B-7); FreshnessIndicator on Today/Requests/CrewMap but **not** My Deployment — the transfer-decision surface (B-13/C10, D10-gated); two hand-rolled dense chips of the species CC-23 eliminated (B-12); the portal's two lost template interpolations rendering `border: 1px solid` + nothing (B-5 — three-line fix); admin OfflineBanner mounted inside the padded column instead of the full-bleed banner slot the operator shell uses (B-15); section-header/table-header type roles drifting across three scales (B-9); form-wrapper `<Box component="form">` defeating MUI dialog scroll containment in five admin dialogs — Save/Cancel scroll away and sit unpinned (C7); RequestComposer fullScreen ignoring safe-areas (C9); AppShell's hardcoded 64px clearance vs the 56px mobile toolbar — an 8–16px dead strip under the bar on every phone screen (C12).

---

## 5 · TIER 5 — Performance & battery (Wattmeter, measured on the prod build)

**Verdict: architecture healthy, five concrete leaks.** Warm loads are effectively free (SW-served repeats: 0 bytes over the wire, ~420–490ms at 4× CPU throttle) and the heavy things that are usually wrong are right here: mapbox-gl is dynamic-imported with full teardown, the QR scanner's camera hygiene is exemplary, Today is one aggregate read, no `refreshInterval` polling storms. The leaks:

- **E3 · The SW precaches the entire 4.13MB build on first install — including the 1.8MB mapbox-gl chunk (43% of precache).** Every fresh device pays ~0.5–0.7MB gz per deploy × near-daily pilot deploys; the mapbox chunk buys nothing until the Map tab is opened (and it's dynamic-imported anyway). One-line Serwist exclude. **This also directly shortens the §1.3 no-nav hydration window on rural signal.**
- **E4 · Sentry (~205KB raw / 68KB gz) ships on every route including /login, even with no DSN configured.** Lazy-init inside the effect when `dsn` is truthy.
- **E5 · Two independent 45s pollers** (NotificationBell + useIncomingPendingCount) = 3 req/45s per idle phone, screen on — ~1,900 requests per 8h shift per device before any work happens. Merge into one badges aggregate.
- **E6 · My Deployment fires 9 API reads on open**, including the full 200-item inventory catalog and all vehicles — feeding dialogs the operator hasn't opened. Defer the four dialog-feeding fetches to first tap.
- **E7 · useOfflineQueue mounts 2–4 full instances per page**, each with its own 30s interval, storage probes, and IndexedDB scans (AppShell + OfflineBanner + page hooks). Hoist to one provider. (Also the root cause multiplier for E1's flash.)
- Small: `qrcode` statically imported in admin/inventory for a click-handler feature (E8); field-reads SW timeout 5s vs 3s elsewhere — 2 extra seconds of lie-fi stare before cached data appears (E9).

---

## 6 · Verified clean under adversarial reading (keep these; they're load-bearing)

Alert deep-links land on real, opened targets (`?task=`/`?check=`/`?operator=` all consumed); the operator Browse drawer is in perfect lockstep with the proxy allowlist — zero dead-end links; the toast system is genuinely unified with correct above-nav lift; status vocabulary is single-sourced (`lib/status.ts` + StatusChip) and honest everywhere; page-title discipline holds across ~20 screens; DetailDrawer adopted by all five admin drawers; the tokens + ESLint hex ban is real substrate (the `~offline` page is an exemplary rogue-surface citizen, brand-correct with safe-area handling and working escape links); CC-23's amber discipline held (zero `amberBright` text uses; every warning surface is 5.4:1); pinch-zoom never locked; done/due states are not color-alone; the QR scanner ships torch + manual-entry fallback; the offline queue's cross-instance flush lock is rare correctness engineering; badge state can't disagree between drawer and tab bar (one shared hook); transfer accept and the daily-check happy path genuinely beat texting today.

---

## 7 · Parking lot — flagged for later sessions, NOT dispositioned here

Correctness/ops (route to a non-UX packet): **login rate limiter keys on client IP** — a crew behind one rural CGNAT/hotspot shares a single bucket; a few mistyped PINs can lock the whole crew's logins (`login/route.ts:23`) · **MATERIAL fulfill records nothing at line level** (no fulfilledQty — "asked for 5, got ?") — the model can't express partial fulfillment · with `skipWaiting`+`clientsClaim`, **a mid-shift deploy swaps chunks under open clients** — keep the evening-deploys rule binding, and coordinate any update-UX change with deploy timing · admin list pages render all rows unvirtualized (fine at pilot scale; jank at hundreds) · verify JSON compression on the real Cloud Run path · Mapbox telemetry (`events.mapbox.com`) phones home from operator devices — disableable if data budgets tighten · one unexplained full page reset observed after an offline→online transition during testing (could not attribute; watch for it in the field) · bell unread doesn't clear when the underlying item is acted on (moot deep-link stays) · admin builder 409 recovery silently clears all serialized kit picks.

Product/UX ideas (cheap, unscheduled): route update prompts through the NotificationBell instead of a floating snackbar · SwipeableDrawer for DetailDrawer once the close-X lands · a shared NumericField if more numeric inputs appear · pull-to-refresh convention for installed-PWA lists · `/operator/scan` is a near-empty landing (no recent scans, no "what can I scan") · greeting renders "Good evening, Field" (first-token split of a two-word first name) · stray stuck-Tooltip "Refresh" pill under touch emulation — check Tooltip-on-touch behavior · kit rows place two same-colored icon-only buttons adjacent (glove discrimination) · filter-control drift (ToggleButtonGroup on three pages, Tabs on one).

Portal cluster (rides the parked CC-16/CC-27-portal work, but note two field-relevant now-items are in UXP-2/3 riders): "Decline entire request" is one-tap-no-confirm for an outside party · every dead-link state says "contact Agricarbon" with no contact method · WORK_ORDER action stack renders all transitions as equal full-width green primaries · portal 15px inputs trigger iOS focus-zoom · raw hexes bypass the token lint on this surface.

Photo policy (owner call, pre-flight question in UXP-3): unit report-problem hard-requires a photo server-side — a device with a broken/denied camera cannot file a damage report at all; and PhotoCapture forces the live camera (`capture="environment"`) on all three surfaces — operators cannot attach the photo they already took; selections past max=5 drop silently.

Known-parked overlaps re-confirmed, not re-filed: secondary-operator Today (review §3.2, own packet pre-CC-17); D10 demand-pull admin splits (this audit supplies the demand evidence for deployments/inventory); CC-23 item 1 portal re-palette.

---

## 8 · Owner interview record (2026-07-29, two rounds) & proposed decisions

Round 1 set scope: read-only audit, fixes as packet specs (no code landed); even iOS/Android fleet, some browser-tab users; all surfaces in scope with dialogs called out; nav-bar repro context captured (iOS, during checkout, plus keyboard/scroll/app-return). Round 2 ruled on the four judgment calls the findings raised:

- **D30 (proposed) · Bottom nav goes to FIVE tabs — Map demoted to the drawer. Supersedes D28.** D28's 65px premise was false as implemented (§1.1); rather than shrink six, Max ruled Map — promoted only 2026-07-28 — returns to the drawer. Home/Check/My Deployment/Requests/Scan remain. Implementation still requires the `minWidth:0` override (five MUI-minimum tabs = 400px > 390px) and 320px verification.
- **D31 (proposed) · Update UX is quiet + auto-apply.** No first-install toast (hadController guard); prompt becomes dismissible, auto-hiding, lifted above the nav, AA-compliant; updates continue to apply on next launch via the existing skipWaiting flow. Reload stays available as the primary action while shown.
- **D32 (proposed) · Phone = phone, always.** The operator shell keys off device class (coarse pointer heuristic), not instantaneous width — landscape on any phone keeps the bottom-nav shell; installed PWA locks portrait via manifest. Admin shell keeps the md breakpoint. One heuristic governs shell + typography.
- **Sequencing ruling:** UXP-1 Nav Trust ships first; then UXP-2 Sunlight & Touch; then UXP-3 Flow Closers; UXP-4 (design system) and UXP-5 (Wattmeter) are paced/demand-pull. Specs in `AHITS_UX_PACKETS_2026-07-29.md`.

**On merge of each packet:** append the corresponding Dn to `DECISIONS.md` (verify D30–D32 numbering is still free at commit time), mark the D28 supersession, and update `STATUS.md` §1/§3 per the session-close contract.

---

## 9 · Method & fidelity appendix — read before trusting

**Environment.** The audit ran against a **production build** (`next build --webpack`, standalone) of the repo copy staged 2026-07-29 ~21:00Z, on a local Postgres with all 57 migrations applied via psql and the app's own seed, plus builder-created state (active rigs ×2, pending transfer, submitted check, in-repair unit, material request — all via the app's UI/APIs with real sessions, no direct SQL writes). ~194 screenshots under `/root/audit/screens/` in the audit sandbox; the citation-relevant set ships as `AHITS_UX_AUDIT_EVIDENCE_2026-07-29.zip` (manifest inside).

**Sandbox-only modifications (NOT in your repo, NEVER commit these):** Prisma engine binaries are unreachable from the audit sandbox, so the sandbox copy ran Prisma 6.19 with the WASM query compiler + `@prisma/adapter-pg` — edits confined to `prisma/schema.prisma` (generator block), `src/lib/prisma.ts`, `prisma/seed.ts` (env-guarded), `@types/pg` devDep. Staging runs your committed Prisma 5.22 exactly as before. No UI/UX source was modified anywhere. The one sandbox artifact worth naming: `/api/cron/dispatch` was non-functional here (its separate PrismaClient lacks the adapter) — nothing cron-driven was audited live.

**Fidelity limits — the PLAUSIBLE set needing a real-phone pass (A6-UX rider, ~10 min on one iOS + one Android device):**
1. Keyboard-over-nav behavior on real iOS Safari standalone (sandbox approximated by viewport shrink) — §1 cluster, A6.
2. Safari **browser-tab** mode: fixed bottom nav vs Safari's own bottom toolbar stacking (code-level analysis only; some crew run tab mode).
3. First-install update toast on a real fleet phone (mechanism CONFIRMED in Chromium; confirm on-device).
4. Portal input focus-zoom on real iOS (C14).
5. iOS PWA install/standalone chrome around the 404/error surfaces once boundaries land.
6. True battery/data measurement across a shift (poller math in §5 is arithmetic, not telemetry).
Everything marked CONFIRMED was reproduced in the sandbox build or re-derived from code by an independent verifier; ADJUSTED items carry their adjusted severity here; nothing REFUTED survived into this document.

**STATUS.md paste block (for the session that commits this):**
`2026-07-29 UX six-seat review: AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md + AHITS_UX_PACKETS_2026-07-29.md landed at root (audit-only session, zero code changes). Nav-bar mystery root-caused (4 stacked mechanisms, §1). D30–D32 proposed (5-tab nav superseding D28 · quiet auto-apply updates · phone=phone shell). Queue: UXP-1 Nav Trust → UXP-2 Sunlight → UXP-3 Flow Closers; UXP-4/5 paced. Parking lot §7 has two correctness items for triage (IP-keyed login rate limit; MATERIAL fulfill line-level model).`
