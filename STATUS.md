# AHITS — STATUS  ·  the one always-current doc — read me first

_Last updated: **2026-07-16 (session 7)**. If this date is more than a session old, trust the code and `git log` over this file, and update it._

> **Before re-opening any settled "should we…" question, read `DECISIONS.md`.** The big ones (prod deferred, Map scope, admin exclusion, W0-10 sequencing) are settled — don't re-litigate them.

## 1. One-paragraph state
AHITS is at the pilot doorstep, running on **staging**. The hard architecture is done and audit-verified. Merged to `development` (→ staging): CC-01 through CC-11, Wave-0 patches, and the doc-cleanup corpus. **CC-11 admin-as-operator shipped (PR #181, `a97079b`):** an admin can now hold a rig, be a transfer/handoff recipient, and accept transfers/handoffs — all writing `deployment_assignments` PRIMARY rows, never the legacy column; admin-held rigs are flagged distinctly (not excluded outright) in the missed-check cron and both dashboard surfaces, and excluded from payroll attribution per D3 via a `role`-carrying hook — D3's note makes this a HARD acceptance criterion on CC-17. **CC-22 pilot ops rider shipped (PR #182, `d3d1537`):** a cron dead-man heartbeat (external `CRON_HEARTBEAT_URL` ping + in-app `notification_config.cronLastRunAt`; a `CRON_SILENT` alert raised on the admin-alerts read path when the cron goes quiet >30 min, re-armed by the next successful run) and manual runtime Sentry wiring (server reads `SENTRY_DSN` in `instrumentation.ts`; DSN + `x-request-id` passed to the client via a provider — no `NEXT_PUBLIC_`, no hardcoded DSN; CSP `connect-src` extended for the Sentry ingest hosts). Both no-op cleanly when their secret is absent. The two staging secrets (`AHITS_CRON_HEARTBEAT_URL`, `AHITS_SENTRY_DSN`) are provisioned. **CC-23 design-system substrate shipped (PR #183, `200e528`):** one `src/theme/tokens.ts` (palette/type/spacing/density) consumed by the MUI theme and the rogue raw-HTML surfaces (`~offline`, `s/[token]`); an AA amber contrast fix (`#9a5b00`, 5.4:1, replacing the WCAG-failing `#ff8f00`); the StatCard icon-tint alpha fix; a no-hex ESLint rule (color-hex outside `tokens.ts` + the CC-27-pending allowlist driven to **0**); and the first 3 primitives — DetailDrawer (adopted on all 5 admin drawers, each keeping its width), StatusChip v2 (semantic status mode unchanged + new dense free-label badge mode), BannerStack (collapse-to-one, full-bleed AppShell slot) — plus a jsdom + RTL component-test harness (`npm run test:ui`, wired into the CI verify job). **CC-24 addendum shipped (PR #184, `51a459f`):** three My-Deployment Android device-pass fixes — responsive action row (End Deployment no longer clips at 390px; all three now outlined), consistent kit-type chips (item type, one casing), 44px remove-tap targets. **The full CC-24 packet (subtraction + glossary) is still to come — the addendum is only the device-pass subset.** Production is deliberately deferred (see D1).

## 2. Environments
- **development → staging:** the live working line. Has the full Wave-0 hardening + W0-10 through PR-4a + CC-01 through CC-11 + CC-22 + CC-23 + the CC-24 addendum (My-Deployment device-pass fixes). **Smoke on staging after every merge.**
- **production:** the git branch is now *current* (PR #144 merged 2026-07-11, `c0d231b`) but there is **NO prod environment** — no Supabase project, no `AHITS_PROD_*` secrets — so nothing is deployed and the triggered deploy failed harmlessly. **Prod is deferred; see `DECISIONS.md` D1 before touching anything prod.**

## 3. Active work — in flight right now
- **A6 device pass** — the pilot gate; human-run on real iOS + Android hardware; **not started — run in parallel with the reflection-increment packets below**.
- **CC-22 live acceptance pass (Max, on staging)** — the code shipped and smoked, but three checks need real credentials/timing I couldn't exercise from a sandbox: (a) with the real `SENTRY_DSN`, use the `/admin/settings` → Sentry diagnostics buttons to confirm a server error and a client error both capture with `request_id` attached (client event passes CSP); (b) confirm the healthchecks.io ping fires on a real cron run; (c) stop the staging cron >30 min → confirm `CRON_SILENT` appears on the admin dashboard and the next successful run resolves it.
- **CC-23 / CC-24 visual re-check on a real device (Max)** — the deploy smoke confirmed the rendered deltas (AA amber, StatCard tints, semantic chips unchanged + dense badges, table truncation, clean layout, consistent kit chips), but four interaction/viewport checks couldn't be driven from the sandbox browser (row-clicks/typing didn't register, and the window wouldn't render below desktop width): the 5 admin drawers' content at their widths (no clip), the daily-check 44px Yes/No toggles mid-flow, the OfflineBanner collapse-to-one when offline, and the CC-24 action-row vertical stack at true 390px. All are mechanical/responsive changes with passing component tests — worth a 2-min eyeball on the next device pass.

## 4. Next actions (ordered)
1. **CC-24** (the full packet — subtraction + glossary) → **CC-25** (live-camera QR) — the remaining reflection-increment packets, per `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`. (**CC-23 shipped** — PR #183, `200e528`. The **CC-24 addendum** — 3 My-Deployment device-pass fixes — shipped as PR #184, `51a459f`, but the full CC-24 subtraction/glossary packet is still to do.)
2. Then **CC-12** (Batch 6b/perf) → **CC-14** (Today view) → **CC-26** (daily-check viewer — must land before the pilot fortnight) → **pilot fortnight** (CC-27 as scheduled filler) → CC-15/16/17/18.
3. Run the **A6 device pass** in parallel, starting now.
4. **D5/D6/D7 are open PENDING decisions** — need Max's call before the pilot fortnight starts (see `DECISIONS.md`). (D8 was resolved last session, folded into D3.)

## 5. Open decisions (undecided — need a human)
- **D5** — hold the pilot fortnight for Today (CC-14), or ship the Today-lite bridge (CC-28)? See `AHITS_PILOT_CHARTER.md` §5.
- **D6** — EMAIL_SANDBOX global flip timing, after the two-part audit.
- **D7** — name a second pilot-hours contact.
- Governance sweep items (push vs 45s polling; CARRY-* build-or-descope) — see workplan §13.
- Mounted collection units: reuse-vs-new-model design decision (CC-21 spike) before building.

## 6. Do-not-touch / deferred (pointers only — these are NOT gates)
- **Production cutover** → DEFERRED, see `DECISIONS.md` D1 + `AHITS_PROD_CUTOVER_DEFERRED.md`.
- **W0-10 `4b′`/`4c` patches** → HELD, see `DECISIONS.md` D4 (they live in `held/`).
- **Real-time GPS tracking** → permanent anti-goal, see `DECISIONS.md` D2 (crew visibility is last-known only).

## 7. Map to the deep docs
- **Start here / corpus map:** `00_START_HERE.md`
- **Plan of record:** `AHITS_PHASE3_WORKPLAN_2026-07-10.md` · **Paste-ready packets:** `AHITS_CLAUDE_CODE_INSTRUCTIONS.md` (canonical, supersedes the dated `_2026-07-10`/`_2026-07-12` packet docs) · **Landing order + smoke:** `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`
- **Deep assessment:** `AHITS_STATE_OF_THE_APP_2026-07-10.md` · **Strategy:** `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` · **Sequence:** `AHITS_MASTER_ROADMAP.md` · **One-pager:** `AHITS_ROADMAP_EXEC_SUMMARY.md`
- **Decisions:** `DECISIONS.md` · **Latest handoff:** `AHITS_SESSION_HANDOFF_2026-07-16.md` · **Rules for changing code:** `CLAUDE.md`

---

## SESSION CLOSE — do all 7 (≈6 min). This is the durability contract.
> **§1 ≡ §2 invariant:** the merged set named in §1 (one-paragraph state) MUST match the merged set listed in §2 (environments). If they disagree, §2's code-grounded list wins — reconcile §1 to it before closing.
1. **`STATUS.md`** — update §1 state, §3 active work, §4 next actions, and the date line.
2. **`DECISIONS.md`** — append any decision made this session (new `Dn`); mark superseded ones.
3. **`00_START_HERE.md` / `docs/INDEX.md`** — if you added/superseded/moved a doc, fix the row.
4. **Handoff** — write `AHITS_SESSION_HANDOFF_<date>.md`: what shipped + resume points; reference decisions by `Dn`, don't re-narrate them.
5. **Commit + push** all docs to git. (`git add -A && git commit && git push`.)
6. **Sanity:** `git status` clean, and confirm the docs you wrote appear in `git ls-files '*.md'`. **If a doc you wrote isn't tracked, it does not exist for the next session.**
7. **Verify every merge you claimed (60 seconds).** For each packet you marked merged in §1/§2, grep the code for ONE acceptance string that only exists if that packet landed. Canonical anchors for the new packets: CC-22 → `CRON_SILENT` · CC-23 → the tokens.ts import in the theme · CC-24 → `Mark handled` · CC-25 → `QrScannerDialog` · CC-26 → the daily-check viewer route path · CC-27 → an MUI import in FulfillmentChecklist. If the string is absent, the claim is wrong — CORRECT §1/§2 before closing, do not close on an unverified claim. Velocity without this check is how STATUS went self-inconsistent within a day of its own contract.
