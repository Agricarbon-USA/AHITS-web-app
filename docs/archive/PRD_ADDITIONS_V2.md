# AHITS PRD — Feature Additions (v2)

This document captures all product decisions, technical architecture choices, sprint outcomes, and planned future features. It is the source of truth for future AI-assisted sprints — read this alongside the codebase before planning or implementing anything.

---

## Sprint History & Architecture Decisions

### Sprint 4 — Per-Unit Inventory Tracking

**Shipped:** Per-physical-unit tracking via `InventoryUnit` model. Every `InventoryItem` has N child `InventoryUnit` records (one per physical unit). Each unit has its own `status: EquipmentStatus` and `qrCodeId: String @unique @default(cuid())`.

**Key architectural decisions:**

- `InventoryItem.status` was removed. Status is now derived from unit counts via a `derivedStatus()` helper with this priority: CHECKED_OUT > INOPERABLE > IN_MAINTENANCE > AVAILABLE > RETIRED.
- `unitCounts` replaces `status` everywhere in the API and UI: `{ available, checkedOut, inMaintenance, inoperable, retired }`.
- `availableUnits` is returned from `GET /api/inventory` as `Array<{ id, serialNumber, qrCodeId, position }>`. Position is 1-based index from `orderBy: { createdAt: 'asc' }`.
- QR codes belong to individual units, not items. Scanning a unit QR checks out that specific unit.
- Seed script `scripts/migrate-inventory-units.ts` must be run after the Sprint 4 deploy. Run via `make db-seed-units`.

**Status chip colors (Sprint 5 fix):**
- AVAILABLE → `'success'` (green)
- CHECKED_OUT → `'info'` (blue, NOT primary/green — they were identical before Sprint 5)
- IN_MAINTENANCE → `'warning'` (amber)
- INOPERABLE → `'error'` (red)
- RETIRED → `'default'` (grey)

### Sprint 5 — Unit Naming + History + Partial Kit Management (planned)

See `CLAUDE_SPRINT_5.md`. Key decisions:
- SERIALIZED items let operators pick which specific unit they're checking out, not just quantity.
- Unit display name: `unit.serialNumber ?? \`Unit ${unit.position}\`` where position is 1-based `createdAt ASC` index.
- Unit selection uses a shared `AdminKitEntry` discriminated union type:
  - `{ itemType: 'CONSUMABLE', quantity: number }` — no unit selection needed
  - `{ itemType: 'SERIALIZED', inventoryUnitId: string, unitLabel: string }` — picks a specific unit
- Per-unit check log history is shown nested under each unit in the admin inventory Units tab.
- `CheckLog` gains `inventoryUnitId: String?` (nullable FK to `InventoryUnit`) to support per-unit history.
- **Partial kit management** — remove or transfer individual units or partial quantities without removing all of an item:
  - Consumables: quantity input (1 to `kitItem.quantity`) when removing or transferring
  - Serialized: each `KitItem` row is already one unit; remove targets that specific unit
  - `DELETE /api/deployments/[id]/items/[kitItemId]` accepts `{ quantity?, condition?, notes? }`
  - Partial remove for consumables decrements `kitItem.quantity` rather than setting `removedAt`; returns the appropriate number of `InventoryUnit` records to AVAILABLE
  - Transfer creation dialog lets operator select specific units or partial quantities before initiating the transfer
  - `TransferItem.inventoryUnitId` (nullable) may need to be added to the schema — check before the deploy migration step

### Sprint 6 — Hardening & Infrastructure (planned)

See `CLAUDE_SPRINT_6.md`. Key decisions:

**Automated tests (Vitest):**
- Test database: separate `DATABASE_URL_TEST` env var; use a second Supabase project or schema.
- `getSession()` uses Next.js `cookies()` — must be mocked via `vi.mock('@/lib/auth/session')` in all tests.
- `prisma` uses `globalForPrisma` singleton — tests share the same client, so data cleanup in `afterEach` is essential.
- Key test suites: inventory (CRUD + soft delete), checkout (CONSUMABLE + SERIALIZED + concurrency), transfers, auth guards, soft delete behaviour.
- CI adds a `test` job that runs a local Postgres 16 service container.

**Soft deletes:**
- `deletedAt DateTime?` added to `InventoryItem` and `InventoryUnit`.
- `DELETE /api/inventory/[id]` now sets `deletedAt` on the item and all its units atomically. Blocks if any units are CHECKED_OUT (returns 409).
- All queries add `deletedAt: null` filter. Hard deletes are never performed on these models — `CheckLog` history must be preserved.

