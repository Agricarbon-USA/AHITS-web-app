# AHITS — Live Functional Stress-Test (Every Core Flow)

_Prepared 2026-06-25 (Session 12, follow-up to the Ultra-Review). This pass does what the first review deliberately did not: **actually executes every transactional flow end-to-end on staging** — creating deployments, transferring, ending, reserving, fulfilling, and running the maintenance loop — and asserts the exact resulting state (stock math, unit statuses, lifecycle transitions, reservedQty) rather than just observing screens. Driven through the app's own authenticated API (the exact endpoints the buttons call), because the MUI click-automation was unreliable. All test data created on staging was cleaned up at the end; staging was returned to its baseline. New findings are appended to **`AHITS_ULTRA_REVIEW_ISSUE_REGISTER.xlsx`**._

---

## 1. Headline

I exercised eight flow groups (A–H) covering deployment creation with mixed equipment, kit operations, transfer/accept, end-with-dispositions, daily checks, the reservation/hub-fulfillment loop, the maintenance loop, and edge/negative cases. **The core business logic is, with two important exceptions, correct and robust** — stock math, reservations, transfers, idempotency, and authorization all held up under direct assertion. The stress-test found **one new High-severity systemic bug** (repaired units never return to service), **reproduced the Critical UR-001 stock bug live with exact numbers**, and surfaced **three new Medium/Low issues** (hub-link undeliverable, ended-deployment attribution loss, daily-check gating).

### New findings from this pass

| ID | Sev | Finding |
|---|---|---|
| **UR-029** | **High** | **Repaired units never return to service.** No `maintenanceTask.create` path sets `inventoryUnitId`, but the repair-complete route returns a unit to service only via `task.unit`. So every serialized unit sent to repair is stranded IN_MAINTENANCE/INOPERABLE forever — even after "Complete repair." Systemic across all three inoperable→repair paths. |
| **UR-001** | **Critical** | **Reproduced live.** Bulk consumable return restored the cross-hub total (72→75) but left per-hub stock at 72 — a permanent 3-unit divergence, with exact before/after numbers. (Was already in the register from source review; now confirmed on staging.) |
| **UR-030** | **Medium** | **Hub-fulfillment tokenized link is undeliverable & unobtainable.** `resend-link` returns only `{ok}` (no URL/token), hubs have no email configured, and the link isn't surfaced in the admin UI to copy — so the hub receiving end cannot be reached at all. |
| **UR-031** | **Low-Med** | **Inconsistent link-issuing endpoints.** `send-to-shop` returns the work-order `url` (usable even when email fails), but `resend-link` returns only `{ok}`. The two tokenized-link flows should behave the same. |
| **UR-032** | **Medium** | **Ended deployments lose operator attribution.** A deployment that has ended returns `operator: null` from the API (the roster query filters `endedAt IS NULL`) — a live manifestation of the UR-002 §7.A tripwire; historical "who had this rig" is blanked. |
| **UR-033** | **Low** | **Daily check is gated to vehicles in the operator's active deployment** (`403` otherwise). This is more restrictive than the PRD's "complete before operating any vehicle," and is the real reason the daily-check vehicle picker is empty when an operator has no active deployment (not a UI bug). |
| **UR-026** | **Medium** | **Confirmed live:** the device's local date was 2026-06-25 while UTC was 2026-06-26 — the daily-check date off-by-one is real on an evening clock. |

Everything else **passed** (details in §3).

---

## 2. Method & honesty notes

