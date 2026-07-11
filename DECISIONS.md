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
> | Sentry error tracking | BLOCKED | Max provides a DSN | — |

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

### D4 · W0-10 legacy-column retirement runs 4a → 4b′ → 4c; DROP guarded by human sequencing
- **Date:** 2026-07-10 (inherited from the W0-10 plan) · **Owner:** Max · **Status:** ACTIVE
- **Decision:** Three-phase retirement so the irreversible `DROP` (4c) runs against a revision that neither reads nor writes the columns. `4b′`/`4c` are **HELD** and must NOT be merged casually — land them only after 4a is live and soaked with the migration plan's §11 go/no-go green. The held patches live in `held/`, out of the way, guarded by the CI drop-guard from CC-01.
- **Rationale:** zero read/write blip on an irreversible drop; the acknowledged-DROP comment bypasses CI's migration-safety gate, so human sequencing plus the CC-01 guard are the guards.
- **Detail:** `AHITS_W0-10_MIGRATION_PLAN.md` §10–§11.

---

_To add a decision: copy the D-format above, give it the next Dn id, fill in date/owner/status/decision/rationale, and set any superseded prior decision's `Superseded-by: Dn`. Reference decisions by id (`D1`) in handoffs and workplans instead of re-explaining them._
