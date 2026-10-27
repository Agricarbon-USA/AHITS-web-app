# Session close · 2026-10-22 · the October fix program, wrapped — and the queue for what's next

> STATUS: **current** — the resume point for the next sessions (owner, Claude Code, and the Cowork oversight chat) · WROTE: 2026-10-22, from the Cowork session that ran the program 2026-10-05 → 2026-10-12 · READ-WITH: `STATUS.md` (resume box, §3, §4, §6), `DECISIONS.md` D39–D49, `00_START_HERE.md` · SUPERSEDES: nothing — the per-PR handoffs stay as build records; this is the one place that lists everything owed and queued, in order, with the paste-ready prompts.
> TIEBREAK: if this file disagrees with `STATUS.md` or the code, they win (00_START_HERE rule 3). Nothing has merged since #267 (2026-10-12); `development` is clean.

---

## 0 · Resume box — read this and you are current

- **The app:** every PR of the fix program plus its three follow-ups is merged, deployed and smoked on staging. Live revision `ahits-web-app-staging-00449-z8b` (after docs #267), `/api/health` 200. Dashboard baseline at close: Active Deployments **0** · Open Alerts **4** · bell **46** · In Maintenance **2**.
- **The rules now in force:** one writer of asset status; lists never truncate silently; totals exclude retired; alerts clear themselves; screens update themselves after any action, online or after the offline queue drains; Delete is reversible and for mistakes; Retire, repair and service are for serialized gear only; every operator on a rig sees it on Today and the daily check is shared by the crew; merges happen after 8 pm Central or when 0 rigs are active (D48).
- **Owed by the owner (nothing blocks on Code):** ① the PR-5c two-operator smoke (§5.1); ② the D-z legacy clean-up — 14 retired consumables to delete, 38 units on consumables to look at (§5.2); ③ the two unrun PR-6 smoke rows (§5.3); ④ small housekeeping (§5.4).
- **Queued for Code, in order (§6):** ① commit this file (docs-only) · ② Dockerfile base-image mirror (quiet day, own PR) · ③ the three post-program point fixes · ④ timing-dependent UI tests · ⑤ field-fix unit picker + anonymous-line tasks (needs a short spec first) · ⑥ the "two rigs at once" rule (needs an owner decision first). Then the strategic queue in `STATUS.md` §4 resumes where it was before 2026-10-05.
- **Parked, deliberately:** staging email (D15 gate), the `held/` patches (D4), production cutover (D1). None are gates.

---

## 1 · What this session did (2026-10-05 → 2026-10-12)

**Start:** the owner's 2026-10-05 test found four bugs — Retire didn't remove an item; new items only showed in filtered views; a serialized total (15) counted a retired unit; the Gooseneck Trailer stuck "In Maintenance" after a field fix. A screening pass (`AHITS_SCREENING_REPORT_2026-10-05_ROOT-CAUSES.md`) showed all four were five structural habits repeating in ~40 places, so the answer became one program of seven PRs in a fixed order (`AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md`), each reviewed in the Cowork chat, merged on the owner's go, and smoked on staging with a docs PR recording the result.

**Landed (all on `development` = staging, D16):**

| PR | # | Merged | What it did | Smoke |
|---|---|---|---|---|
| 1a · Lists tell the truth — pages | #242 | 2026-10-07 | `listResponse`/`parsePagination` with `clamped`/`truncated`; `useListQuery` + `PagedTable` (25/50/100, page in URL); Inventory + Maintenance pages; "Just added" pin; "Show retired" | pass |
| 1b · pickers | #244 → reverted #245 → re-landed #246 | 2026-10-07 | `/api/inventory?mode=options` complete pickable set + async `SearchableSelect`; `/api/operators`; dashboard; bell | pass (the revert was a mistake — §4) |
| 2 · One vocabulary for numbers | #248 | 2026-10-07 | `populations.ts`, exhaustive `tally()`, `itemCounts()` on every payload; IN_TRANSIT = "Returning"; `businessDate()` | pass |
| 3a · Status has one owner — modules | #250 | 2026-10-08 | `asset-status.ts` (only writer), `asset-references.ts`, `maintenance.ts` `openDamageTask/closeDamageTask`, guard test | pass |
| 3b · guards + admin UI | #252 | 2026-10-08 | reference guards (409 naming what's in the way), item Retire, Return to service / Take out of service, hub inherits repair, INV-6/8/9 monitors | pass |
| 4 · Signals clear themselves | #254 | 2026-10-09 | alert evaluators (raise and clear by the same check), `activeKey` CHECK, notifications read on resolve, `EmailOutcome` + `deliveredTo` | pass |
| 3c · Delete items (and restore) | #256 | 2026-10-09 | reversible soft delete with Undo, bulk delete, Show deleted → Restore, guards, 410 on a deleted sticker, `deletedById` | pass (deploy failed once at Cloud Run, re-run green) |
| 5a · Screens reconcile — machinery | #258 | 2026-10-09 | `useMutation` + `invalidates`, `useInvalidation`, queue-drain refresh, `/api/deployments/mine`, conversions | pass |
| ci · test Postgres from AWS mirror | #260 | 2026-10-09 | Docker Hub rate limit on `postgres:16` | — |
| fix · picker categoryName always a string | #261 | 2026-10-09 | the 2¼-minute My Deployment outage (§4) | — |
| 5b · dead ends, copy module, point fixes | #259 | 2026-10-09 | Pick Up when deployed, hub toast colours, deep-link filters, `admin-actions.ts` + copy-contract test, five point fixes | pass (10/10) |
| 5c · Today shows the crew rig | #264 | 2026-10-09 20:32 | one resolver, shared rig checks, duplicate check refused by name (D47) | **owed** — needs two operator logins (§5.1) |
| 6 · Repair and Retire are for serialized gear | #266 | 2026-10-12 09:36 | `item-rules.ts`, consumable write-off, type lock, no units on consumables, Send for repair from Inventory (D49) | pass; two rows unrun (§5.3) |
| docs | #241 #243 #249 #251 #253 #255 #257 #262 #263 #265 #267 | — | start sheet, smoke records, decisions, rules, the What's Changed sheet | — |

**Also done in the session:** the July-trial data clean-up (Phase A read-only report → Phase B decisions → Phase C SQL in the Supabase editor: old alerts resolved with `activeKey` nulled, old notifications read, 0 active deployments); the Operator Start Sheet PDF (#241); the one-page **What's Changed** sheet for Stewart and the operators (`AHITS_WHATS_CHANGED_2026-10.md` + PDF, current as of PR-6); Node 24 on the owner's Mac (`.nvmrc`), `npx prisma generate` after `npm ci` under npm 11, `vitest.config.ui.ts` serial files.

---

## 2 · Decisions made (all ACTIVE in `DECISIONS.md`)

| D | One line | Born in |
|---|---|---|
| D39 | Lists tell the truth — one envelope, one paged table, no silent truncation | PR-1 |
| D40 | IN_TRANSIT is "Returning" — its own bucket, label and chip; pickable from 3a | PR-2 |
| D41 | Totals exclude retired everywhere; repair spend on retired gear still counts | PR-2 |
| D42 | Asset status is derived and has one writer (`asset-status.ts`); pickable widens only with `pickUnit` | PR-3a |
| D43 | Broken gear returned to a hub: the hub inherits the repair (serialized; a consumable write-off is task-less — D49) | PR-3b |
| D44 | Deactivating a user who is the operator on an active deployment is refused, naming the deployment | PR-3b |
| D45 | Signals clear themselves; email outcomes are reported truthfully | PR-4 |
| D46 | Delete vs Retire — Delete is a reversible soft delete for mistakes; QR labels stay bound (consumables: delete when you stop stocking — D49) | PR-3c |
| D47 | Every operator on a rig sees it on Today; the rig's daily checks are shared by its crew | PR-5c |
| D48 | The merge window: after 8 pm Central, or whenever the dashboard shows 0 active deployments; count stated in every merge report | 2026-10-09 |
| D49 | Repair and Retire are for serialized gear; a damaged consumable is written off; admins send a unit for repair from Inventory; a consumable never has units; item type locks once it has history; legacy rows stay | PR-6 |

The program's letter decisions (D-a … D-n in the program §0, D-o … D-u in the PR-3c addendum, D-v … D-z + D-g′ in the PR-6 addendum) are the owner's answers that these entries record. Don't re-ask them.

---

## 3 · Rules added to `CLAUDE.md` this session (and why)

- **No autonomous reverts** — a revert is a deploy; owner's go required, exception only when `/api/health` fails; confirm the symptom after the revision settles and on a surface the PR touched. *(#245, 2026-10-07.)*
- **Docs-only PRs** (`*.md` only) may be merged by the session once CI is green; anything touching code, config or migrations needs the owner's go.
- **Smoke only with the tab visible** — hidden tabs are throttled and look stuck. *(The "5–30 s admin spinner" that wasn't.)*
- **Throwaway smoke data goes in through the app's own screens, never raw API calls** — the forms carry validation the API may not. *(The item-without-a-category outage, 2026-10-09.)*
- **State the Active Deployments count before any smoke** — staging is the operators' environment.
- **Merge window D48** is item 3 of the merge checklist in `STATUS.md` §4.
- Environment notes: `.nvmrc` = 24 (Node 26 broke the UI suite); npm 11 blocks install scripts → `npx prisma generate` after `npm ci`; UI tests run serially (`fileParallelism: false`) until the timing-dependent tests are fixed (§6.4).

---

## 4 · Incidents and what they taught

| When | What | Outcome |
|---|---|---|
| 2026-10-07 | #245 reverted PR-1b on a cold-start screenshot of a page it didn't touch | re-landed unchanged as #246; the no-reverts rule |
| 2026-10-07/08 | "admin pages sit on a spinner 5–30 s" | hidden-tab throttling, not the app; withdrawn; the visible-tab rule |
| 2026-10-09 | PR-3c deploy: Cloud Run "Container import failed" | Google-side blip; re-run green; nothing to fix |
| 2026-10-09 | PR-5a deploy: Docker Hub rate limit pulling `postgres:16` in CI; later a 504 on `node:24-alpine` | #260 mirrors the test Postgres from AWS; the Dockerfile base image is parked for the same treatment (§6.2) |
| 2026-10-09 22:08–22:10 UTC | My Deployment crashed for every operator for ~2¼ minutes | a smoke item created by API without a category (a PR-1b gap, not #258); fixed on the spot, #261 made the picker robust; the data-via-screens rule; exposure nil (no operator rigs were active) |
| 2026-10-09 afternoon | four code merges during field hours (16:01–17:51 Central) | recorded as D31 deviations (no operator rig was active); D48 gives the window a real hour |

---

## 5 · Owed by the owner (each with the exact steps)

### 5.1 The PR-5c two-operator smoke (still owed since 2026-10-09)
Needs two sign-ins; Code can't create accounts or enter PINs.
Setup (admin): People → add "Test Op A" and "Test Op B", copy each invite link; open A's in a private browser window on the laptop and set a PIN, B's on the phone. Vehicles → New → "ZZ TEST VAN".
1. Laptop, as A: Start Deployment with ZZ TEST VAN; add Test Op B as the second operator (My deployment if the button is there, else the admin Deployments drawer).
2. Phone, as B: Today shows the rig and its due check.
3. Laptop, as A: do the daily check.
4. Phone, as B: Today says "Checked by Test Op A at …"; trying the check is refused naming A and the time.
5. Admin dashboard: "Missed checks today" does not list the rig.
6. Phone, as B: airplane mode on → My deployment → add or remove an item → airplane mode off → the screen updates by itself (the last unverified PR-5 behaviour).
7. **While the rig is active — the first unrun PR-6 row:** Inventory → the serialized test item → Units tab → Send for repair on the unit that is out → refused, naming the rig.
8. Laptop, as A: End the rig.
Then paste to Code: *"PR-5c smoke done by me: <one line per step>. Record it in STATUS as the owed smoke, step 6 as the PR-5 offline check and step 7 as the PR-6 out-unit row. Clean up through the admin screens: receive the test rig's returns at the hub, delete ZZ TEST VAN, deactivate Test Op A and Test Op B. State the active-deployment count per D48 and merge the docs PR once CI is green; this is my go. No reverts."*

### 5.2 The D-z legacy clean-up (counts from 2026-10-12: 14 · 38 · 0 open / 1 total)
- **14 retired consumables:** Inventory → Show retired → delete the consumables (Delete selected works on the page; they are restorable). Retired already keeps them out of pickers and alerts, so this is housekeeping that makes the data match D49.
- **38 units on consumables — look before touching.** That many labelled units on quantity-tracked items usually means some "consumables" are really serialized gear typed wrong at setup, and D49's type lock means the app can no longer flip them. Run read-only in the Supabase SQL Editor:
  ```sql
  SELECT i.id, i.name, i.status, count(u.id) AS units,
         sum(CASE WHEN u.status='AVAILABLE' THEN 1 ELSE 0 END) AS available,
         sum(CASE WHEN u.status='RETIRED' THEN 1 ELSE 0 END) AS retired,
         (SELECT coalesce(sum(s.quantity),0) FROM inventory_stock s WHERE s."itemId"=i.id) AS stock_qty
  FROM inventory_items i JOIN inventory_units u ON u."inventoryItemId"=i.id
  WHERE i."itemType"='CONSUMABLE' AND u."deletedAt" IS NULL AND i."deletedAt" IS NULL
  GROUP BY i.id, i.name, i.status ORDER BY units DESC;
  ```
  Per item there are two answers. **(a) It is really serialized gear** (it has serials or labels people scan): if `stock_qty` is 0, the one-off fix is `UPDATE inventory_items SET "itemType"='SERIALIZED' WHERE id='<id>' AND "itemType"='CONSUMABLE';` (undo: the same with the values swapped) — Supabase editor only, never from Code; after it, the item's counts come from its units. If `stock_qty` is not 0, bring the result to the Cowork chat before changing anything (the stock would become invisible to counts). **(b) It is a consumable with stray labels:** leave it; the units keep working as legacy under D-z and the Units tab shows them read-only.
- Tasks on consumables: 0 open, nothing to close.

### 5.3 The two PR-6 smoke rows not run (optional, low risk — both are covered by Node tests)
Send for repair on a unit that is out (folded into §5.1 step 7); scanning a legacy consumable unit — if §5.2 shows one with an AVAILABLE unit, scan its sticker once on the phone: it should come up normally.

### 5.4 Housekeeping
- Bell: **Mark all read** once — ~43 of the 46 items pre-date PR-4 and were resolved before signals learned to clear themselves.
- Dashboard shows **In Maintenance 2** — if those are still Can-Am #1 and the Gooseneck Trailer from the 10-05 test, Return to service (or Report damage if they really are broken).
- Hand out `AHITS_Whats_Changed_2026-10.pdf` to Stewart and the operators; it is current as of PR-6.
- Monday routine, now with returns: Hubs → Inbound → mark received, then the bell.
- The Code automation tab may still be open in its own Chrome window (2026-10-12) — close it.

---

## 6 · Queued for Code — in this order, one PR per session, paste-ready

Standing rules for every prompt below: branch from `development`, named files only, `npm run test:ui` locally, open the PR when CI is green and give the number, **do not merge** (docs-only PRs excepted). Merges on the owner's go inside D48, count stated. No reverts.

### 6.1 First — commit this close (docs-only; Code merges it)
```
Docs-only PR: commit AHITS_SESSION_CLOSE_2026-10-22_FIX-PROGRAM-WRAP.md from the repo root. In 00_START_HERE.md make it the newest file in row 6 of the 15-minute path and add a routing row "see everything owed and queued after the October fix program → this file". In STATUS.md add one resume-box line dated today pointing at it, and under §4 replace the scattered parked/point-fix bullets' order with a pointer "queue and order: the close doc §6" (leave their text in place). Merge once CI is green.
```

### 6.2 Dockerfile base image from the AWS mirror (quiet day; own PR; config change → owner's go to merge)
```
Own PR, one change: every FROM node:24-alpine stage in the Dockerfile pulls public.ecr.aws/docker/library/node:24-alpine instead (same official image, no Docker Hub). Nothing else in the Dockerfile moves. Note in the PR body that #260 did the same for CI's test Postgres and why (Docker Hub rate limit / 504 on 2026-10-09). STATUS: close the parked line. Open the PR when CI is green and give me the number — do not merge it.
```

### 6.3 The three post-program point fixes (one small PR)
```
One PR, "post-program point fixes", the three items in STATUS §4: (a) POST /api/inventory requires categoryId exactly as the admin item form does — 400 with a plain error naming the field; the form is unchanged. (b) The transfer card shows ×2 for a transfer of 1 from a ×2 consumable kit line — the Pending Transfers card and the deployment drawer show the transfer's own quantity, not the line's. (c) After a failed hub Receive (409/410 from /api/status-links/[id]/receive) the inbound list refetches so the stale row goes; the red toast stays. Tests: Node for (a) and (b), UI for (c). STATUS: tick the three. Open the PR when CI is green and give me the number — do not merge it.
```

### 6.4 Timing-dependent UI tests (lets `test:ui` go parallel again)
```
One PR: make tests/components/pr1a-inventory-just-added.test.tsx and tests/components/pr1b-picker-search.test.tsx deterministic — vi.useFakeTimers() + advanceTimersByTime over the real search debounce instead of 2–3 s waitFor timeouts — then run the whole UI suite with fileParallelism true five times; if all green, set it in vitest.config.ui.ts and close the parked line in STATUS; if not, leave it serial and record which test still flakes. Open the PR when CI is green and give me the number — do not merge it.
```

### 6.5 Field fix picks a unit; anonymous-line damage tasks (needs a short spec before building)
What's wrong: the admin "Log field fix" on a serialized item with no unit writes an audit task the equipment report never counts; damage tasks on serialized "anonymous" kit lines (no unit resolvable) are second-class everywhere — not in the report, not on the rig drawer, and they demand a return destination on close. Likely shape: the field-fix picker resolves a unit (serial or label) and refuses item-only; an INV-10 monitor flags item-level damage tasks on serialized items; `complete` stops asking for a destination when there is no unit. **Ask the Cowork chat for the addendum** (same pattern as PR-3c/PR-6: map → spec → adversarial review) before pasting anything to Code.

### 6.6 "One operator on two active rigs" (owner decision first)
Today the schema allows an operator to be SECONDARY on several open rigs (PRIMARY is unique), nothing refuses it, and every screen shows that operator one rig (PRIMARY first, else newest). Options: **refuse** adding someone still on another open rig, naming it and offering to move them (recommended — crews move between rigs, the stale membership is the bug); **allow** and show all rigs on Today (bigger: Today, /mine and the checks all become lists); **leave** until it bites. Record the choice as D50, then a small PR for "refuse and offer to move".

### 6.7 Parked until their gates (not queued)
Staging email — Resend testing mode + unverified domain; copy-link invites remain the onboarding path; re-open via D15 (verify the domain in Resend, or point the redirect inbox at the Resend account address). Production cutover — D1, not a gate. `held/` patches — D4.

### 6.8 After the queue
Resume `STATUS.md` §4's strategic queue where it stood on 2026-10-05 (the post-floor items: CC-17 Clockify replacement per D19, the full A6 device matrix, CC-18). The fix program changed no decisions there.

---

## 7 · The files this session produced (where to look)

| File | What it is |
|---|---|
| `AHITS_BUGFIX_PACKET_2026-10-05_INVENTORY-MAINTENANCE.md` | the original four-bug packet — superseded by the program |
| `AHITS_SCREENING_REPORT_2026-10-05_ROOT-CAUSES.md` | five root causes, ~40 findings with file:line, two SQL checks |
| `AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md` | the build spec, §0 owner decisions D-a…D-n, PR-1a/1b/2/3a/3b/4/5 (+ PR-5c section) |
| `AHITS_FIX_PROGRAM_ADDENDUM_PR-3C_DELETE-ITEMS_2026-10-09.md` | Delete items — D-o…D-u |
| `AHITS_ADDENDUM_PR-6_SERIALIZED-ONLY-REPAIR-RETIRE_2026-10-10.md` | serialized-only repair/retire, write-off, Send for repair — D-v…D-z, D-g′; §6 legacy SQL |
| `AHITS_JULY_TRIAL_CLEANUP_2026-09-07.md` | the Phase A/B/C clean-up packet (Phase C ran 2026-10) |
| `AHITS_OPERATOR_START_SHEET.md` / `AHITS_Operator_Start_Sheet.pdf` | first-day sheet for operators (#241) |
| `AHITS_WHATS_CHANGED_2026-10.md` / `AHITS_Whats_Changed_2026-10.pdf` | one-page "what changed" for Stewart and operators (current to PR-6; the PDF is regenerated outside the repo from the .md) |
| `AHITS_SESSION_HANDOFF_2026-10-0{6,7,8,9}_*.md`, `_2026-10-12_PR6-MERGED-SMOKED.md` | per-PR build and smoke records |
| `STATUS.md` §3 | the smoke tables for every PR; §4 the merge checklist and parked items; §6 deferred |

---

## 8 · How the Cowork ↔ Code loop worked (keep doing this)

1. The owner reports in plain words (bug, screenshot, question). The Cowork chat maps the code (agents read the repo via the device bridge), writes a spec with the owner's decisions in a §0 table, has a second agent try to break the spec against the code, and puts the spec in the repo root.
2. The owner pastes one prompt into Claude Code: read the program + addendum, build exactly as written, named files only, tests as specified, open the PR green, **do not merge**.
3. Code reports back; the owner screenshots the report to the Cowork chat; the chat checks it against the spec and confirms or corrects each judgement call.
4. The owner pastes the merge-go prompt: merge inside D48 with the count stated, watch the deploy through env-drift and `/api/health`, smoke with the tab visible and test data through the app's screens, clean up through the app, docs-only PR with the smoke table (Code merges that one), no reverts, report back.
5. Anything only the owner can do (sign-ins, phones, SQL in the Supabase editor) is listed as owed with exact steps — never run by Code.
6. SQL runs only in the Supabase SQL Editor, read-only unless it comes with its undo. Nothing is ever hard-deleted.

**Owner's standing preferences:** simple, direct, consolidated answers; exact paste-ready prompts; the owner merges (or gives Code the go); Code never reverts on its own; questions asked up front, not mid-build.
