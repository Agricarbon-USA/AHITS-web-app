# AHITS — UX Fix Playbook · copy-and-paste edition

> STATUS: current (execution playbook) · UPDATED: 2026-07-29
> Companion to `AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md` (evidence) and `AHITS_UX_PACKETS_2026-07-29.md` (full specs). Those two files must be committed to the repo BEFORE Step 1 — the paste blocks below tell each build session to read them.
>
> **How to use this doc:** work top to bottom. Each fenced block is ONE complete paste — into your terminal, into a fresh Claude Code session, or into a doc. Checkbox lists are yours, done with a phone in your hand. Don't skip a smoke step to save ten minutes; that's how mid-pilot surprises happen.

---

## STEP 0 · Commit the audit docs (terminal, ~1 min)

```bash
cd ~/Downloads/"Agricarbon US Codebase"
git checkout development && git pull
git add AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md AHITS_UX_PACKETS_2026-07-29.md AHITS_UX_PLAYBOOK_COPY_PASTE.md
git commit -m "docs: UX six-seat review + UXP packet queue + playbook (audit-only session 2026-07-29)"
git push
```

(The evidence zip can stay untracked or be deleted — your call. `_to_delete/ux_audit_bundle.tgz` can be deleted.)

---

## STEP 1 · Build session #1 — UXP-1 NAV TRUST (paste into a fresh Claude Code session)

```
Read 00_START_HERE.md, STATUS.md, DECISIONS.md, CLAUDE.md first, as always.

This session executes UXP-1 (Nav Trust) EXACTLY as specified in AHITS_UX_PACKETS_2026-07-29.md — items 1a through 1g. Evidence and rationale for every item live in AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md §1 (finding IDs are cross-referenced in the packet); read the relevant finding before coding each item.

Scope, in one line each:
1a — Bottom nav goes to FIVE tabs: remove the Map tab (drawer entry stays/returns), add the MUI minWidth:0 override so five tabs actually fit 320–430px. This executes owner decision D30 (supersedes D28 — see the packets doc; DECISIONS.md entry is pasted by Max after merge).
1b — ServiceWorkerUpdater: no toast on first install (hadController guard), dismissible + autoHide ~8s + re-offer on visibility, lifted above the tab bar exactly like useToast.tsx's offset, action color inherit. Do NOT touch sw.ts.
1c — Operator shell is mobile by DEVICE CLASS (pointer:coarse heuristic or down('lg') via a new AppShell prop), so phone landscape never swaps to the desktop shell; manifest.json orientation "portrait-primary". Admin shell keeps down('md') unchanged.
1d — Pre-mount default flips to the MOBILE composition (no more desktop flash/fossil on phones); add branded src/app/error.tsx, global-error.tsx, not-found.tsx, and minimal loading.tsx files with Reload + Home escapes, tokens-sourced, offline-tolerant.
1e — useHistoryGuard hook: hardware/browser Back closes open dialogs/drawers and steps the daily-check wizard back instead of leaving the page. Scope ONLY: daily-check wizard, DetailDrawer, the transfer/handoff respond dialogs, RequestComposer.
1f — DetailDrawer renders below/above the AppBar correctly (header never hidden) and gains a built-in 44px close X; remove the two page-local X's that hit-test to the notification bell.
1g — flush() returns early when the queue has no non-failed items; OfflineBanner's queue banner requires pending>0 || isOffline. No other queue changes — tests/offline must stay green.

Hard rules: UI layer only, NO schema changes, NO sw.ts changes, no new deps. The fleet is live on staging (D16): PR(s) to development with full CI green, explicit-path staging (never git add -A), merge only on my go, evening deploy. Every touched component gets/keeps a component test (npm run test:ui); 1a gets a tab-count snapshot test that fails loudly if a sixth tab is ever added (cite D30). Acceptance criteria per item are in the packets doc — meet them literally; where an acceptance says "measure", measure.

Ship as 2 PRs: PR-1 = 1a+1b+1g (small, pure wins), PR-2 = 1c+1d+1e+1f (shell work). If the session runs long, 1e is the designated drop — everything else is not droppable.

Close-out per CLAUDE.md session-close contract: update STATUS.md §1/§3/§4, write the session handoff doc, commit all docs. Do not append D30–D32 to DECISIONS.md — Max pastes those himself after his smoke.
```

---

