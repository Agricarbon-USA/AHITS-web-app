# Session handoff · 2026-09-03 · UXP-3 Flow Closers + UXP-6 Admin Setup (two branches, ready to push)

> STATUS: handoff (resume points for the next session) · WROTE: 2026-09-03 (Cowork session, owner present)
> READ-WITH: `AHITS_UX_PACKETS_2026-07-29.md` (UXP-3 packet + the new UXP-6 packet block) · `AHITS_UXP3_RIDER_2026-08-20.md` · DECISIONS.md D36 (executed here), **D38** (new) · `AHITS_PILOT_FLOOR_TODO.md` Part 4
> METHOD: 4 planners → 8 builders in isolated worktrees (A1/B/C → A2 · 6a → 6d/6c/6b+6e) → 2 antagonist reviewers + 1 focused hook reviewer → 2 fixers. Every wave re-verified on the integrated tree. **The DB test suite could not run in the build sandbox (no Prisma engine); CI is the gate for the node tests — do not merge red.**

---

## 1 · What was built (two stacked branches on `development` @ `d050015`)

**PR-1 · `feature/20260903/Agricarbon-USA-uxp3-flow-closers`** — UXP-3 in full (3a–3j) + rider ride-alongs:
- **3a** GPS ceiling: a check enqueues within 8 s even in permission-limbo; granted/denied/offline bodies byte-identical.
- **3b** Lockout tells the truth: `verifyPinDetailed()`; login 401 carries `locked` + `lockedUntil` only after the unknown/inactive/role gates; card "Too many attempts — locked until HH:MM. Contact your ops lead if urgent."; change-pin says the same. **Threat-model note needs Max's sign-off in the PR (see §4).**
- **3c** Mark Handled notifies the requester (the headline): MATERIAL `fulfill` now fires the same notification as `complete`; admin toast "Marked handled — {name} notified"; REQUESTED button "Fulfill" → "Mark Handled" (F-03 — was NOT done in CC-24; only the FORWARDED button had been renamed); bell link lands on the operator's **Closed** tab (`?tab=closed`).
- **3d** Deployments get projects: both New-Deployment dialogs extracted to components (`my-deployment/page.tsx` **1,939 → 1,476 lines**, D21 satisfied); Project pick in both; admin review summary on the Start step; B-14 stepper labels at xs.
- **3e** Post-action truth: badges recount within 2 s of accept/decline (`notifyIncomingPendingChanged`); validation reject scrolls to the failing field with an inline error; "Done" on Today is a tappable read-only summary of today's check + "Redo check (replaces today's)".
- **3f** Composer opens on Request materials when the operator has an active rig; remembers last-used mode.
- **3g** Photos per **D36**: library attach allowed everywhere (`capture` removed); max-5 surfaced instead of silently dropped; unit "Report a problem" and INOPERABLE returns no longer require a photo (server clauses removed; `localphoto:` 422 guard kept).
- **3h** Drafts survive: half-done check stored per user+vehicle+day in localStorage, restored with a notice on reopen/relogin/vehicle switch; purged on logout and when the day changes.
- **3i** One-line offline-saves banner, dismissal remembered 90 days.
- **3j** Preselects the first vehicle without a check today (also after "Start New Check"); a late server reply can never flip a pick the operator already made.
- Ride-along: `tests/cc30-cron-lock-connect-error.test.ts` pins the advisory-lock connect-error 500 (the last GAP-4 residual).

**PR-2 · `feature/20260903/Agricarbon-USA-uxp6-admin-setup`** (stacked on PR-1) — UXP-6 Tier 1:
- **6a** `EntityFormDialog` (one create/edit grammar: pinned Save/Cancel, Enter submits, inline field errors + scroll-to-first, "Discard changes?" guard, Back-to-close, `Save & add another` slot, toast `action`), `parseApiError`, `useDirtyState`, `SearchableSelect` `error` prop. **Recorded as D38.**
- **6d** Admin Start Deployment on the grammar: operator/project/hub as SearchableSelects; pickers refetch after every create and every 409 (T2); a 409 drops only the unit/vehicle that was actually taken, named, and keeps the rest (T1 — the kit-pick wipe is gone); drawer Add Items works for consumables and surfaces errors (T3); unit labels from the API (T8); toast "Deployment started for {name} · Open".
- **6c** Add/Edit item on the grammar: serialized items create their units with the item (count + serials, T4); consumable stock can't be lost to a missing hub (T5); edits can clear fields (T6); Move stock / Add stock / Invite / Manage account get pinned actions (C7).
- **6b** Add/Edit vehicle on the grammar: scan an existing QR sticker at create; drawer **Setup** block (daily checklist · service schedules · QR label download) with deep-links into the checklist editor and the CC-34 schedule dialog (D24 connected); Duplicate.
- **6e** Checklist editor on the grammar; entry from Vehicles ("Checklists" button, per-type "Using: …"); `?checklist=<TYPE>` deep-link; duplicate-active warning (T7); Duplicate.
- `useHistoryGuard` (UXP-1e) rewritten to be **nest-aware** with deferred arming — one Back closes one overlay, a form opened from a drawer no longer closes itself on arrival in real browsers, StrictMode double-effects no longer bounce. Rules R1–R6 in the hook header; 18 tests emulate real traversal.

