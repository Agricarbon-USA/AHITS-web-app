# AHITS — Design Direction & Reflective Assessment
### The four questions, answered with evidence · 2026-07-12

> STATUS: current · UPDATED: 2026-07-12 · READ-WITH: `AHITS_PHASE3_WORKPLAN_2026-07-10.md`, `AHITS_IDEA_COMPENDIUM.md`
> **Snapshot caveat:** grounded in the local working tree mid-CC-10, which appears behind `origin/development` (CC-07/08/09 changes not present in it). Items marked ⟲ should be re-checked against origin before acting — they may already be fixed.

---

## Q1 · Overall logic & comprehensiveness

**Verdict: the app is a very good ledger with almost no lens — roughly 50–55% of the intended machine, and the half that exists is now mostly *correct*.**

The last two weeks did exactly what the audit demanded, verified in source: the hold-race is dead (cancel flips status transactionally and throws on mismatch; `claimHeldStock` re-checks `releasedAt` under lock), transfer decline/cancel restore stock, IN_TRANSIT is finally written (the hub custody loop stopped being theater), the drift cron raises `INVENTORY_DRIFT` alerts instead of whispering to console, expired sessions return real 401s so the offline queue's parking works for the first time, and idempotency never re-executes. **The write-side ledger is no longer the weak point. Stale criticism of it should die.**

Domain scorecard: inventory/custody writes **solid** · auth/people **solid** · offline foundation **solid (gated on A6)** · deployments, transfers, maintenance, notifications **functional-with-gaps** · requests **backend solid / front skeletal** · daily checks **capture solid / read-side skeletal**.

**The defining imbalance is capture vs. legibility.** The app writes beautifully and barely reads: no admin surface shows a submitted daily check's answers/odometer/photos; `RequestLineEvent` (the hub audit trail) has zero readers; resolved transfers/handoffs are unreadable (every fetch is `?status=PENDING`); discrepancy notes vanish on action; alerts deep-link to list roots. And the thesis's own headline artifacts are at 0%: Today view, close-out ritual, week board, all three capstones, the money models.

**The single structural improvement:** the read-side substrate — Batch 6b's monolith split + query cache + aggregate reads (CC-12), with the Today view (CC-14) as its first consumer. It converts capture into legibility everywhere at once. Second place, far cheaper: the daily-check admin viewer (still the cheapest high-leverage stitch in the codebase).

## Q2 · Simplicity — the remaining levers, ranked

1. **Ship the pickup thread end-to-end** (CC-09 ⟲ — merged per your session; confirm the TTL-pause + residual-release acceptance items shipped with it). The flagship case of the app asking a human to remember what the system already knows.
2. **Live-camera QR scanning** — the most-repeated hardware gesture is still photo-capture→decode; the single biggest felt-friction kill (M).
3. **Simplicity by subtraction — delete, don't improve:** kill the vestigial `/operator/checkout` redirect + the duplicate dashboard card (two cards → one destination); one verb for Dismiss/Revoke; merge the two remove-gear flows in my-deployment; either wire material-request "fulfill" to stock or rename it honestly.
4. **Kill the required typed note** on deployment launch and every kit mutation (presets or optional) — a daily friction-budget violation (S).
5. **Glossary: one term per state** (~15 sites: Stage/Prepared, Fulfill/Pick up/Check out/Claim) (S).
6. **Pickers & nav:** zero `Autocomplete` in the codebase — 200-item flat selects; Requests not thumb-reachable; confirm-on-cancel for requests (S each).
7. **Manager side:** URL-filter rollout beyond inventory ⟲, record-level deep links from alerts, bulk confirm on the request checklist.
8. **Two-dashboards IA:** the durable fix is Today (an operator-shaped read), not polishing the admin dashboard for operators.

