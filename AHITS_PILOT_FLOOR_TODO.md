# AHITS — Pilot-Floor To-Do · one page, current as of 2026-07-28 evening (CC-31+CC-32 FULLY LANDED)

> STATUS: working checklist (snapshot — tick freely; `STATUS.md` stays canonical) · UPDATED: 2026-07-28
> Everything below comes from `AHITS_CC29-31_PILOT_FLOOR_PACKETS.md` + the CC-30 Max checklist + the owner riders (workplan §15). When this page and STATUS disagree, STATUS wins.
> **The one rule: no operator onboards until section 1 is fully checked.**
> **Six-seat pre-execution review DONE (2026-07-29): all three queued packets hardened — paste each with its rider from `AHITS_PACKET_ERRATA_2026-07-29.md`. Order confirmed: CC-16S → CC-33 → CC-34.**

---

## 1 · CC-29 — Offline trust floor (CODE DONE ✅ — phone smokes are the remaining first-operator gate)

- [x] ~~Merge PRs~~ **#202 / #203 / #205 / #207 all MERGED, CI + staging deploys green, session close done (D26/D27 recorded, tree clean)**
- [ ] **YOUR PHONE SMOKES — the one remaining gate** (exact steps: `AHITS_SESSION_HANDOFF_2026-07-28_CC29-BUILD.md` + STATUS §3):
  - [ ] Airplane mode → submit check → reconnect → syncs exactly once
  - [ ] Weak signal → submit → "saved, will sync" within ~12s, never a stuck spinner
  - [ ] Two tabs, 3 queued actions, reconnect → no false "Failed"; photo-wedge Discard works from Outbox
  - [ ] Forced-expired session, ONLINE submit → "check saved, sign in to send" (not "Unauthorized"); after sign-in it lands
  - [ ] **Overnight replay (start TONIGHT):** queue a check in airplane mode this evening → sync tomorrow morning → it shows under TODAY's date; tomorrow's real check untouched
  - [ ] Admin "force logout" still boots a phone on its next tap

## 2 · CC-30 — Ops floor (FULLY LANDED ✅ — all six step-7 anchors green, both deploys green)