## STEP 2 · Your UXP-1 evening smoke (phone in hand, ~10 min, after deploy is green)

- [ ] iPhone + Android, portrait: **five tabs, all fully visible**, no clipped edges, at least 44px each.
- [ ] Rotate the phone on any screen: **shell does not swap** — tabs stay (Pro Max especially).
- [ ] Fresh install / cleared-site-data first open: **no "new version" toast**.
- [ ] After this very deploy, on a phone that had the old build open: update toast appears **above** the tab bar, has an X, auto-hides; tabs still tappable while it shows.
- [ ] Airplane mode → cold open the PWA: nav renders (cached shell), no desktop flash.
- [ ] Type a wrong URL inside the app (e.g. /operator/xyz): **branded 404** with a working Home button.
- [ ] Daily check → step 2 → hardware/system Back: **answers intact**, you're on step 1 (not the dashboard).
- [ ] Admin on your phone: open Deployments and Vehicles drawers — header visible, X visible, X actually closes.
- [ ] Watch Today idle for 60s: **no "Syncing 0 action(s)" flicker**, no layout twitch.

All boxes ticked → give the merge/keep go. Any box fails → screenshot it, tell the next session which box.

---

## STEP 3 · Record the decisions (paste into DECISIONS.md, after Step 2 passes)

First, on the existing **D28** entry, change its status line to:
`- **Date:** 2026-07-28 · **Owner:** Max · **Status:** SUPERSEDED · Superseded-by: D30 · **Shipped:** CC-32 PR-3 (#211)`

