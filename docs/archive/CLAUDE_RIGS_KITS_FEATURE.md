# Claude Code Instructions — Rigs, Kits & Deployments Feature

## Context

Agricarbon field crews operate in "deployments." A deployment is created when an operator
heads out into the field — by the operator themselves or by an admin. It groups together:

- **Rig** — the operator's vehicles for this deployment (truck, trailer, UTV/ATV). Not a
  permanent named object — created fresh each time an operator deploys.
- **Kit** — the inventory items the operator takes (tools, sampling gear, bags, etc.).
  Always associated with a Rig. Created alongside the Rig.

Operators can create deployments, edit their rigs on-the-fly (add/remove vehicles and
items at any time), and transfer equipment to other operators mid-deployment.

**One note covers an entire action, regardless of how many items or vehicles are
involved. Adding 10 items at once requires one note for the batch. Removing one item
after the fact requires one note for that edit. Notes are never per-item.**

**Photos may optionally be attached to any action.**

**Transfers are a two-step handshake.** Initiating a transfer creates a pending
`TransferRequest`. Equipment stays with the source operator until the destination
operator explicitly accepts. The destination operator can also decline, in which case
nothing moves.

**Key terms used throughout this file:**
- "Active" deployment/rig = `endedAt IS NULL`
- "Transfer" = reassigning a vehicle or item from one rig/kit/operator to another
- `RigVehicle` and `KitItem` use soft-deletes (`removedAt`) to preserve history
- Notes on changes are stored on `RigVehicle.changeNote` and via `CheckLog.notes`
- "Pending transfer" = a `TransferRequest` with `status = PENDING`; equipment has not moved yet

---

## Step 1 — Schema additions

### New models — add to `prisma/schema.prisma`

Add all four models before the `InventoryItem` model. Add relations to existing models
after each new model.

```prisma
model Rig {
  id          String    @id @default(cuid())
  label       String?   // Optional free-text label, e.g. "TX Summer Run"
  operatorId  String
  operator    User      @relation("OperatorRigs", fields: [operatorId], references: [id])
  projectId   String?
  project     Project?  @relation(fields: [projectId], references: [id])
  startedAt   DateTime  @default(now())
  endedAt     DateTime? // null = currently active
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  vehicles    RigVehicle[]
  kits        Kit[]

  @@map("rigs")
}

model RigVehicle {
  id          String    @id @default(cuid())
  rigId       String
  vehicleId   String
  rig         Rig       @relation(fields: [rigId], references: [id])
  vehicle     Vehicle   @relation(fields: [vehicleId], references: [id])
  addedAt     DateTime  @default(now())
  addNote     String    // Required note when adding this vehicle
  removedAt   DateTime? // null = still in this rig
  removeNote  String?   // Required note when removing this vehicle
  photoUrls   String[]  @default([]) // Supabase Storage URLs

  @@map("rig_vehicles")
}

model Kit {
  id        String    @id @default(cuid())
  rigId     String
  rig       Rig       @relation(fields: [rigId], references: [id])
  label     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  items     KitItem[]

  @@map("kits")
}

model KitItem {
  id              String        @id @default(cuid())
  kitId           String
  inventoryItemId String
  quantity        Int           @default(1)
  kit             Kit           @relation(fields: [kitId], references: [id])
  item            InventoryItem @relation(fields: [inventoryItemId], references: [id])
  addedAt         DateTime      @default(now())
  removedAt       DateTime?     // null = still in this kit

  @@map("kit_items")
}
```

### Transfer models — add alongside the Rig/Kit models

```prisma
enum TransferStatus {
  PENDING
  ACCEPTED
  DECLINED
}

model TransferRequest {
  id             String          @id @default(cuid())
  fromRigId      String
  fromRig        Rig             @relation("FromRig", fields: [fromRigId], references: [id])
  toOperatorId   String
  toOperator     User            @relation("TransferTo", fields: [toOperatorId], references: [id])
  initiatedById  String
  initiatedBy    User            @relation("TransferBy", fields: [initiatedById], references: [id])
  note           String          // Required — describes what is happening and why
  photoUrls      String[]        @default([])
  status         TransferStatus  @default(PENDING)
  responseNote   String?         // Optional note when accepting or declining
  respondedAt    DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  vehicles       TransferVehicle[]
  items          TransferItem[]

  @@map("transfer_requests")
}

model TransferVehicle {
  id                String          @id @default(cuid())
  transferRequestId String
  vehicleId         String
  transferRequest   TransferRequest @relation(fields: [transferRequestId], references: [id])
  vehicle           Vehicle         @relation(fields: [vehicleId], references: [id])

  @@map("transfer_vehicles")
}

model TransferItem {
  id                String          @id @default(cuid())
  transferRequestId String
  kitItemId         String
  transferRequest   TransferRequest @relation(fields: [transferRequestId], references: [id])
  kitItem           KitItem         @relation(fields: [kitItemId], references: [id])

  @@map("transfer_items")
}
```