## 2 · Verification (what passed where)

| Gate | PR-1 branch | PR-2 branch (superset) |
|---|---|---|
| `tsc --noEmit` | 0 errors | 0 errors |
| `eslint` | 0 errors / 48 warnings (= baseline) | 0 errors / 47 warnings |
| `npm run test:ui` | **40 files / 250 tests** (baseline 27/130) | **52 files / 390 tests** |
| `next build --webpack` | compiles | compiles |
| node DB suite (`npm test`) | **CI only** — new: `uxp3-fulfill-notifies` (4) · `uxp3-login-lockout` (9) · `auth-pin-session` +5 · `uxp3-photos-d36` (3) · `cc30-cron-lock-connect-error` (2) · `cc34-report-and-promote` no-photo case flipped to 201 | same |

Node-suite risk points if CI goes red: the two mocked-`DIRECT_URL` cron tests (env restore) and the login-lockout route tests (`next/headers` fake). Everything else mirrors existing files line-for-line.

## 3 · Owner steps (plain)

```bash
cd ~/Downloads/"Agricarbon US Codebase"
git checkout development && git pull
git push -u origin feature/20260903/Agricarbon-USA-uxp3-flow-closers
git push -u origin feature/20260903/Agricarbon-USA-uxp6-admin-setup
```
Then open two PRs on GitHub (bodies in §4): **PR-1 base `development`**; **PR-2 base = PR-1's branch**. Merge PR-1 first, evening, watch the five deploy jobs; merge PR-2 the next evening after its own smoke.