**Model problems wearing UI costumes** (fix the model, the words fix themselves): Reservation and Deployment are disconnected models joined only in the operator's memory — that's *why* five words exist for two states (`Rig.requestId` is the load-bearing fix); StatusLink REVOKED is a link state pretending to be a custody resolution; three damage vocabularies are one `MaintenanceTask` wearing three UIs (CC-10's "one mental model" instruction is the fix — hold it to that).

## Q3 · Clean UI — the design-system direction

**Diagnosis: the app doesn't need a redesign; it needs *one* set of rules where it currently has five.** The theme is 45 lines; everything else drifted: **62 hardcoded hex values** (three files re-implement the brand palette by hand — the public portal, FulfillmentChecklist, ~offline), **~89 raw fontSize literals**, 175 row-Stacks with only 28 wraps, **3 filter-bar grammars**, ≥5 empty-state patterns, 2 stat-card systems, 3–4 toast systems, and a copy-pasted hand-rolled dense chip (`height:18, fontSize:10`) at 15+ sites that clips letter descenders — a large share of the literal "overlapping text/boundaries" feel. Two gems found: `StatCard` has a silent bug (`${color}18` on theme paths → invalid CSS → the icon tint renders transparent on every dashboard card), and **FulfillmentChecklist is an entire parallel unthemed design system rendered inside the themed admin app** — raw system-font buttons next to MUI buttons on the same screen, the most visible "two apps in one page" spot.

**Field-conditions failures (measured):** secondary amber `#ff8f00` on white = 2.3:1 contrast (hard fail) and warning-outlined chips = 3.6:1 *at the smallest font size in the app* — read in sunlight; the daily-check Yes/No toggles are ~32px tall (under the 44px glove floor) on *the* daily interaction; 43 `size="small"` controls on the primary operator surface; the photo-remove button is ~18px and literally edge-clipped. Ironically the hand-rolled public page got touch targets right (48px) — the MUI surfaces are the offenders.

**The plan (incremental, ~3 PRs, no visual redesign):**
- **(a) Tokens pass (M):** real type scale; one exported `tokens.ts` consumed by theme + the three rogue files (kills 46/62 hexes); fix warning/secondary contrast; a theme `dense` chip variant (h20/fs11) to kill the 15-site hack; 44px minimum on operator controls; fix the StatCard alpha bug; an ESLint rule forbidding hex literals outside tokens.
- **(b) 8 primitives, adopted in order:** DetailDrawer (`{xs:'100%',sm:480}` — finally kills the 540/560 clippers ⟲) → StatusChip v2 (dense+badges) → BannerStack (collapse OfflineBanner's up-to-7 stacked alerts to one, priority-ordered, in a true full-bleed AppShell slot) + toast unification → MobileCardTable (users/deployments/reports first) → EntityCard (bakes in `minWidth:0`+wrap so the overflow class can't recur) → EmptyState → PageHeader → FilterBar (unify Tabs/ToggleButtons, wired to `useUrlFilters`).
- **(c) One density standard per surface:** operator = large, one primary action, 44px, 16px actionable text, max one banner; admin desktop = dense but consistent (13px floor, enforced table minWidth); admin phone = never a table (cards); public portal = keep 48px, consume tokens.
- **(d) 10 quick fixes** for the "doesn't quite add up" feel, all S: the two drawers ⟲, the dense-chip variant, the StatCard bug, banner collapse, the five `mt:-0.5` Alert-action hacks, `minWidth:0` on kit/vehicle rows, table minWidths + truncate the vehicles `join(',')` cell, Snackbar offset above the bottom nav, PhotoCapture button inside bounds at 44px, kill the 3 inline toast systems.
- **One retirement:** rebuild FulfillmentChecklist on MUI + tokens (M) — the highest-leverage single consistency fix in the app.

## Q4 · Major concerns — mostly institutional now, not engineering

1. **Single-human dependency (HIGH).** Everything ships, smokes, and gets decided through one person driving AI sessions. Sentry has been "blocked on a DSN from Max" across three weeks of documents. There is no support story for the pilot's first 6am sync failure. *Cheapest mitigations:* the DSN (10 minutes); a one-page "operator can't sync" triage card a non-owner can follow; name a second human as pilot-hours contact.
2. **The pilot is a direction, not a plan (HIGH).** No document names who pilots, on which project, starting when, with what success criteria — while the *de facto* pilot has already begun (field feedback exists) ahead of the A6 gate, on staging where email is sandboxed and both hubs have no contact address. *Mitigation:* a one-page pilot charter (names, project, date, 3 metrics: adoption %, check time-to-complete, zero lost writes) + run A6 this week + decide when the email sandbox flips.
3. **Adoption-surface sequencing (MED-HIGH).** Integrity-first was correct — but the schedule currently permits launching the pilot onto the verified static menu, i.e., competing with texting using a directory. *Mitigation:* hold the pilot fortnight until Today ships, or land a Today-lite bridge (check-done chip + transfers row + pickup cards on the existing dashboard).
4. **Velocity without calibration (MED-HIGH).** ~9 workstreams merged in ~2 days; the always-current doc went self-inconsistent within a day of its own contract (STATUS §1 vs §2), and this review was nearly conducted on a stale tree. *Mitigation:* session-close adds a 60-second code-grep verification of each claimed merge; component-level tests remain absent (lib/API only).
5. **Data quality has no reader (MED, rising).** The pencil-whipping plan (time-to-complete, variance check) is thoughtful but currently unfalsifiable: nobody can see a check's contents, so diligent and pencil-whipped are indistinguishable to every surface. *Mitigation:* the daily-check viewer + put the variance check on a calendar with a name.
6. **One nobody's tracking:** staging's 10-minute cron is now the pilot's production heartbeat (TTL release, alerts, drift watchdog) with no failure alarm — if it silently stops, holds never expire and drift goes undetected, invisibly. A ping-on-silence check is ~an hour.
7. **Trust asymmetry (MED-LOW now, rising with the Map).** The app records much about operators before the pay-me loop balances it; D2's crew visibility lands *before* earnings. Cheap hedge: operator-facing views of their own history, and keep D2 framed operator-first.

---

*Sources: design-seat visual audit + Fable reflective assessment (2026-07-12), both file:line-grounded on the working-tree snapshot; prior six-seat audit digests; live walkthrough 2026-07-10.*
