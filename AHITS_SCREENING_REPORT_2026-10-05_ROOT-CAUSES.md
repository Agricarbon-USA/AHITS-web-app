# Screening report · root causes behind the 2026-10-05 test findings · and everything that shares them

> STATUS: findings + proposed program (nothing built yet; owner decisions in §6 gate the build) · WROTE: 2026-10-05 · READ-WITH: `AHITS_BUGFIX_PACKET_2026-10-05_INVENTORY-MAINTENANCE.md` (the four original fixes — superseded by §5 of this report once the program is approved), `DECISIONS.md` (D15, D16, D29, D38), `AHITS_PHASE3_WORKPLAN_v2.md` (known-issue register — IDs cited where a finding was already known)
> METHOD: five screening agents, one lens each (status ownership · lists and pickers · counts and populations · UI truth after actions · alert/notification/email pipeline), all working from the full source tree, first-principles mandate (define the invariant, then the smallest structural change that enforces it, then point fixes). A sixth agent independently re-verified the fifteen highest-impact claims against the code: 15 of 15 confirmed, none wrong. File:line references are to `development` @ e83fc7e.

---

## 1 · The short version

The four bugs found in testing are not four bugs. They are the first four visible symptoms of **five structural habits** in the codebase, and the sweep found **about forty more places** where the same habits produce wrong data or false confirmations. Several of the new ones are more serious than the originals:

- The **Maintenance page silently shows only the first 25 tasks**, sorted so that scheduled "upcoming" items come first — so once there are more than 25 tasks, open damage reports and overdue items drop off the Damage and Overdue tabs, the tab counts are wrong, and the "View" link from an alert opens nothing.
- **Every equipment picker in the app shows at most the first 100 items by name.** Item 101 onward cannot be packed, reserved, scheduled or field-fixed, and typing its name says "No options".
- **Returning gear in bulk marks it Available even if it was out of service**, and removing a vehicle from a deployment after reporting damage on it puts it straight back to Active with the repair still open.
- With the email sandbox on (which it is, by decision D15), **every "emailed to the shop / hub link resent / invite sent" message in the app is false** — the log even records the real recipient as SENT.
- If any alert type is disabled in Settings and 100 of those pile up, **the notification dispatcher stops sending every other alert too**.

None of this needs a rewrite. Each habit is fixed by one small shared module that every route uses, and the original four bugs then disappear as consequences rather than patches. The honest shape of "fix everything in one go" is **one program of five PRs in a fixed order** (§5), each independently shippable and reviewed, rather than one giant PR.

---

## 2 · The five root causes, in plain terms

