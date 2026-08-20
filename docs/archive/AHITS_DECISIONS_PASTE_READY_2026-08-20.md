# AHITS — DECISIONS.md paste blocks · ready 2026-08-20

> STATUS: paste-ready staging file (NOT the register — `DECISIONS.md` is) · WROTE: 2026-08-20 by the resume review
> WHY THIS FILE: the corpus rule is "Max writes decisions, not the session" (STATUS §3, UXP-1 row). These blocks are drafted to the house format so recording them is a 5-minute paste, not an archaeology session. D30–D32 reconstruct exactly what shipped in UXP-1 (#232/#233); D33–D35 are TODAY'S candidates — **read, edit if needed, initial, then paste.** Numbering verified against DECISIONS.md (ends at D29 as of today; the program doc's "D33/D34" reservations are renumbered here accordingly).
> AFTER PASTING: delete this file or move it to `docs/archive/` — it must not outlive its purpose and become a second register.

---

## 1 · Paste these three verbatim (they record what already shipped)

### D30 · Operator bottom nav returns to FIVE tabs — Map back to the drawer
- **Date:** 2026-07-30 · **Owner:** Max · **Status:** ACTIVE · **Shipped:** UXP-1 PR-1 #232 (tip `3264175`), merged 2026-07-30
- **Decision:** the operator bottom bar returns to FIVE tabs, superseding D28's six. Home / Check / My Deployment / Requests / Scan. The Map ITEM leaves the bar (D28's six-tab promotion reverted); the `/operator/map` route and the drawer's "Crew Map" entry stay. `minWidth:0`/`px:0.5` override fits five tabs at 320–430px. A snapshot test pins the label set so a sixth tab fails loudly, citing this decision.
- **Revisit triggers:** a device pass showing five tabs unusable on a cohort phone, or Map usage data justifying a bar slot.
- **Rationale:** UXP-1 finding 1.1 — six tabs at 320px clipped labels and shrank tap targets below the 44px floor; Map is a reference surface, not a daily verb.

---