**Serialized checkout concurrency:**
- Two operators cannot check out the same `InventoryUnit` simultaneously.
- Fix: use `prisma.inventoryUnit.updateMany({ where: { id, status: 'AVAILABLE', deletedAt: null }, data: { status: 'CHECKED_OUT' } })`. If `result.count === 0`, the unit was taken — return 409 with a human-readable message.
- Frontend: on 409, clear unit selection, reload available units, show toast error.

**N+1 query fix:**
- `GET /api/inventory` was calling `prisma.checkLog.findFirst()` inside a loop (N+1).
- Fix: two bulk queries (`findMany` for CHECK_OUT and CHECK_IN logs), then resolve `activeByItem` in memory.

**Atomic item creation:**
- `POST /api/inventory` wraps `inventoryItem.create` + `inventoryUnit.createMany` in `prisma.$transaction`.

**Database indexes added:**
- `CheckLog`: `[itemId]`, `[itemId, action]`, `[inventoryUnitId]`, `[operatorId]`, `[submittedAt]`
- `InventoryUnit`: `[inventoryItemId]`, `[inventoryItemId, status]`, `[status]`
- `InventoryItem`: `[categoryId]`, `[hubId]`, `[deletedAt]`
- `KitItem`: `[kitId]`, `[inventoryUnitId]`, `[removedAt]`
- `Rig`: `[operatorId]`, `[endedAt]`
- `RigVehicle`: `[rigId, removedAt]`
- `DailyCheck`: `[operatorId]`, `[vehicleId]`

**`hourlyRate` pre-population:**
- `User.hourlyRate Decimal? @db.Decimal(10, 2)` added in Sprint 6.
- Admin can set it per operator in the user edit dialog.
- Required for Sprint 7+ Time Tracking.

**UI error handling:**
- `ToastProvider` wraps both admin and operator layouts.
- `extractApiError(res: Response): Promise<string>` utility parses API error responses.
- Every mutating `fetch()` call shows a success or error toast.

---

## Future Sprints

The following features are planned but not yet in any sprint document. They should be implemented in this order after Sprint 6.

### Sprint 7 — Polish, Correctness & Daily Operations

See `CLAUDE_SPRINT_7.md` for full spec. Key decisions captured here:

**P0 Data Accuracy:**
- `CheckLog.condition` must be written on all CHECK_IN records: `returnCondition` maps as `IN_MAINTENANCE → NEEDS_REPAIR`, `INOPERABLE → MISSING_PARTS`, `GOOD → GOOD`.
- Consumable unit returns must be scoped to exclude units in other active rigs' kits.
- End-of-deployment TRANSFER disposition: kit items must NOT get `removedAt` until transfer is accepted or declined. Accept route must not block on `sourceRig.endedAt` or `kitItem.removedAt: null` for end-of-deployment transfers. Decline route must restore units to AVAILABLE when source rig has ended.
- `rigId String?` added to `CheckLog` model with a migration.

**P1 Features:**
- Operator new deployment dialog supports serialized unit selection (same picker as Add Items).
- Daily check page fully implemented (vehicle, date, odometer, site, 9-item checklist, pass/fail, offline queue).
- Scan page gains check-in/check-out actions; checkout stub redirects to scan.

**P2:**
- Alert triggers: `DAMAGE_REPORTED`, `EQUIPMENT_NOT_RETURNED`, `MAINTENANCE_OVERDUE`, `PIN_LOCKED`. New admin alert feed via `/api/admin/alerts`.
- Service worker caches `/api/deployments*` and `/api/daily-check*`.
- Secondary operators can initiate transfers (same auth check as end/vehicles routes).
- Admin-accepted transfers include an audit note in `responseNote`.
- Admin deployment drawer gains a History tab via `GET /api/deployments/[id]/history`.

**P3:**
- Dead `doAction('removeItems')` code removed. Legacy `/api/checkout` returns 410.
- Photo context for kit additions changed from `MAINTENANCE` to `INVENTORY_REFERENCE`.
- Inline per-page toast state replaced with `useToast()` hook calls.

### Sprint 8 — Deployment Map

See "Feature: Deployment Map" section below for full spec.

**Technical prerequisites:**
- `DailyCheck` gains `gpsLat Float?`, `gpsLng Float?`, `gpsAccuracy Float?`.
- `PATCH /api/daily-checks` accepts GPS fields from browser `navigator.geolocation`.
- New `GET /api/admin/map` endpoint returns all active deployment positions.
- Mapbox GL JS loaded from CDN in the admin dashboard layout.
- Pin colours determined by recency of last `DailyCheck.submittedAt` per deployment.

### Sprint 9 — Time Tracking, Invoicing & Availability Calendar

See "Feature: Time Tracking, Invoicing & Availability Calendar" section below for full spec.

**Technical prerequisites (confirm Sprint 6 landed):**
- `User.hourlyRate` exists.
- `Project` model exists and is linked to `Rig` and `CheckLog`.

