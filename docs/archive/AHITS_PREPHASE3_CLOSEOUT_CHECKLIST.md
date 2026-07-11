# AHITS — Pre-Phase-3 Closeout Checklist

The three remaining gates before Phase 3: **UR-021** (decide what "production" is), **A6** (real-device offline pass), **UR-005b** (private photo bucket). Work them in this order — UR-021 unblocks the cutover, A6 is the pilot gate, UR-005b is a prod-hardening item that can land in parallel.

---

## UR-021 — Settle "what is production" (decision + execution)

**Why it's open:** the Session-7 roadmap says "stand up a separate prod DB + `AHITS_PROD_*` secrets," but the Session-11 handoff shelved that and declared "ONE environment." You can't cut over until you pick one. This is a human call — it can't be inferred.

### Step 1 — Make the decision
- [ ] Choose **Option A — Separate prod project** (recommended): a new Supabase project + `AHITS_PROD_*` secrets + a `production` branch deploy. Gives real test/prod data isolation; money/assets never share staging's DB.
- [ ] …or **Option B — Promote the single staging env to prod-grade**: faster, but **no test/prod isolation** — every QA write lands in the same DB real operators use. Only acceptable if you accept that risk explicitly.
- [ ] Write the decision + rationale in one place (e.g. top of `AHITS_PROD_STANDUP_CHECKLIST.md` or the register UR-021 row), dated and signed.

### Step 2 — Reconcile the contradicting docs
- [ ] Update the Session-7 roadmap **and** Session-11 handoff so they state the *same* answer. The current contradiction is the root of this item; leaving it will re-open the question next session.

