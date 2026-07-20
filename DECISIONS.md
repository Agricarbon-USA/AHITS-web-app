# AHITS — Decision Log

**Append-only. Read this file before re-opening any "should we…" question.**
Never delete or rewrite a decision. To change one, add a NEW entry and set the old one's `Superseded-by`. IDs (D1, D2, …) are permanent. If a decision here is `ACTIVE`, you may not act against it — you may only propose a superseding entry with the owner's sign-off.

> **Parked / Deferred registry — the fast lookup for "is this a live blocker?" (answer: no)**
>
> | Item | State | Revisit when | Ref |
> |------|-------|--------------|-----|
> | Production cutover (environment standup) | DEFERRED | actual go-live (real users) | D1 |
> | W0-10 `4b′`/`4c` DROP patches | HELD | 4a soaked on prod + go/no-go green | D4 |
> | Map: real-time / live GPS tracking | ANTI-GOAL (permanent) | never (crew visibility is last-known only) | D2 |
> | Sentry error tracking | SHIPPED (CC-22, PR #182) | — (DSN provisioned; wiring live on staging) | — |
> | CC-20 #1 (daily-check full-contents viewer) | SHIPPED (CC-26, PR #195) | — (pulled forward as a pilot-fortnight gate) | D12 |
> | CC-20 remainder (record-reader legibility #2–#6) | PARKED | first pilot dispute needing history a surface can't show | CC-20 |

---

### D1 · Production cutover is DEFERRED until go-live
- **Date:** 2026-07-10 · **Owner:** Max · **Status:** ACTIVE
- **Decision:** Do not stand up production now. The pilot runs entirely on staging. The `AHITS_PROD_*` runtime secrets and the W0-10 `4b′`/`4c` patches stay held. **Nothing in Phase 3 is gated on prod.**
- **Rationale:** Production is a full from-scratch standup (separate Supabase project, 11 secrets, migrations, first admin, prod cron, isolation checks) — not an empty environment needing one secret. The money loop already reads `deployment_assignments` (PR-4a, live on staging), so nothing downstream depends on the cutover. Deferring costs nothing.
- **Supersedes:** the earlier "cutover-first, prod is empty" framing.
- **Note (2026-07-11):** PR #144 (`development → production`) was merged (commit `c0d231b`), so the **production git branch is now current** — but this does **not** un-defer prod: there is still no prod *environment* (no Supabase project, no `AHITS_PROD_*` secrets), so the triggered deploy failed harmlessly at secret-validation and nothing is live. What remains deferred is the environment standup. Do not read "#144 merged" as "prod is live."
- **Detail:** `AHITS_PROD_CUTOVER_DEFERRED.md`

### D2 · Deployment Map scope — attestation GPS only; NO real-time tracking
- **Date:** 2026-07-10 · **Owner:** Max · **Status:** ACTIVE
- **Decision:** The Map includes admin pins, **per-rig check-in route history** (where a rig has *been*, assembled from the daily-check GPS points it already captures), and **last-known crew positions** (so operators can coordinate a gear swap or request help). **All positions come from GPS captured on daily-check attestations. There is NO real-time / continuous location tracking, ever.** Zero new operator taps.
- **Rationale:** honors the friction budget and the standing "no live tracking" line while giving the field a real coordination tool; route history is historical only, not live position.
- **Supersedes:** the Master Roadmap §7.2A anti-goal ("no route history, no operator-facing map") and the North Star's "crew visibility, declined by name" — both now stale. (Those docs must carry a banner pointing here.)

### D3 · Admin-as-operator is EXCLUDED from the money loop
- **Date:** 2026-07-10 · **Owner:** Max · **Status:** ACTIVE
- **Decision:** Admins may own and operate a rig (built on `deployment_assignments`, not the legacy column). Admin-held rigs are **excluded from payroll attribution** and flagged distinctly in missed-check scans and dashboards. This policy is written into the attribution resolver and the cron scan **before** the role gates are relaxed.
- **Rationale:** admins acting as operators for coverage must not contaminate payroll/invoicing attribution — the exact cleanliness W0-10 was built to protect.
- **Detail:** CC-11 / workplan §5 A-5.
- **Note (2026-07-12, Max):** Role gates relaxed in PR #181 with the cron missed-check exclusion landing in the same PR. No attribution resolver exists yet (money models unbuilt), so D3's resolver-side exclusion transfers forward as a HARD acceptance criterion on CC-17 (Time/Invoicing): attribution via deployment_assignments MUST exclude admin-held rigs, verified at review. Any CC-17 implementation without this exclusion violates D3.

### D4 · W0-10 legacy-column retirement runs 4a → 4b′ → 4c; DROP guarded by human sequencing
- **Date:** 2026-07-10 (inherited from the W0-10 plan) · **Owner:** Max · **Status:** ACTIVE
- **Decision:** Three-phase retirement so the irreversible `DROP` (4c) runs against a revision that neither reads nor writes the columns. `4b′`/`4c` are **HELD** and must NOT be merged casually — land them only after 4a is live and soaked with the migration plan's §11 go/no-go green. The held patches live in `held/`, out of the way, guarded by the CI drop-guard from CC-01.
- **Rationale:** zero read/write blip on an irreversible drop; the acknowledged-DROP comment bypasses CI's migration-safety gate, so human sequencing plus the CC-01 guard are the guards.
- **Detail:** `AHITS_W0-10_MIGRATION_PLAN.md` §10–§11.

### D5 · Pilot must not launch onto the static menu — hold for Today, or ship a Today-lite bridge
- **Date:** 2026-07-12 · **Owner:** Max · **Status:** PENDING (Max to decide — see `AHITS_PILOT_CHARTER.md` §5)
- **Options:** (A) HOLD the pilot fortnight until Today (CC-14) ships [RECOMMENDED — cleanest]; (B) ship a Today-lite bridge (check-done chip + transfers-waiting row + Awaiting-Pickup cards on the existing dashboard) as packet CC-28 (number reserved), inserted after CC-26, and start on that.
- **Recommendation:** A. Launching onto the verified static 4-card menu is competing with texting using a directory; the adoption metric is at risk from day 1.

### D6 · Email sandbox flip — global flip on charter start date, after the two-part audit
- **Date:** 2026-07-12 · **Owner:** Max · **Status:** PENDING (Max to run the audit and flip)
- **Recommendation:** `EMAIL_SANDBOX` is one global env var — a per-hub flip is impossible. On the charter start date, flip global EMAIL_SANDBOX off, AFTER (a) verifying only pilot hubs have contact addresses, (b) auditing all non-hub recipient paths (shop emails, invites, invoice sends) for real addresses in staging data.

### D7 · Name a second human as pilot-hours contact
- **Date:** 2026-07-12 · **Owner:** Max · **Status:** PENDING (Max to name)
- **Recommendation:** name one non-owner reachable during pilot hours to run the "operator can't sync" triage card (`AHITS_PILOT_CHARTER.md`). A one-human pilot is a single point of failure; the first 6am sync failure has no owner today.

### D8 · CC-11 landed the cron-scan half of the D3 exclusion concurrently with the role-gate relax, not before it
- **Date:** 2026-07-12 · **Owner:** Max · **Status:** RESOLVED · **Superseded-by:** D3 (note, 2026-07-12)
- **Context:** D3 says the admin-as-operator payroll exclusion "is written into the attribution resolver and the cron scan before the role gates are relaxed." CC-11 (PR #181, merged) relaxed the role gates (transfer/handoff/operators roster) and added the cron-scan `isAdminHeld` flagging in the same PR — no attribution resolver exists yet (Time/Invoicing / CC-17 isn't built), so there was nothing to sequence the resolver-half against. `DeploymentRoster.operator.role` and `getVehicleOperators`'s `operatorRole` now carry the signal CC-17 will need; a comment above `getVehicleOperators` names the requirement.
- **Recommendation:** treat this as satisfied in spirit (cron scan is done, resolver literally cannot exist before its own capstone) rather than a violation requiring rework — but flagging per CLAUDE.md's rule against silently acting against an ACTIVE decision. Superseded-by candidate if Max agrees: fold this note into D3 itself rather than keep it standalone.
- **Resolution (2026-07-12, Max):** folded into D3 as a dated note — the resolver-side exclusion transfers forward as a HARD acceptance criterion on CC-17, verified at review. This entry stays for provenance; D3's note is authoritative going forward.

### D9 · Glossary conventions locked in CC-24 (one word per state; "Fulfill" reserved for stock-moving)
- **Date:** 2026-07-17 · **Owner:** Max · **Status:** ACTIVE
- **Decision:** From CC-24 (PR #185), these naming rules hold on every surface (button/badge/header/toast) and must not be re-introduced by later packets:
  - **"Fulfill" is reserved for stock-moving actions only** — the reservation `fulfill` action / `FulfillmentChecklist` / the `FULFILLED` state. A MATERIAL request's completion moves no stock and is labelled **"Mark Handled"**, never "fulfilled". (The shared `FULFILLED` *state chip* is deliberately left unchanged, so a material request can read "Mark Handled" as its action but still show a "Fulfilled" status — an accepted mild inconsistency.)
  - **Dismiss/Revoke → "Dismiss"** as the survivor verb for closing/invalidating (hub discrepancy + the maintenance work-order chip). The DB `REVOKED` enum is unchanged; label-only.
  - **Staged/Prepared → "Staged"** (matches the `STAGED` status enum).
- **Deferred to CC-14:** the **Fulfill / Pick-up / Check-out / Claim** glossary cluster is NOT renamed yet — it waits for CC-14's `Rig.requestId` model fix, because renaming before the model joins those states would force a second rename pass. CC-14 owns that cluster's one-word-per-state sweep.
- **Scope-guard correction (provenance):** CC-24's packet scope guard wrongly named the operator "Mark Fulfilled" as a stock-moving action to protect; the code proved it is the MATERIAL `complete` action (server enforces `requestType==='MATERIAL'`) and moves no stock. Max confirmed the rename. The real stock-mover is the separate `fulfill` action, left untouched.
- **Detail:** CC-24 / PR #185.

### D10 · CC-12 admin-monolith splits (admin/deployments, admin/inventory) are DEFERRED — demand-pull
- **Date:** 2026-07-19 · **Owner:** Max · **Status:** ACTIVE
- **Decision:** CC-12's structural performance work split **only my-deployment** (PR3, the worst offender at ~2026 lines / 55 useState). The **admin/deployments (~1566) and admin/inventory (~1362) splits are deliberately deferred**, not dropped: they are **demand-pull**, done by the **first packet that materially touches those surfaces (owner: CC-18 or earlier if one lands there first)** — never as a standalone sweep. This is a recorded decision so no future session rediscovers it as "unfinished CC-12."
- **Rationale:** three behaviour-preserving refactors of the biggest files in one packet is not one sitting; my-deployment (the field's daily surface) is the highest-value target and was done well with a real Android device-pass acceptance. Splitting an admin file no one is otherwise editing is churn without a demand signal.
- **Also note (PR3 scope):** PR3 extracted the two heavy presentational cards (Vehicles, Kit) as `React.memo` children with render-count-verified memo boundaries — the primary re-render win. Deeper container-thinning (SWR on the rig read via `useFreshList`, more leaf extractions) is likewise demand-pull as later my-deployment work touches those areas.
- **Detail:** CC-12 / PR #187 (queue-UX) · #188 (SWR+freshness) · #189 (my-deployment split).

### D11 · CC-14's D9 glossary sweep (Fulfill/Pick-up/Check-out/Claim) is RE-DEFERRED — owner: next session after CC-14
- **Date:** 2026-07-19 · **Owner:** Max · **Status:** ACTIVE
- **Decision:** D9 assigned the **Fulfill / Pick-up / Check-out / Claim one-word-per-state glossary sweep** to CC-14, gated on "CC-14's `Rig.requestId` model fix." The pre-flight found that link **already shipped in CC-09 as `Rig.fromRequestId`**, so D9's precondition is met — but CC-14 shipped as five planned PRs and PR5 (the sweep) was **planned droppable from the start** (strictly strings, zero logic). CC-14's core (Today view + endpoint + daily-check/NS-5 + IA fixes, PRs #190–#193) landed and deployed; the session ran long, so PR5 was **cut rather than rushed** (Max's explicit instruction: "if the session runs long, cut PR5 and record D11… rather than rushing it"). The sweep is **re-deferred, owner: the first session after CC-14**, a strings-only pass across buttons/badges/headers/toasts. This is NOT unfinished CC-14 — it is a recorded, precondition-met follow-up.
- **Rationale:** a cross-surface rename touching a critical glossary is exactly the work that should not be rushed at the tail of a long session; the model precondition being met means it can be done cleanly whenever picked up, with no dependency risk.
- **Detail:** CC-14 / PRs #190 (spine) · #191 (Today view) · #192 (daily-check/NS-5) · #193 (IA fixes) · #194 (test fix). Supersedes D9's "CC-14 owns the cluster" only as to *timing/owner* — the conventions in D9 still hold.

### D12 · CC-26 alert deep-link targets + the "deployment-drawer reach" is transitive by design
- **Date:** 2026-07-19 · **Owner:** Max · **Status:** ACTIVE
- **Decision:** For the CC-26 daily-check viewer's reachability (PR #195): (a) a **DAILY_CHECK_FAILED** alert deep-links to the exact check via `/admin/vehicles?check=<checkId>` (checkId carried in alert metadata; graceful fallback to `/admin/vehicles` for stale/pre-CC-26 ids); (b) a **DAILY_CHECK_MISSED** alert — which has **no vehicle/check record**, only the operator — lands on `/admin/deployments?operator=<operatorId>`, opening that operator's active rig drawer (Max chose this over a per-operator history list or the old `/admin/users`); (c) the **deployment drawer "reaches the viewer" transitively** — its per-vehicle "View checks" links to the vehicle drawer, whose extended recent-checks list opens the viewer — **deliberately, to honor the CC-26 pre-flight's "extend the existing list, don't build a duplicate"** (the per-vehicle history lives only in the vehicle drawer). A future session reading the packet's "the deployment drawer reaches the viewer" should not "fix" this into a direct open.
- **Rationale:** a MISSED alert genuinely has no single vehicle to target; routing through the operator's deployment is the faithful landing. The transitive deployment-drawer reach avoids duplicating the check-history list, which the pre-flight explicitly forbade.
- **Scope guard held:** only the two check alerts carry a record id; the rest of CC-20 #6 (deep-links everywhere else) stays PARKED. `createAlert`'s dedup now refreshes metadata on re-raise (so the link points at the latest check) but leaves `notifiedAt`/`triggeredAt` untouched (no re-notify) — safe across all alert types (verified: no caller freezes first-occurrence metadata).
- **Detail:** CC-26 / PR #195. CC-15 later adds check-level GPS columns; the viewer's GPS slot is already absent-safe and will render them when present.

---

_To add a decision: copy the D-format above, give it the next Dn id, fill in date/owner/status/decision/rationale, and set any superseded prior decision's `Superseded-by: Dn`. Reference decisions by id (`D1`) in handoffs and workplans instead of re-explaining them._
