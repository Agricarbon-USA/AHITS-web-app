# AHITS — Session Handoff · 2026-07-21b

> Read `STATUS.md` (§1/§3/§4) and `DECISIONS.md` **D14** first. This records what moved after the earlier 2026-07-21 handoff (which planned CC-15). Everything below is **shipped**.

## Shipped this session

### CC-15 Deployment Map — ✅ MERGED & smoked (D14), inside the Thursday 07-23 freeze
- **PR #197 (GPS capture, merged):** additive `DailyCheck.gpsLat/gpsLng/gpsAccuracy` migration + resolve-or-skip `getCurrentPosition` in the daily-check `buildPayload` (denied/dismissed/timeout → null coords, never blocks; rides the offline queue). FND-35 confirmed already-fixed.
- **PR #198 (maps, merged):** admin map (`/admin/map`) — one pin per active deployment, recency green/amber/red (businessDate-aware), popup deep-links to the deployment drawer via `?operator=`; per-rig route-history trail (drawer reaches it via `/admin/map?rig=<id>` — **D12 transitive-reach, Max accepted**, not an embedded map); operator crew map (`/operator/map`) of teammates' last-known positions. D2 held: attestation-only, no live tracking anywhere.
- **Secret:** `AHITS_MAPBOX_TOKEN` created ENABLED + mounted (server-side only, `MAPBOX_TOKEN` env via `--set-secrets`). **Now mandatory for every staging deploy.**
- **Smoke:** passed on staging — 3 recency-coloured pins + a 3-point SLC trail + crew map, using `scripts/cc15-staging-smoke-seed.sql` (+ `-cleanup.sql`). All smoke data was synthetic, **`seed-cc15-*` id-keyed across all six tables** (users/vehicles/rigs/deployment_assignments/rig_vehicles/daily_checks); **cleanup ran, 0 synthetic rows remain**, real data untouched.
- **Docs:** D14 + STATUS + A6 row 29 + the 2026-07-21 handoff were the CC-15 session-close, merged as PR #199.

### Copy-link invites — ✅ MERGED (PR #200)
- Email-independent onboarding. `POST /api/users/invite` + the resend route (`POST /api/users/invite/[id]`) take `delivery: 'EMAIL'|'LINK'` (default **EMAIL, byte-identical**). **LINK** skips `sendEmail`, returns `{ setupUrl, expiresAt }`, `Cache-Control: no-store`; the raw token is never persisted/logged/audited (audit carries only email/role/inviteId). Same token-hash / 48h expiry / revoke. New audit actions `INVITE_LINK_CREATED` / `INVITE_LINK_REGENERATED` — **no migration** (`AccountAuditLog.action` is a `String`).
- **UI (`/admin/users`):** email-vs-link choice; a one-time copy dialog (URL + expiry + "shown once — regenerate if lost"); a net-new **Pending Invites** list with **Regenerate link** + **Revoke**.
- **Operators still set their own PIN** on `/setup-account` (untouched).
- **Antagonist seat:** revoke keeps the same token hash → deadness is enforced at the account-minting `/complete` route (pre-check + atomic claim `where revokedAt: null`), asserted by test — not only at the friendly `validate` page.
- Staging-smoked (incognito setup + PIN + sign-in; regenerate → old link 404s).

## Resume points / residual
1. **iOS A6-Lite on the post-CC-15 build** — now rows **2 / 5 / 6 / 19 / 23 / 29** (row 29 = location grant AND deny at the daily check); Android re-verify rows **2 / 19 / 29**. Target Fri 2026-07-24. This is the **sole outstanding pre-pilot-start gate** (pilot start Mon 2026-07-27).
2. **Prod cutover (D1)** stays deferred; when it happens it needs **`AHITS_PROD_MAPBOX_TOKEN`** or the first prod deploy fails at `--set-secrets` validation.
3. **Full A6 matrix** parked → trigger is pre-CC-17 (edge rows 20–22 + all-column ceremony).
4. **Open, unrelated:** docs PR **#173** ("version the AHITS planning corpus", from 2026-07-11) is still open — a stale prior-session PR, NOT reviewed this session; left for Max to decide (do not blind-merge — stale base).

## Not touched
W0-10 held patches (D4); production; the parked CC-20 remainder; the CC-14 D9/D11 glossary sweep.

## Verify the claims (60s)
- CC-15 live: `grep -rn "MAPBOX_TOKEN" Makefile` · `ls "src/app/(admin)/admin/map/page.tsx"` · migration `prisma/migrations/20260720120000_cc15_daily_check_gps`.
- Copy-link invites: `grep -n "INVITE_LINK_CREATED" src/lib/audit.ts` · `grep -n "delivery" src/app/api/users/invite/route.ts`.