### Step 3a — If Option A (separate prod): execute the standup
Follow `AHITS_PROD_STANDUP_CHECKLIST.md` end to end. The gates there, in order:
- [ ] **Phase 0** — create a **new** Supabase project `ahits-prod` (never point prod at staging's `DATABASE_URL`).
- [ ] **Phase 1** — create all 11 `AHITS_PROD_*` secrets; PIN/CRON secrets **freshly generated** (not copied from staging); `AHITS_PROD_NEXT_PUBLIC_APP_URL` = the real prod host (it's embedded in `/s/` status links); grant the deployer SA `secretAccessor` on each.
- [ ] **Phase 2** — `make cloud-run-migrate SECRET_NS=AHITS_PROD` against the empty prod DB (applies the committed migration history, including the rental migration).
- [ ] **Phase 3** — create the first admin; **do NOT** run `make db-seed` (it wipes data).
- [ ] **Phase 4** — stand up a **separate prod cron scheduler** hitting the prod URL with the prod `CRON_SECRET`.
- [ ] **Phase 5** — cutover only after CI is green on `development`: promote `development → production` via PR, push `production` (runs `verify → make deploy-prod SECRET_NS=AHITS_PROD`). Never deploy to prod from a local machine.
- [ ] **Phase 6 (the critical check)** — create an inventory item in **prod**, confirm it does **NOT** appear in staging (and vice versa). If it does, prod is on staging's DB — STOP and fix `AHITS_PROD_DATABASE_URL`/`DIRECT_URL`.
- [ ] **Phase 7** — take a post-cutover Supabase snapshot; run the one-line cutover gate at the bottom of that checklist.

### Step 3b — If Option B (promote single env): minimum hardening
- [ ] Relabel the env so no one mistakes it for disposable (`ahits-web-app` not `…-staging`).
- [ ] Rotate `PIN_SESSION_SECRET` + `CRON_SECRET` to fresh values.
- [ ] Establish a **data-isolation policy in lieu of separate DBs**: no `make db-seed`, no `db push`, all QA on throwaway records, and a documented "no test data in prod" rule.
- [ ] Turn on automated Supabase backups + a restore drill.

### Step 4 — Close it
- [ ] Mark UR-021 resolved in the register with the chosen option and the cutover date.

---

## A6 — Real-device offline pass (the pilot gate)

**Why it's open:** the offline durable queue is solid where used, but it must be proven on *real* iOS + Android hardware against the flows that matter in the field. UR-006/007 are now routed through the queue — A6 verifies them under real loss-of-signal, plus the UR-008 ergonomics.

### Step 1 — Device + install matrix
- [ ] iOS Safari — installed as a PWA (Add to Home Screen).
- [ ] Android Chrome — installed PWA.
- [ ] One desktop browser (Chrome/Edge) as the control.
- [ ] On each: sign in as a real operator (not admin), so PIN-session + role gating are exercised.

### Step 2 — Offline write scenarios (toggle airplane mode at each ⚡)
For every scenario: perform the action **offline**, confirm an optimistic/queued state, then **reconnect** and confirm exactly-once apply with no duplicate.
- [ ] **UR-006 — deployment create offline.** Build a rig (vehicles + kit) ⚡offline⚡, submit. Confirm it queues (placeholderId), survives an app kill/relaunch, and on reconnect creates exactly one deployment.
- [ ] **UR-007 — daily check offline.** Submit a pass **and** a fail ⚡offline⚡. Confirm both durably queue with idempotency and apply once on reconnect (and the fail still raises the `DAILY_CHECK_FAILED` alert).
- [ ] **Photos offline.** Attach a photo to an offline write; confirm it stores as `localphoto:` and uploads + remaps to a real URL on reconnect (no stranded refs).
- [ ] **UR-026 — dependent writes.** Do an offline create then an offline edit of the *same* record; confirm the placeholder→real id remap keeps them linked.
- [ ] **Rental add offline.** Add a rental ⚡offline⚡; confirm the agreement upload defers gracefully and the "Agreement needed" flag shows until you attach it online (matches the non-blocking design).
- [ ] **Double-submit / flaky signal.** Tap submit twice, or reconnect mid-flight; confirm idempotency prevents a duplicate.

### Step 3 — UR-008 ergonomics (installed PWA only)
- [ ] **iOS safe-area:** with `viewport-fit: cover`, confirm no notch/home-indicator clipping of the app shell or bottom controls.
- [ ] **Navigation reachability:** confirm primary nav is reachable one-handed (the hamburger-only drawer was flagged — note if a bottom tab bar is needed).
- [ ] **Service-worker update:** ship a trivial change, confirm the operator is **not** swapped mid-form silently (the `skipWaiting: true` SW was flagged — verify an "update available" prompt or safe timing).

### Step 4 — Sign off
- [ ] Record device/OS/browser versions tested, pass/fail per scenario, and any defects (file new UR-#).
- [ ] All green → mark A6 done; this is the pilot line.

---

## UR-005b — Private photo bucket + signed URLs

**Why it's open:** uploads go to a **public** Supabase bucket (`photos`) via `getPublicUrl` (`src/app/api/uploads/route.ts:67`). Damage/serial/site imagery is world-readable via enumerable URLs and is embedded into login-less `/s/` shop-status links. The magic-byte sniffing (UR-005) already landed; the remaining piece is the **private bucket + signed URLs** infra.

### Step 1 — Supabase config
- [ ] Set the `photos` bucket to **private** in the Supabase dashboard (or via API).
- [ ] Confirm the service-role key (server-side only) can still write; the anon key cannot read.

### Step 2 — Switch uploads to signed reads
- [ ] In `uploads/route.ts`, replace `getPublicUrl(path)` with a stored **object path** (not a public URL). Return the path/key to the client instead of a public URL.
- [ ] Decide the read model:
  - **Render-time signing (recommended):** persist the storage path; generate a short-TTL `createSignedUrl` at the moment a photo is rendered. Do **not** persist signed URLs — they expire.
  - …or a **server proxy route** (`/api/photo/[path]`) that auth-checks then streams the object.
- [ ] Note: `src/lib/photo-security.ts` `isAllowedPhotoUrl` already accepts `…/object/sign/…` paths, so signed URLs pass origin validation — but expiry is the reason not to store them.

### Step 3 — The login-less status pages (the hard part)
- [ ] The `/s/` shop/hub status links have **no session**, so they can't mint signed URLs as a user. Choose one:
  - a tokenized, time-boxed signing endpoint scoped to that specific status link, or
  - a server-rendered page that signs each photo at render with a short TTL, or
  - keep *only* status-page imagery in a separate public bucket and everything sensitive private.
- [ ] Whatever you pick, confirm an expired/blank link cannot enumerate other objects.

### Step 4 — Migrate existing objects + verify
- [ ] Move/keep existing objects in the now-private bucket; confirm old persisted public URLs are re-pointed (or proxied) so historical photos still load.
- [ ] **Verify world-readability is gone:** open a raw object URL in an incognito window with no token → expect 403/denied.
- [ ] **Verify in-app:** operator + admin photo galleries and the `/s/` status pages still render (via signed/proxied URLs).
- [ ] Run `tsc` + `eslint` + the upload test; ship via the normal PR → `development` flow.

### Step 5 — Close it
- [ ] Mark UR-005/005b resolved; this clears the last prod-hardening security item.

---

### Suggested sequencing
1. **A6** first (or in parallel) — it's the pilot gate and needs only real devices, no infra.
2. **UR-021** — decide now; execute the standup when you're ready to cut over.
3. **UR-005b** — land before *production* (not required for pilot); can run in parallel with the A6 pass.
