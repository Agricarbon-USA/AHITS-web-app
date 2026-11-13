# AHITS decisions — the rules today

- A rule is one plain sentence: what the app, or the people who build it, must do.
- To add or change a rule, edit one line here in the PR that changes it.
- History is in `docs/DECISIONS_HISTORY.md`; IDs in brackets point there. "— not built yet" means decided, but not in the live code as of Nov 11, 2026.

## What the app is for
- The one job: know where all gear is — who has what, and where, at any moment. (Nov 11)
- Crews use all four areas weekly: daily vehicle check; deployments and gear lists; requests, transfers, returns; problem reports and repairs. (Nov 11)
- Every working feature stays; only clutter and dead code may be removed. (Nov 11)
- The map shows only where daily checks were filed; the app never tracks anyone live. (D2)
- The app builds no audit-evidence feature. (D25)
- The no-login links for hubs and repair shops stay but are frozen: they keep working by copy-link, and no new work goes into them. (Nov 11)
- Quick fixes ship first. (Nov 11)
- No new operator interviews: the field brief is the feedback operators and Stewart already gave. The daily check "feels like homework" and kit setup is "clunky". (Nov 11)

## Words
- Say "Deployment" for the crew's job, "Equipment" to operators and "Needs repair" on the operator's switch; "rig" means the vehicles only. (Oct 22, Nov 11) — not built yet
- Labels use sentence case. (Oct 22) — not built yet
- One word per thing: Pick up, Start deployment, Return to hub, Check out · in, Staged, Returning, Transfer. (D9, D11, D40; screens still show capitals until the sentence-case change)
- "Fulfill" is only for actions that move stock; a material request is closed with "Mark Handled". (D9)
- Operators read "Transfer", never "handoff". (D22)

## People and sign-in
- Operators sign in with a 6-digit PIN. Admins sign in on the Admin tab with a password of 8 or more characters, or with a 6-digit PIN after a Reset PIN or a change of role. (Nov 11)
- A phone stays signed in for 4 days without use, up to 14 days after the PIN was typed; an admin can cut it off at once, and a change of role signs that person out. (D27, Nov 11)
- Operator PINs are not reset after the Oct 22 leak fix; the risk is accepted. (Nov 11)
- An admin may run a deployment; missed-check scans flag it as admin-run. (D3)
- The lead operator of a live deployment cannot be deactivated until it is ended or transferred. (D44)

## Daily check
- Driven vehicles and trailers each get a daily check. (Oct 22)
- Crews work in several time zones, so a check belongs to the day on the operator's own phone. Whether a check was missed is judged by that same clock. (Nov 11) — not built yet (today: the US Central day)
- Items start on "Yes". (Nov 11)
- A failed item stays open until someone marks it fixed. (Nov 11) — not built yet
- One check per vehicle per day covers the whole crew; a second is refused, naming who checked. (D47)
- A check filed late keeps the day it was done, up to 3 days back, and never overwrites another day's. (D26, Nov 11)
- Giddings and Wintex units are checked and serviced as part of the vehicle that carries them. (D24)
- A failed-check alert opens that check; a missed-check alert opens that operator's deployment. (D12)

## Deployments and gear
- Everyone on a deployment sees it on Today. (D47)
- A second crew member can do everything the lead can. (Oct 22) — not built yet
- A deployment has one project at a time and can move between projects. The dated project links stay as history, the old single project column is dropped, and ended deployments show their projects. (Nov 11) — partly built (ended deployments show their project; the old column is still there)
- A project is required to start a deployment, with an "Internal / no project" choice. (Oct 22) — not built yet
- The old "who holds it" columns go in one fresh PR, and the stale `held/` patches are deleted. (Nov 11) — not built yet
- One Start deployment builder serves both entry points, with search, "start from my last kit" and scan to add. (Oct 22) — not built yet
- Gear is serial-numbered (each unit tracked) or consumable (counted, used up); the type is fixed once an item has units, stock or history. (D49)
- "Returning" gear (sent back, not yet confirmed by the hub) counts as on hand and can go out again. (D40)
- A "Missing" state marks gear that did not arrive. (Nov 11) — not built yet
- Retire is for real gear you are done with; Delete is for mistakes and can be undone; neither works while something live points at the item. (D46)
- No photos are asked for on Add vehicles, Remove vehicles, Add items or Transfer; problem reports keep them. (Nov 11)
- A photo may come from the camera or the library; a missing camera never blocks a submit. (D36)
- Also decided, none built yet: a third "Auxiliary" gear type, an Equipment overview page, kit templates, boxes, a Project page, a Christie daily check, short checklists per vehicle type. (Oct 22)

## Hand-overs, returns and places
- One Transfer button offers the whole deployment (the receiver becomes its operator) or selected equipment. (D22)
- A transfer names a real, active person other than the deployment's own operator; the note is optional. (D52)
- A transfer between crewmates (a hand-over) changes the record at once; the receiver gets a notice and a "Not mine" button, which returns the gear to the giver and tells an admin. (Nov 11) — not built yet (today the receiver must accept)
- Handing over a whole deployment follows the same rule: it changes at once, and the new lead gets a notice and a "Not mine" button. (Nov 11) — not built yet
- Operators act only on their own deployment's gear; only an admin retires a vehicle. (D52)
- When two people change one deployment at once, the second is refused clearly and stock is counted once. (D52)
- Piedmont is the only hub; YS Shop is closed. (Nov 11)
- A temporary place (secure parking, a storage unit) is a named place, added in a few taps and closed when emptied. (Nov 11) — not built yet
- Every return names its hub; none is pre-picked. (D51; the server still falls back to the home hub)
- A return never changes an item's home hub. (D51) — not built yet
- Each serial-numbered unit has its own location, set by a return, a closed repair or an admin. (D51) — not built yet
- Broken gear can always go back to a hub; its repair stays open and goes with it. (D43)

