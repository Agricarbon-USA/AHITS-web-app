# AHITS — Session Handoff · 2026-07-30 · UXP-1e (back-button history guard)

> STATUS: handoff snapshot · WROTE: 2026-07-30 · READ-WITH: `AHITS_UX_PACKETS_2026-07-29.md` (UXP-1e), `AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md` finding 1.5/A5, `STATUS.md` §3
> Owner-of-shared-docs: this session (no other session live in the tree).

## What shipped (as a PR — not merged)
Built the previously-deferred **UXP-1e** — the last open UXP-1 item, a **P1** (Back button destroying in-progress work). One PR to `development`, **CI GREEN**, awaiting Max's merge (D16). **UI layer only — no schema, no `sw.ts`, no new deps.**

**PR-3 #234** `feature/20260730/Agricarbon-USA-uxp1e-back-button-guard` (tip `e0532fe`).
- New `src/hooks/useHistoryGuard.ts`: while armed, keeps ONE sentinel history entry at the current URL; Back pops it → `popstate` → `onBack` (close overlay / step wizard back) instead of leaving. jsdom tests cover arm / pop / multi-step re-arm / programmatic-close.
- Adopted in the **four scoped surfaces only** (no global router patch): daily-check wizard (`useHistoryGuard(step>0 && !submitted, () => setStep(s-1))`), `DetailDrawer` (`open`/`onClose`), the my-deployment transfer + handoff respond dialogs, `RequestComposer`.
- **Two Next App-Router correctnesses** (a non-Next harness can't see them): (1) MERGE our flag into `history.state` — replacing Next's routing markers makes Back a full navigation that REMOUNTS the page and wipes the wizard's `useState` answers; (2) cleanup pops the sentinel only when it's still the TOP entry (flag present) — so a forward-nav while armed (Home tab mid-wizard) doesn't bounce the user back in.

## Verification
- **Real Chromium against the prod Next standalone build** (`node .next/standalone/server.js`) via a throwaway route + the Chrome browser tools. Result (Back = `history.back()`, identical to the Back button / Android hardware back; `MOUNT #n` unchanged ⇒ no remount):
  - Wizard: step 2 (answer "my odometer note") → Back → **step 1, answer intact, MOUNT #4 (no remount)** → Back → step 0, guard disarms → next Back leaves.
  - Dialog: open → Back → closed, page unchanged. Drawer: open → Back → closed, page unchanged. Button-close → sentinel popped (no leaked entry).
- `tsc` clean · `eslint` (touched) 0 · `test:ui` **24 files / 119 tests** · `next build --webpack` compiles.
- **Playwright is NOT a dep** and "no new deps" applied, so the real-browser leg used the Chrome MCP tools against a throwaway route instead — Max approved this route. See [[throwaway-verification-hygiene]].

## Throwaway scaffolding — CONFIRMED GONE, never staged
`src/app/histguard-throwaway/page.tsx` (reproduction of the 3 scenarios with the REAL hook) and the temporary `/histguard-throwaway` entry in `proxy.ts` `PUBLIC_PATHS` were **deleted / reverted** before commit. The PR's six files are the hook + its test + the four adoption edits — nothing else. (`git grep histguard` on the branch → 0.)

## ✅ External verification closed the authed-pages leg (audit sandbox, 2026-07-30)
Prod build of `development` + this PR's diff, **real seeded DB + real Chromium @ 390×844 → 14/14 PASS** across all four scoped surfaces on the REAL authed pages the local no-DB env couldn't drive:
- daily-check wizard: Back → prior step, answers intact, MOUNT stable (no remount/reload); Back at step 0 disarms and exits.
- my-deployment respond dialog: Back → closes, page stays, no reload.
- admin DetailDrawer: Back → closes, page stays, no reload.
- RequestComposer (fullScreen): Back → closes, page stays; a subsequent Back navigates normally (guard not stuck).

**Remaining leg (only one left):** on-device staging smoke — "daily-check step 2 → hardware Back → step 1, answers still populated, page did NOT reload." (The earlier admin-desktop-drawer and alert-deep-linked-drawer notes are subsumed by the 14/14 authed run; the on-device physical-Back-gesture check is all that remains.)

## Decisions / tensions
- **No DECISIONS entry** (instructed — 1e needs none).
- **D21 (my-deployment anti-regrowth) tension, flagged:** +2 hook lines + 1 import wiring Back-to-close onto the EXISTING respond dialogs. That's not the new-inline-dialog regrowth D21 targets, and the packet scope names those dialogs. Surfaced in the PR body per the ACTIVE-decision rule.
- **DetailDrawer.tsx overlaps open PR-2 #233 (1f):** both edit it (1f = below-bar + close X; 1e = one `useHistoryGuard` line), different regions — whoever merges second resolves the trivial conflict.

## State of UXP-1 as a whole
All of **1a–1g** is now in PRs — **NONE merged**: **#232** (1a·1b·1g), **#233** (1c·1d·1f), **#234** (1e). Do NOT read "UXP-1 done" until all three merge. On merge: paste D30/D31/D32 (from #232/#233) into `DECISIONS.md`, mark D28 superseded-by D30.

## Next actions
1. **Max:** staging smoke + merge #232, #233, #234; paste D30–D32; then UXP-2.
2. **Next session:** **UXP-2 (Sunlight & Touch)** per the packet order.

## Rollback
UI-layer; a bad deploy rolls traffic back per `PILOT_ROLLBACK.md`, zero data implications.
