> ⤴ **ARCHIVED (superseded) — SUPERSEDED-BY `AHITS_SESSION_HANDOFF_2026-07-21b.md`, moved 2026-07-22.** Historical; kept for provenance.

# AHITS — Session Handoff · 2026-07-21

> Read `STATUS.md` (§1/§3/§4) and `DECISIONS.md` **D14** first. This handoff only records what moved this session and where to resume; it does not re-narrate decisions.

## What this session did — CC-15 Deployment Map, pulled ahead of the pilot (D14)

Executed CC-15 under the `AHITS_CC15_PRELAUNCH_RIDER.md` rider: two PRs, both **OPEN and NOT merged** (each gated on Max's staging smoke). Step 7 (weather stamps) is OUT per the rider.

### PR-1 (#197) — GPS capture at the daily check · steps 1–2 · GREEN, awaiting smoke
- Additive migration `DailyCheck.gpsLat/gpsLng/gpsAccuracy Float?` (DOUBLE PRECISION, mirrors `Photo` GPS; `prisma/migrations/20260720120000_cc15_daily_check_gps`).
- `getCurrentPosition` in the daily-check `buildPayload()` — **resolve-or-skip**: denied / dismissed / position-unavailable / 10s-timeout all submit with **no coords**; location NEVER blocks or fails a check. Captured on-device before enqueue, so coords ride the offline queue unchanged.
- API upsert persists coords with **undefined-skip** (a denied re-submit preserves a prior good fix). One-line pre-prompt explainer on the review step (D2 trust framing).
- **FND-35 confirmed already fixed** in the file (stable-vehicle-type effect key + active-cancellation guard) → no fix-first commit needed.
- Tests: capture-with-permission · capture-denied-still-submits · queued-offline-check-carries-coords.
- **Status:** full verify gate green (tsc, eslint 0-errors, node 37/184, UI 17/74, prod build), CI green, **staging-deployed** (`ahits-web-app-staging`, migration applied). **Awaiting Max's smoke** (granted / denied / airplane-mode) → then merge.

### PR-2 (#198, DRAFT / HELD) — the maps · steps 3–6 · GREEN, blocked on secret + seed
- **Secret + CSP:** `MAPBOX_TOKEN` `--set-secrets` Makefile mapping (server-side only, never `NEXT_PUBLIC_`); read at request time in the map pages (`force-dynamic`) → passed to the client as a prop (SentryProvider pattern). `proxy.ts` CSP `connect-src`/`img-src` += `api.mapbox.com`, `connect-src` += `events.mapbox.com`.
- **Admin map** `/admin/map`: one pin per active deployment at latest-check coords; recency colours green today / amber yesterday / red 2+ days (**businessDate-aware**, FND-7); popup deep-links to the deployment drawer via `?operator=<id>`.
- **Route history:** per-rig check-in trail (one point per business day, chronological) on the admin map; the deployment drawer reaches it via a **"View route history →" link to `/admin/map?rig=<id>"** (D12 transitive-reach, not an embedded map — **flagged for Max to accept/reject at review**).
- **Crew map** `/operator/map`: other deployed operators' last-known positions; viewer excluded; "last-known, not live"; zero new taps.
- Reusable `DeploymentMap` (mapbox-gl dynamically imported → SSR-safe; popup text HTML-escaped; graceful token-absent fallback; colours from `@/theme/tokens`).
- Tests: recency-color businessDate boundaries · route-trail ordering (per-day dedup, GPS-null excluded, latest-across-vehicles pin).
- **Status:** verify gate + **production build** green; opened as **draft** so nobody label-triggers a deploy that would fail without the secret.

## Resume points (in order — the path to the Thursday 07-23 freeze)
1. **Max smokes PR-1 (#197)** on staging → on his go, **merge to `development`**.
2. **Max creates `AHITS_MAPBOX_TOKEN`** in Secret Manager (one **ENABLED** version, deploy SA granted Secret Accessor, server-side only). **Do not trigger PR-2's deploy until this exists** — Cloud Run validates `--set-secrets` at deploy time and will fail otherwise.
3. **Trigger PR-2's staging deploy** (`gh workflow run pr-staging-deploy.yml -f pr_number=198`, or the `deploy-staging` label).
4. **Max runs `scripts/cc15-staging-smoke-seed.sql`** against staging (back-dates GPS checks; the POST clamps `date` to today, so the API alone can't make a multi-day trail / amber-red pins / a 2nd-operator crew pin). Then **smoke** pins+recency+deep-link, a 2+point route trail, and the crew map.
5. **Rebase PR-2 onto `development`** after PR-1 squash-merges (drop the redundant PR-1 commit) and retarget its base; on Max's go, **merge**.
6. **iOS A6-Lite re-run** on the post-CC-15-merge build now includes **row 29** (location grant AND deny at the daily check); Android needs a quick re-verify of rows 2/19/29.

## Watch-outs
- **Freeze is sacrosanct:** anything not merged+smoked by **Thu 2026-07-23 EOD** parks to pilot week 2. **CC-15 never gates the pilot** (start Mon 2026-07-27 stands).
- **Post-merge consequence:** once PR-2 merges, `AHITS_MAPBOX_TOKEN` is **mandatory for every staging deploy**; prod cutover (D1) needs `AHITS_PROD_MAPBOX_TOKEN` or the first prod deploy breaks.
- **Do not push docs/other changes directly to `development` while Max is smoking a PR** — `development` auto-deploys to the same `ahits-web-app-staging` service and would clobber the PR preview. (This handoff ships as its own docs branch/PR for that reason.)
- The **W0-10 held patches (D4)** and **production** were not touched.

## Verify the claims (60s)
- PR-1 landed columns: `grep -n gpsLat prisma/migrations/20260720120000_cc15_daily_check_gps/migration.sql`.
- PR-2 map routes exist: `ls "src/app/(admin)/admin/map/page.tsx" "src/app/(operator)/operator/map/page.tsx"`; anti-goal audit: `grep -rin "watchPosition\|current location\|real-time" src/lib/deployment-map*.ts src/components/map` → expect none.