## Requests
- A staged reservation is ready for pickup, with no extra Fulfill click. (D50) — not built yet
- A hold past its date waits for an admin to return it to stock or extend it. (D50) — not built yet

## Repairs
- Operators report trouble one way, "Report a problem", and say if the gear is still usable; admins sort it out. (D29)
- Repair, service and Retire are for serial-numbered gear and vehicles; a damaged consumable is written off. (D49)
- Service schedules run by date or mileage only. (D29)
- A status changes only together with the record that explains it, through `src/lib/asset-status.ts`; a test fails the build otherwise. (D42)

## What people see
- The operator bar has five tabs: Home, Check, My Deployment, Requests, Scan; the Crew Map stays in the menu. (D30)
- A phone always gets the phone layout, even turned sideways. (D32)
- Operators may see repair and rental costs. (Nov 11) — partly built (the repair list still hides costs from operators)
- A list shows everything that matches, or says how much it is not showing. (D39)
- Totals leave out retired and deleted gear; repair spend counts everything. (D41)
- A report's date range includes its "To" day; a report day is the app's day (US Central today). (Nov 11)
- An alert clears itself when its cause ends. (D45)
- Admin pages work at phone width, and the dashboard leads with who is out, missed and failed checks, open repairs and due service, waiting requests and transfers. (Oct 22) — not built yet
- Admin add and edit forms share one shape. (D38)
- Invites default to copy-link. (Oct 22) — not built yet

## Offline
- Plan for crews losing signal for a few hours at most; phones are rarely shared. (Nov 11)
- A new version applies on the next launch, with a small prompt that can be dismissed. (D31)

## Environment and data
- There is one live environment, called "staging"; it is the real app. (D1, D16, Nov 11)
- It is protected like production: the only way onto it is a merge to `development`, and `make db-seed` and `make db-reset` refuse its database. (D16)
- Migrations only add; one that drops data needs a PR labelled `destructive-migration-approved`. (D16)
- Email is switched off cleanly; the bell and copy-link are enough. (Nov 11) — not built yet
- The owner owes, top priority, a backup restore test and switching the Supabase Data API off; after that a restore is practised once a quarter and dated. (Nov 11)
- Stewart gets a short "in case of emergency" guide (roll back, restore from a backup, who to call) instead of a backup developer. It also stands in for the admin guide (D20). (Nov 11) — to write

## How code ships
- Code ships by the six-step loop in `CLAUDE.md`, one short request per PR. (Nov 11)
- A PR merges when the owner says "go", at any time of day. Docs-only PRs may merge themselves once CI is green. (Nov 11)
- Database migrations and app-update (service worker) changes wait until after 6 pm Eastern or zero active deployments, and merge alone. (Nov 11)
- The safety rules in `CLAUDE.md` always hold (git, `.env`, SQL, the owner's PINs, reverts). (Nov 11)
- Docs-only merges do not redeploy the live app. (Oct 22)

## Decided for the paused packets (Oct 30) — none built yet
- A PIN or password change signs out other devices; sign-ins are kept 12 months, for admins only.
- Only the owner resets another admin's password; others may reset the owner's, with a bell message; any admin may promote or demote.
- Operators see a colleague's check as date, result, who and issues; supplier and reorder links are hidden.
- No hub or admin confirms more than was requested; a shop link takes only the invoice for 30 days after its repair closes.
- Any operator may close any repair (fixed means fixed); a unit in admin review stays until an admin acts or it is fixed; "Can it be fixed?" must be answered.
- Admins get one bell per missed check day.
- Saved actions keep 7 days (warning at 6); an offline End that meets new gear is refused by name; an offline morning shows "Start daily check".

## Parked
| Item | Why parked | What would reopen it |
|---|---|---|
| Timesheets and invoicing (D19, "CC-17"); pay rules for admin-run deployments (D3) | Someday, not this year | The owner asks; nothing waits on it |
| Separate production environment (D1, D35) | This app is the real one | Owner's call; D35 named over 20 operators or a parent-company IT demand |
| Six paused packets, 17 unbuilt PRs: P1-1c/d/e, Eastern time, Security S1–S4, Offline O1–O6, Data D1–D3 | Queue paused Nov 11 | Re-cut as short requests; Eastern time is dropped |
| Full offline device test (D13) | Was tied to timesheets | Owner's call |
| No-login QR daily check (D18) | No user needs it | A user who cannot keep the installed app |
| Carrier shipment tracking (D23) | Was to follow timesheets | The owner asks |
| Airtable layer; week board "CC-18" (D34) | Too few users | A manager asks twice in a month; or Feb 2027 |
| One operator on two deployments (Oct 22) | Has not happened | It happens |

## No longer rules
Do not follow these from the history file.
- D4 — three-step column drop; replaced Nov 11.
- D5, D7, D8, D13 (gate), D14, D17, D33 — July pilot gates; history.
- D6, D15, D45's email result labels — email is off.
- D9, D11 capital-letter spellings — replaced by sentence case.
- D10, D28 — replaced (Oct 22; D30).
- D31's evening-deploy clause, D48, all deviation notes — replaced by "How code ships".
- D46's "nothing is ever hard-deleted" — untrue: projects and categories are.
- D47's "only the lead may write" — replaced Oct 22.
- D52's waiting-transfer parts — replaced by at-once hand-overs; in code until that PR.
- Oct 22: "return hub becomes home hub" (see D51); "several projects, one per day" (see Nov 11); PIN rotation (closed).
- Oct 30: Eastern business day and 19:00 cutoff; shared-phone rules; hiding repair and rental costs; email to the owner on a reset; late checks 7 days back.