### Relations to add to existing models

```prisma
// In User model, add:
rigs               Rig[]             @relation("OperatorRigs")
transfersReceived  TransferRequest[] @relation("TransferTo")
transfersInitiated TransferRequest[] @relation("TransferBy")

// In Vehicle model, add:
rigVehicles      RigVehicle[]
transferVehicles TransferVehicle[]

// In Project model, add:
rigs  Rig[]

// In InventoryItem model, add:
kitItems  KitItem[]

// In Rig model, add:
outgoingTransfers TransferRequest[] @relation("FromRig")

// In KitItem model, add:
transferItems TransferItem[]
```

### Run the migration

```bash
npx prisma migrate dev --name rigs-kits-deployments
npx prisma generate
```

---

## Step 2 — Shared component: `NotePhotoDialog`

Before writing the APIs or pages, define this reusable dialog in
`src/components/shared/NotePhotoDialog.tsx`. It is used everywhere a change requires a
note and optional photos.

```tsx
'use client'
// Props:
// title: string — e.g. "Remove Truck 01 from rig"
// description?: string — optional context sentence shown below the title
// noteLabel?: string — defaults to "What's happening? (required)"
// open: boolean
// loading: boolean
// onClose: () => void
// onConfirm: (note: string, photoUrls: string[]) => void
// confirmLabel?: string — defaults to "Confirm"
// confirmColor?: 'error' | 'primary' | 'warning' — defaults to 'primary'
```

The dialog body contains:
1. A required `TextField` multiline (3 rows), label from `noteLabel`. Submit button is
   disabled until this has at least 5 characters.
2. An "Add photos" section:
   - A file input (`accept="image/*"` `multiple`) hidden behind a styled "Attach photos"
     button with a camera icon.
   - When files are selected, upload each to Supabase Storage at the path
     `rig-events/<timestamp>-<filename>` using the Supabase client.
   - Show upload progress as small circular indicators.
   - Display uploaded photo thumbnails (48×48px) in a row below the button, each with
     an X to remove.
   - Store the resulting public URLs in local state.
3. Cancel + Confirm buttons. Confirm passes `(note, photoUrls)` to `onConfirm`.

Import and use `NotePhotoDialog` everywhere a note/photo is needed. **Do not build
inline note fields** — always use this component.

---

## Step 3 — API routes

### Auth rules that apply to all deployment endpoints

- **Admins** can do everything on any deployment.
- **Operators** can:
  - Create a deployment (always for themselves — `operatorId` is forced to `session.userId`)
  - Read, edit, add/remove vehicles/items, transfer, and end **their own active deployment only**
  - For any endpoint that accepts a deployment ID, verify `rig.operatorId === session.userId`
    before proceeding; return 403 otherwise.

### `src/app/api/deployments/route.ts` (new file)

**GET** — list deployments. Query params:
- `active=true` (default) — `endedAt IS NULL`
- `active=false` — ended deployments
- `operatorId=X` — filter by operator
- `projectId=X` — filter by project

Operators automatically see only their own deployments (apply `operatorId = session.userId`
filter regardless of query param if `session.role === 'OPERATOR'`).

Response: array using the shape below. Only include `vehicles` and `kitItems` where
`removedAt IS NULL`.

