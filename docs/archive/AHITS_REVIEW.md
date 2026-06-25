# AHITS — Comprehensive Application Review

**Date:** June 2026  
**Purpose:** Full audit of the current state, gaps, risks, and recommended path forward. Written to survive multiple sprints of context loss — everything here should be treated as durable product knowledge.

---

## Part I — What This Application Is

AHITS (Agricarbon Hardware Inventory Tracking System) is a field operations platform for a soil carbon sampling company whose operators are contractors deployed in the field for days or weeks at a time. The core problem it solves: equipment doesn't come back, nobody knows who has what, vehicles go unserviced, and billing is manual.

The application has three concentric audiences:

1. **Operators** — the people doing the work in the field. Often remote, often on mobile, sometimes without internet. They need the app to work fast and fail gracefully. Every second of friction costs them.
2. **Admins** — office staff managing the whole fleet. They need to know, in real time, where everything is, what's broken, and what's overdue. Desktop-first, but must be able to triage from a phone.
3. **Downstream recipients** — maintenance shops receiving repair orders, accountants and management receiving cost reports, and eventually landowners or Agricarbon clients receiving project summaries. These parties don't log into the app; information reaches them through email, PDFs, and exported reports.

---

## Part II — What Is Built vs. What Is Wired Up

Understanding what actually works is critical before planning more.

### What is built and functional:
- Admin: Inventory management (items + per-unit tracking), deployments (create/manage rigs, kits, vehicles), transfers, maintenance tasks, vehicles, projects (basic), users, settings, alerts (schema only)
- Operator: My Rig (main deployment page — the most complete operator feature), Inventory (read-only), Scan QR

