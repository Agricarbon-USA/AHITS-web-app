# Session handoff · 2026-10-26 · Hotfix: signal returning no longer reloads the app

> Read with `STATUS.md` (resume line), the packet `AHITS_HOTFIX_2026-10-25_KEEP-WORK-ON-RECONNECT.md` (decisions H2-a…H2-d; no new D number), and D48 (a dated deviation note was added).

## What shipped
- **#270 built** on 2026-10-26. It changes seven files and adds four tests, all as written in the packet. The local gate is green: tsc clean, eslint 0 errors and no new warnings, `test:ui` 71 files / 571 tests, build OK, and `my-deployment/page.tsx` still 1467 lines. Each new test was shown to fail without its fix. PR CI is green after one rerun for the ECR Public data limit.
- **Merged** at 09:34 Central on the owner's ruling, as a **D48 deviation**. Active Deployments was **4**, read at 09:27 with the tab visible. I recommended waiting for 20:00; the owner chose to merge now.
  - Squash `b91ea36`.
  - Deploy run 40340903667, green through env-drift on the first attempt.
  - Revision `ahits-web-app-staging-00452-p2h`. `/api/health` returns 200 `{"status":"ok","db":"up"}`.
- **Smoke** (desktop Chrome, admin, tab visible, read-only, no data written):
  - **Before the merge:** on the live build, `window.dispatchEvent(new Event('online'))` reloaded the dashboard (navigation type `reload`).
  - **After the deploy:**
    - None of the 39 loaded chunks contains `"online",()=>location.reload`.
    - An `online` event keeps the same document. It sends one `ahits:invalidate` with all 10 keys, and the dashboard re-reads (`/api/dashboard`, `/api/admin/alerts`, …).
    - `sw.js` precaches `/~offline` at revision `"2026-10-25"`.
    - `/~offline` shows "You're offline" with one nonce'd inline script in `<main>`. An `online` event reloads it, so the CSP lets the script run.
- **§7 docs (this PR):**
  - A6 checklist: row 30 added, row 13 sentence appended, "30 rows".
  - STATUS: resume line, and the PIN-rotation line corrected.
  - `CHANGELOG.md` created, with #270 and #268.
  - D48 deviation note.

## Resume points
1. **Owner, packet §5 steps 3–5 (phone):**
   - Get the new build first: close the app fully, reopen it online, wait 10 s, and tap Reload if the update prompt shows.
   - Add items: make picks, then airplane mode on and off. The picks should stay and the page should not reload.
   - In the phone browser: open `/operator/dashboard?hf2=1` while offline to get the offline page. Turn airplane mode off and the dashboard should load by itself.
   - Not yet done. This session tested only on desktop Chrome, with a synthetic `online` event and no real network drop.
2. **PIN rotation (#269): operators only, by admin Reset PIN.** Don't use Change PIN or Reset PIN on admin accounts: an admin's 6-digit PIN written over their 8+ character password locks them out. Admin credentials wait for P1-2. `AHITS_SESSION_HANDOFF_2026-10-22_HOTFIX-CHECKER-FIELDS.md` resume point 3 says "admins included". That is superseded by this line and by STATUS.
3. **CI's Postgres pull from ECR Public** keeps hitting "Data limit exceeded" (two wordings). It cost one rerun on #270's PR CI and several earlier. A CI-config PR would fix it, but needs the owner's go.
4. **Next in the packet slot:** P1-1.

## Notes
- **Untracked and not touched:** `AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md`, `AHITS_PACKET_P1-1de_RESERVATIONS_2026-10-25.md`, `AHITS_SESSION_CLOSE_2026-10-22_FIX-PROGRAM-WRAP.md`. These are the owner's packets and notes, outside the named files.
- **Staging sign-in:** the admin session had expired at the start of the smoke. The owner signed in; I don't enter credentials.
