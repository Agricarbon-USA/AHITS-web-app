# AHITS — Packet Landing Order & Smoke Checklist
### Keep this next to Claude Code · 2026-07-10

> ## ⛔️ PROD CUTOVER (CC-04, CC-05) IS DEFERRED — skip both for now
> **Postponed by decision 2026-07-10. It's its own separate step for actual go-live, and it gates nothing.** Do NOT run CC-04 or CC-05, don't create `AHITS_PROD_*` secrets, don't merge PR #144, leave the held W0-10 patches held. Everything else runs on staging without it. Full context: `AHITS_PROD_CUTOVER_DEFERRED.md`.

**The loop for every packet:** branch → change → verify gate (`make db-generate && npx tsc --noEmit && npx eslint src && npm test`) → PR to `development` → CI green → merge → **auto-deploys to staging** → smoke on staging → next packet. **One packet = one PR = one staging deploy.** Never stack packets into one PR. Production never moves automatically — only CC-04/CC-05 touch it, and only on your explicit go.

---

## Landing order

**Do first — the trust floor (before the prod cutover):**

1. **CC-01** Release-safety guards *(CI/pipeline — makes the cutover safe)*
2. **CC-02** Data-integrity fixes *(inventory-truth cluster)*
3. **CC-03** Offline & trust one-liners *(incl. the 401 fix)*
4. **Three pending patches** — land EmailLog-FAILED alert, URL-filters rollout, batch6a date-unify *(independent, reviewed)*

**⛔️ Prod cutover — DEFERRED, skip for now (see banner above):**

5. ~~**CC-04** Prod cutover~~ — DEFERRED to go-live
6. ~~**CC-05** Held 4b′ / 4c~~ — DEFERRED (patches stay held)

**Then Wave A / feel:**

7. **CC-06** Dashboard fix + vehicle-type enum
8. **CC-07** Mobile quick-win triage *(leaf-level only)*

**Wave B:**

9. **CC-08** Hubs discrepancy + bulk verify
10. **CC-09** Awaiting-Pickup thread
11. **CC-10** Field-fix logging
12. **CC-11** Admin-as-operator *(build directly on `deployment_assignments` — no longer waits on 4b′, since prod/4b′ is deferred)*

**Then the big work in workplan order:** CC-12 (Batch 6b/perf) → CC-14 (Today view) → CC-15 (Map) → CC-16 (QR) → CC-17 (Time/Invoicing) → CC-18 (Week board). CC-13/CC-19/CC-20 (doc + consistency + dead-code) land whenever convenient. CC-21 is a design spike (no build).

**In parallel, starting now (no code):** the **A6 device pass** — your pilot line — and get a **Sentry DSN** to unblock error tracking.

---

## Per-packet smoke checklist (on staging, after merge)

**CC-01 (release-safety):** CI goes green; a normal PR still passes; confirm the new drop-guard job appears in the checks. Nothing user-facing to click.

**CC-02 (data-integrity):** end a 2-operator deployment and confirm items disposition cleanly; do a transfer → decline and a transfer → cancel on an ended rig and confirm stock is credited back (not stranded); return a unit "damaged" and confirm it comes back IN_MAINTENANCE, not AVAILABLE; confirm the drift-report cron raises an alert (not just a log line).

**CC-03 (offline):** on a phone, submit a daily check offline, let the session expire, reconnect → the queued check should sync (not fail); confirm the admin pages now show the offline banner.

**CC-04 (prod cutover):** follow the packet's own stop-points — the two invariant queries must return zero before #144 merges; confirm the migrate job's secret read didn't error; smoke prod after.

**CC-06 (dashboard):** log in as an **operator**, open the Dashboard — KPI cards show real numbers, not "—".

**CC-07 (mobile):** at 390px, open the two detail drawers (deployments, inventory) — no clipping; Team page shows one project filter, not two.

**CC-08 (hubs):** a discrepancy is reviewable with a resolution action; Dismiss asks to confirm and doesn't strand the unit; bulk-select works on Inbound.

**CC-09 (awaiting-pickup):** fulfill a reservation → operator sees an "Awaiting Pickup" card → pickup seeds checkout; leave one unclaimed past when the sweep would fire and confirm it does NOT silently vanish.

**CC-10 (field-fix):** log a fixed issue on a vehicle from the field — it records COMPLETED without flipping the unit into maintenance or firing a damage alert.

**CC-11 (admin-as-op):** an admin can be a transfer recipient and hold a rig; confirm the admin-held rig does **not** appear in payroll/missed-check attribution.

**CC-14 (Today):** operator dashboard shows the day (deployment, check state, what's waiting on me), not the static menu.

**CC-15 (Map):** admin sees pins + the per-rig check-in history trail; operators see last-known crew positions — and **nothing shows live/real-time movement** (positions come from checks only).

**CC-17 (money loop):** run one payroll period end-to-end — clock → approve → invoice → emailed → PAID — with zero manual corrections; operator answers "what did I earn this week?" in ≤2 taps.

---

## The three guardrails, always

- **Nothing to production except through the PR + Actions flow**, and only CC-04/CC-05 on your explicit go. Merging to `development` never reaches prod.
- **The held patches (4b′, 4c) stay held** until CC-04/CC-05 — never apply them in a general "land the patches" session.
- **Every packet goes through the six-seat review** (Antagonist / Fable / Calibration / Operator-lens / SRE / Integration) named in the packet before it lands. Schema-touching PRs always run CI `tsc` with a fresh `make db-generate` as the authoritative type gate.