**New models (add to schema in this sprint):**
```
TaskType          — name, rateMultiplier Decimal, fixedRate Decimal?, isActive Boolean
OperatorRate      — operatorId, taskTypeId, customRate Decimal
TimeEntry         — operatorId, projectId?, rigId?, taskTypeId, clockIn DateTime,
                    clockOut DateTime?, durationMinutes Int?, notes String?,
                    hourlyRateApplied Decimal
Expense           — operatorId, projectId?, rigId?, type ExpenseType, amount Decimal,
                    date DateTime, description String, receiptUrl String?
Invoice           — operatorId, invoiceNumber Int @unique @default(autoincrement()),
                    periodStart DateTime, periodEnd DateTime,
                    status InvoiceStatus (DRAFT/SUBMITTED/APPROVED/PAID),
                    subtotalHours Decimal, subtotalExpenses Decimal, grandTotal Decimal,
                    pdfUrl String?, submittedAt DateTime?, approvedAt DateTime?,
                    approvedById String?, paidAt DateTime?
InvoiceLineItem   — invoiceId, type LineItemType (TIME/EXPENSE), description String,
                    quantity Decimal, rate Decimal, subtotal Decimal
Availability      — operatorId, date DateTime, type AvailabilityType
                    (AVAILABLE/UNAVAILABLE/TIME_OFF), notes String?
```

Add `milesReimbursementRate Decimal?` to a new `Settings` model (singleton row keyed by id = 'global').

### Sprint 10 — Projects & Reporting

- `Project` model fully fleshed out with phases, start/end dates, acreage targets, and status.
- Admin project dashboard: per-project cost breakdown (hours × rates + expenses).
- Export to CSV/PDF: kit manifest, time log, expense report per project.
- Operator project history: past projects with dates and invoice totals.

---

---

## Feature: Deployment Map

### Overview

A live map on the admin dashboard showing the current location of every active
deployment. Location is captured automatically from the operator's phone GPS when they
submit their daily check. The map gives admins instant situational awareness of where
all crews are in the field without requiring any manual reporting.

### User Stories

**Admin**
- As an admin, I can see a map of all active deployments so I know where every crew is right now.
- As an admin, I can click a pin on the map to see that deployment's details — operator name, project, rig, kit summary, and when the location was last updated.
- As an admin, I can see how long ago a location was last updated so I know if a crew hasn't checked in recently.

**Operator**
- As an operator, my location is captured automatically when I submit my daily check — I don't have to do anything extra.
- As an operator, I can see my own current pin on the map so I can confirm my location was recorded.

### How Location Is Captured

Location is recorded from the operator's phone browser when they submit their daily
check. The app requests the device's GPS coordinates (`navigator.geolocation`) at
submission time and stores them alongside the daily check record.

If the operator denies location access, the daily check still submits successfully —
the location fields are left blank and the deployment pin does not appear on the map
until a successful location is recorded.

### Map Behaviour

- **Provider**: Mapbox GL JS (open-source friendly, no per-load fees at our scale)
- **Default view**: zoomed to show all active deployment pins. If no deployments are
  active, shows the continental US centered on the midwest.
- **Pins**: one per active deployment, positioned at the most recent daily check GPS
  coordinates for that deployment's operator.
- **Pin colour**: green if updated within 24 hours, amber if 24–48 hours, red if more
  than 48 hours since last check-in (crew may be unreachable or forgot to check in).
- **Click/tap a pin**: opens a tooltip showing:
  - Operator name and avatar
  - Project name (if assigned)
  - Rig summary (vehicle names)
  - Kit item count
  - "Last updated [relative time]" (e.g. "Last updated 3 hours ago")
  - Link to open the full deployment detail

### Dashboard Placement

The map appears as a full-width card below the KPI summary row on the admin dashboard.
On mobile it collapses to a compact view (smaller height, still interactive).

### Data Model Changes Required

Add GPS fields to the `DailyCheck` model:
```
gpsLat   Float?   // Latitude from browser geolocation
gpsLng   Float?   // Longitude from browser geolocation
gpsAccuracy Float? // Accuracy in metres (for display quality indicator)
```

### What Is Out of Scope (for now)

- Route history / path tracking (showing where a deployment has travelled over time)
- Distance and mileage reports per deployment (planned for a future release)
- Real-time location tracking (location only updates when a daily check is submitted)
- Operator-facing full map (operators can only see their own pin)

---

## Feature: Time Tracking, Invoicing & Availability Calendar

### Overview

Operators are contractors. This feature lets them track their hours, log mileage and
expenses, and generate invoices to submit to Agricarbon for payment — all inside the
app. It also includes an availability calendar so admins can see who is free for
upcoming project assignments.

### User Stories