| # | Habit | What it looked like in the four bugs | The rule the code should obey | The one structural change |
|---|---|---|---|---|
| RC-1 | **Status has no owner.** About fourteen unrelated routes write `vehicle.status` / `unit.status` / `item.status` as literals; almost nothing reads them as a guard. | Retire wrote a flag nothing reads (B1). Field-fix logged a record but the status belonged to a different route (B4). | A vehicle or unit's status is *derived* from the records about it: In Maintenance ⇔ an open damage task; Checked Out ⇔ a live kit item on an active deployment; Retired ⇒ nothing live references it. Changing state and the record that explains it is one transaction. | `src/lib/asset-status.ts` — the only writer of asset status (`pullForRepair`, `restore`, `retire`); `src/lib/asset-references.ts` — one "what still references this?" query behind every retire/delete/deactivate; `src/lib/maintenance.ts` `openDamageTask` / `closeDamageTask`; four new nightly invariant checks (INV-6..9) that alert when anything slips. |
| RC-2 | **Lists pretend to be complete.** A page of rows is fetched, re-sorted and regrouped, and shown with no count or "more". | 25 rows regrouped under category headers looked like the whole inventory (B2). | A view shows everything that matches or says exactly how much it is not showing. A picker is complete or server-searchable, never silently partial. | One list envelope `{data, total, truncated}` from every list API; one paged table component with "a–b of N", rows-per-page and page-in-URL; a picker mode (`?mode=options`) that returns the complete pickable set, with server search when it is large; every sort ends with a stable tiebreaker. |
| RC-3 | **Numbers are computed at the screen from whatever it happened to fetch.** The same concept ("total", "available", "out", "overdue", "today") has a different population on every page. | Total counted retired units; the right number was already on the wire (B3). | Each population is defined once (active unit, live kit item, open task, live vehicle, active hub, business today) and every number flows from those definitions; clients display server counts, never recompute them. | `src/lib/populations.ts` (Prisma `where` fragments + SQL twins) and a `tally()` that is exhaustive over the status enum, so a new status can never vanish from a count; one `itemCounts()` carried on every inventory payload. |
| RC-4 | **The screen is not reconciled after an action, and copy is hand-written per button.** Mutations fire-and-forget; toasts say what the author hoped. | "All available units will be marked retired" (B1, never true); the new row not shown (B2); "Log fixed issue" under the in-maintenance warning (B4). | Every mutation names the views it changes and all of them refresh, online or when the offline queue drains; copy describes the server's actual effect; no action is offered where it cannot complete. | `useMutation({ …, invalidates: [keys] })` on top of the existing offline `mutate()`, with an invalidation event the queue also fires on drain (generalising the `INCOMING_PENDING_CHANGED` precedent); error toasts always through `apiErrorMessage`; a test that every confirm/success string maps to a documented effect. |
| RC-5 | **Signals are raised without a matching clear.** Alerts, bell rows, hub-return links and "emailed" flags are written by one path and assumed to be cleared or delivered by another that filters the entity away or does not exist. | Retired consumable keeps its low-stock alert (B1); the open task keeps nagging (B4); the cleanup SQL that forgot `activeKey = NULL`. | An alert exists iff its condition holds for a live entity, and one evaluator owns both raise and clear. A notification is read when its alert resolves. An email log records where the message actually went. | Per-type evaluator registry run by the cron over *active alerts ∪ candidates*; `resolveAlertsFor(sourceTable, sourceId)` that also marks notifications read, called by every delete/retire/end/complete; a DB check `resolved = false ⇔ activeKey IS NOT NULL`; `EmailOutcome = SENT | REDIRECTED | SKIPPED | FAILED` shown truthfully in the UI; dispatcher filters disabled types in the query. |

---

## 3 · What is wrong today (verified, user-facing)

| ID | Where | What a user sees | RC |
|---|---|---|---|
| L-1 / C-1 / U-4 / P-11 | Admin → Maintenance (`admin/maintenance/page.tsx:230`, `api/maintenance/route.ts:19-30`) | Only the first 25 tasks load; with more than 25, Damage/Overdue tabs lose rows and show wrong counts; alert "View" links open nothing; a logged field fix never appears | RC-2, RC-3 |
| L-2 | Every item picker (`admin/deployments/page.tsx:1307,1327`, both `NewDeploymentDialog`s, `my-deployment:270`, both requests pages, `maintenance:451,506`, `RequestComposer`) | First 100 items by name only; item 101+ unpickable and unsearchable; preset pickup lines for such items submit invisibly | RC-2 |
| S-1 | Remove vehicle from deployment (`deployments/[id]/vehicles/route.ts:190-201`, `my-deployment:534`) | Report damage, then remove the vehicle → it is Active and pickable with the repair still open; scan warning gone | RC-1 |
| S-2 / C-2 | Bulk return (`deployments/[id]/items/route.ts:390-394`), End deployment (`end/route.ts:159-168`) | Out-of-service units come back as Available; returning gear "needing maintenance" at end creates no repair task; hub "Inbound" counts phantom returns | RC-1, RC-3 |
| S-3 / U-1 / U-2 | Inventory Retire (B1) + three different "retire" paths | Item stays; units untouched; the unit dropdown's Retire skips QR release and alert resolve that the review path does | RC-1, RC-4 |
| B3 / U-3 / C-6 | Inventory counts | Total includes retired; units in transit vanish from every count and show a raw `IN_TRANSIT` chip | RC-3 |
| B4 / U-8 / S-5 | Scan → Log fixed issue; Maintenance complete | Status never restored; closing one of two reports restores early; no refetch after the fix | RC-1, RC-4 |
| P-1 / U-5 / U-13 | Shop work orders, hub links, invites (`lib/email/resend.ts:88-109`, `requests/page.tsx:257`, `users/page.tsx:100`) | "Emailed" / "resent" / "sent" toasts and log rows while the sandbox redirects or skips the message; both staging hubs have no email at all | RC-5, RC-4 |
| P-2 | Notification dispatcher (`lib/notifications.ts:81-88`) | If a disabled alert type accumulates 100 unresolved rows, no alert of any type is ever notified again | RC-5 |
| U-6 | Admin → Hubs (`hubs/page.tsx:140,186-243,829-832`) | Failures ("Could not mark received.") appear as green success toasts; bulk Receive never checks the result | RC-4 |
| U-7 | Vehicle Edit → Status (`vehicles/page.tsx:1176`) | Setting Active leaves the repair and its alert open; setting In Maintenance creates no task; "Reopen" on a repair leaves the vehicle Active | RC-1 |
| L-7 | Start Deployment / add secondary (`api/users/route.ts:14-22`) | Deactivated users offered as operators; Start has no server guard | RC-3 |
| S-7 / S-9 / P-4 / C-13 | Vehicle/item/hub delete; cron (`vehicles/[id]/route.ts:118-121`, `cron/dispatch/route.ts:177-180`) | A deleted vehicle stays on its deployment and its daily check fails; deleted vehicles keep raising insurance/registration alerts; stock at a deactivated hub keeps alerting | RC-1, RC-5 |
| C-3 / L-6 | Dashboard | Alert banner counts a capped list of 50 while the card beside it shows the true count | RC-2, RC-3 |
| C-5 / P-12 | Dashboard "Today's checks" (`api/dashboard/route.ts:9-10`) | Uses server midnight, not the business day — resets at 7 pm Central, disagrees with "Missed checks" beside it | RC-3 |
| P-8 | Bell | Notifications stay unread after their alert resolves or their transfer is accepted | RC-5 |
| U-9 | Offline queue (`useOfflineQueue.ts:433-455`) | After a queued action syncs, the screen is not refreshed — an offline End Deployment still shows the rig active | RC-4 |

