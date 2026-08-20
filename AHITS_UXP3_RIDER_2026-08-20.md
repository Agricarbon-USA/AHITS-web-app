# RIDER — paste WITH the UXP-3 packet · 2026-08-20

> STATUS: paste-along rider (the errata convention: a rider supersedes its packet where they disagree) · READ-WITH: `AHITS_UX_PACKETS_2026-07-29.md` (UXP-3) + `AHITS_UX_PLAYBOOK_COPY_PASTE.md` (the UXP-3 step)
> WHY: the UXP-3 packet was written 2026-07-29, before the pilot stall, the 2026-08-20 resume review, and the green-light session. This rider carries everything that changed. **Next build session = UXP-3 + this rider.**

## 0 · Context deltas since the packet was written

1. **UXP-3 now runs BEFORE UXP-2** (Max, 2026-08-20 — recorded in the TODO §5 and STATUS resume box). Reason: pilot attempt-1 stalled on loop/trust failures, not legibility — see D33 and `AHITS_RESUME_BRIEF_2026-08-20.md` §2. Any packet line assuming "UXP-2 already landed" is void; do not depend on UXP-2 items.
2. **The pre-flight is already satisfied: photo policy = D36 (YES/YES).** Library-attach is allowed wherever a photo is accepted; a denied/missing camera never blocks a submit. **3g executes D36** — read the D36 entry in `DECISIONS.md` before writing 3g code; per-surface details are yours to design within it. Do not re-ask the two YES/NOs.
3. **UXP-1 is fully merged** (#232/#233/#234, 2026-07-30) — `useHistoryGuard`, the five-tab bar, device-class shell, and the branded error boundaries all EXIST. Build on them; a stale packet line describing them as pending is void.
4. **CC-34 is fully landed** (#226/#227/#229): `ReportProblemDialog`, check→task promotion, schedules. If any 3-item touches those surfaces, current `origin/development` is the truth — run the ⟲ pre-flight re-grounding as usual.
5. **New decisions exist: D30–D36.** Read `DECISIONS.md` end-to-end first, as always. D33 (attempt-1 VOID) explains the pilot-metrics state you'll see in `/admin/pilot`; treat attempt-1 rows as kept history, never data to "fix."

## 1 · Emphasis (scope unchanged, weight shifted)

- **3c (Fulfill-notify) is the headline** — the program calls it "the last flow that loses to texting," and group-text reversion is the stall's core failure. If session length forces drops, protect 3a/3b/3c; the packet's designated-droppable rules otherwise stand.
- **3h (drafts survive kill/reload)** directly serves the "check feels like homework" complaint — losing a half-done check is the homework-feel at its worst.
- While in the notification seam for 3c: capture (do NOT build) a half-page **P3-NOTIF push assessment** — what Web Push would take on this stack (PWA/Serwist), rough effort, and whether 3c's in-app+email loop plausibly beats SMS reach without it. Max decides after this packet; evidence, not advocacy.

## 2 · Ride-along (small, pre-authorized)

- **GAP-4 residual test:** the stale-hold bug itself is FIXED (#220 + `tests/step7-stale-hold-release.test.ts` — verified 2026-08-20). What's missing: a cron-route test covering the **advisory-lock connect-error branch** (the 500 `advisory-lock-connect-error` path from CC-30). One focused node test; if it threatens session length, drop it loudly in the handoff.

## 3 · Unchanged rules (restated because they bite here)

- Two server-touching items (3a/3c) — migration discipline + `withIdempotency` conventions apply; everything else is UI-layer.
- `tests/offline` untouched and green; `test:ui` for every new/changed component; no new deps without cause; no raw hex.
- PR(s) to `development`, evening merge on Max's go (D16). Session-close contract applies — including the same-day smoke rows for whatever ships, written into the refreshed `AHITS_PILOT_FLOOR_TODO.md` §1 Part B (not a new scratch list).

*One line to keep in view: every surface this packet touches must end the session strictly better than a text message — that is the whole reason it jumped the queue.*
