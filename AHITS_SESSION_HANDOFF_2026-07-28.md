# AHITS — Session Handoff · 2026-07-28

> STATUS: current · UPDATED: 2026-07-28 · SUPERSEDES: `AHITS_SESSION_HANDOFF_2026-07-22.md` · READ-WITH: `STATUS.md` · `AHITS_SIX_SEAT_REVIEW_2026-07-28.md` · `AHITS_CC29-31_PILOT_FLOOR_PACKETS.md` · `DECISIONS.md` D16–D20
> Six-seat critical review + owner interview session (Cowork). **No code changed** — this session produced the review, five decisions, four paste-ready packets, and the corpus sync recording them.

## What this session did

1. **Ran the full six-seat review** (Antagonist, Calibration, Operator-lens, SRE, Integration, Fable) over the repo + corpus → `AHITS_SIX_SEAT_REVIEW_2026-07-28.md` (every finding with file:line evidence). Headline: three silent write-loss mechanisms in the offline path, a pipeline still treating staging as disposable, and a pilot design that measures compliance rather than preference.
2. **Interviewed Max** (structured, 3 rounds). Ground truth learned: the 07-27 launch **did not happen** (operational delays → rolling start); iOS A6-Lite **ran & passed but was never recorded**; the entire Thursday preflight (backups, healthchecks, CRON_SILENT, Sentry, min-instances) was **never attempted**; all 9 operators are **solo-PRIMARY** (no shared rigs → secondary seam deferred); payroll incumbent is **Clockify** (hours fine, invoicing painful); the week's planner is **Max, in his head/texts**; **staging is home** for the foreseeable future.
3. **Recorded D16–D20** (staging-is-home · postponed→rolling start + A6 retro-record · CC-16 split/park · CC-17 full-replace-Clockify with riders · Stewart = admin #2).
4. **Wrote the pilot-floor packets** — `AHITS_CC29-31_PILOT_FLOOR_PACKETS.md`: CC-29 (offline trust floor, gates first operator), **CC-32 (friction & flow — the UX floor, added on Max's UX-priority call, slots after CC-29; owns the D11 glossary sweep)**, CC-30 (staging-is-home ops floor + Max's live-fire checklist), CC-31 (accuracy floor + /admin/pilot dashboard), CC-16S (public-surface security step-0). Each grounded file:line by dedicated agents against the actual code.
5. **Corpus sync:** STATUS launch box rewritten (rolling start, new gate = CC-29), STATUS §4 re-baseline item, workplan §15 (Workstream 7 + downstream queue changes + corpus-thinning), A6 checklist iOS banner retro-ticked, 00_START_HERE routing rows.

## Second pass (same session): simplification + opportunity interview → D21–D25 + CC-33

While Max ran CC-29, two more agent scans (simplification, opportunity) + two interview rounds produced: **D21** (Forward→Operator removed — never used; portal reservation-forwarding frozen; ~450-LOC dead-code sweep; my-deployment anti-regrowth rule), **D22** (one unified "Transfer" entry — entire-rig = handoff, ownership flips, client-flow only), **D23** (carrier shipping is real at 5+/month — NS-9 trigger MET, tracking queues post-CC-17, Shipment table stays dormant), **D24** (mounted units need NO model — permanently mounted; template bridge + carrier-vehicle maintenance tasks; CC-21 spike CLOSED, L build cancelled), **D25** (evidence probe RETIRED — audits ride the science-side app; lane = passive capture). Packet **CC-33 Simplify & unify** written and appended to the packets file; queue is now CC-29 → CC-32 → CC-30 → CC-31 → CC-16S → CC-33. Two capture-now owner actions added to W7-5: the **mounted-units template bridge** and the **Clockify archive snapshot**.

## Resume points (ordered)

1. **Paste CC-29 to Claude Code** (one packet per session). It gates the first operator onboarding — nothing else moves first.
2. **Max, in parallel:** the CC-30 live-fire checklist items that need no code (Supabase backups + restore drill; healthchecks grace period; branch protection; delete the `deploy-staging` label; Mapbox token restriction) — every one is currently unverified and cheap.
3. Then CC-32 (Max confirms the glossary word list first — packet step 0) → CC-30 → CC-31 → CC-16S, in order.
4. **Owner riders:** Stewart's ADMIN account + one-page admin guide (D20); onboarding one-pager (D17); baseline the group-text volume before first operators go live; "someone gets hurt" line on the triage card.
5. Post-floor queue (workplan §15): secondary-operator Today packet (pre-CC-17) → CC-17 (full replace, D19 riders — measure Clockify's daily taps FIRST) → CC-18 (re-confirm scope; its customer is Max).
6. Still pending from before: batch6a residue is ONE site (`admin/hubs/page.tsx:71` — hand-apply, don't `git am`); D6/D15 email chain (Resend DNS etc.) unchanged.

## ⚠️ For the next session's eyes

- The six-seat review's **Calibration table** (§5) lists every claim-vs-code verdict — read it before trusting any STATUS claim older than this session.
- **Gates get ticked the day they run** (D17's process rule) — the iOS A6 pass going unrecorded cost this session real diagnostic time.
- These docs were written from a Cowork session against a snapshot of the repo; **this session could not push to git**. Committing these files (session-close steps 5–6) is the FIRST act of the next Claude Code session: `git add -A && git commit && git push`, then confirm `git ls-files '*.md'` shows the six new/changed docs.