```json
{
  "id": "rig_id",
  "label": "TX Run",
  "operator": { "id": "...", "name": "John Smith" },
  "project": { "id": "...", "name": "ABC Farm" },
  "startedAt": "...",
  "endedAt": null,
  "vehicles": [
    {
      "id": "rv_id",
      "addNote": "Starting TX deployment",
      "photoUrls": [],
      "vehicle": { "id": "...", "name": "Truck 01", "type": "TRUCK" },
      "addedAt": "..."
    }
  ],
  "kits": [
    {
      "id": "kit_id",
      "items": [
        {
          "id": "ki_id",
          "quantity": 2,
          "item": { "id": "...", "name": "Christie Drill", "category": { "name": "Sampling Equipment" } }
        }
      ]
    }
  ]
}
```

**POST** — create a deployment. Available to admins and operators.

Body:
```json
{
  "operatorId": "string — admins set this; operators ignored (forced to self)",
  "projectId": "string (optional)",
  "label": "string (optional)",
  "note": "string (required — deployment start note)",
  "vehicleIds": ["id1", "id2"],
  "kitItems": [{ "inventoryItemId": "id", "quantity": 1 }]
}
```

On creation (in a transaction):
1. Create the `Rig` record (force `operatorId = session.userId` for operators)
2. Create `RigVehicle` records for each vehicleId, setting `addNote = body.note`
3. Create one `Kit` record linked to the Rig
4. Create `KitItem` records for each item
5. Create `CheckLog` entries (action: `CHECK_OUT`, notes: `body.note`) for every item
6. Update `Vehicle.assignedOperatorId = operatorId` for all vehicles
7. Update `InventoryItem.status = 'CHECKED_OUT'` for all items

Return the created rig with its full shape.

---

### `src/app/api/deployments/[id]/route.ts` (new file)

**GET** — return the single rig with full shape (admins and operators for own rig).

**PATCH** — update `label`, `projectId`, or `notes`. Admins and operators (own rig only).

---

### `src/app/api/deployments/[id]/end/route.ts` (new file)

**POST** — end a deployment. Admins and operators (own rig only).

Body: `{ note: string (required) }`

On end:
1. Set `Rig.endedAt = now()`, `Rig.notes = body.note`
2. For every active `KitItem`: create `CheckLog` (CHECK_IN, notes: body.note), set item
   status to AVAILABLE
3. For every active `RigVehicle`: clear `Vehicle.assignedOperatorId`

Return `{ ok: true }`.

---

### `src/app/api/deployments/[id]/transfer/route.ts` (new file)

**POST** — initiate a transfer request. Does NOT move equipment. Admins and operators
(own rig only).

Body:
```json
{
  "toOperatorId": "string (required)",
  "note": "string (required)",
  "photoUrls": ["string"],
  "vehicleIds": ["id1"],
  "kitItemIds": ["id1", "id2"]
}
```

Validation:
- `vehicleIds` and `kitItemIds` cannot both be empty
- `toOperatorId` must be a different operator from the source rig's operator
- Any vehicleId or kitItemId must belong to the source rig's active assignments

In a transaction:
1. Create a `TransferRequest` record with `status = PENDING`, `note`, `photoUrls`,
   `fromRigId = params.id`, `toOperatorId`, `initiatedById = session.userId`
2. Create `TransferVehicle` records for each vehicleId
3. Create `TransferItem` records for each kitItemId
4. **Do not move any equipment yet** — it stays with the source operator

Return the created `TransferRequest` with its vehicles and items included.

---

### `src/app/api/transfers/route.ts` (new file)

**GET** — list transfer requests. Query params:
- `status=PENDING|ACCEPTED|DECLINED` (default: PENDING)
- `direction=incoming|outgoing` (for operators — incoming = toOperatorId matches session user;
  outgoing = fromRig.operatorId matches session user)

Admins see all transfers. Operators see only their own (incoming or outgoing).

Response: array of TransferRequest with fromRig (+ operator), toOperator, vehicles, and items.

---

### `src/app/api/transfers/[id]/accept/route.ts` (new file)

**POST** — accept a pending transfer and execute the equipment move.

Auth: only the **destination operator** (`toOperatorId === session.userId`) or an admin
can accept. Return 403 otherwise.

Body: `{ responseNote: string (optional) }`

In a transaction:
1. Verify `TransferRequest.status === PENDING` — return 409 if already responded
2. For each `TransferVehicle`:
   - Set `RigVehicle.removedAt = now()`, `removeNote = request.note` on the source RigVehicle
   - Find or create the destination rig (active Rig for `toOperatorId`; if none exists,
     create a new Rig with `operatorId = toOperatorId` and `startedAt = now()`)
   - Create new `RigVehicle` in destination rig with `addNote = "Accepted transfer from [source name]"`
   - Update `Vehicle.assignedOperatorId = toOperatorId`
