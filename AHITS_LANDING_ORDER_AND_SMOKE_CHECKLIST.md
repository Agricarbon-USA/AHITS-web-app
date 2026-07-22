# AHITS — Packet Landing Order & Smoke Checklist
### Keep this next to Claude Code · 2026-07-10

> ## ⛔️ PROD CUTOVER (CC-04, CC-05) IS DEFERRED — skip both for now
> **Postponed by decision 2026-07-10. It's its own separate step for actual go-live, and it gates nothing.** Do NOT run CC-04 or CC-05. Leave the held W0-10 patches held. Everything else runs on staging without it. Full context: `AHITS_PROD_CUTOVER_DEFERRED.md` and `DECISIONS.md` D1.
> **PR #144 was merged 2026-07-11** — the `production` branch is current, but the production environment/DB does not exist yet. The remaining work is the from-scratch standup, not one secret.

**The loop for every packet:** branch → change → verify gate (`make db-generate && npx tsc --noEmit && npx eslint src && npm test`) → PR to `development` → CI green → merge → **auto-deploys to staging** → smoke on staging → next packet. **One packet = one PR = one staging deploy.** Never stack packets into one PR. Production never moves automatically — only CC-04/CC-05 touch it, and only on your explicit go.

---

## Landing order

**Do first — the trust floor (before the prod cutover):**

1. **CC-01** Release-safety guards *(CI/pipeline — makes the cutover safe)*
2. **CC-02** Data-integrity fixes *(inventory-truth cluster)*
3. **CC-03** Offline & trust one-liners *(incl. the 401 fix)*
4. **Wave-0 patches** — EmailLog-FAILED alert ✅ and URL-filters rollout ✅ are **merged**; **`batch6a-date-unify.patch` is still PENDING** (loose patch at repo root; CC-19 owns landing it — verified 2026-07-22)

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

**Then the reflection increment + the big work, in this order:**
**MERGED (through 2026-07-21):** CC-10 → CC-11 → CC-22 → CC-23 → CC-24 → CC-25 → CC-12 → CC-14 → CC-26 → CC-27 → **CC-15 (Map — pulled AHEAD of the pilot per D14, shipped 2026-07-21)** + copy-link invites (PR #200). **LIVE QUEUE (post-pilot):** **CC-16** (QR no-app) → **CC-17** (Time/Invoicing — the **full A6 matrix is required first**, D13) → **CC-18** (Week board). **CC-28 is MOOT** (D5 = Option A — the Today-lite bridge was never built). *(CC-13 remains ⛔ SUPERSEDED, absorbed into `AHITS_DOC_CLEANUP_INSTRUCTIONS.md`.)*
CC-13/CC-19/CC-20 (doc + consistency + dead-code remainder) land whenever convenient. CC-21 is a design spike (no build).

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

**CC-22 (pilot ops rider):** stop the staging dispatch cron for >30 min (or fake lastRunAt) → a CRON_SILENT alert appears on the admin dashboard, and the next successful run RESOLVES it; the heartbeat ping hits the healthchecks.io URL on a successful run (and no-ops with the env var absent); with no DSN set nothing hits Sentry; with a dummy DSN, a forced server error and a forced client error both capture with the x-request-id attached (the client event passes CSP).

**CC-23 (tokens/design):** at 390px the 5 detail drawers use DetailDrawer and don't clip; the daily-check Yes/No toggles and the photo-remove button are ≥44px with ≥16px actionable text; dashboard StatCard icons show their color tint (not transparent); the amber secondary/warning text is readable; the s/[token] page pulls palette/type from tokens.ts; the ESLint no-hex rule fails a deliberately-added stray hex outside the allowlist.

**CC-24 (subtraction):** the dashboard shows ONE scan card (not two); the /operator/checkout redirect still works UNLESS the PR proved zero inbound references; Dismiss/Revoke reads as one verb everywhere; deployment launch submits with NO typed note (or a one-tap preset) — server accepts it too; the two remove-gear flows are one, and a single-item remove is ≤2 taps; MATERIAL-request says "Mark handled" while reservation/hub "Fulfilled" is untouched.

**CC-25 (live QR):** on a phone (include iOS Safari), a code decodes live from the viewfinder with no shutter tap in operator/scan and both my-deployment scanners; deny camera → falls back to photo capture (not a blank screen); offline shows "can't verify right now" and a bad code shows "not found" — never "Failed to process image"; the camera stream stops on close and resumes after switching apps and back.

**CC-26 (daily-check viewer):** from a failed-check alert, one click opens THAT check (`/admin/vehicles?check=<id>`) with answers + odometer + site + photos; a **missed-check alert** (which has no vehicle record) lands on the operator's active-rig drawer via **`/admin/deployments?operator=<id>`** (D12); the vehicle AND deployment drawers reach the viewer (the deployment drawer transitively, D12); nothing on the viewer is editable.

**CC-27 (FulfillmentChecklist):** BEFORE merge: hub-flow staging smoke — fulfill a request end-to-end through the rebuilt checklist. After: controls in admin/requests are themed MUI (no raw system-font buttons next to MUI ones); every action produces the same result as before (behavior parity).

**CC-14 (Today):** operator dashboard shows the day (deployment, check state, what's waiting on me), not the static menu.

**CC-15 (Map):** admin sees pins + the per-rig check-in history trail; operators see last-known crew positions — and **nothing shows live/real-time movement** (positions come from checks only).

**CC-17 (money loop):** run one payroll period end-to-end — clock → approve → invoice → emailed → PAID — with zero manual corrections; operator answers "what did I earn this week?" in ≤2 taps.

---

## The three guardrails, always

- **Nothing to production except through the PR + Actions flow**, and only CC-04/CC-05 on your explicit go. Merging to `development` never reaches prod.
- **The held patches (4b′, 4c) stay held** until CC-04/CC-05 — never apply them in a general "land the patches" session.
- **Every packet goes through the six-seat review** (Antagonist / Fable / Calibration / Operator-lens / SRE / Integration) named in the packet before it lands. Schema-touching PRs always run CI `tsc` with a fresh `make db-generate` as the authoritative type gate.