> **CORRECTION (2026-09-07, learned the hard way).** GitHub does **not** retarget a stacked PR when its base branch is deleted on merge — it **closes** it, and a PR closed that way is **unrecoverable**: you cannot change the base of a closed PR, and reopen is refused *even after you recreate the base branch*. That is what happened to PR-2 (#237); it had to be re-proposed as a new PR (#238). Two further traps: `ci.yml` is `pull_request: branches: [production, development]`, which matches on the **base**, so a stacked PR gets **no CI at all** while its base is a feature branch; and `verify.yml` is `workflow_call:`-only, so there is nothing to dispatch by hand.
>
> **What actually works — do this BEFORE merging PR-1 with `--delete-branch`,** while PR-2's base branch still exists:
> - **Preferred — rebase PR-2 onto `development` and force-push.** After PR-1 merges, its content is on `development`, so PR-2 no longer needs to carry it:
>   ```bash
>   git branch backup/<topic>-prerebase <pr2-branch>            # keep a handle on the pre-rebase history
>   git rebase --onto development <pr1-tip-sha> <pr2-branch>    # merge commits are dropped; that is fine
>   git rev-parse '<pr2-branch>^{tree}'                         # MUST equal the pre-rebase tree
>   git push --force-with-lease origin <pr2-branch>
>   ```
>   Compare **trees**, not file counts — a rebase can complete and still lose a hunk. The force-push fires `synchronize`, which starts CI once the base is `development`.
> - **Or `gh pr close <n> && gh pr reopen <n>`** to kick CI — but this only works **while the base branch still exists**. Once PR-1 is merged with `--delete-branch`, it is too late and the only path left is opening a fresh PR.
>
> If you have already merged PR-1 and lost PR-2: rebase the branch as above, `gh pr create` a replacement with the same title/body from §4, and comment the new number on the dead PR.

## 4 · PR bodies (paste)

**PR-1 = #236 — ✅ MERGED 2026-09-07** (squash `aff2fac`, deploy green, revision `ahits-web-app-staging-00419-tpw`). 3b threat-model signed off by Max in the merge.

**PR-1 title:** `UXP-3 Flow Closers — 3a–3j + rider (GAP-4 residual test)`
> Builds the UXP-3 packet (AHITS_UX_PACKETS_2026-07-29.md §UXP-3) with the 2026-08-20 rider. UI-layer except the three named server touches: 3b lockout flag on login/change-pin (strings + one boolean), 3c the MATERIAL fulfill notification (mirrors the `complete` arm behind the status-guarded UPDATE; replay = 409, no double fire), 3g photo policy per D36 (report-problem / INOPERABLE no longer require a photo; `localphoto:` 422 guard kept). No schema, no deps, no sw.ts/offline-queue changes. F-03 done here (CC-24 had renamed only the FORWARDED button). my-deployment/page.tsx 1,939 → 1,476 (D21).
> **3b threat-model — needs owner sign-off:** a guesser who hits a REAL email 5× now learns the account exists and is locked (today all failures are indistinguishable). Bounded by the per-IP limiter (15/5 min, unchanged, still 429 without a `locked` key), the 15-minute lock, 6-digit PINs and the tool being internal; unknown/inactive/wrong-role logins keep the byte-identical generic 401 (pinned by tests). Lock-a-coworker DoS was already possible — 3b only makes it visible and actionable.
> Verification: tsc 0 · eslint 0 errors · test:ui 40 files/250 · next build OK. The node DB suite was not runnable in the build sandbox — CI is the gate; do not merge red.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
>
> https://claude.ai/code/session_012ccD9iLZcBJs5PwqjTmPkL

**PR-2 = #238 — ✅ MERGED 2026-09-07** (squash `f701f92`, deploy green, revision `ahits-web-app-staging-00420-4s5`). **Not #237** — #237 was the original stacked PR and was auto-**closed** when its base branch was deleted on the merge of #236; GitHub did **not** retarget it, and it could not be reopened (see the CORRECTION in §3). The branch was rebased onto `development` (tree verified identical) and re-proposed as **#238**, which carries this same title and body. UXP-3's granular pre-squash history is preserved server-side at **`archive/uxp3-uxp6-prerebase`** (`d46b910`).

**PR-2 title:** `UXP-6 Admin Setup & Fleet Onboarding — one create/edit grammar (6a–6e) + nest-aware history guard`
> Stacked on PR-1. Implements the UXP-6 packet (Tier 1) from the 2026-09-03 audit: EntityFormDialog + error normaliser + dirty guard (D38), and the five admin flows on it — closing the audit's data-loss traps T1–T8 (409 kit-pick wipe, stale pickers, drawer Add-Items silent failure, units never created with a serialized item, consumable stock lost without a hub, edits unable to clear fields, duplicate-active checklists, wrong unit labels). "Nothing lost" verified field-by-field: every request body is unchanged or a superset (qrCodeId create-only; PATCH nulls only for schema-nullable keys; `unitId` no longer sent on item PATCH because the strict schema always rejected it). useHistoryGuard rewritten nest-aware (rules R1–R6 in the header) — required because a form opened from a drawer closed itself on arrival in real browsers; jsdom cannot see this, so the phone smoke matters. UI layer only; no schema, no deps.
> Verification: tsc 0 · eslint 0 errors · test:ui 52 files/390 · next build OK. Node DB suite: CI (no new node tests in this PR beyond PR-1's).
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
>
> https://claude.ai/code/session_012ccD9iLZcBJs5PwqjTmPkL

## 5 · Phone smoke — plain English (after each merge; tick same-day into the TODO)

**After PR-1 (operator phone + admin):**
1. Start a check, answer a few rows, kill the app from the switcher, reopen → "Restored your in-progress check", same step and answers.
2. File Truck 1's check, tap "Start New Check" → Truck 2 is preselected; if you pick a truck already checked you see "already filed … submitting replaces it".
3. Answer "No" on an item with no note, tap Next → it jumps to that row with a red "Required — describe the issue".
4. Location permission left unanswered → Submit still completes in ~8 s, check saved without coordinates.
5. Wrong PIN 5× → yellow card "locked until HH:MM"; a made-up email still says only "Invalid credentials".
6. Report a problem with camera denied → type notes → "Report without photo" → it lands for the admin. Add photo → phone offers camera OR library; pick 7 → 5 kept + the limit message.
7. Admin → Requests → a material request shows **Mark Handled** → tap → toast "Marked handled — <name> notified" → operator's bell rings and lands on the Closed tab.
8. Phone A sends a transfer, Phone B accepts → B's badge clears within ~2 s without changing tabs.
9. Today → tap a checked vehicle's "Done" → read-only summary of today's check → "Redo check" reopens it on that vehicle.
10. Start Deployment (both admin and operator) shows a Project pick; admin's last step shows the read-back.

**After PR-2 (admin on a phone — history-guard cases are the ones jsdom can't prove):**
1. Vehicles → Add vehicle → scan a sticker → Add → "Open" lands in the drawer → Setup rows show checklist / schedules / QR label → Download → scan it on operator/scan → resolves.
2. Drawer → Edit → change a field → tap the backdrop → "Discard changes?"; hardware Back does the same; Cancel brings the drawer back. **The Edit form must stay open on arrival.**
3. Inventory → Add item → Serialized, 3 units, paste 3 serials → drawer Units tab shows 3. Consumable qty 20 with no hub → blocked with a field error.
4. Inventory drawer → Move stock → hardware Back closes ONLY the dialog; second Back closes the drawer; third leaves the page.
5. Add item → type a name → press Enter → it saves and closes (Enter must NOT trigger "Save & add another").
6. Start two admin deployments back-to-back → the second offers only free vehicles/units. Have a second phone take a unit first → only that unit drops, by name; the consumable stays.
7. Settings → Add a second active Truck checklist → warning names the one that would lose.
8. Team → Invite → Enter submits; inline "Email is required" when blank.

## 6 · Deferred by name (not lost)

6f operator-builder 409 scoping parity (D21 budget) · EmptyState ×4 · "Repeat last deployment" · "Save & add another" on the vehicle form · `pageSize=200` on requests/my-deployment/maintenance lists (server clamps to 100; only the deployment pickers were fixed) · `downloadUnitQR` still duplicated in inventory (shared helper exists in `src/lib/qr-label.ts`) · UXP-6 Tier 2 (server/zod: 409 bodies with `code`+ids, nullable hub/category on PATCH, vehicle P2002 → 409, transactional item+units, one-active-template enforcement, bulk QR sheet) · P3-NOTIF (below) · the `ahits_identity` `.id` vs `userId` mismatch in `useOfflineQueue.currentUserId()` (Sentry tags read "unknown" — one-line fix, offline-engine file, deliberately untouched here).

## 7 · P3-NOTIF — Web Push assessment (rider deliverable; decision is Max's)

**Exists:** in-app `Notification` rows polled every 45 s **only while a page is open** (+ visibility change); Serwist SW has no `push`/`notificationclick` handlers; email goes to admins only and is sandboxed under D16 — so for operators, "in-app + email" means **in-app at next open**. **Web Push would take:** an additive `PushSubscription` model + migration, a VAPID key pair (2 secrets + Makefile mapping), the `web-push` dependency, subscribe/unsubscribe routes + logout handling, SW `push`/`notificationclick` handlers (touches the offline base → re-run A6-Lite), an opt-in UI, and a `notify()` fan-out at ~3 create sites. iOS needs 16.4+ AND the installed PWA. **Effort M–L (2–3 sessions + device verification), one migration, one dep** — outside the UXP rules. **Does 3c beat SMS without it?** SMS ≈ 100 % reach/instant; 3c = a guaranteed record + bell with latency bounded by the next app open (the daily check bounds it at "next morning") — wins "bags for tomorrow", loses "bags in an hour". **Cheap evidence first:** add a median/p90 `Notification.createdAt → readAt` latency tile to `/admin/pilot` for two weeks after 3c ships; if p90 beats typical handled-time, push is unnecessary; if reads cluster at the morning check, decide push vs an operator email carve-out (a D16/FND-16 decision, not code).

## 8 · Resume points for the next session

- If CI is red on PR-1: the failing test name maps to one cluster (§2); fix in a rider, do not weaken the test.
- Next build candidates, in order: UXP-2 Sunlight & Touch (unchanged packet) · the P3-NOTIF latency tile (one small packet) · UXP-6 Tier 2 when a server session is open anyway.
- Owner paper items unchanged (TODO Parts 1–3); Clockify export SHELVED for the next few weeks by owner call (noted in the TODO — it is still the CC-17 baseline and must happen before that build).