Medium and low findings (ghost alerts for ended rigs and retired assets, PIN_LOCKED outliving the lock, "Pick up" dead-ending when deployed, deep-links that land on unfiltered lists, three different vehicle maintenance counts, project counts on a legacy column, no sort tiebreakers, mislabeled "(10)" caps, IN_TRANSIT contradicting its own contract, hub-return links outliving the unit's state, equipment report populations, low-stock threshold meaning three things) are in the full register, §4.

---

## 4 · Full register (deduplicated; one line each)

**RC-1 Status ownership** — S-1 remove-vehicle resets damaged vehicle · S-2 bulk return frees out-of-service unit / end-of-deployment HUB+IN_MAINTENANCE creates no task / single return also clobbers IN_MAINTENANCE · S-3 item status write-only (B1) · S-4 task Reopen/PATCH/DELETE move the task, not the asset · S-5 no one-open-task-per-asset guard (B4 generalised) · S-6 admin status overrides bypass every transition (unit dropdown, vehicle form) · S-7 retire/delete/deactivate have no reference guard (vehicle, item, unit, hub) · S-8 IN_TRANSIT has two custody rules and no bucket · S-9 soft-delete honoured by lists but not cron/relations · S-10 pending handoffs/transfers outlive their rig · U-7 vehicle status edit ≠ repair closed · P-10 mutation routes skip alert re-evaluation.

**RC-2 Lists** — L-1 maintenance page silent 25 · L-2 pickers capped at 100 · L-3 no truncation signal anywhere · L-4 inventory residuals (B2) · L-5 bell badge counts all, list shows 30 · L-6 dashboard counts from capped arrays · L-8 "my active rig" chosen three different ways · L-9 admin-as-operator never sees outgoing transfers · L-10 operator pickers fetched once, never refetched · L-11 service worker can serve a pre-mutation page to admins · L-12 mislabeled drawer caps · L-13 no sort tiebreaker · L-14 hidden caps (status links 100, request lines 200, audit) · L-16 picker load failure never retried.

**RC-3 Counts** — C-1 maintenance tab counts from a page · C-2 hub inbound counts phantom returns · C-3 banner vs card · C-4 feed chips are capped lengths, soft-deleted tasks listed · C-5 Today's checks on server midnight · C-6 IN_TRANSIT no bucket (B3 ext.) · C-7 consumable Out/Total are unit counts (always 0) · C-8 equipment report populations (deleted vehicles, soft-deleted tasks, schedules counted as events/downtime) · C-9 low-stock threshold has three meanings · C-10 "Available" differs by consumer · C-11 vehicle maintenance count ×3 · C-12 project counts via legacy column · C-13 population leaks · L-7 deactivated users in pickers · L-15 report/picker population drift.

**RC-4 UI truth** — U-1 retire copy lies (B1) · U-2 three retire paths · U-5 "Hub link resent"/"Forwarded" with nothing delivered · U-6 hubs errors render green · U-8 field-fix no refetch (B4) · U-9 queue replay never refreshes · U-10 sibling views stale online (dashboard stat, drawer transfer lists, "Currently with") · U-11 "Pick up" dead-ends when already deployed · U-12 new item not shown (B2) · U-13 delivery toasts false under sandbox · U-14 deep-link drift · U-15 copy/misc (vehicle dialog shows kit options; Deactivate confirms "Delete"; zod object can reach a toast; duplicate open-task).

**RC-5 Pipeline** — P-1 sandbox logged as SENT to the real recipient · P-2 dispatcher starvation · P-3 scan population exit freezes the clear (retired vehicles, deleted items, ended rigs' missed-check alerts) · P-4 deleted/inactive entities still raise · P-5 EQUIPMENT_NOT_RETURNED: one clear, five removal paths · P-6 PIN_LOCKED outlives the lock · P-7 CRON_SILENT can't be pushed while true · P-8 notifications never read on resolve · P-9 manual Resolve on evaluator-owned types re-bells within the hour · P-11 alert deep-links no-op (with L-1) · P-12 dashboard date · P-13 EMAIL_FAILED false recovery · P-14 cron half-states · P-15 HUB_RETURN link outlives unit state.

Known-issue IDs still live and now explained by a root cause: FND-7 (dates), FND-9 (hub returns), FND-10 (email-less hubs), FND-12 (toast severity, Hubs), FND-13 (retire), FND-20 (picker retry), FND-24 (maintenance paging — server half only), FND-32 (queue replay refresh), FND-37 (not-returned clear), FND-40/26 (report populations), FND-45 (no cron/dispatcher tests), FND-46 (IN_TRANSIT writer only), FND-48 (deep-links), INV-3 (one-sided), CARRY-10 (reservation never holds the unit), D15 (sandbox — decided, but the UI does not say so).

---

## 5 · The program — "one go" as five PRs in order

Each PR is independently shippable against `development` (D16: merge is the deploy), named files only, no schema migration except PR-4's one additive constraint, tests as the house harness allows (UI in jsdom; DB tests run in CI). Order matters: later PRs use the modules the earlier ones create. The four original bugs are closed by the foundations, not patched.

| PR | Builds | Closes | Size |
|---|---|---|---|
| **PR-1 Lists tell the truth** | `listResponse` envelope + `parsePagination` returning `clamped`; `<PagedTable>`/`useListQuery` ("a–b of N", 25/50/100, page in URL, reset on filter change, reload after mutation); `/api/inventory?mode=options` complete pickable set + async `SearchableSelect` over `?q=` when truncated; stable `orderBy` tiebreakers; maintenance page on the paged table with server-side tab filter | B2, L-1/C-1/U-4/P-11, L-2, L-3, L-4, L-5, L-6/C-3, L-10, L-12, L-13, L-14, L-16 | L |
| **PR-2 One vocabulary for numbers** | `src/lib/populations.ts` + exhaustive `tally()` + server `itemCounts()` on every inventory payload; IN_TRANSIT gets a bucket, label and pickability per §6 Q2; shared `deletedAt`/`RETIRED`/`isActive` fragments applied to cron, feeds, reports, pickers; `businessDate()` everywhere; equipment report populations (spend history kept) | B3, C-4..C-13, L-7, L-15, S-9/P-4/C-13 leaks, C-5/P-12 | M |
| **PR-3 Status has one owner** | `asset-status.ts` (pull/restore/retire), `asset-references.ts` guard (409 with names), `maintenance.ts` open/close helpers with one-open-task-per-asset; every route that writes asset status goes through them (end, bulk/single return, remove vehicle, transfer decline/cancel, complete, delete, reopen, unit/vehicle PATCH, field-fix, retire); the four INV-6..9 monitors; owner rules from §6 Q1 | B1, B4, S-1..S-8, S-10, U-1/U-2/U-7/U-8, P-10 | L |
| **PR-4 Signals clear themselves** | evaluator registry driven off active alerts; `resolveAlertsFor()` marking notifications read; DB check on `activeKey`; dispatcher filters disabled types in the query and creates-then-claims; `EmailOutcome` surfaced in every "emailed" toast/badge (with copy-link fallback for email-less hubs); PIN_LOCKED and EQUIPMENT_NOT_RETURNED clears; CRON_SILENT order | P-1..P-9, P-13, P-14, U-5, U-13, FND-10/37 | M |
| **PR-5 Screens reconcile** | `useMutation` with `invalidates` keys and the queue-drain event; `useFreshList` subscribers; residual dead ends and deep-links; `/api/deployments/mine` for the one "my active rig"; hubs toast severity; "Pick up" when deployed; copy audit test | U-6, U-9, U-10, U-11, U-14, U-15, L-8, L-9, L-11, P-15 | M |

What the first pass must contain if appetite is limited: **PR-1 and PR-3** (the two with user-facing wrong data today), then PR-4 (false "emailed" and the dispatcher), then PR-2 and PR-5.

Build note (2026-10-05, after owner approval of the whole program): the build spec is `AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md`. It keeps these five themes but splits PR-1 (1a pages, 1b pickers) and PR-3 (3a modules + writers, 3b guards + admin UI) so each stays within one Code session and one review — seven PRs in all.

D10 (admin/inventory and admin/deployments splits are demand-pull): PR-1 touches both pages materially. The recommendation is to keep the splits out of the fix program and record that in the handoff — a structural split inside a correctness pass doubles the review surface.

---

## 6 · Decisions needed from the owner (gate the build)

1. **Broken gear returned to a hub.** When a unit that is In Maintenance comes back to the hub at end of deployment or in a bulk return, does the hub *inherit the repair* (unit stays In Maintenance, task stays open, hub recorded as its return destination), or is the return *refused* until an admin closes the repair? Recommendation: inherit — refusing blocks a truck in the field on an admin's attention.
2. **Returned-but-unconfirmed gear (IN_TRANSIT).** The schema says it can be re-deployed; every picker says it cannot. Which? Recommendation: re-deployable, shown in its own "Returning" bucket; picking it completes the hub-return link. Both staging hubs have no email, so waiting for a hub confirmation can block gear indefinitely.
3. **"Retire item".** Keep it (retire every unit on hand, refuse while any unit is out, hide the item behind "Show retired") — already answered yes on 2026-10-05; confirming it stands under RC-1's version.
4. **Program appetite.** All five PRs as one program (several Code sessions), or the first pass only (PR-1 + PR-3) now and the rest queued? Nothing in the pilot restart depends on PR-5.
5. **Deactivated users on old deployments.** When a user is deactivated while still PRIMARY on an active rig, should deactivation be refused (guard) or should the rig be ended automatically? Recommendation: refuse with the rig named.

## 7 · Two checks to run before building (read-only, Supabase SQL Editor)

```sql
-- Is the maintenance page lying today?  (> 25 total means yes)
SELECT status, count(*) FROM maintenance_tasks WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 1;

-- Is the dispatcher at risk of starving?  (compare against the types disabled in Admin → Settings)
SELECT type, count(*) AS unresolved, count(*) FILTER (WHERE "notifiedAt" IS NULL) AS never_notified
FROM alerts WHERE resolved = false GROUP BY 1 ORDER BY 2 DESC;
```

## 8 · What this program does not touch

Offline queue storage and replay semantics (`tests/offline`, `sw.ts` stay untouched per house rule — PR-5 only adds an event on drain); the daily-check flow; auth; the schema beyond one additive CHECK constraint; the data in staging (the cleanup packet remains the only hand-run data operation). PR-4's migration first normalises existing rows — `activeKey = NULL` on every resolved alert, and the key rebuilt as `type:sourceTable:sourceId` on any unresolved alert missing it — and only then adds the CHECK, so it cannot fail on historic data and passes the migration-safety gate (additive).