Then append (fill in the PR #s):

```markdown
### D30 · Operator bottom nav returns to FIVE tabs — Map demoted to the drawer. Supersedes D28.
- **Date:** 2026-07-29 · **Owner:** Max · **Status:** ACTIVE · **Shipped:** UXP-1 PR-1 (#___)
- **Decision:** `OperatorBottomNav` carries five tabs — Home / Check / My Deployment / Requests / Scan. Map returns to the drawer. The 2026-07-29 six-seat UX review proved D28's arithmetic false as implemented: MUI enforces an 80px minimum per labeled tab, so six tabs = 480px — Home and Map rendered as 0–55px slivers on every phone width (review §1.1, CONFIRMED by four seats independently). Asked with the alternatives stated (shrink six via minWidth override, demote Scan, icon-only), Max ruled Map — the newest promotion — steps back down. The `minWidth:0` override ships regardless (five 80px-minimum tabs = 400px, still > 390px).
- **Rationale:** five full-width, fully-visible, honestly-tappable tabs beat six clipped ones on the surface operators touch most; Map keeps one-tap reach from the drawer.
- **Revisit trigger:** operator telemetry/complaints showing the drawer-hunt for Map actually costs adoption.

### D31 · App-update UX is quiet + auto-apply
- **Date:** 2026-07-29 · **Owner:** Max · **Status:** ACTIVE · **Shipped:** UXP-1 PR-1 (#___)
- **Decision:** No update prompt on a device's first-ever visit (hadController guard). When a real update lands, the prompt is dismissible, auto-hides (~8s, re-offers on next app-return while an update is waiting), sits ABOVE the bottom nav with AA contrast, and keeps Reload as its primary action. The service worker's existing skipWaiting/clientsClaim behavior is unchanged — updates continue to apply on next launch without operator action. UI layer only.
- **Rationale:** the prior snackbar was undismissable, covered the nav, ate mis-taps into Reload (destroying in-progress forms), and fired falsely on first install (review §1.2) — the single biggest "app feels broken" surface. Ops guardrail unchanged: evening deploys only, since chunks still swap under open clients mid-shift.

### D32 · Phone = phone, always — operator shell keys off device class, not viewport width
- **Date:** 2026-07-29 · **Owner:** Max · **Status:** ACTIVE · **Shipped:** UXP-1 PR-2 (#___)
- **Decision:** The operator shell decides mobile-ness by device class (coarse-pointer heuristic / wider breakpoint via an AppShell prop), so rotating any phone — including Pro Max-class at 932px landscape — never swaps to the desktop drawer shell; the installed PWA additionally locks portrait via manifest. The admin shell keeps the md breakpoint. Pre-mount default is the MOBILE composition, so cold loads and hydration failures no longer strand phones in a nav-less desktop layout (pairs with the new error/404/loading boundaries).
- **Rationale:** review §1.3–1.4 — the width-keyed swap plus the desktop-shaped SSR default were two of the four confirmed "disappearing nav" mechanisms.
```

---

## STEP 4 · Update STATUS.md (paste into §1/§3 area, adjust PR #s)

```markdown
**2026-07-29 UX six-seat review LANDED (audit-only, zero code changes that session):** `AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md` (74 findings; 22/26 P0-P1 CONFIRMED, 0 refuted; nav-bar mystery = 4 stacked mechanisms, §1) + `AHITS_UX_PACKETS_2026-07-29.md` (build queue UXP-1→5) + playbook. **UXP-1 Nav Trust ✅ MERGED (PR-1 #___ + PR-2 #___), evening smoke passed** — five-tab nav (D30, supersedes D28), quiet auto-apply updates (D31), phone=phone shell + error/404/loading boundaries (D32), Back-button guards, drawer-over-AppBar fix, phantom-sync silenced. **Next: UXP-2 Sunlight & Touch → UXP-3 Flow Closers** (specs in the packets doc; UXP-3 has a photo-policy pre-flight for Max). Parking lot §7 of the review holds two correctness items for a non-UX session: IP-keyed login rate limiting (crew-wide lockout on shared hotspots) and MATERIAL fulfillment's missing line-level record.
```

---

## STEP 5 · A6-UX device rider (once, after UXP-1; one iOS + one Android)

- [ ] Keyboard up on daily-check: nav behavior intentional, focused field visible above the keyboard.
- [ ] Safari **tab** mode (not installed): bottom bar vs Safari's own toolbar — usable, nothing hidden.
- [ ] Fresh install: no update toast on first open (re-confirm on real iOS).
- [ ] Rotate mid-check on the biggest phone you have: shell stable, answers intact.
- [ ] Installed-PWA 404 (stale link): branded page, escape works with no browser chrome.
- [ ] Record results in AHITS_A6_DEVICE_CHECKLIST.md per house ritual.

---

## STEP 6 · Build session #2 — UXP-2 SUNLIGHT & TOUCH (paste into a fresh session)

```
Read 00_START_HERE.md, STATUS.md, DECISIONS.md, CLAUDE.md first, as always.

This session executes UXP-2 (Sunlight & Touch) EXACTLY as specified in AHITS_UX_PACKETS_2026-07-29.md — items 2a through 2i. Evidence: AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md §2 (finding IDs D-02..D-13, C5/C6/C8/C13, B-5, C14). Read each finding before coding it.

The shape: 2a tokenize color.info (≥4.5:1 under white) + palette.info — this recolors all eight offline trust toasts; 2b daily-check Yes gets color="success" + a theme-level Mui-focusVisible outline; 2c operator crew map gets the admin-style legend row + shape-redundant recency markers (solid/ring/hollow — D2 language untouched); 2d type floor: real label+helper on the failure note, meaning-bearing 12px captions to 13-14px, PhotoGallery's hand-rolled chip → StatusChip badge, portal border-interpolation fix + 16px portal inputs; 2e distinct glyphs for Log-usage vs Return + "Report" becomes a labeled control; 2f the remaining 44px pass (daily-check Back/Next, requests Cancel + toggles, composer line controls, preset chip hit areas); 2g odometer inputMode numeric; 2h stepper alternativeLabel at xs + admin-table right-edge scroll affordance + 12-13px headers; 2i aria-labels on the 7 naked IconButtons.

Hard rules: presentation only — zero logic, zero API, zero schema. Items 2a and 2b are NOT droppable; every other item may drop individually if the session runs long (say which in the handoff). One PR is fine; two (tokens/theme vs surfaces) also fine. Component tests ride along; attach 320px and 390px screenshots of daily-check step 2, Today, the operator map, and one admin table to the PR body. Re-run a contrast pass over changed surfaces and paste the numbers into the PR.

Close-out per the session-close contract; no DECISIONS entries needed for this packet.
```

**Your UXP-2 smoke:** stand outside in daylight with the phone — daily-check selected answers obviously readable; map legend visible; every button you aim at with a work glove lands.

---

## STEP 7 · Build session #3 — UXP-3 FLOW CLOSERS

**7a. First, answer the two photo-policy questions** (edit the two lines, keep them in your paste):

```
PRE-FLIGHT ANSWERS (Max):
(a) Operators may attach an EXISTING photo from the library, not only live camera: YES / NO
(b) When a device has no working camera, unit report-problem may submit WITHOUT a photo: YES / NO
```

**7b. Then paste this (with your answers appended) into a fresh session:**

```
Read 00_START_HERE.md, STATUS.md, DECISIONS.md, CLAUDE.md first, as always.

This session executes UXP-3 (Flow Closers) EXACTLY as specified in AHITS_UX_PACKETS_2026-07-29.md — items 3a through 3j, honoring the PRE-FLIGHT ANSWERS pasted below. Evidence: AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md §3 (F-02, critic-G1, F-04, F-10, F-05, F-06, F-08, F-09, F-11, A9 + builder observations).

Not droppable, in this order: 3a GPS can never hold a daily-check submit hostage (Promise.race ceiling or enqueue-first — granted/denied paths byte-identical; add the permission-limbo test); 3b lockout honesty (locked ≠ wrong-PIN in the response; login card says locked-until + who to contact; flag the info-disclosure tradeoff in the PR body for my sign-off); 3c MATERIAL direct-Fulfill notifies the operator (mirror the complete arm) + admin toast names the outcome + strings rider: that button reads "Mark Handled" per D9.
Droppable riders, take what fits: 3d project select in both deployment builders + review-summary step + stepper label fix; 3e badge recount on accept/decline + scroll-to-first-error on daily-check validation + tappable Done chip → today's check summary with redo; 3f composer defaults MATERIAL when a rig is active; 3g photo capture per PRE-FLIGHT; 3h daily-check sessionStorage draft + restore notice; 3i offline-storage banner: persistent dismissal + one-line collapse; 3j daily-check preselects the first UNCHECKED vehicle.

Hard rules: 3b and 3c are the only server-touching items (strings + one boolean + one notification.create) — NO schema changes, no new alert types, withIdempotency untouched, tests/offline stays green. PRs: PR-1 = 3a+3b+3c (the trust core), PR-2 = riders. Explicit-path staging; evening merge on my go; session-close contract applies.
```

**Your UXP-3 smoke:** deny-then-ignore the location prompt and submit a check (it must save); enter a wrong PIN 5× then the right one (card must say locked-until, not "invalid"); have a request Fulfilled from the admin side (operator phone must ring the bell); build a deployment start-to-finish and confirm the review step + project shows on the list.

---

## STEP 8 · Ongoing — UXP-4/5 ride-alongs (append ONE line-item to any future packet session)

```
Ride-along from the UX queue (AHITS_UX_PACKETS_2026-07-29.md): execute UXP-4 item ___ / UXP-5 item ___ alongside this packet, same PR discipline. Do not start a standalone sweep; one or two items max, only where this session already touches neighboring files.
```

Good first picks when a session is in the area: UXP-5/E3 (one-line Serwist exclude — big first-install win), UXP-4/B-11 (kill the `window.confirm`), UXP-5/E8 (dynamic-import qrcode), UXP-4/C7 (dialog form-wrapper fix). The nav-vocabulary sweep (UXP-4 item ii) waits until you've confirmed a word list — same D11 ritual as last time.

---

## STEP 9 · One correctness session (not UX — schedule separately)

```
Read 00_START_HERE.md, STATUS.md, DECISIONS.md, CLAUDE.md first, as always.

Two items from the 2026-07-29 UX review's parking lot (§7), correctness class:
1. Login rate limiter keys on client IP (src/app/api/auth/login/route.ts:23) — a crew behind one rural hotspot/CGNAT shares a single bucket, so a few mistyped PINs can lock the whole crew out. Re-key per-account (email) with a modest per-IP ceiling as backstop; keep the per-account PIN lockout as-is. Add tests for both dimensions.
2. MATERIAL fulfillment records nothing at line level — "asked for 5, got ?". Propose (do not build yet) the minimal additive model for fulfilledQty/what-was-sent, as a short spec for my review — it likely wants to ride a CC-17-adjacent packet.
Also verify from the review's parking lot: JSON compression on the real Cloud Run path, and the once-observed full page reset after an offline→online transition (try to reproduce; file or close it).
```

---

### Rules of thumb (apply to every step above)
One packet per session · PRs to `development`, full CI green, merge only on your go, evening deploys (D16) · never `git add -A` · every session re-verifies cited file:line against HEAD before coding · if a fix collides with any Dn, stop and ask — decisions beat findings · `tests/offline` green is non-negotiable on anything near the queue.
