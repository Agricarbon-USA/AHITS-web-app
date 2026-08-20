# M-1 — Second-Maintainer Retainer · posting + validation pack · 2026-08-20

> STATUS: action document (M-1 search OPENED by owner green-light 2026-08-20) · READ-WITH: `AHITS_UNDISPUTED_PROGRAM_2026-07-30.md` §1 (M-1 spec) · DECISIONS.md D34/D35
> WHY: M-1 is "the keystone — the one gap that regenerates the challenger case forever." **Signed + personally drilled before CC-17 (money loop) writes its first line — hard gate.** The stall was a bandwidth story; this is the structural fix.
> §1 is paste-ready for a contractor pool / job board. §2–§4 are Max's evaluation machinery — do not send to candidates.

---

## 1 · The posting (paste this)

**Part-time retainer: production-adjacent maintainer for a field-operations web app (TypeScript/Next.js) — ~4–8 hrs/month**

We run a custom system-of-record for an agricultural field operation: Next.js (App Router) + TypeScript + Prisma/PostgreSQL (Supabase) + MUI, deployed on Google Cloud Run via GitHub Actions, with a serious offline-first PWA layer (service worker, IndexedDB outbox, idempotent replay). One engineer built it; it now runs a live pilot. We're adding a **second pair of trusted hands** — not for feature work, but so the system is never one person deep.

**The retainer (typical month, ~4–8 hrs):**
- Stay current: skim the session log/PR stream; keep your local env working.
- Once a quarter: personally run one restore drill, one full deploy, and one rollback; triage one Sentry error to root cause. (First month: all four, as onboarding.)
- Review PRs on money-path code when our timesheets/invoicing build starts (this is where hours concentrate later; the retainer may step up by agreement).
- Be reachable within 72 hours for break-glass: a runbook exists; you'll have your own credentials to everything (GCP, Supabase, GitHub, Sentry) — no shared accounts, no access-through-me.

**You:**
- Strong TypeScript + React/Next.js App Router; comfortable with Prisma/Postgres and reading a mature codebase you didn't write.
- Have operated something real: deploys, migrations, backups/restores, incident triage — and can show it.
- Comfortable with strict guardrails: PR-only trunk, additive-migration discipline, migration-safety CI gates, "merge is the deploy."
- Bonus: PWA/service-worker experience; GCP Cloud Run; small-team/solo-founder empathy.

**Engagement:** monthly retainer (propose your rate for the ~4–8 hr floor + an hourly rate above it), month-to-month after a paid 1-month validation period (below). Fully remote, async-first; occasional scheduled calls.

**To apply:** a short note + links (GitHub or equivalent), one paragraph on an incident you triaged to root cause, and one on the scariest migration you've shipped and how you made it safe.

## 2 · Screening questions (Max's, 15-min call)

1. "Walk me through recovering a Postgres database to a point in time — what do you check before you trust the restore?" (Listen for: restore to a *separate* instance first, row-count/spot checks, never restore over live.)
2. "A deploy is live and errors spike. First three moves?" (Listen for: roll traffic back to the previous revision FIRST, then diagnose — matches `PILOT_ROLLBACK.md`.)
3. "When is a `DROP COLUMN` migration safe?" (Listen for: only after the code that read it has been out of production for a while — backward-compatibility instinct.)
4. "What would you want in place before reviewing payroll-affecting code?" (Listen for: tests around money math, idempotency, an audit trail.)
5. Rate/availability honesty check: "Some months are 2 hours. Some incident weeks are 10. Does the retainer structure work for you?"

## 3 · The validation month = "signed" (what M-1 ✓ actually means)

Per the program: M-1 is validated only by the candidate **personally running**, with their own credentials, each of:
- [ ] **One restore drill** — Supabase backup → throwaway project → verify `daily_checks` rows (they write the drill log entry).
- [ ] **One full deploy** — a trivial doc/comment PR through the full path: PR → CI green → merge → `deploy.yml` verify→migration-safety→migrate→deploy→env-drift, watched end-to-end. (This doubles as GAP-9's "one PR through the full migrate path" proof.)
- [ ] **One Sentry triage** — a real or test event traced to file/line with a written root-cause note.
- [ ] **One rollback** — traffic to previous Cloud Run revision and back, timed.
- [ ] Own credentials confirmed in: GitHub (repo), GCP (Cloud Run + Secret Manager read), Supabase, Sentry, healthchecks.io.
- [ ] Reads: `00_START_HERE.md` → `STATUS.md` → `DECISIONS.md` → `CLAUDE.md` → `PILOT_ROLLBACK.md`; can answer "what is D16?" unprompted.
- [ ] **72-hour break-glass runbook** written WITH them (contact chain, credentials location, first moves) — the runbook is the deliverable that proves the drills stuck.

**When all boxes tick: flip GitHub branch-protection approvals 0→1** (they become the reviewer), record M-1 ✓ SIGNED in STATUS §3 with dates, and add the drill log to the standing monitors ("a lapsed drill = uninsured").

## 4 · Where to post + budget note

TS/Next contractor pools (the program: "candidates exist in any TS/Next contractor pool"): your own network first (an agency bench engineer is ideal — continuity built in), then regional dev-shop retainer inquiries, then a targeted post (e.g. a senior-freelancer platform) — in that order; network hires shorten the trust runway this role is entirely about. Budget expectation for sizing offers: the bake-off priced AHITS's total run-cost including exactly this kind of cover inside $82–131k/24-months all-in — a 4–8 hr/mo senior retainer fits without moving that math.

---
*Owner: Max posts §1 + runs §2. The validation month (§3) can start before CC-17 planning does — it's the gate, not the ceremony.*
