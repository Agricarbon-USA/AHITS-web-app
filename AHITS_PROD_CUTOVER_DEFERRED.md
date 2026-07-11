# ⛔️ PRODUCTION CUTOVER — DEFERRED. DO NOT TREAT AS A GATE. ⛔️

**Status: POSTPONED, by explicit decision, on 2026-07-10. This is its own separate step. It is NOT started, NOT in progress, and NOT blocking anything else.**

---

## Read this first, every time

If you are re-reading the AHITS docs and trying to figure out "what about production / the cutover / PR #144 / the `AHITS_PROD_*` secrets / the W0-10 drop" — **the answer is: it is deferred on purpose. Skip it. Do not let it block or gate any other work.** This step has been repeatedly misread as an active blocker. It is not one.

## The one-sentence version

**Production does not exist yet, we are deliberately not standing it up now, the pilot runs entirely on staging, and nothing in Phase 3 depends on prod being live.**

## Exactly what is deferred

- Standing up a **separate production Supabase project**.
- Creating the **11 `AHITS_PROD_*` secrets**.
- **Merging PR #144** (`development → production`). It stays a **Draft** so it cannot be merged by accident.
- Landing the held **W0-10 patches `batch5-pr4b` and `batch5-pr4c`** (they stay in `held/`, untouched).
- The whole `PROD_CUTOVER_RUNBOOK.md` / `AHITS_PROD_STANDUP_CHECKLIST.md` procedure.
- The Claude Code packets **CC-04 and CC-05** — skip them for now.

## Why deferring costs nothing (so nobody re-opens this out of worry)

- **The money loop is NOT gated on prod.** PR-4a already migrated the attribution readers onto `deployment_assignments`, so Time/Invoicing builds and runs on **staging** with no dependency on the cutover.
- **The pilot runs on staging by design.** The Executive Summary and North Star both say production is a deliberate later, go-live step. Staging is a full running copy of the app; the pilot lives there.
- **The only thing the cutover "unblocks" is fully retiring the legacy columns (the 4c DROP)**, which is *elective defense-in-depth*, not on any critical path. Leaving 4b′/4c held is completely fine indefinitely.

## What is NOT gated by this (i.e. proceed on all of it freely)

- ✅ All the Workstream-0 trust-floor packets (CC-01, CC-02, CC-03) — land to `development` → staging.
- ✅ The three pending Wave-0 patches (EmailLog-FAILED alert, URL-filters rollout, date-unify).
- ✅ Field-feedback Wave A (dashboard fix, mobile triage, enum) and Wave B.
- ✅ The A6 device pass (the actual pilot gate — run it on staging hardware).
- ✅ The operator's Today view, the Map/QR/Time-Invoicing capstones, the week board.
- ✅ Everything in the Phase 3 workplan except the two prod packets (CC-04, CC-05).

**Note on Wave B item CC-11 (admin-as-operator):** it was previously sequenced "after 4b′ lands." Since 4b′ is now deferred with the rest of prod, **CC-11 is simply implemented directly against the `deployment_assignments` model** (which is already live via PR-4a) with the money-loop exclusion — it does not need to wait on the held patch. The file-collision concern only mattered if 4b′ were landing soon; it isn't.

## One loose end to clean up (not urgent, but don't forget)

An `AHITS_PROD_MIGRATE_URL` secret was created during exploration before this deferral. Because there is no prod Supabase project yet, its connection string may point at the **staging** database. It is harmless while nothing is deployed, but **before any future cutover it must be deleted and recreated against the real prod project** (per the runbook). Flagged here so it's caught at go-live rather than silently reused.

## When to revisit this

**At actual go-live** — when there are real users to serve on production. At that point, and only then, open `PROD_CUTOVER_RUNBOOK.md` and work it top to bottom (new Supabase project → 11 secrets → migrations → first admin → prod cron → isolation checks → un-draft and merge #144). Until then: **this document is the answer. Prod is deferred. Move on.**

---

_Decision owner: Max · Deferred 2026-07-10 · This supersedes the earlier "cutover-first" framing in the workplan's decision D1, which was based on the mistaken belief that prod was an existing empty environment needing one secret. It is not; it is a full from-scratch standup, and it waits for go-live._