### What is a stub (UI placeholder, API exists):
- Operator Daily Check page — `src/app/(operator)/operator/daily-check/page.tsx` is a single line of placeholder text. The API (`POST /api/daily-check`) is fully implemented, sends email on failure, supports `upsert` to prevent duplicates. The page just hasn't been wired up to it yet.
- Operator Checkout page — `src/app/(operator)/operator/checkout/page.tsx` is a stub. `POST /api/checkout` exists but is pre-Sprint-4 tech (doesn't know about rigs, kits, or `inventoryUnitId`). This route should probably be deprecated in favor of `POST /api/deployments/[id]/items`.

### What is built but partially wired up:
- Offline queue — `useOfflineQueue` is implemented with IndexedDB and auto-flushes on `online` event. The operator dashboard shows the queue count and offline banner. But only the daily-check flow was intended to use it, and since that page is a stub, the queue is currently empty in practice.
- Service worker — caches `GET /api/dashboard`, `/api/inventory`, `/api/vehicles`, `/api/maintenance` with NetworkFirst + 12h expiry. Does NOT cache `/api/deployments` (operator's active rig data), which is the single most important API for the offline operator.
- Alerts — the `Alert` schema model and `AlertType` enum exist (MAINTENANCE_OVERDUE, EQUIPMENT_NOT_RETURNED, LOW_INVENTORY, etc.) but there is no code that creates or dismisses alerts. The admin dashboard shows an "Open Alerts" count but that count is likely always zero.

### What is referenced but doesn't exist:
- `src/hooks/useAuth.ts` — the operator dashboard imports this; confirmed it exists (it calls `GET /api/auth/me`). This is fine.
- Admin reports page — exists as a file but content is unknown.
- Admin projects page — exists; basic project CRUD but no full project lifecycle.

---

## Part III — User Persona Deep Dives

### 3.1 The Operator

**Who they are:** A contractor doing soil sampling or field work. They drive a truck, pull a trailer, carry specialized equipment, and may be in rural areas with spotty LTE. They may not be technically sophisticated. They care about speed and clarity. They resent paperwork.

**Their daily flow (as designed):**
1. Morning: open app, submit daily vehicle check for each vehicle in their rig
2. Throughout deployment: check equipment in/out as needed, scan QR codes to look things up
3. Transfer equipment to another operator if needed
4. End of deployment: return equipment with disposition notes, end rig

**Critical gaps for this persona:**

**The daily check page is not implemented.** This is arguably the highest-frequency operator interaction — it happens every single day. The API is there; the page just needs to be built. Until it exists, operators can't submit checks via the app, which means the admin email-on-failure notification never fires, the daily check count on the admin dashboard is always zero, and vehicle issues go unreported.

**GPS is missing from daily checks.** The PRD calls for GPS on `DailyCheck` to power the deployment map. The operator submits a daily check while physically at the job site — that's exactly when their location is known and meaningful. Without capturing it here, the map feature (Sprint 8) has no data. This field should be captured at daily check submission time using `navigator.geolocation`.

**No push notifications.** If an admin sends a transfer request, the operator has no way of knowing unless they open the app. There's no badge count, no push notification, no email alert. The transfer sits unacknowledged until the operator happens to check the My Rig page.

**PIN reset is unclear.** If an operator forgets their PIN, what do they do? The lockout system (`pinLockedAt`, `failedPinAttempts`) exists but there's no self-service PIN reset visible in the codebase. Presumably an admin resets it, but there's no UI for that either (no "Reset PIN" button on the user edit dialog). This is a real support burden.

**QR scanning uses a file input, not a live camera.** The scan page captures an image file and decodes it client-side with `jsQR`. On iOS, `<input type="file" accept="image/*" capture="environment">` opens the camera, but the resulting static image approach means the user has to frame the QR code perfectly in a photo. A live video scan (using `html5-qrcode` which is already installed) would be far more reliable and operator-friendly. Inconsistency: the My Rig QR checkout uses `html5-qrcode` for live scan; the standalone scan page uses `jsQR` and a file input. Two different UX patterns for the same task.

**Operator can't see their transfer history.** The My Rig page shows pending transfers. But there's no operator-visible history of past transfers, past rigs, or past check logs. An operator who wants to know "when did I last have item X" has no way to see that.

**The operator "checkout" card on the dashboard goes nowhere.** Tapping "Check Out / Check In" shows a stub page. For new operators, this is confusing and feels broken. Either implement the page or remove the card until it's ready.

**Secondary operators see the full rig.** A secondary operator (`RigOperator`) can add/remove items and end the rig. This may be intentional, but there's no "view only" mode for a secondary operator who's just there to be tracked without having full control.

---

### 3.2 The Admin

**Who they are:** An office person managing all operators, all equipment, and all vehicles. They need situational awareness across the entire fleet without having to contact each operator individually.

**Critical gaps for this persona:**

**The admin dashboard is five stat cards.** Active vehicles, in maintenance, items checked out, overdue maintenance, open alerts, and today's checks. That's it. An admin cannot immediately tell from the dashboard: where all active deployments are, which operators haven't submitted a daily check today, which items have been out for more than a week, or which vehicles have expiring insurance or registration. The dashboard is informational but not actionable. Every number should be clickable and drill into the relevant list.

**Alerts exist in the schema but are never created.** The `AlertType` enum has eight types: `MAINTENANCE_OVERDUE`, `EQUIPMENT_NOT_RETURNED`, `DAMAGE_REPORTED`, `REPAIR_NEEDED`, `LOW_INVENTORY`, `INSURANCE_EXPIRING`, `REGISTRATION_EXPIRING`, `PIN_LOCKED`. None of these are automatically generated anywhere in the codebase. The admin sees "Open Alerts: 0" permanently. The alert system is structurally there — it just needs the trigger logic wired up. This is one of the highest-value, lowest-effort wins in the entire roadmap.

**Only one `ADMIN_EMAIL` receives notifications.** The daily-check failure email goes to a single environment variable. If there are two admins, only one gets the email. This should pull from admin users in the database rather than a hardcoded env var.

**No filtering on the admin deployments view by project.** Admins can't quickly see "all deployments for Project X." The API supports `projectId` filtering but the UI doesn't expose it.

**Maintenance tasks have no assignee notification.** A `MaintenanceTask` has an `assigneeId` field, but there's no email, alert, or in-app notification when a task is assigned. The assignee would have to know to look at the maintenance page.

**No vehicle mileage history.** `Vehicle.odometer` is a single field set at creation. The `DailyCheck` model accepts an `odometer` reading, but nothing reconciles that with the vehicle's official odometer. If three different operators submit daily checks for the same vehicle with different odometer readings, there's no resolution logic. The vehicle odometer on the vehicle record never updates from daily checks.

**No bulk actions.** Admin can't bulk-retire inventory items, bulk-assign a project to multiple rigs, or bulk-export anything. As the fleet grows, individual item management becomes untenable.

**The admin projects page exists but projects are shallow.** A `Project` has name, type, location, start/end dates, status, lead, and notes. There's no acreage target, no completion percentage, no linked deliverables, and no way to see "what does it cost to run this project" in terms of equipment usage. The data model can support this with what's already in `CheckLog.projectId`, but the reporting layer doesn't exist.

**No admin mobile experience.** The admin layout is desktop-first with a sidebar nav. On a phone, it collapses — but has it been tested? If an admin is in the field and needs to approve a transfer or check on a deployment, they're doing it on a phone, and the admin UI needs to accommodate that.

---

### 3.3 Downstream Parties (Maintenance Shops, Management, Clients)

**Who they are:** People who never log into the app, but receive information generated by it.

**Maintenance shops:** Currently receive nothing. A `MaintenanceTask` can be created with shop name, shop address, repair type, purchase order, and invoice number — but there's no way to send that information to the shop. There's no "Send to Shop" button that emails the repair order. The shop has to be called manually, and the admin has to remember to update the task with the invoice number afterward.

**What's missing for shops:**
- A "Send Repair Order" action that emails the task details (item name, damage description, photos, PO number, hub address for shipping) to the shop's email address
- A public-facing URL where the shop can upload the completed invoice and close the task without needing an account
- Without this, the maintenance task system is just a note-taking tool, not a workflow system

**Management/ownership:** The `reports` page exists but its content is unknown. Management needs to see: cost per project (equipment rental equivalent, labor once Time Tracking exists), equipment utilization rate, operator activity summary, and fleet health at a glance.

**Landowners/clients (future):** Agricarbon's clients may want to see project progress. This is beyond the current PRD but it's worth designing toward — every data collection point (daily check GPS, project notes, equipment used) should be captured with the assumption that it will eventually be surfaced to a client-facing view.

---

## Part IV — Platform and Offline Analysis

### 4.1 iOS

**Camera input:** The scan page uses `<input type="file" accept="image/*" capture="environment">`. On iOS 16+, this opens the camera. The image is then decoded by `jsQR`. This works but is fragile — poor lighting, motion blur, or an off-angle shot will fail, and there's no retry loop without re-tapping the button. The My Rig QR scanning uses `html5-qrcode` for live video scanning, which is far more reliable. Both approaches should use the same component; the inconsistency is a UX problem.

**File upload for photos:** iOS restricts `<input type="file">` in certain PWA contexts. Photos attached to daily checks and disposition dialogs may fail in iOS home-screen PWA mode if the camera input element isn't correctly structured. This was partially addressed in Sprint 3 (photo attachment iOS fix) but should be regression-tested on each iOS major release.

**PWA installation on iOS:** iOS doesn't support the Web App Manifest's `display: standalone` prompt from the browser — users must manually "Add to Home Screen." The app has no onboarding screen that explains this. First-time operators on iOS will open the app in Safari and may not know to install it.

**Session cookies on iOS:** The session cookie uses `sameSite: 'lax'` and `httpOnly: true`. This works fine in Safari. The 24-hour session is reasonable for field use — but if an operator goes offline for more than 24 hours (e.g., remote multi-day deployment), their session will expire and they'll be prompted to log in again when they come back online. With a PIN-based login, this isn't catastrophic, but if they're offline they can't authenticate (the login route hits the server). Consider extending session duration to 7 days or implementing a "remember this device" option for field operators.

**Geolocation on iOS:** `navigator.geolocation` requires explicit user permission and will prompt the first time. If the operator denies it, the app needs to handle this gracefully and should not re-prompt on every submission. iOS also restricts background geolocation — the app can only capture location when the screen is on and the app is in the foreground.

### 4.2 Android

**More permissive:** Android's Chrome browser is more permissive about PWA installation (shows the "Add to Home Screen" banner automatically), file inputs, and camera access. The live QR scanning via `html5-qrcode` works better on Android overall.

**Background sync:** Android Chrome supports the Background Sync API, which could replace the current `online` event listener for the offline queue. Background Sync is more reliable — it fires even after the app is closed and the connection is restored. The current `useOfflineQueue` approach relies on the app being open when connectivity returns.

**WebAssembly for QR decoding:** Some Android devices can use WASM-based decoders for faster, more accurate QR scanning. This is a future optimization, not a current concern.

### 4.3 Desktop

**Admin use case:** The admin interface is desktop-first and works well there. The sidebar nav, data tables, and multi-step dialogs are designed for a mouse and a wider screen.

**Operator on desktop:** The operator interface is mobile-first but should work on desktop. Some interactions (QR scanning) don't apply on desktop — ensure the scan page degrades gracefully (shows "use the mobile app to scan" rather than a broken camera input).

### 4.4 Offline — The Honest Assessment

The app has real offline infrastructure: a service worker (serwist), an offline queue (IndexedDB via `useOfflineQueue`), and an offline fallback page (`/~offline`). The architectural intent is correct. But the current implementation has several gaps that mean it doesn't actually work well offline.

**What works offline right now:**
- Cached GET responses for `/api/inventory`, `/api/vehicles`, `/api/maintenance`, `/api/dashboard` (NetworkFirst, 5-second timeout, 12-hour cache)
- The offline fallback page when navigating to uncached pages
- The offline banner on the operator dashboard

**What doesn't work offline:**
- The operator's active rig data (`GET /api/deployments`) is NOT in the service worker cache. If an operator opens My Rig while offline, they see nothing. This is the single most critical page for field operators.
- The daily check page is a stub, so there's nothing to cache yet — but the intent was that daily checks queue offline and sync later.
- The offline queue (`useOfflineQueue`) is only referenced from the dashboard. No other page actually calls `enqueue()` to queue a submission for later. The My Rig page POSTs directly to the API. If offline, those POSTs fail silently or with an error.
- The queue has **no idempotency protection.** If the connection drops mid-POST and the request partially completes, the queue will replay it on reconnect, potentially creating duplicate data. The `/api/daily-check` uses `upsert` so it's safe. But `/api/deployments/[id]/items` is NOT idempotent — replaying it would add items twice.

**What the offline experience should be (target state):**
1. Add `GET /api/deployments` to the service worker cache
2. Every mutating action on My Rig should check `navigator.onLine`, and if offline, `enqueue()` the action to IndexedDB with a unique idempotency key
3. On reconnect, `flush()` replays queued actions in order
4. Idempotency: every queued item should include a client-generated UUID; the server should deduplicate on that UUID
5. The offline page should show the queued actions so the operator knows what's pending
6. Session persistence: extend session cookie maxAge to 7 days for operators so they don't need to re-authenticate after being offline

---

## Part V — UX Consistency Issues

These are places where the same concept is expressed differently in different parts of the app.

### 5.1 QR Scanning — Two Approaches, One App

- **My Rig page:** Uses `html5-qrcode` for live video scanning (continuous detection). Good UX.
- **Scan page:** Uses `jsQR` with a file input (take-a-photo approach). Worse UX.

Both are scanning `InventoryUnit.qrCodeId` values. They should use the same component. Create a `<QrScannerDialog>` shared component backed by `html5-qrcode`, and use it everywhere. The scan page should also be a dedicated surface for looking up items by QR, not a separate flow.

### 5.2 Status Chip Colors — Inconsistency Found

The scan page (as of the current codebase) still has `CHECKED_OUT: 'primary'` (green). After Sprint 5 ships this will be fixed in the inventory and admin pages, but the scan page's `STATUS_COLORS` map uses the old values and won't be caught unless explicitly included in the sprint.

**Sprint 5 must also update `/operator/scan/page.tsx`'s `STATUS_COLORS` map.** It currently maps `CHECKED_OUT: 'primary'`.

### 5.3 Status Labels — Two Different Naming Conventions

Some places use "Checked Out," others use "Out." The history tab chips say "Out" and "In." The status chips say "Checked Out" and "Available." This inconsistency makes the app feel unpolished. Standardize: status chips always use the full label; history chips may use abbreviated labels ("Out" / "In") only in tight spaces, but the meaning must be immediately clear from context.

### 5.4 Action Confirmation Dialogs — Inconsistent Patterns

- Some destructive actions (retire item, end rig) have confirmation dialogs
- Some don't (removing a kit item, removing a vehicle from a rig)
- The pattern for "are you sure?" should be consistent: any action that moves data from one state to another and cannot be trivially undone should confirm

### 5.5 Notes Are Required in Some Flows, Optional in Others

- `POST /api/deployments/[id]/items` requires `note: z.string().min(1)` — note is mandatory when adding items
- `POST /api/checkout` accepts `notes: z.string().optional()` — note is optional on standalone checkout
- End-of-rig disposition also requires a note

Notes are valuable for audit purposes. The pattern should be: notes are optional for routine actions (daily check pass, adding a standard item), required for any action that flags a problem (failed check, damaged item, inoperable unit). The current requirement for a note on every kit addition is probably too strict — adding a shovel doesn't need a note.

### 5.6 Loading States — Inconsistent

Some pages use `<Skeleton>` components during loading, others use `<CircularProgress>`, others show nothing. Standardize on `<Skeleton>` for table/list loading and `<CircularProgress>` in buttons during async actions.

### 5.7 Empty States

The inventory table shows "No equipment found" when there are no results. Other tables may show nothing, or a spinner that never clears. Every list, table, and collection should have a meaningful empty state that explains why it's empty and, if applicable, what to do about it.

### 5.8 Date Formatting

`new Date(log.submittedAt).toLocaleDateString()` is used in several places without specifying a locale. This will format differently depending on the user's browser locale — some will see M/D/YYYY, others D/M/YYYY. Standardize on explicit locale: `new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`.

### 5.9 Error Messages Reaching the User

Outside of Toast notifications (Sprint 6), errors currently surface inconsistently. Some pages have a local `error` state string that renders as a `<Typography color="error">`. Others swallow errors silently. Some API errors return `{ error: string }` and some return `{ error: { formErrors: [] } }`. The `extractApiError()` utility (Sprint 6) handles both formats, but it needs to be used everywhere.

### 5.10 Navigation Labels

The admin nav includes "Deployments" for what operators call "My Rig." These are the same concept from different perspectives. Internally this is fine, but any user-facing language should be consistent. If operators call it a "rig," the admin interface should say "Rigs" or "Deployments (Rigs)" rather than using terminology the operator never sees.

---

## Part VI — Codebase Risks and Technical Gaps

### 6.1 The Checkout API Is Orphaned

`POST /api/checkout` is a pre-Sprint-4 route that operates on item-level checkout without any knowledge of rigs, kits, or units. It still exists and still works. The operator checkout page that was supposed to use it is a stub. This route is now at odds with the current data model:

- It picks an arbitrary available unit and marks it CHECKED_OUT
- It creates a `CheckLog` with no `rigId` context (no direct FK to rig anyway)
- It doesn't create a `KitItem` record
- It doesn't update any rig's kit

If this route is ever called (e.g., directly from the offline queue), it will create `InventoryUnit` records in CHECKED_OUT state with no kit association, making the admin inventory view show things as checked out with no visible deployment.

**Recommendation:** Deprecate `POST /api/checkout` and the checkout stub page. Standalone checkout outside of a rig is a valid use case but should be designed as a lightweight "borrow" flow within the rig system, not a separate code path. For now, remove the checkout card from the operator dashboard or replace it with "Quick Borrow" that creates a minimal rig behind the scenes.

### 6.2 The CheckLog Has No Rig Reference

`CheckLog` records `itemId`, `inventoryUnitId`, `operatorId`, `projectId` — but NOT `rigId`. You cannot query "all check logs for Rig #123" directly. You can approximate it through `KitItem → Kit → Rig`, but that only works for the current checkout. A historical checkout that's been returned won't be linked to its rig.

This gap matters for:
- Operator history ("what did I have during my July deployment?")
- Admin auditing ("what items were on Rig #5 and what happened to them?")
- Cost allocation ("what equipment was used for Project X?")

**Fix:** Add `rigId String?` to `CheckLog`. Populate it whenever a checkout happens through the rig/kit system. This is a migration with a nullable field — safe to apply at any time, and can be backfilled where the `KitItem` association exists.

### 6.3 Vehicle Odometer Is a Dead Field

`Vehicle.odometer Int?` stores the vehicle's odometer at creation time. `DailyCheck.odometer Int?` stores what the operator typed in each day. These two values are never reconciled. The vehicle odometer never updates from daily checks.

This means:
- "Next service at 75,000 miles" maintenance tasks can't auto-trigger because the current odometer is unknown
- Mileage-based intervals (`IntervalType.MILEAGE`) are effectively non-functional
- The odometer shown on the vehicle detail page is stale from day one

**Fix:** In `POST /api/daily-check`, after creating/updating the check, if `odometer` is provided and it's greater than `vehicle.odometer`, update `Vehicle.odometer`. This is a simple one-line addition to the existing route.

### 6.4 MaintenanceTask Auto-Creation Is Missing

When an operator reports a failed daily check with issues, an email goes to the admin. But no `MaintenanceTask` is created automatically. The admin has to read the email, go to the maintenance page, and manually create a task. This is friction that erodes the value of the daily check system.

**Fix:** In `POST /api/daily-check`, if `passFail === false`, automatically create a `MaintenanceTask` with `isDamageReport: false`, `status: 'UPCOMING'`, `priority: 'HIGH'`, and the `issues` field as notes. The admin can review and update it, but at least it's in the system.

Similarly: when an operator reports an item as INOPERABLE during rig end, a `MaintenanceTask` is created (`isDamageReport: true`, `status: 'IN_PROGRESS'`) — this is already implemented. Good. The same should happen for IN_MAINTENANCE disposition.

### 6.5 Alert Creation Logic Is Missing

The `Alert` model has eight alert types. None are created anywhere. This is a placeholder that looks complete in the schema but does nothing at runtime. Suggested trigger points:

| Alert Type | Trigger |
|-----------|---------|
| `MAINTENANCE_OVERDUE` | Cron/scheduled check — any MaintenanceTask where `nextDue < now` and status is not COMPLETED |
| `EQUIPMENT_NOT_RETURNED` | Cron/scheduled check — any CheckLog CHECK_OUT older than N days with no CHECK_IN |
| `DAMAGE_REPORTED` | In `POST /api/deployments/[id]/items` (DELETE) when disposition is INOPERABLE |
| `REPAIR_NEEDED` | When a MaintenanceTask is created with isDamageReport: true |
| `LOW_INVENTORY` | In `POST /api/inventory` when quantity drops below `lowStockThreshold` |
| `INSURANCE_EXPIRING` | Cron/scheduled check — any Vehicle where `insuranceExpires` is within 30 days |
| `REGISTRATION_EXPIRING` | Same for `registrationExpires` |
| `PIN_LOCKED` | In `POST /api/auth/login` when `pinLockedAt` is set |

Most of these can be triggered synchronously at the point of data change. The cron-based ones need a scheduled endpoint (call from GCP Cloud Scheduler, or add as a cron route in Next.js).

### 6.6 No Rate Limiting on API Routes

There is no rate limiting anywhere. The login route (`POST /api/auth/login`) has PIN lockout after failed attempts, which is good. But the rest of the API has no protection against:
- An attacker enumerating inventory items by ID
- Bulk creation of rigs or transfers
- Photo upload abuse (Supabase Storage costs money per GB)

At the current scale (small team), this is a low-risk issue. As the user base grows, add rate limiting via middleware. `@upstash/ratelimit` with Redis or a simple in-memory rate limiter are both options.

### 6.7 Photo Upload — No Validation on File Type or Size

`POST /api/uploads` accepts photos for attachment to daily checks, dispositions, and maintenance tasks. The Supabase service role key has full storage access. If someone sends a non-image file or a very large file, the current code will upload it. File type and size validation should happen before the upload, not after.

**Quick fix:** Check `file.type.startsWith('image/')` and `file.size < 10 * 1024 * 1024` (10MB) before passing to Supabase.

### 6.8 `POST /api/deployments/[id]/items` — kitItemId Route Already Exists

`src/app/api/deployments/[id]/items/[kitItemId]/route.ts` already exists (it appeared in the file listing). This is likely the partial kit remove endpoint from Sprint 5. Need to verify it's not a conflict with the Sprint 5 spec in Section 4.2 before Sprint 5 ships — if it already exists, Sprint 5 may be implementing something that's already there or may overwrite different logic.

### 6.9 The `POST /api/checkout` Route Bypasses the Kit System

This route still exists, accepts `{ action, itemId }`, and picks an arbitrary available unit. It has no `kitId`, no `rigId`, no `inventoryUnitId` selection. It creates a `CheckLog` that is disconnected from any deployment. Any data created through this route will be orphaned — visible in the history tab but not attributable to a rig.

The `/operator/checkout/page.tsx` stub that links here should either be removed from the nav or implemented to go through the rig/kit system.

### 6.10 Session JWT Contains Stale Data

The session JWT stores `{ userId, role, name, email }` and is valid for 24 hours. If an admin changes a user's role (e.g., promotes an operator to admin, or deactivates them), the existing session JWT will continue to work with the old role until it expires. The `isActive: false` check on the user is bypassed because the session is validated by JWT signature alone, not by a database lookup.

**Fix:** In `getSession()`, after verifying the JWT, add a quick database check: `prisma.user.findUnique({ where: { id: payload.userId }, select: { isActive: true, role: true } })`. If `!isActive`, return null. If `role !== payload.role`, re-sign the session with the current role. This adds one DB query per request but is necessary for correct access control.

Alternatively, shorten session duration to 1 hour and rely on the auto-refresh pattern — longer sessions increase the window of stale access.

### 6.11 `InventoryItem.quantity` vs Unit Count Divergence

`InventoryItem.quantity Int` is a legacy field from before per-unit tracking. It's still stored and displayed (the operator inventory page shows it in the QTY column). But the true count of items is now `inventoryUnit.count({ where: { inventoryItemId } })`. These two numbers can diverge if:
- Units are soft-deleted (Sprint 6)
- Units are seeded with a different count than `quantity`
- An admin updates `quantity` directly without creating/removing units

The `quantity` field should either be removed (it's now derived from unit count) or kept in sync automatically. The admin inventory page appears to derive available count from `unitCounts`, but `quantity` is still shown as "Qty" in the table header. This creates confusion — "Qty: 5, Available: 2" where 5 is the original purchase quantity and 2 is the available units.

**Recommendation:** Rename `quantity` to `totalPurchasedQuantity` in the schema, or remove the display of `quantity` from the operator inventory page in favor of the unit count breakdown.

### 6.12 The Transfer System Has Partial Quantity Ambiguity

`TransferItem` links a `TransferRequest` to a `KitItem`. A `KitItem` has a `quantity` field. If a kit item has `quantity: 5` shovels and an operator wants to transfer just 2, the current system (before Sprint 5) transfers the entire `KitItem`. Sprint 5's partial kit management (Section 4) addresses this for removal, but the transfer flow doesn't yet explicitly handle partial quantities for consumables.

When a transfer is accepted, the accept route presumably creates new `KitItem` records for the receiving operator. If the original `KitItem.quantity` is 5 but only 2 were transferred, the accept route needs to know to create a `KitItem` with `quantity: 2` and decrement the original to 3. This business logic needs to be explicit in the transfer accept route.

---

## Part VII — Business Logic Gaps

### 7.1 A Vehicle Can Be on Two Active Rigs Simultaneously

Nothing prevents creating two active rigs that both include the same vehicle. The `RigVehicle` table has no unique constraint on `(vehicleId, removedAt IS NULL)`. Admin could accidentally assign the same truck to two deployments. At scale with many concurrent deployments, this becomes likely.

**Fix:** Before creating `RigVehicle`, check: `prisma.rigVehicle.findFirst({ where: { vehicleId, removedAt: null, rig: { endedAt: null } } })`. If found, return 409.

### 7.2 An Operator Can Have Two Active Rigs Simultaneously

Similarly, there's no constraint preventing an operator from being the primary operator on two active rigs at once. `Rig` has `operatorId` but no unique constraint on `(operatorId, endedAt IS NULL)`.

This matters for:
- Kit checkout — if an operator has two rigs with conflicting equipment, inventory tracking breaks
- Time tracking (Sprint 9) — clock-in should know which rig the time belongs to

**Fix:** Before creating a rig, check: `prisma.rig.findFirst({ where: { operatorId, endedAt: null } })`. If found, either block or prompt the admin to confirm.

### 7.3 End-of-Rig Doesn't Validate All Items Are Returned

When an operator ends their rig, the disposition dialog presumably handles each kit item. But what if they submit without addressing all items? Is it possible to end a rig with items still marked CHECKED_OUT? If so, those units are permanently stuck in CHECKED_OUT state with no active rig to trace them to.

The `POST /api/deployments/[id]/end` route should validate: all non-removed `KitItem` records in this rig's kit must have a disposition or must be in the request's `itemDispositions` array. If any are missing, return 400.

### 7.4 Transfer Accept Doesn't Validate the Receiving Operator Has an Active Rig

When a transfer is accepted, kit items move to the receiving operator's rig. But what if the receiving operator doesn't have an active rig? The transfer accept route presumably needs to find or create a kit for them. If there's no active rig, the transfer items have nowhere to go.

**Fix:** Transfer acceptance should either require the receiving operator to have an active rig, or auto-create a minimal "receive-only" rig for the items.

### 7.5 Project Assignment Is Optional but Reporting Requires It

CheckLogs optionally store a `projectId`. The project is set on the rig, and flows through to check logs from `rig.projectId`. But if a rig has no project, all its check logs are project-less, and cost attribution is impossible. 

For Agricarbon's carbon credit business, every deployment is presumably tied to a specific client/landowner project. Making `projectId` required on rig creation (or at minimum warning when not set) would improve data quality significantly.

### 7.6 `MaintenanceTask.assigneeId` Is Not Validated

The maintenance task has an `assigneeId String?` that presumably links to a `User`. But looking at the schema, there's no Prisma relation defined for this field — `MaintenanceTask` doesn't have an `assignee User?` relation. This means:
1. Prisma won't type-check the field as a user ID
2. No cascade behavior on user deletion
3. No way to query "all tasks assigned to me" efficiently

Either add the relation explicitly or decide this is a free-text field.

---

## Part VIII — Security and Compliance

### 8.1 PIN Authentication Is Sufficient for Now, But Has Ceilings

PIN-based auth is appropriate for mobile field workers — it's fast, works in gloves, and doesn't require typing an email. The current implementation is solid: `bcrypt` hashing, lockout after failures, 24-hour sessions. But as the organization grows:

- **PINs are shared or guessable.** Common PINs (1234, 0000, birth year) should be rejected.
- **No multi-factor for admin accounts.** An admin account compromised via PIN gives full access to all data.
- **No audit trail for admin actions.** If an admin deletes a vehicle, reassigns equipment, or changes user roles, there's no record of who did it. Every mutating admin action should log to an audit table.

### 8.2 Supabase Keys in Environment — Service Role Key Is Powerful

`SUPABASE_SERVICE_ROLE_KEY` is used server-side for photo uploads. This key bypasses all Supabase Row Level Security. If it ever leaks (into logs, a client bundle, or a public error response), someone has full read/write access to the Supabase database and storage. Verify:
- It's never included in the Next.js client bundle (it shouldn't be — it's a server-only env var, not `NEXT_PUBLIC_`)
- Logs don't capture request bodies that might contain it
- Error responses don't echo environment variables

### 8.3 Photo URLs Are Permanent and Unauthenticated

Supabase Storage public bucket URLs don't expire. Once a photo is uploaded, its URL is permanently accessible to anyone who knows it. For damage photos, inoperable equipment reports, and site photos, this may be sensitive. 

Consider:
- Using signed URLs with expiry for sensitive photos (Supabase supports this)
- Or explicitly keeping these as "non-sensitive" and documenting the assumption

### 8.4 No HTTPS Enforcement on Staging

Cloud Run serves over HTTPS by default, but if the staging URL is somehow accessible over HTTP (misconfigured load balancer, direct IP), session cookies set without `secure: true` (which is only set in production via `NODE_ENV`) would be vulnerable. Confirm staging sets `NODE_ENV=production` — looking at the Makefile, it does: `--set-env-vars="NODE_ENV=production"`. Good.

### 8.5 Invite Token Expiry Is Short With No Resend

`InviteToken.expiresAt` is set at creation. If the invited operator doesn't complete signup before expiry, the token is dead and they need a new invite. There's no "resend invite" button on the admin user management page — an admin would have to look up whether the token expired, delete the user record (if one was created), and re-invite. This should be a one-click action.

---

## Part IX — Operations and Deployment

### 9.1 Migrations Run in Production With No Validation

The deploy workflow (Cloud Run via GitHub Actions) does not run `prisma migrate deploy` as part of the deploy. Migrations must be run manually before or after deploy. This means:
- There's a window where the new code is running against an old schema
- Migrations can be forgotten, causing runtime errors
- No rollback procedure is documented

**Fix (Sprint 6 partially addresses):** Add migration step to the deploy workflow. The full recommendation is:
1. Run migration before deploying the new image (schema changes are backward-compatible by design)
2. Deploy new image
3. Run seed-units if needed
4. Health check

### 9.2 No Structured Logging or Error Tracking

The codebase has `console.error()` in a few places. Cloud Run captures stdout/stderr as log lines, but there's no structured logging (no correlation IDs, no request IDs, no error severity levels). Debugging a production issue requires wading through unstructured logs.

**Future:** Add `pino` or a similar lightweight logger. At minimum, log: route method + path + status + duration + userId on every request. This is a single middleware file.

**Even more future:** Integrate Sentry or Highlight.io for error tracking. Right now, if a server-side exception occurs in a background process, it silently fails.

### 9.3 The `ADMIN_EMAIL` Single Point of Failure

Daily check failure notifications go to `process.env.ADMIN_EMAIL`. If this person is on vacation, the email sits unread. The `Alert` system (once wired up) is the right solution — alerts appear in the app and any admin can see them. Until then, support multiple admin emails or pull from the admin users table.

### 9.4 Cold Start on Cloud Run

Staging has `min-instances=0`, meaning the container scales to zero when idle. The first request after idle will experience a cold start (typically 5-10 seconds for a Next.js app). This is fine for staging. Production has `min-instances=1`, which keeps one container always warm. Good.

### 9.5 No Database Backup Policy Documented

Supabase provides automatic backups on paid plans, but the backup retention period and restoration procedure aren't documented anywhere in the codebase. Before going to production with real customer data, document: backup frequency, retention period, and restoration drill procedure.

---

## Part X — Data Model Gaps and Future Schema Needs

### 10.1 Missing: `rigId` on `CheckLog`

As discussed — every checkout should know which deployment it belongs to. Add `rigId String?` with a nullable FK to `Rig`.

### 10.2 Missing: GPS on `DailyCheck`

`gpsLat Float?`, `gpsLng Float?`, `gpsAccuracy Float?` — needed for Sprint 8 Deployment Map. Capture at daily check submission from `navigator.geolocation`. GPS is already on `Photo` — the same pattern applies here.

### 10.3 Missing: `TransferItem.quantity`

`TransferItem` only has `{ id, transferRequestId, kitItemId }`. For consumable items where partial quantity transfer is needed (Sprint 5 Section 4.4), a `quantity Int @default(1)` field needs to be added. Without it, partial consumable transfers can't be expressed in the data model.

### 10.4 Missing: Audit Log

Every admin action that modifies data should be logged: who, what, when, and what changed. The schema needs an `AuditLog` model:
```
AuditLog  — userId, action, resourceType, resourceId, 
            changedFields Json?, createdAt
```

This is especially important for compliance-sensitive contexts (equipment accountability, chain of custody for field samples).

### 10.5 Missing: `MaintenanceTask.assignee` Relation

The `assigneeId` field exists but lacks a Prisma relation. Either formalize it or rename it to a free-text `assigneeName`.

### 10.6 Missing: Notification Preferences on User

When Sprint 9 adds invoicing and time tracking, and when alerts start firing, different users will want different notifications (email vs. in-app, immediate vs. digest). Add a `notificationPrefs Json?` field to `User` to support this without a schema migration later.

### 10.7 Missing: `InviteToken` Tracking of Who Was Invited

`InviteToken` has `createdBy String` (the admin's userId) but doesn't link to the `User` record that was eventually created. After an invite is completed, there's no way to know "this invite token resulted in user X." Consider adding `completedUserId String?` to `InviteToken`.

### 10.8 Missing: `Project` Fields for Agricarbon's Real Workflow

The `Project` model is minimal. Agricarbon's carbon credit workflow likely involves:
- **Acreage** — how many acres are being sampled (`acreage Decimal?`)
- **Protocol** — which carbon methodology is being followed (`protocol String?`)
- **Sample target** — number of soil cores or samples required (`sampleTarget Int?`)
- **Completion percentage** — derived from submitted samples vs. target
- **Client/Landowner** — who commissioned this project (a future `Client` model or just `clientName String?`, `clientEmail String?` for now)

Without these fields, the project system is just a label applied to deployments and check logs.

### 10.9 `Rig.label` Is Optional But Navigation Uses It

The rig `label` field is optional. In the My Rig page, the rig may display without a name. Operationally, operators may run multiple concurrent deployments (secondary operators, multiple simultaneous projects). An unlabeled rig is confusing. Either make label required or auto-generate: `"Rig — {operatorName} — {startDate}"`.

---

## Part XI — What Hasn't Been Discussed That Should Be

### 11.1 Carbon Credit Data Chain of Custody

Agricarbon's business is carbon credits. These credits are verified by third-party auditors who need to trace every soil sample from collection through lab analysis through credit issuance. AHITS is currently a logistics tool, but it sits right at the start of that chain. Someday, auditors may want to see: which operator collected samples at which GPS coordinate on which date using which equipment. All of that data exists in AHITS (or could). Design toward this — every field captured now could be evidence in an audit.

### 11.2 Equipment Certification and Training Records

Certain equipment (drills, UTVs, Christie drills) requires operator certification. Right now there's nothing preventing an uncertified operator from being assigned a Christie drill. In a future sprint, equipment categories could carry a `requiredCertification` field, and operators could carry a `certifications` list. The system could then warn or block assignments that don't match.

### 11.3 Rental Vehicles Have More Complexity Than Currently Modeled

`Vehicle` has `isRental Boolean` and several rental-specific fields (`rentalMake`, `rentalDropoffLocation`, `rentalAgreementUrl`, etc.). But there's no `rentalCostPerDay Decimal?`, no `rentalStartDate`, no `rentalEndDate`, and no alert when a rental is approaching its drop-off date. A rental that goes past its return window generates late fees. This is a real business cost that the app should track and alert on.

### 11.4 Consumable Item Quantity Reconciliation

Consumables (soil bags, sample jars, flags, etc.) are checked out in bulk quantities. But there's no mechanism for an operator to report "I used 30 of the 50 sample bags" — they check out 50 and check in... nothing. The inventory shows 50 permanently out. Without a "partial return" or "used quantity" mechanism, consumable inventory tracking is fictional — the numbers don't reflect reality after the first checkout.

Sprint 5 Section 4 adds partial return UI, which is the right direction. But even with partial return, the scenario is: "I used 30 bags in the field and have 20 left to return." The operator needs to be able to say "consumed: 30, returning: 20" — not just "returning 20." The consumed quantity should update the item's `quantity` permanently (reduce it), while the returned 20 go back to AVAILABLE. This consumption model isn't yet designed.

### 11.5 QR Labels Need a Print Workflow

QR code stickers need to be physically attached to every piece of serialized equipment. Currently the admin inventory page generates QR images that can be downloaded individually. At scale (100 serialized units), downloading 100 individual images is impractical. The app should support:
- Bulk QR label generation (PDF of N labels per page, formatted for standard label paper like Avery 5160)
- Pre-formatted label template with item name, unit number, and QR code
- A "Print Labels" button on the inventory item detail that generates the sheet

`src/lib/qr-label.ts` exists in the codebase, suggesting this has been thought about. Its content should be reviewed to see what's there.

### 11.6 The App Has No Onboarding Flow

A brand new operator receives an invite email, clicks the link, sets up their PIN, and lands on the operator dashboard. They see three cards: "Daily Vehicle Check," "Check Out / Check In," and "Scan QR Code." Two of those are stubs. There's no walkthrough, no "here's what to do on your first day," no help text. For a non-technical contractor who's never seen the app, this is disorienting.

**Recommendation:** Add a simple one-time onboarding flow after first login: "Welcome to AHITS. Here's how your day works." Three or four screens explaining: (1) start a rig when you begin a deployment, (2) submit a daily check every morning, (3) scan QR codes to track equipment, (4) end your rig when you return. This can be a simple `seenOnboarding Boolean @default(false)` field on User, checked after login.

### 11.7 Multi-Language Support

Field operators are contractors who may not be native English speakers. The app currently has no internationalization. This likely isn't a priority now, but choosing MUI (which has i18n support) and Next.js (which has built-in i18n routing) was the right foundation. Avoid hardcoding strings in ways that make translation difficult.

### 11.8 The Service Worker `skipWaiting: true` Can Cause Problems

The service worker is configured with `skipWaiting: true` and `clientsClaim: true`. This means when a new version deploys, the service worker updates immediately and takes control of all open tabs — without waiting for the user to close and reopen the app. If a user is mid-way through filling out a form when this happens, the page could reload mid-submission. The risk is low (deployments are infrequent) but real. Consider adding a "New version available — tap to update" banner instead.

---

## Part XII — Recommended Sprint Sequence

Based on this review, here is the recommended priority order for future sprints after Sprints 5 and 6:

### Sprint 7 — Complete the Operator Core Loop

The operator daily check and standalone checkout pages are stubs. The daily check is the highest-frequency operator interaction and the data source for vehicle maintenance triggers, GPS location, and admin oversight. This sprint makes the app actually usable by a field operator from end to end.

**Scope:**
- Implement the Daily Vehicle Check page (full checklist UI, photo capture, GPS capture, offline queue integration)
- Auto-create `MaintenanceTask` when daily check fails
- Update `Vehicle.odometer` from daily check submissions
- Wire the service worker to cache `GET /api/deployments` (operator's active rig)
- Add idempotency keys to offline queue submissions
- Fix session cookie maxAge to 7 days for operators
- Add GPS fields to `DailyCheck` schema
- Fix the QR scan page to use `html5-qrcode` (same as My Rig)
- Remove the "Check Out / Check In" stub card from the operator dashboard or implement it

### Sprint 8 — Alert System + Admin Dashboard v2

The alert system is fully designed but completely unimplemented. Wiring it up transforms the admin dashboard from a static stats page into an actionable command center.

**Scope:**
- Alert creation logic for all 8 alert types
- Admin dashboard: alerts panel (filterable, dismissable)
- Admin dashboard: "operators without today's check" warning
- Admin dashboard: "equipment out more than N days" warning
- Admin dashboard: vehicle insurance/registration expiry panel
- Vehicle odometer reconciliation from daily checks
- PIN reset UI on admin user management page
- Resend invite button on admin user management page
- `rigId` added to `CheckLog`
- Maintenance task auto-assignment notification email

### Sprint 9 — Deployment Map

With GPS now on daily checks (Sprint 7), the map feature can be built.

**Scope:** Per PRD Additions V2 — Mapbox GL JS map on admin dashboard, pin colors by recency, click-to-detail, operator's own pin on operator dashboard.

### Sprint 10 — Reporting and Project Depth

**Scope:**
- Project model extension (acreage, protocol, client name, sample target)
- Per-project cost reporting (equipment usage from CheckLog)
- Equipment utilization rate report
- Fleet health report (overdue maintenance, expired insurance, available/out breakdown)
- QR label print workflow (bulk PDF generation)
- Operator history view (past rigs, equipment used)
- Export to CSV (admin inventory, check log history, project summary)

### Sprint 11 — Time Tracking and Invoicing

Per PRD Additions V2. Prerequisites: `hourlyRate` on User (Sprint 6), `rigId` on CheckLog (Sprint 8), Projects with client info (Sprint 10).

### Sprint 12 — Maintenance Shop Integration

- "Send Repair Order" email action on maintenance tasks
- Shop email input on maintenance task
- Public URL for shop to upload invoice (no auth required — signed URL with expiry)
- Invoice number auto-capture on close

### Sprint 13 — Client/Landowner Portal (Future)

A read-only portal for Agricarbon clients to see project progress, GPS track, and equipment used. Requires: auth for external users (separate from operator/admin PIN), project data completeness (Sprint 10).

---

## Part XIII — The Most Important Things Right Now

If forced to rank by impact-per-effort:

1. **Implement the daily check page.** The API is done. It's the highest-frequency operator interaction, the source of maintenance triggers, and the data source for the deployment map. A motivated developer can build the UI in a day.

2. **Wire the alert system.** Eight alerts, most triggered synchronously on existing API routes. This single sprint turns the admin dashboard from decoration into a tool.

3. **Add `rigId` to `CheckLog`.** One nullable migration field. Unlocks operator history, admin auditing, cost attribution, and the foundation for Time Tracking. Should be in Sprint 8 at the latest.

4. **Fix vehicle odometer from daily checks.** One line added to the daily check API. Unlocks mileage-based maintenance intervals, which are currently non-functional.

5. **Extend operator sessions to 7 days.** One line change. Prevents operators from being locked out during multi-day offline deployments.

6. **Add `gpsLat/gpsLng` to `DailyCheck` now.** A nullable migration. Costs nothing to add and nothing to display yet, but delays Sprint 9 (the map) by one entire migration cycle if missed.

7. **Remove or implement the stub operator pages.** "Check Out / Check In" goes nowhere. For any operator who taps it on their first day, the app looks broken.

---

*This review reflects the state of the codebase as of Sprint 5 implementation (June 2026). It should be updated after each sprint cycle and used as the primary reference before writing new sprint documents.*
