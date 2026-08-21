# AHITS — Next Steps · plain-English checklist · 2026-08-20

> This page is deliberately jargon-free: one action per line, in order, with time estimates. Tick freely.
> The detailed version of everything here (IDs, history, reasoning) lives in `AHITS_RESUME_BRIEF_2026-08-20.md` — you never need it to work this list.
> Two rules: **do Part 1 before building anything · do Parts 2–3 before any operator touches the app again.**

---

## Part 1 · At your computer — one sitting, ~2½ hours (items 3–6 fit inside item 2's and 5's waiting time)

1. [ ] **Push the saved work to GitHub (2 min).** In Terminal:
   `cd ~/Downloads/"Agricarbon US Codebase" && git push origin development`
   *(Three commits from our sessions are sitting on your machine only — this puts them safely on GitHub.)*

2. [ ] **Practice a database restore (~30 min) — the single most important item on this page.**
   Supabase dashboard → your project → **Database → Backups**:
   a. Note what backup plan/retention you're on (write it down).
   b. Turn on point-in-time recovery if it's offered.
   c. Restore the latest backup into a **new throwaway project** (never over the real one).
   d. Open the throwaway → confirm the daily-checks table has rows → delete the throwaway.
   e. Tell me what you clicked and I'll write it into the emergency playbook for you.
   *(Right now, if this database is lost, everything is lost — this drill is the insurance.)*

3. [ ] **Close the last GitHub loophole (2 min).** GitHub repo → Settings → Branches → edit the `development` rule → tick the option that makes the rules apply to admins too ("Do not allow bypassing" / "Include administrators") → Save.

4. [ ] **Lock the map key to your site (5 min).** account.mapbox.com → Tokens → your token → add a URL restriction for the app's staging address. *(Stops strangers burning your map quota.)*

5. [ ] **Prove the monitoring is actually alive (~40 min, mostly waiting):**
   a. **healthchecks.io** → log in → the check should show a ping within the last hour → set its grace period to under 30 minutes.
   b. **Google Cloud Console → Cloud Scheduler** → pause the job → wait ~35 min → open the app's admin dashboard → a "background jobs silent" warning should appear → resume the job → the warning clears.
   c. **In the app:** Admin → Settings → press the two "send test error" buttons → check sentry.io that both events arrived.
   *(None of this has ever been fired for real — if any step doesn't behave, tell me and I'll fix it.)*

6. [ ] **Delete two leftover test copies of the app (5 min).** Google Cloud Console → Cloud Run → delete `ahits-web-app-preview-cc31-pr3` and `ahits-web-app-preview-cc31-pr2`.

7. [ ] **July-trial leftovers — say the word and I'll do it.** Old alerts and never-closed deployments from July will clutter the screens on restart; I can clean them up for you in one short session.

## Part 2 · This week, before anyone uses the app again — ~2 hours, phone + paper

1. [ ] **Count this week's group texts (30–60 min).** Scroll the crew thread(s) and count messages by type: equipment requests · "did you check the truck" · problem reports · other. *(This is the "before" number that will prove the app earns its keep — and it vanishes the moment people start using the app again. Do this one first.)*

2. [ ] **Export Clockify (20 min).** Reports → export full history as CSV → note roughly how many taps one person spends per day. *(The "before" number for the future timesheets feature.)*

3. [ ] **Give Stewart admin access (30 min).** App → Team Management → invite with **copy-link** → admin role. The deal: he checks the app 5 minutes a day, you only do a Monday look.

4. [ ] **Operator start-up sheet — I'll draft it, just say the word.** One page: how to install · "Transfer" is the word we use · reload the app after updates · never delete-and-reinstall. Print it or text it.

## Part 3 · Test on your phone — 1 hour + one overnight (after Part 1)

*Real use in July already proved the basics — checks syncing in bad signal, the 5-tab layout, the back button, installing. Those are done. These eight never came up naturally:*

1. [ ] **Two phones — transfer both ways:** send a whole-rig transfer → accept on the other phone → ownership moves. Then a selected-gear transfer → only that item moves.
2. [ ] **Airplane mode — report a broken item** with a photo and note → signal back on → it appears for the admin, photo attached, and the item is still listed in the kit. Marking it "Out of service" moves it to maintenance.
3. [ ] **Overnight sync:** evening, airplane mode, do a check → leave it → next morning it syncs and shows under YESTERDAY (the day you actually did it).
4. [ ] **Remote logout:** log a phone out from the admin side → that phone is locked out at its next tap.
5. [ ] **Signed-out submit:** with an expired login, submit a check while online → app says "saved — sign in to send" → sign in → it lands.
6. [ ] **Maintenance schedules:** add the real Wintex 90-day and Giddings service items → due dates look right → close a repair in ≤3 clicks → the operator's phone shows "In repair".
7. [ ] **Shared links:** an old/expired link shows nothing sensitive; a live link works; double-tapping its button doesn't double-submit.
8. [ ] **Wrong address:** type a bad URL inside the installed app → you get a friendly branded error page with a working Home button.

## Part 4 · Claude Code — the building queue, in order

1. [ ] **Build session 1 — "stop losing to text messages."** Open Claude Code in the project folder and paste BOTH of these, together: the **UXP-3 section** of `AHITS_UX_PACKETS_2026-07-29.md` **and all of** `AHITS_UXP3_RIDER_2026-08-20.md`. In plain terms it builds: requests notify the person when they're handled · a submitted check can never silently vanish · a half-done check survives closing the app · photos can come from the camera roll · lockout messages tell the truth. You merge in the evening as usual.
2. [ ] **Build session 2 — "make adding equipment fast."** Ask Claude Code (or me) to draft the admin-setup improvement plan first — the fix for "creating equipment feels clunky" — then build it the following session.
3. [ ] **Post the backup-developer ad (20 min — not a Code session).** The ad is already written: top section of `AHITS_M1_RETAINER_POSTING_2026-08-20.md`. Send it to your network or a contractor pool. *(A second person who can run the system — required before the big timesheets build, and your bandwidth insurance.)*
4. [ ] **Later sessions:** visual polish for sunlight/gloved hands, then the bigger roadmap. Ignore until 1–3 are done.

## Part 5 · Restart the pilot (when Parts 1–3 are ticked)

1. [ ] Each July phone opens the app **online** once → confirm its Outbox is empty.
2. [ ] Re-onboard the 2–3 July operators first (they know it), start-up sheet in hand → then add the rest gradually.
3. [ ] Stewart watches daily · you do Mondays.
4. [ ] The day the first check lands: **write the date down.** That starts the official 2-week measuring window.

---

**Done recently (don't redo):** all stray docs committed (3 commits await your push) · decision log brought current (D30–D36; that old cron bug turned out to be already fixed) · July trial formally closed out with its data kept · Airtable reporting shelved with written revisit conditions · build order decided (session 1 above goes first) · photo policy decided (camera roll allowed; a missing camera never blocks).

**Parked on purpose — safe to ignore for now:** full device test matrix · UK-parent security pack · adoption measuring dashboard additions · timesheets build (off-season, needs the backup developer signed) · production server standup (has a written trigger) · Airtable reporting (has written revisit conditions).
