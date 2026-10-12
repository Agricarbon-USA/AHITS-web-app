# AHITS — what's changed

October 2026 · one page for operators and admins

We've just finished a round of fixes to the app. Most of it is under the hood. Here's what you'll notice.

## For everyone

- **The screen updates itself.** After you do something — end a rig, add an item, resolve an alert — the page refreshes on its own. That includes when you were offline: once your phone is back online, the queued action goes through and the screen catches up. No more pulling to refresh to see if it worked.
- **Today, My deployment and Scan agree.** All three now ask the same question — which rig is mine? — so you'll never see a rig on one screen and nothing on another. That includes second operators: if you're on a rig, Today shows it.
- **The daily check belongs to the rig.** Everyone on the crew sees it due. Once one of you does it, everyone sees "Checked by Ana at 7:42 AM". If a crewmate already did it, the app tells you who and when instead of taking a second one.
- **Pickers find everything.** Typing in any item or person picker searches the whole list, not just the first page.
- **"Returning".** Gear on its way back to the hub now shows as Returning. You can still pick it up for a new rig — doing so completes the return.
- **Log fixed issue works.** Scan a unit or vehicle, tap Log fixed issue, and it's back to Active straight away with the repair closed. A vehicle with reported damage stays In Maintenance until someone fixes it — taking it off a rig doesn't clear it.
- **Pick Up when you already have a rig** takes you to Add items on your current rig, instead of a dead end.
- **Errors say what's in the way.** Instead of "something went wrong", you'll see things like "2 units are still out — get them back first". A failed hub receive shows red, not green.
- **Scanning a deleted sticker says so:** "… was deleted from inventory — an admin can restore it."

## For admins (Stewart)

- **Lists page properly.** Inventory and Maintenance show "Showing 1–100 of N" with page sizes of 25, 50 or 100, a Show retired switch, a Show deleted switch, and a Just added pin so a new item is easy to find.
- **Numbers mean one thing.** Totals leave out retired gear everywhere — list, drawer, reports, dashboard. Returning gear is counted as Returning, not as out.
- **Retire vs Delete.** Retire is for real gear you're done with: it stays in history and reports, and its QR label is freed. Delete (new) is for mistakes, duplicates and test entries: the item leaves every list, count and report, and can be brought back under Show deleted → Restore. There's an Undo on the toast, a bulk Delete selected, and the row shows who deleted it and when. Both refuse — and tell you why — while units are out or in repair, or the item is named on an open request. Nothing is ever truly erased.
- **One open repair per thing.** Reopen refuses if another repair is already open. Return to service and Take out of service are explicit buttons, and a vehicle taken out of service never comes back on its own.
- **Returns inherit the repair.** A unit coming back damaged arrives at the hub as In Maintenance, so it can't be handed out by mistake. Monday routine: Hubs → Inbound → mark received.
- **Guard rails.** You can't put a non-Active vehicle on a rig, deactivate a person who's on a deployment (it names the deployment), or deactivate a hub that still holds stock.
- **Alerts clear themselves.** An alert raised by the nightly check clears when the cause is fixed, the same alert never appears twice, and resolving a repair marks its bell item read. The email log now says where each message actually went. Email from the test system is off for now — invite people with the copy-link.
- **Retire is for serialized gear; a consumable you stop stocking is deleted.** Send for repair works on any unit at the hub, from the Inventory drawer. A damaged consumable is written off, not repaired.
- **Dashboard numbers are links.** Tap In maintenance and you land on the vehicles list filtered to exactly those.

**If something looks wrong:** reload once. If it's still wrong, send Max a screenshot with the time. Nothing is deleted for good, so mistakes can be put right.