- **Driver:** each flow was executed by calling the real endpoints from inside the authenticated staging page (`fetch` with the session cookie) — the same routes the UI buttons hit — and asserting the resulting state by re-reading inventory, stock, deployments, and maintenance. Session switching (op1 ↔ op2 ↔ admin) was done via `POST /api/auth/login`.
- **Why not clicks:** the browser click/type automation intermittently failed to deliver synthetic events to the MUI components (documented in the Ultra-Review §4.4), so API-level driving was both more reliable and more rigorous (exact numeric assertions). Where a finding depended on UI wiring, it was cross-checked against the earlier screenshots.
- **Root-causing:** every API-level finding was confirmed against the source (`file:line`), not inferred from behavior alone — e.g., UR-029 was traced to the four `maintenanceTask.create` sites and the complete route's `task.unit` condition.
- **External side-effects:** I did not send operator invites or shop emails to outside parties. `send-to-shop` was driven with `recipientEmail = ops@agricarbon.com` (the org's own admin inbox); Resend reported `emailed:false` (mailer not configured on staging), so no mail left the system. A real failing daily-check (which notifies admins) was **not** submitted; its validation gates were tested instead.
- **Cleanup:** all created deployments were ended, the two units I disturbed were restored (Garmin Montana 700 #01 → AVAILABLE; the Manual Corer unit → INOPERABLE), the Cardboard Home-Lab stock was reset to 75/75 (fixing the UR-001 divergence I induced), and the probe category was deleted. op1/op2 end the pass with **no active deployments**. Residual records (completed maintenance tasks, check-logs, fulfilled/cancelled requests, one daily-check row) are normal history, not broken state.

---

## 3. Flow-by-flow results

### Flow A — Operator creates a mixed-equipment deployment ✅
Created a deployment as op1 with a serialized item (Garmin Montana 700 #01) **and** a consumable (Cardboard ×3) drawn from Home Lab. Asserted: create `201`; consumable total **75 → 72** (−3, correct); per-hub Home-Lab stock **75 → 72** (correct); the Garmin unit flipped **AVAILABLE → CHECKED_OUT**; `drawnQuantity`/`drawnHubId` recorded on the kit item. **Pass.**

### Flow B — Kit operations + stock math (with UR-001 reproduction) ⚠️ (UR-001)
- **Add consumable ×4:** drew 4 from both per-hub (→68) and total (→71). ✅
- **Single-item return ×2 GOOD:** per-hub **restored +2** (→70) and total +2 (→73). ✅ — the single-item path restores per-hub correctly.
- **Log usage ×2 (`consumed`):** per-hub unchanged, total unchanged (already decremented at checkout) — usage correctly does not restore. ✅
- **Bulk return ×3 GOOD (the suspected path):** total **72 → 75** (restored) but per-hub **stayed 72** → **divergence confirmed** (UR-001). ❌

The contrast is conclusive: **single-item and end-deployment returns restore per-hub stock; the bulk items-DELETE path does not.** UR-001 is pinpointed to that one endpoint.

### Flow C — Transfer op1 → op2 and accept ✅
Created a transfer of the Garmin to op2 (`201`); the source kept the item **until accept** (no premature decrement); op2 saw exactly **1 pending** incoming transfer; accept `200`; the unit stayed CHECKED_OUT (now to op2); op2 gained an active rig. Two-phase handoff is correct with **no double-decrement**. **Pass.** _(Side observation that became UR-032: when the last item transferred out, op1's source rig auto-ended and then reported `operator: null`.)_

### Flow D — End deployment with mixed dispositions ✅ (feeds UR-029)
Stocked op2's rig with three items, then ended with **three different dispositions**: Garmin → INOPERABLE, Field Tool Set → HUB-good, Cardboard ×2 → HUB-good. Asserted: end `200`; rig `endedAt` set; Field Tool Set unit → **AVAILABLE**; Garmin → **IN_MAINTENANCE**; **a damage-report maintenance task + DAMAGE_REPORTED alert were created**; the consumable restored correctly on **both** stores (per-hub +2, total +2 — the end route restores per-hub, unlike the bulk path). **Pass** — but the inoperable Garmin's task is the one that later exposes UR-029.

### Flow E — Daily check (pass / idempotency / validation) ✅ (with UR-033, UR-026)
- **Behavioral gate (UR-033):** an operator with no active deployment gets `403: "You can only submit a daily check for a vehicle in your active deployment."` — daily checks are scoped to deployment vehicles.
- With an active deployment+vehicle: **pass submit `201`**; **idempotent re-submit** (same vehicle+date) produced **no duplicate** (1 row, odometer updated 1234 → 1240 — upsert). ✅
- **Validation gates:** failing check with empty summary → `400`; "No" item without a note → `400`. ✅
- **Date (UR-026):** local date 2026-06-25 vs UTC 2026-06-26 — the off-by-one is real on an evening clock. **Pass (logic), with the two noted issues.**

### Flow F — Reservation / hub-fulfillment loop ✅ (with UR-030)
- **Per-line checklist gate:** staging a request is blocked (`409 "All lines must be checked off before staging"`) until each line is confirmed/edited/denied. ✅
- **Confirm / Edit / Deny:** drove a 3-line request — confirm (qty 5), edit (partial → fulfilledQty 2), deny (reason recorded). All `200`. ✅
- **Hard-reserve on stage:** `reservedQty` went **0 → 5** for the confirmed item and **0 → 2** for the edited item; the denied line reserved nothing. Exact. ✅
- **Release on fulfill:** both `reservedQty` returned to 0; stock total unchanged (the UR-010 fulfill→checkout gap — released but not drawn — is real). ✅
- **Hub token (UR-030):** I could not drive the hub *receiving* end via the tokenized link — `resend-link` returns only `{ok}` (no URL/token), hubs have no email, and the link isn't shown in the admin UI to copy. The lifecycle was completed via the admin line-checkoff endpoint instead. **Logic passes; hub-link delivery is broken.**

### Flow G — Maintenance loop + inoperable review ❌ (UR-029) / mostly ✅
- **Damage report + alert:** the Flow-D inoperable disposition created the task and a DAMAGE_REPORTED alert. ✅
- **Send-to-shop:** `201`, returned the WORK_ORDER `url` (email `false`, graceful). ✅
- **Shop receiving end via token:** the shop **viewed** the work order (`200`) and drove **RECEIVED → IN_PROGRESS → INVOICED (#QA-INV-1, written back to the task) → COMPLETED** — all `200`. The tokenized work-order link works end-to-end. ✅
- **Admin finalize:** `complete` `200`, task → COMPLETED, actualCost recorded, **DAMAGE_REPORTED alert auto-resolved** (1 → 0). ✅
- **UR-029 (the bug):** the Garmin unit **stayed IN_MAINTENANCE** — it did **not** return to service. Root cause: the task was created with `itemId` only; **`inventoryUnitId` is never set** at any of the four `maintenanceTask.create` sites, and the complete route returns a unit only via `task.unit`. The admin **inoperable-review REPAIR** path has the identical defect (verified at `review-inoperable/route.ts:52-67`). **Net: repaired units are permanently stranded.** ❌
- **Inoperable review:** REPAIR creates the task and sets the unit IN_MAINTENANCE (`200`, after supplying the required `note`); RETIRE was not executed to avoid permanently retiring a real seeded unit (mechanics confirmed from source: sets RETIRED + suffixes the QR for reuse).

### Flow H — Edge & negative cases ✅
- **Authz:** operator → `POST /api/inventory` = **403**; operator → `GET /api/dashboard` (admin) = **403**. ✅
- **Oversell guard:** drawing 99 999 of a consumable with 70 at the hub = `409 "Only 70 available at Home Lab (requested 99999)"`, stock unchanged. ✅
- **One-active-deployment guard:** starting a second deployment for an operator who already has one = `409`. ✅
- **Self-protection:** admin self-deactivate and self-force-logout both blocked (`400 "You cannot suspend, demote, or force-logout your own account."`). ✅
- **Invalid input:** malformed create = `400` (zod). ✅
- **Idempotency:** two identical `Idempotency-Key` add-item calls drew the consumable **exactly once** (no double-draw). ✅

---

## 4. What this changes about the readiness picture

The Ultra-Review's verdict stands, with two amendments:

1. **The maintenance loop has a second, equally important defect (UR-029) alongside UR-001.** Both are silent data-correctness bugs in already-"done" features, both have exact reproductions, and both should be **pilot blockers**: UR-001 corrupts hub stock accounting; UR-029 strands repaired equipment out of inventory (directly hitting the "zero equipment missing" and "proactive maintenance" KPIs). The fixes are small and surgical — UR-001 is a one-branch mirror; UR-029 is adding `inventoryUnitId` to the four task-create sites (or having the complete route fall back to the item's IN_MAINTENANCE units).

2. **The hub-fulfillment receiving end is not actually usable yet (UR-030).** The *logic* (hard-reserve, per-line checklist, release) is correct and tested, but a hub literally cannot receive its link — no email, no copyable URL. This matches the handoff's "created but not auto-delivered," but it means the hub workflow can't be piloted until either hub email + delivery is wired or the admin UI surfaces the link to copy (as `send-to-shop` already effectively does).

Everything else the business case leans on — deployment creation, mixed kits, transfers, end-of-deployment dispositions, the reservation hard-reserve, idempotent offline-safe writes, and the full authorization model — **executed correctly under direct assertion.** That's a strong result; the defects are specific and fixable, not architectural.

### Suggested fix order (folds into the Ultra-Review §7 plan)
Add **UR-029** next to **UR-001** at the top of the pilot-blocker list. Then **UR-030/UR-031** (hub-link delivery + endpoint consistency) and **UR-032** (ended-deployment attribution) with the M6 hub-fulfillment work. **UR-033/UR-026** fold into the daily-check polish (M5) — decide whether daily checks should be allowed outside an active deployment, and fix the date default.

---

# Part 2 — Remaining-path sweep (Flows I–O)

_A second functional pass covering every path not yet exercised: RETIRE/QR-reuse, QR scan, failing-check notification, secondary operators & handoff, the alert/mileage/recurrence machinery, the MATERIAL request type, transfer decline, operator PIN change, hub stock movement, the HUB_RETURN link, notifications, and the audit log. Same method (authenticated API driving + source confirmation); all test data cleaned up afterward._

## 5. Headline for Part 2

**One new finding (UR-034, Medium-High); everything else passed.** The sweep confirmed a large amount of already-built functionality works end-to-end — including several things the older docs implied were missing (a working change-PIN endpoint, secondary operators, self-service handoff). The one defect: a **failing daily check produces no in-app alert or notification** — it relies solely on an email to `ADMIN_EMAIL`, so a failed safety check is silently invisible in-app when email isn't configured.

| ID | Sev | Finding |
|---|---|---|
| **UR-034** | **Medium-High** | **Failing daily check has no in-app alert/notification.** The route only emails `ADMIN_EMAIL` on a fail (`daily-check/route.ts:177-185`); it never calls `createAlert`/`notifyAdmins`, and there is no `DAILY_CHECK_FAILED` value in the `AlertType` enum. A failed brake check creates **zero** in-app trace — no alert row, no bell badge — unlike damage/low-inventory/expiry. On staging (no `ADMIN_EMAIL`/Resend) it produced no admin-visible signal at all. |

## 6. Flow-by-flow (I–O)

### Flow I — Inoperable RETIRE + QR reuse ✅
Created a throwaway unit, marked it INOPERABLE, ran **review → RETIRE**: unit → **RETIRED**, its `qrCodeId` suffixed with `::retired::`, and the freed QR was successfully **re-registered on a new unit** (201; the QR now resolves to the new serial). Retired unit excluded from availability. QR-reuse-on-retire works. **Pass.**

### Flow L — QR scan ✅
`by-qr` lookups: known unit QR → **200**, unknown QR → **404**, vehicle QR → **200**. The old "every scan returns 404 / not recognised" class of bug is fixed. (`/api/checkout` POST is intentionally **410** — deprecated in favor of `/api/deployments/[id]/items`.) **Pass.**

### Flow J — Failing daily check ❌ (UR-034)
A `passFail:false` check with a failing item + summary submitted **201** and was stored, but produced **no new alert** (alerts unchanged at 0) and **no admin notification** (unread stayed 4). Root cause confirmed in source: the only fail-path side-effect is an email to `ADMIN_EMAIL`; there is no in-app alert/notification and no alert-type for it. **Fail (UR-034).**

### Flow K — Secondary operator + handoff ✅
- **Secondary operator:** added op2 as SECONDARY to op1's rig (`201`); the roster correctly shows the secondary. ✅
- **Self-service handoff:** op1 initiated a handoff to op2 (`force:false` → PENDING); op2 saw exactly 1 pending, accepted (`200`), and **primary reassigned to op2**. ✅
- **Admin force-handoff:** `force:true` immediately reassigned primary back to op1. ✅

Secondary operators and the full handoff machinery (M6) are built and correct.

### Flow M — Alerts + cron auth ✅
- **Mileage-trigger alert:** a daily-check odometer past a MILEAGE task's `nextOdometer` flipped the task to **OVERDUE** and created a **MAINTENANCE_OVERDUE** alert synchronously. ✅
- **Dedup:** a second trigger created **no** duplicate alert (one per task, via the `activeKey` partial-unique). ✅
- **Resolve:** `resolve` marked it resolved and dropped it from the unresolved list. ✅
- **Cron auth:** `POST`/`GET /api/cron/dispatch` with no header or a wrong bearer → **401** (properly secret-gated). ✅
- _Limitation:_ **low-inventory** and **insurance/registration-expiry** alerts are created **only** by the cron scan, which requires the real `CRON_SECRET` — so they could not be fired live. The alert create/dedup/resolve mechanics they share are proven via the overdue path; the dispatcher auth is verified.

### Flow N — Scheduled maintenance recurrence ✅
Completing the recurring MILEAGE task rolled **`nextOdometer` forward 4000 → 11100** (actual reading 6100 + 5000 interval) and reset status to **UPCOMING**, with the tied alert resolved. Recurrence works. **Pass.**

### Flow O — MATERIAL / decline / PIN / hub ✅
- **MATERIAL request:** create → **forward** (→ FORWARDED, fulfiller set) → **complete** (→ FULFILLED). Full second request-type lifecycle works. ✅
- **Transfer decline:** op2 declined a pending transfer (`200`); the **source kept the item** (no decrement). ✅
- **Operator PIN change:** op2 changed PIN 123456 → 654321 (`200`), logged in with the new PIN, then changed back to 123456 (`200`). **The documented PIN is restored and verified working** (login `200`). The change-PIN endpoint older docs doubted is present and correct. ✅
- **HUB_RETURN link:** ending a deployment with a serialized hub-return **issued a HUB_RETURN status link** (all three link types — HUB_RETURN, RESERVATION, WORK_ORDER — present in `/api/status-links`). The *mechanism* works; *delivery* is the UR-030 gap. ✅ (mechanism)
- **Multi-hub stock move:** moved 5 Cardboard Home Lab → YS Shop (Home Lab 75→70, YS 0→5) and back (75 / 0). Exact. ✅
- **Notifications mark-read:** mark-all dropped unread 4 → 0. ✅
- **Audit log:** `/api/users/audit` returns entries (e.g. `DEPLOYMENT_HANDOFF`) — the `AccountAuditLog` is surfaced and recording. ✅
- **Rate limiter (bonus):** my ~30 session-switch logins eventually drew **429s** from the login limiter — the CR-3 shared-store limiter genuinely throttles. ✅

## 7. Updated tally

Across **15 flow groups (A–O)**, the AHITS business logic is **strong**: deployment lifecycle, transfers (accept + decline), end-dispositions, reservations with exact hard-reserve, MATERIAL requests, secondary operators, handoffs, mileage-triggered maintenance with dedup/resolve/recurrence, RETIRE/QR-reuse, QR scan, PIN change, multi-hub stock, idempotency, and the entire authorization/guard surface all execute correctly under direct assertion. **Three defects** carry forward as the priorities: **UR-001** (Critical, bulk-return per-hub divergence — reproduced live), **UR-029** (High, repaired units never return to service), and now **UR-034** (Medium-High, failed checks invisible in-app), plus the hub-link-delivery gap (UR-030). None are architectural; all are localized fixes.

### Could not be exercised live (noted for completeness)
- Cron-only alerts (**low-inventory**, **insurance/registration expiry**) — gated by `CRON_SECRET`.
- The **hub RESERVATION / HUB_RETURN receiving end** — the raw token is never surfaced (UR-030); only the WORK_ORDER receiving end was drivable and it passed.
- A **real failing-check email** and **operator-invite email** — deliberately not sent to avoid external mail (and staging has no mailer configured — which is how UR-034 surfaced).

### Cleanup confirmation
All test artifacts were reverted: both operators end with **0 active deployments**, the throwaway QA units are RETIRED, the QA maintenance task is soft-deleted, the Cardboard stock is back to **75 total / 75 per-hub (consistent)**, and **op2's PIN is verified restored to 123456**. Residual records (completed tasks, check-logs, fulfilled/cancelled requests) are normal history.