3. For each `TransferItem`:
   - Soft-delete the source `KitItem` (`removedAt = now()`)
   - Find the destination rig's Kit (create one if none exists)
   - Create new `KitItem` in destination kit
   - Create CHECK_IN `CheckLog` for source operator (notes: request.note)
   - Create CHECK_OUT `CheckLog` for destination operator (notes: "Accepted transfer")
4. Set `TransferRequest.status = ACCEPTED`, `respondedAt = now()`,
   `responseNote = body.responseNote`

Return `{ ok: true, transferRequest: <updated> }`.

---

### `src/app/api/transfers/[id]/decline/route.ts` (new file)

**POST** — decline a pending transfer. Equipment stays with source. No records move.

Auth: only the destination operator or an admin can decline.

Body: `{ responseNote: string (optional) }`

1. Verify `status === PENDING`
2. Set `status = DECLINED`, `respondedAt = now()`, `responseNote = body.responseNote`

Return `{ ok: true }`.

---

### `src/app/api/deployments/[id]/vehicles/route.ts` (new file)

**POST** — add one or more vehicles to an active rig. Admins and operators (own rig only).

Body: `{ vehicleIds: string[] (required, min 1), note: string (required), photoUrls: string[] }`

For each vehicleId: creates `RigVehicle` with `addNote = note` and `photoUrls`. Updates
`Vehicle.assignedOperatorId`. The single note applies to the entire batch. Returns updated rig shape.

**DELETE** — remove one or more vehicles from a rig.

Body: `{ vehicleIds: string[] (required, min 1), note: string (required), photoUrls: string[] }`

For each vehicleId: sets `RigVehicle.removedAt`, `removeNote = note`. Clears
`Vehicle.assignedOperatorId`. The single note applies to the entire batch. Returns updated rig shape.

---

### `src/app/api/deployments/[id]/items/route.ts` (new file)

**POST** — add one or more items to the rig's kit. Admins and operators (own rig only).

Body:
```json
{
  "items": [{ "inventoryItemId": "string", "quantity": 1 }],
  "note": "string (required — one note for the entire batch)",
  "photoUrls": ["string"]
}
```

For each item: creates `KitItem`. Creates one `CheckLog` per item (CHECK_OUT, notes:
body.note). Attaches photos to the first CheckLog. Sets each item to CHECKED_OUT.
One note covers all items in the batch.

**DELETE** — remove one or more items from the kit.

Body:
```json
{
  "kitItemIds": ["string"],
  "note": "string (required — one note for the entire batch)",
  "photoUrls": ["string"]
}
```

For each kitItemId: sets `KitItem.removedAt`. Creates `CheckLog` (CHECK_IN, notes:
body.note). Sets item to AVAILABLE. One note covers all items in the batch.

---

## Step 4 — Admin deployments page

Create `src/app/(admin)/admin/deployments/page.tsx` as a `'use client'` component.

Follow the canonical admin page pattern (same structure as `admin/users/page.tsx`).

### Header
- Left: "Deployments" + subtitle: "X active"
- Right: "New Deployment" button (+ icon)

### Filter bar
```
[ All Operators ▾ ] [ All Projects ▾ ] [ ○ Show ended ]
```

### Main table

| Column | Content |
|--------|---------|
| OPERATOR | Avatar with initials + name |
| VEHICLES | Comma-separated vehicle names, each prefixed with its type icon |
| KIT ITEMS | "8 items" — tooltip on hover listing names |
| PROJECT | Project name or "—" |
| STARTED | Relative date ("3 days ago") |
| ACTIONS | Transfer icon + End icon (disabled if ended) |

Clicking a row opens the **Deployment Detail Drawer**.

### Deployment Detail Drawer (560px, right)

**Header:** Operator name + avatar + Active/Ended chip + editable label field.

**Rig section:**
- "Rig" heading + "Add Vehicles" button + "Remove Vehicles" button (shown only when rig has vehicles)
- List of active vehicles: type icon + name + type chip
- **Add Vehicles** → multi-select picker of unassigned ACTIVE vehicles → `NotePhotoDialog`
  (one note for all selected) → `POST /api/deployments/:id/vehicles` with array of vehicleIds