**Operator — Time Tracking**
- As an operator, I can clock in and out, with my time automatically assigned to the
  project I'm currently deployed on.
- As an operator, I can log the type of task I'm working on (each task type can have a
  different rate).
- As an operator, I can add mileage and out-of-pocket expenses for reimbursement.
- As an operator, I can review all my logged hours and expenses for a given period.
- As an operator, I can generate and download a PDF invoice for a date range that
  includes my hours broken down by project and task type, plus my expenses.

**Operator — Calendar**
- As an operator, I can mark days or ranges when I'm available for new assignments.
- As an operator, I can mark time off (personal days, vacations) so admins know I'm
  not reachable.
- As an operator, I can see my upcoming project assignments on my calendar.

**Admin**
- As an admin, I can see all operators' availability, time off, and project assignments
  in a single calendar view, filterable by operator.
- As an admin, I can see total hours and costs per project, with a breakdown by
  operator and task type.
- As an admin, I can review and approve submitted invoices before they are paid.

### Time Entry

When an operator clocks in:
1. They tap "Clock In" on their dashboard or My Rig page.
2. They select the task type they're starting (e.g. Soil Sampling, Equipment Setup,
   Travel, Administrative). Task types are admin-configurable (same editable dropdown
   pattern as equipment categories).
3. The system records the clock-in time and links it to their current active deployment
   and project.
4. They tap "Clock Out" when done. Duration is calculated automatically.
5. Optionally, they can add a note describing what they worked on.

Each operator has a **base hourly rate** stored in their profile. Task types can have
a **rate multiplier** (e.g. "Soil Sampling = 1.0×", "Travel = 0.75×", "Overnight = 1.5×")
or a **fixed override rate** set per operator per task type.

### Expenses

Operators can log individual expenses:
- **Type**: Mileage | Fuel | Lodging | Equipment Purchase | Other
- **Amount** (dollar value)
- **Date**
- **Description**
- **Receipt photo** (optional, uploads to Supabase Storage)
- Linked to current deployment/project automatically

Mileage uses a configurable per-mile reimbursement rate (admin sets this in Settings).

### Invoice Generation

An operator creates an invoice by selecting a date range. The system compiles:
- All time entries in the period, grouped by project and task type
- All expenses in the period
- Calculates totals (hours × rates + expenses)
- Generates a PDF with:
  - Operator name, contact info, and invoice date
  - Agricarbon's billing address
  - Line items: [Project] — [Task Type] — [Hours] — [Rate] — [Subtotal]
  - Expense line items with descriptions
  - Grand total
  - Invoice number (auto-incremented)

Invoice statuses: **Draft** → **Submitted** (operator submits) → **Approved** (admin
approves) → **Paid** (admin marks paid).

Admins can see all invoices across all operators, filter by status, and mark them approved
or paid.

### Availability Calendar

**Operator view** — a monthly calendar showing:
- **Green blocks**: days marked as available for new assignments
- **Grey blocks**: days marked as unavailable / time off
- **Blue blocks**: days with active deployment assignments
- **Clock icons**: days with logged time entries

Operators can click any day to add or edit availability or log time off.

**Admin view** — same calendar but showing all operators in a grid (one row per
operator, scrollable). Filterable by operator. Lets an admin quickly answer
"who is free next week?" before assigning a new deployment.

### Data Model (new models required)

```
TaskType          — name, rateMultiplier, fixedRate?, isActive
OperatorRate      — operatorId, taskTypeId, customRate (overrides TaskType rate)
TimeEntry         — operatorId, projectId?, deploymentId?, taskTypeId, clockIn,
                    clockOut, durationMinutes (computed), notes, hourlyRateApplied
Expense           — operatorId, projectId?, deploymentId?, type, amount, date,
                    description, receiptUrl?
Invoice           — operatorId, invoiceNumber, periodStart, periodEnd,
                    status (DRAFT/SUBMITTED/APPROVED/PAID), subtotalHours,
                    subtotalExpenses, grandTotal, pdfUrl?, submittedAt?,
                    approvedAt?, approvedById?, paidAt?
InvoiceLineItem   — invoiceId, type (TIME/EXPENSE), description, quantity,
                    rate, subtotal
Availability      — operatorId, date, type (AVAILABLE/UNAVAILABLE/TIME_OFF),
                    notes?
```

Also add `hourlyRate` (Decimal) to the `User` model for base operator rate.
Also add `milesReimbursementRate` to a `Settings` model or the `Hub` model.

### What Is Out of Scope (for now)

- Integration with external payroll systems (QuickBooks, Gusto, etc.)
- Automatic overtime calculations
- Two-way calendar sync (Google Calendar, Outlook)
- Expense approval workflow (expenses are included in the invoice, approved at invoice level)