### D31 · The update prompt goes quiet + auto-apply
- **Date:** 2026-07-30 · **Owner:** Max · **Status:** ACTIVE · **Shipped:** UXP-1 PR-1 #232, merged 2026-07-30
- **Decision:** update prompting goes quiet + auto-apply. `ServiceWorkerUpdater.tsx` only: a `hadController` guard kills the false "new version" toast on first install; the snackbar lifts above the tab bar, is dismissible, auto-hides ~8s, re-offers on `visibilitychange`; action color `inherit`. **`sw.ts` untouched** — skipWaiting/clientsClaim still auto-apply on next launch; the evening-deploy rule (D16) remains the guardrail against mid-shift swaps.
- **Revisit triggers:** a mid-shift chunk-swap incident, or an operator reporting a missed critical update.
- **Rationale:** UXP-1 finding 1.2 — the old prompt fired on fresh installs (trust-killer for a new operator's first minute) and sat under the tab bar where thumbs dismissed it accidentally.

---

### D32 · The operator shell keys on DEVICE CLASS, not viewport width
- **Date:** 2026-07-30 · **Owner:** Max · **Status:** ACTIVE · **Shipped:** UXP-1 PR-2 #233 (tip `9d0ee18`), merged 2026-07-30
- **Decision:** the operator shell keys on device class, not viewport width. `AppShell` gains `shellMode`: operator surfaces use coarse-pointer OR `down('lg')` → phone shell; rotation NEVER swaps the shell mid-use. Admin keeps `down('md')`. `manifest.json` adds `portrait-primary`. ONE heuristic, no per-page overrides.
- **Revisit triggers:** a real tablet cohort (coarse-pointer + large screen wanting the desktop composition).
- **Rationale:** UXP-1 findings 1.3/1.4 — landscape rotation swapped operators into the desktop drawer shell mid-task ("the app changed"), and the pre-mount default rendered desktop-first on phones (hydration flash + mismatch risk).

**…and mark D28:** append ` · Superseded-by: D30` to D28's **Status** line.

---

## 2 · Today's candidates (edit → initial → paste; renumbered, see banner)

### D33 · Pilot attempt-1 window VOID — relaunch is a fresh first-operator-live (CANDIDATE — needs Max's initials)
- **Date:** 2026-08-20 · **Owner:** Max · **Status:** ACTIVE (once initialed)
- **Decision:** pilot attempt-1's window is VOID; the relaunch is a fresh first-operator-live. Attempt 1 (~2026-07-30 → ~08-06): 2–3 operators, ~a week of real use, then reversion to group texts/emails. The TODO §5 gate never validly opened (§1 unticked, no one-pager, nothing recorded), so the charter fortnight never started — the window is VOID, not a scored fail. Causes on record: owner bandwidth · daily check "feels like homework" · equipment-creation/day-to-day friction · trust. **Attempt-1 data stays** (snapshot-per-day metrics score those days honestly); the gap is annotated in the pilot log, never the DB. Relaunch = a new first-operator-live under D17's rolling rule, gated by the refreshed `AHITS_PILOT_FLOOR_TODO.md` §4, with the clock ticked the day the first check lands in `/admin/pilot`.
- **Revisit triggers:** none — this records history. The relaunch gate lives in the TODO.
- **Rationale:** the corpus's own "Schrödinger's gate" rule (D17; A6 banner): a gate without a recorded result never ran. Retro-scoring an ungated week as a charter fortnight would poison Metric 1 forever.

---

### D34 · RL-1 (Airtable read layer) SHELVED (CANDIDATE — needs Max's initials)
- **Date:** 2026-08-20 · **Owner:** Max · **Status:** ACTIVE (once initialed)
- **Decision:** the bake-off's Wave-1 read layer (RL-1) does not build now. Consequences accepted with eyes open: stakeholder drivers #1 (manager reporting) and #2 (Airtable familiarity) stay answered by argument, not artifact; the 60-day falsifier (a program §6 monitor) and the no-write-back rule (the program's reserved "D33") are deferred with it — **not** recorded as active; the program's other reservation ("D34", the D1 cutover trigger) is RL-1-independent and pastes today as D35; **CC-18 reverts to undecided** (its "absorbed by RL-1's week board" logic has no falsifier to wait on). Everything RL-1-independent stands: M-1, SEC-1, GAP register, CC-17 gates, monitors minus sync-age/falsifier/write-back lines. The program's §5 packet stays on file, build-ready.
- **Revisit triggers:** a manager asks for a view twice in one month · any stakeholder re-opens build-vs-buy · CC-17 design needs the reporting seam · 6 months elapsed. Cheapest interim answer to driver #1 if pressure arrives early: the Looker-on-Postgres rung (bake-off §4).
- **Rationale:** owner call 2026-08-20 — with the pilot stalled at 2–3 operators, the read layer's customer barely exists; relaunch and adoption outrank manager reporting for the next waves.

---

### D35 · The D1 prod-cutover trigger, written down (GAP-6) (CANDIDATE — needs Max's initials)
- **Date:** 2026-08-20 · **Owner:** Max · **Status:** ACTIVE (once initialed) · **Read-with:** D1, D16
- **Decision:** production stands up at the EARLIER of: **(a)** CC-17 code-complete before the first real payroll period it would serve — money does not live on staging; **(b)** >20 concurrently active operators; **(c)** a UK-parent IT/compliance requirement naming production isolation. Until a trigger fires, D1/D16 govern: staging is home, no reactive prod standup, `PROD_CUTOVER_RUNBOOK.md` is the playbook (and `AHITS_PROD_MIGRATE_URL` gets recreated at go-live, per the runbook's warning).
- **Revisit triggers:** the trigger list itself only via a written owner decision.
- **Rationale:** GAP-6 (Undisputed Program §1) — the one RL-1-independent decision that shared RL-1's paste session and must not fall off the truck; an unwritten trigger invites both premature standup and indefinite drift.

---

*Paste order: D30 → D31 → D32 → D28 mark → D33 → D34 → D35. Then commit `DECISIONS.md` and archive this file.*