- **Remove Vehicles** → toggles checkboxes on each vehicle row → operator selects any
  subset → "Remove Selected" button appears → `NotePhotoDialog` (one note for all
  selected) → `DELETE /api/deployments/:id/vehicles` with array of vehicleIds

**Kit section:**
- "Kit" heading + "Add Items" button + "Remove Items" button (shown only when kit has items)
- List of active kit items: name + category chip + quantity
- **Add Items** → multi-select picker of AVAILABLE items, a direct number input field for consumables (type="number", min=0, no spinner arrows — operator types the quantity directly)
  → `NotePhotoDialog` (one note for the entire batch) → `POST /api/deployments/:id/items`
- **Remove Items** → toggles checkboxes on each item row → operator selects any subset
  → "Remove Selected" button appears → `NotePhotoDialog` (one note for all selected)
  → `DELETE /api/deployments/:id/items` with array of kitItemIds

**Footer:**
- "Transfer..." button → Transfer Dialog (see below)
- "End Deployment" button (error color) → `NotePhotoDialog` (title: "End this
  deployment?", description: "All kit items will be checked back in and vehicles
  unassigned.", confirmLabel: "End Deployment", confirmColor: "error") →
  `POST /api/deployments/:id/end`

### New Deployment Dialog (multi-step)

**Step 1 — Assign**
- Operator (select, required)
- Project (select, optional)
- Label (text, optional)

**Step 2 — Build Rig**
- Multi-select from ACTIVE, unassigned vehicles
- At least one required

**Step 3 — Build Kit**
- Search + multi-select from AVAILABLE items + a direct number input field for consumables (type="number", min=0, no spinner arrows — operator types the quantity directly)
- Can proceed with zero items (show amber warning "Starting with empty kit")

**Step 4 — Note & Launch**
- Required note field (placeholder: "e.g. Starting TX deployment with Truck 01 and Christie Drill kit")
- Optional photo upload (same pattern as NotePhotoDialog)
- "Launch Deployment" button → `POST /api/deployments`

### Transfer Dialog

**Step 1:** "Who are you transferring to?" — dropdown of all active operators (excluding
the current rig's operator).

**Step 2:** "What is transferring?" with checkboxes:
- Vehicles section (default all checked)
- Kit Items section (default all checked)
- "Select all" / "Deselect all" links

**Step 3:** Note & photos using `NotePhotoDialog` UI inline.

Submit → `POST /api/deployments/:id/transfer` — creates a **pending** transfer request.
On success show a toast: "Transfer request sent — waiting for [operator name] to accept."
Reload the drawer.

### Pending transfers in the admin drawer

When viewing a deployment that has outgoing pending transfers, show a section above the
Rig/Kit sections:

**Outgoing Pending Transfers** (only shown when `status = PENDING` transfers exist)
- Each row: "→ [Destination Operator]" + list of vehicles/items being transferred + date sent + note
- Cancel button (X) — ConfirmDialog → `DELETE /api/transfers/:id` (add this endpoint:
  admin or initiator only; sets status to DECLINED with note "Cancelled by sender")

---

## Step 5 — Operator "My Rig" page

Create `src/app/(operator)/operator/my-rig/page.tsx` as a `'use client'` component.

Operators can create, edit, and transfer from this page.

### Fetch
`GET /api/deployments?active=true` (API auto-filters to session user)

### State: no active deployment

Centered empty state:
- Truck icon (large)
- "No active deployment"
- Subtext: "Start a deployment when you pick up a rig or kit from a hub."
- **"Start Deployment" button** (primary, prominent) → opens New Deployment Dialog

### New Deployment Dialog (operator-specific)

Same multi-step form as the admin version **except** Step 1 has no Operator selector
(always self). Steps are:
1. Project (optional) + Label (optional)
2. Build Rig
3. Build Kit
4. Note & Launch

### State: active deployment

**Page header:** "My Rig" + project name chip (if set) + started date.

**Two Cards side by side (stack on mobile):**

**Left — My Rig**
- Vehicle list: type icon + name
- "Add Vehicles" button (small, outlined) below the list
- "Remove Vehicles" button (small, outlined, error color) — appears only when rig has vehicles
- Add → multi-select vehicle picker → one `NotePhotoDialog` for the batch
- Remove → toggles checkboxes on each vehicle → "Remove Selected (N)" button →
  one `NotePhotoDialog` for the batch

**Right — My Kit**
- Item list: name + category chip + quantity badge (amber if low stock)
- "Add Items" button (small, outlined) below the list
- "Remove Items" button (small, outlined, error color) — appears only when kit has items
- Add → multi-select item picker → one `NotePhotoDialog` for the batch
- Remove → toggles checkboxes on each item → "Remove Selected (N)" button →
  one `NotePhotoDialog` for the batch

**Incoming transfer banner** — shown at the very top of the page when there are pending
transfers addressed to this operator (`GET /api/transfers?status=PENDING&direction=incoming`):

```
┌─────────────────────────────────────────────────────────────────┐
│  📦  Incoming Transfer from John Smith                          │
│  Truck 01, Christie Drill (×2)                                  │
│  "Swapping rigs at the Waterloo hub"              [Decline] [Accept] │
└─────────────────────────────────────────────────────────────────┘
```

- If multiple pending transfers exist, stack one banner per transfer
- **Accept** → opens a small dialog with an optional response note field →
  `POST /api/transfers/:id/accept` → reload page
- **Decline** → opens a small dialog with an optional response note field →
  `POST /api/transfers/:id/decline` → reload page
- After accepting: the accepted vehicles/items appear in the operator's rig/kit immediately

**Outgoing pending transfer notice** — below the cards, if the operator has initiated
a transfer that hasn't been responded to yet:

```
⏳  Waiting for [Operator Name] to accept your transfer of [summary of items]
    [Cancel Transfer]
```

Cancel → ConfirmDialog → `DELETE /api/transfers/:id` → reload page

**Action row below both cards:**
- "Transfer Equipment" button (outlined, full width) → Transfer Dialog (same as admin)
- "End Deployment" button (text, error color, right-aligned) → `NotePhotoDialog`

All actions call the same APIs as the admin page — operators are just limited to
their own rig by the API layer.

### Add My Rig to operator nav

```typescript
// src/components/operator/OperatorNav.tsx
import LocalShippingIcon from '@mui/icons-material/LocalShipping'

// Current NAV_ITEMS order:
// Dashboard → Equipment → Daily Check → Check Out / In → Scan QR
//
// Insert My Rig between Dashboard and Equipment:
{ label: 'My Dashboard', href: '/operator/dashboard', icon: DashboardIcon },
{ label: 'My Rig',       href: '/operator/my-rig',   icon: LocalShippingIcon }, // ADD THIS
{ label: 'Equipment',    href: '/operator/inventory', icon: InventoryIcon },
{ label: 'Daily Check',  href: '/operator/daily-check', icon: ChecklistIcon },
{ label: 'Check Out / In', href: '/operator/checkout', icon: SwapHorizIcon },
{ label: 'Scan QR',      href: '/operator/scan',      icon: QrCodeScannerIcon },
```

---

## Step 6 — Update Admin nav

```typescript
// src/components/admin/AdminNav.tsx
import LocalShippingIcon from '@mui/icons-material/LocalShipping'

// Current NAV_ITEMS order:
// Dashboard → Inventory → Vehicles → Maintenance → Projects → Users → Reports
//
// Insert Deployments between Inventory and Vehicles:
{ label: 'Dashboard',    href: '/admin/dashboard',    icon: DashboardIcon },
{ label: 'Inventory',    href: '/admin/inventory',    icon: InventoryIcon },
{ label: 'Deployments',  href: '/admin/deployments',  icon: LocalShippingIcon }, // ADD THIS
{ label: 'Vehicles',     href: '/admin/vehicles',     icon: DirectionsCarIcon },
{ label: 'Maintenance',  href: '/admin/maintenance',  icon: BuildIcon },
{ label: 'Projects',     href: '/admin/projects',     icon: FolderIcon },
{ label: 'Users',        href: '/admin/users',        icon: PeopleIcon },
{ label: 'Reports',      href: '/admin/reports',      icon: BarChartIcon },
```

---

## Vehicle type icon map — define at top of any file that needs it

```typescript
import TruckIcon from '@mui/icons-material/LocalShipping'
import TerrainIcon from '@mui/icons-material/Terrain'
import AgricultureIcon from '@mui/icons-material/Agriculture'

const VEHICLE_ICON: Record<string, React.ElementType> = {
  TRUCK: TruckIcon,
  TRAILER: TruckIcon,
  POLARIS_UTV: TerrainIcon,
  CAN_AM_UTV: TerrainIcon,
  ATV: TerrainIcon,
  CHRISTIE_DRILL: AgricultureIcon,
  OTHER: TruckIcon,
}
```

---

## Files to create or modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `Rig`, `RigVehicle`, `Kit`, `KitItem` models + relations |
| `src/components/shared/NotePhotoDialog.tsx` | **Create new** — reusable note + photo dialog |
| `src/app/api/deployments/route.ts` | **Create new** |
| `src/app/api/deployments/[id]/route.ts` | **Create new** |
| `src/app/api/deployments/[id]/end/route.ts` | **Create new** |
| `src/app/api/deployments/[id]/transfer/route.ts` | **Create new** — creates pending TransferRequest |
| `src/app/api/transfers/route.ts` | **Create new** — list transfer requests |
| `src/app/api/transfers/[id]/accept/route.ts` | **Create new** — accept and execute transfer |
| `src/app/api/transfers/[id]/decline/route.ts` | **Create new** — decline transfer |
| `src/app/api/transfers/[id]/route.ts` | **Create new** — DELETE to cancel a pending transfer |
| `src/app/api/deployments/[id]/vehicles/route.ts` | **Create new** |
| `src/app/api/deployments/[id]/items/route.ts` | **Create new** |
| `src/app/(admin)/admin/deployments/page.tsx` | **Create new** |
| `src/app/(operator)/operator/my-rig/page.tsx` | **Create new** |
| `src/components/admin/AdminNav.tsx` | Add Deployments nav item |
| `src/components/operator/OperatorNav.tsx` | Add My Rig nav item |

**Do not touch any other files.**

---

## What NOT to build in this task

- Full audit-log view of every mid-deployment change (the data is captured in CheckLog
  and RigVehicle; the UI to display it is a future "History" tab)
- SMS/push notifications when a transfer happens
- Linking Deployments to `DailyCheck` (future — daily checks will reference the active
  rig once this is in place)

---

## Definition of done

- [ ] `npx prisma migrate dev` succeeds
- [ ] `npx prisma generate` succeeds
- [ ] `POST /api/deployments` works for both admins (any operator) and operators (self)
- [ ] Note field is required on all create/add/remove/transfer/end actions — API returns 400 if missing
- [ ] `RigVehicle.addNote` and `removeNote` are stored correctly
- [ ] Photos uploaded to Supabase Storage and URLs saved to `RigVehicle.photoUrls` or CheckLog
- [ ] `POST /api/deployments/:id/end` checks items back in and clears vehicle assignments
- [ ] `POST /api/deployments/:id/transfer` creates a PENDING TransferRequest — does NOT move equipment yet
- [ ] `POST /api/transfers/:id/accept` executes the actual move and sets status ACCEPTED
- [ ] `POST /api/transfers/:id/decline` sets status DECLINED, nothing moves
- [ ] `DELETE /api/transfers/:id` cancels a pending transfer (initiator or admin only)
- [ ] `GET /api/transfers?direction=incoming&status=PENDING` returns pending incoming transfers for the operator
- [ ] Operator My Rig page shows incoming transfer banners with Accept / Decline actions
- [ ] Operator My Rig page shows outgoing pending transfer notice with Cancel option
- [ ] Admin deployment drawer shows outgoing pending transfers with Cancel option
- [ ] Admin deployments page loads; drawer shows rig + kit with add/remove controls
- [ ] Every add/remove action in the admin drawer opens `NotePhotoDialog`
- [ ] Operator My Rig page shows empty state with "Start Deployment" button when no active rig
- [ ] Operator can complete the New Deployment flow from start to finish
- [ ] Operator can add/remove vehicles and items with note + optional photo
- [ ] Operator can open Transfer dialog and complete a transfer
- [ ] Operator can end their own deployment
- [ ] "My Rig" link in operator nav; "Deployments" link in admin nav
- [ ] `npm run type-check` passes with no errors