- [x] ~~Merge PRs~~ **#204 (pipeline hardening) + #206 (server-side eyes) MERGED**; CC-29 mid-session collision handled (all 6 failed-transitions instrumented, 18 files/84 tests green)
- [x] **First post-#204 deploy.yml run: GREEN end-to-end** — migration-safety wiring confirmed sound (real BEFORE_SHA, diff ran, non-vacuous) AND the env-drift step passed its first execution (= pipeline-verified min-instances/sandbox values; console item e evidenced)
- [x] Clamp shipped on #206 (status-code only; operator-facing strings untouched; terminal-branch errMsg deliberately kept — app-authored diagnostics)
- [x] **#206 MERGED via the new pipeline** — genuinely BLOCKED until all 3 checks green on the updated branch; no override used. The gate works.
- [x] Doc follow-ups LANDED (PR #208, via the new protection): e/f/g ticked with evidence · handoff items folded · parallel-session rule in the close contract · a step-7 anchor bug fixed (session-edge.ts path) · §1≡§2 invariant maintained
- Notes: pr-staging-deploy's migrate step was DROPPED (safer than gated — overridable if you ever want DB-backed previews) · the migration gate is false-green when run locally on macOS (CI is the only authoritative run) · DECISIONS untouched, D16 governs

**Your console checklist — the FINAL SIX, all genuinely yours (record each in STATUS §3):**
- [ ] **(a) Supabase → Backups:** note plan/retention · enable PITR if offered · run ONE restore drill to a throwaway project (~15 min) · write the steps into `PILOT_ROLLBACK.md`  ← *the single biggest unprotected risk*
- [ ] **(b) healthchecks.io:** confirm a real cron ping arrived · set grace period < 30 min
- [ ] **(c) Cloud Scheduler:** pause cron > 30 min → CRON_SILENT banner appears → resume → it clears
- [ ] **(d) Sentry:** fire the two test buttons in /admin/settings → both events arrive with request_id
- [x] **Cloud Run min-instances = 1** — verified by the env-drift step's first green run (glance at the console once if you want the human cross-check)
- [x] **GitHub branch protection: COMPLETE** — approvals 0, all 3 checks required, strict, force-pushes off · **`deploy-staging` label DELETED** (verified 0 hits)
- [ ] **(h) Mapbox:** token is a pk. public token, URL-restricted to the staging domain
- [ ] *(i, optional, 5 min)* uptime check on `/api/health`

## 3 · Your owner items (no code, no session needed — all cheap, two are capture-now-or-lose-it)

- [x] **CC-32 word list CONFIRMED (Max, 2026-07-28)** — confirmation line included in the CC-32 paste ✓
- [ ] **Clockify export + tap count** (capture-now: dies when Clockify is replaced): full CSV history export + count its real daily taps per operator
- [ ] **Mounted-units template bridge** (~30 min, zero code — D24): admin checklist editor → add Wintex items to the Can-Am template, Giddings items to the Bobcat template; add their service schedules as named maintenance tasks on those vehicles
- [ ] **Stewart:** create his ADMIN account (guide gets written with CC-31)
- [ ] **Onboarding one-pager** (rolling start = you won't be present every time)
- [ ] **Group-text baseline** (jot this week's volume — the adoption metric's control arm)
- [ ] **Triage card:** add one "someone gets hurt" line

## 4 · The packet queue

| # | Packet | What it is | State |
|---|--------|-----------|-------|
| ✅ | CC-29 | Offline trust floor | code DONE — your phone smokes remain (§1) |
| ✅ | CC-30 | Ops floor | DONE end-to-end |
| ✅ | **CC-32** | Friction & flow | **FULLY LANDED** — #209 glossary + #210 + #211 + #212 docs all merged (shepherded by CC-31 post-green) |
| ✅ | **CC-31** | Accuracy + /admin/pilot dashboard | **FULLY LANDED** — PR-1 + #214 (dashboard) + #215 + #213 green-fix + docs #216-218; browser-smoked pre-merge on preview services |
| ✅~ | **CC-16S** | Public-link security + TTL warmup | **#220 + #221 MERGED & LIVE on staging** (deploy-guard run; nonce fix in). Remaining: say "go" on #222 docs · portal 3-part eyeball smoke · one cron watch (= TTL first fire + CC-31 retro smoke + PIN self-clear) · preview-service delete via Cloud Console. |
| ✅ | **CC-33** | Simplify & unify | **#223 + #224 MERGED 2026-07-29, both staging deploys GREEN. D21/D22 EXECUTED.** FORWARDED-drain SELECT ran read-only → **0 live rows** (no drain needed). Anti-regrowth met (1,924→1,905); handoff grep = 0. **Owed (you, physical): the two-phone Transfer smoke on live staging.** ("Text the crew" moot until onboarding — put "Transfer" in the one-pager instead.) |
| ▶ LAST | **CC-34** | Maintenance speaks | **paste WITH Rider C** (BLOCKING fixes: vehicle-status fetch premise, consumable alert-key trap, photo backstop, stale-nag backfill guard, in-kit repair close, session SPLIT: PR-1+2 then PR-3; D29 appends at PR-1 close) |

**Incident CLOSED (evening):** #213 landed 3 root-cause fixes, dev went green, the full convoy merged. Residual items now live in §2b below.

**§2b · Post-convoy residuals (yours):**
- [ ] **Retroactive PR-1 smoke** (staging): one cron force-run watched in the bell (INV-5 no longer cries wolf on a normal end-of-deployment) + lock/reset a test PIN → PIN_LOCKED self-clears
- [ ] **Delete the two preview services:** `gcloud run services delete ahits-web-app-preview-cc31-pr3 ahits-web-app-preview-cc31-pr2 --region us-central1`
- [ ] **GitHub: "Include administrators" ON** — dev is green, nothing needs a direct push anymore; this seals the incident category permanently
- [ ] Note: the expired-link smoke correctly freed one genuinely-stranded unit on staging (Manual Corer → AVAILABLE) — expected, recorded
- [ ] Optional: ask any session to remove the `ahits-cc31-worktree` folder when convenient

**Parallel-run rules (unchanged):** first-started session owns STATUS/DECISIONS; both touch `daily-check/page.tsx` at one point (second-to-merge rebases); CC-31's index migration = the migration gate's first real-migration run (watch it pass).

## 5 · First-operator gate (the finish line of this page)

- [ ] All of §1 checked (CC-29 merged + smoked) — **the hard gate**
- [ ] §2 merges done + backups/restore drill done — strongly recommended before day 1
- [ ] Onboard operator #1 using the one-pager · watch their first check land in the viewer · fortnight clock starts

**Parked / not on this page by decision:** CC-16-proper (D18) · secondary-operator packet (pre-CC-17) · CC-17 Clockify replacement (post-floor; measure taps first, D19) · CC-18 week board · shipment tracking (D23, post-CC-17) · weather stamps (CC-17 rider) · everything in DECISIONS' parked registry.
