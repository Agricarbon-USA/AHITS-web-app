# AHITS Codebase & Sprint Consistency Audit

**Date:** 2026-06-16  
**Scope:** All sprint docs, PRD, schema, and live code  
**Legend:** 🔴 Bug / blocker | 🟡 Gap / inconsistency | 🟢 Already correct | ⏳ Future sprint

---

## Summary

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | 🟢 | Sprint 3 API | Rental vehicle type restriction — already fixed in live code (`!parsed.data.isRental &&`) |
| 2 | 🔴→🟢 | Sprint 4 Schema | Two-step migration now explicit in `CLAUDE_SPRINT_4.md` Section 1.6 |
| 3 | 🔴→🟢 | Sprint 4 API | `inventoryUnitId` on CheckLog entries now called out in Sprint 4 Section 2.9 |
| 4 | 🟡→🟢 | Sprint 3/4 API | Secondary operator auth fixed in `end/route.ts` and `vehicles/route.ts` (live code patched) |
| 5 | 🟡 | Sprint 4 API | `POST /api/inventory` unit seeding not transactional — use nested create |
| 6 | 🟡 | Sprint 4 UI | Admin `?status=` filter UI not explicitly called out for removal |
| 7 | 🟡 | Bugfix Sprint 2 | `NotePhotoDialog` spec missing `compressImage` (code is correct; doc is stale) |
| 8 | 🟡 | Disposition Feature | Spec says photos required for inoperable; code (correctly) makes them optional |
| 9 | ⏳ | PRD | Deployment Map feature: `DailyCheck.gpsLat/gpsLng/gpsAccuracy` not yet in schema |
| 10 | ⏳ | PRD | Time Tracking / Invoicing: large feature, no sprint planned yet |

---

## Detailed Findings

---

### 🔴 1 — Rental Vehicles: Operator API restriction blocks rental trucks

**Files:** `src/app/api/vehicles/route.ts`, `CLAUDE_BUGFIX_SPRINT_2.md`, `CLAUDE_SPRINT_3.md`

`CLAUDE_BUGFIX_SPRINT_2.md` adds this restriction to `POST /api/vehicles`:
```typescript
const OPERATOR_ALLOWED_VEHICLE_TYPES = ['TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV']
```

`CLAUDE_SPRINT_3.md` adds a `RentalVehicleForm` that includes `TRUCK` as a selectable type. An operator trying to add a rental truck will hit a 403.

**Fix required in Sprint 3 (if not yet deployed) or as a hotfix:**

Add an exception — if `isRental === true`, operators may add any vehicle type:

```typescript
if (session.role !== 'ADMIN') {
  const isRentalTruck = parsed.data.isRental === true
  if (!isRentalTruck && !OPERATOR_ALLOWED_VEHICLE_TYPES.includes(parsed.data.type)) {
    return NextResponse.json({ error: 'Operators may only add trailers and UTVs' }, { status: 403 })
  }
}
```

---

### 🔴 2 — Sprint 4: Two-step migration required (current guidance is ambiguous)

**File:** `CLAUDE_SPRINT_4.md`, Phase 1.7

The sprint doc mentions a "two-step migration" as a parenthetical note but doesn't spell it out. Because `InventoryItem.status` is a required enum field and the data migration script seeds `InventoryUnit` records, Claude Code must NOT drop `status` in the same migration that adds `InventoryUnit` — that would orphan live data.

**Correct sequence:**

**Migration 1 (add, don't remove):**
- Add `InventoryUnit` table
- Add `KitItem.inventoryUnitId`, `CheckLog.inventoryUnitId`
- Add `InventoryItem.units` relation
- Do NOT touch `InventoryItem.status` yet

**Data migration (run once before Migration 2):**
- `scripts/migrate-inventory-units.ts` — reads `item.status` to seed units with correct status

**Migration 2 (cleanup):**
- Remove `InventoryItem.status`
- Remove `InventoryItem.inoperableNotes`, `inoperableReportedAt`, `inoperableReportedById`
- Remove `User.inoperableReports` relation

This ensures no data loss and no migration-order dependency failures.

**Update to Sprint 4 deploy section — replace the migration steps with:**
```bash
# Step 1: Add InventoryUnit without dropping item status
make db-generate  # after editing schema to ADD models only
make db-migrate   # migration 1

# Step 2: Seed unit records while item.status still exists
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-inventory-units.ts

# Step 3: Remove status from InventoryItem in schema, regenerate, migrate
make db-generate  # after removing status/inoperable fields from InventoryItem
make db-migrate   # migration 2
```

---

### 🔴 3 — Sprint 4: Transfer accept route doesn't carry `inventoryUnitId` into CheckLog

**File:** `CLAUDE_SPRINT_4.md`, Section 2.9; `src/app/api/transfers/[id]/accept/route.ts`

Sprint 4's transfer section correctly copies `inventoryUnitId` to the new `KitItem` in the recipient's kit, but the `CheckLog` entries created in the same block don't carry `inventoryUnitId`. For serialized items, this breaks the per-unit audit trail.

**Fix:** In the transfer accept route, when creating CheckLog entries for transferred kit items, include `inventoryUnitId` when the kit item has one:

```typescript
await tx.checkLog.create({
  data: {
    action: 'CHECK_IN',
    itemId: ti.kitItem.inventoryItemId,
    inventoryUnitId: ti.kitItem.inventoryUnitId ?? null,  // ADD
    operatorId: transfer.fromRig.operatorId,
    notes: transfer.note,
  },
})
await tx.checkLog.create({
  data: {
    action: 'CHECK_OUT',
    itemId: ti.kitItem.inventoryItemId,
    inventoryUnitId: ti.kitItem.inventoryUnitId ?? null,  // ADD
    operatorId: toOperatorId,
    notes: 'Accepted transfer',
  },
})
```

This is already added to `CLAUDE_SPRINT_4.md` Section 2.9 (transfer block). Confirm it's in the code when implementing.

---

### 🟡 4 — Secondary operator auth: `end` and `vehicles` routes not covered

**Files:** `src/app/api/deployments/[id]/end/route.ts`, `src/app/api/deployments/[id]/vehicles/route.ts`, `CLAUDE_SPRINT_3.md`, `CLAUDE_SPRINT_4.md`

Sprint 4 Section 2.8 fixes secondary operator auth for the checkout route (`deployments/[id]/items`). But the same `getAuthorizedActiveRig` helper is used by `end` and `vehicles` routes — secondary operators also need to manage vehicles and end deployments they're assigned to.

**Fix required** (can be included in Sprint 4):

In `src/app/api/deployments/[id]/end/route.ts` and `src/app/api/deployments/[id]/vehicles/route.ts`, replace the authorization check to mirror what Sprint 4 already specifies for the items route:

```typescript
// Replace the simple getAuthorizedActiveRig check with:
const rig = await prisma.rig.findUnique({ where: { id } })
if (!rig || rig.endedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
const isSecondary = session.role !== 'ADMIN' && rig.operatorId !== session.userId
  ? await prisma.rigOperator.findUnique({
      where: { rigId_operatorId: { rigId: id, operatorId: session.userId } }
    })
  : null
if (session.role !== 'ADMIN' && rig.operatorId !== session.userId && !isSecondary) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

Or extract this into a shared `getAuthorizedRig(id, session)` helper that all three routes import.

---

### 🟡 5 — Sprint 4: New item creation not transactional

**File:** `CLAUDE_SPRINT_4.md`, Section 2.1

The spec shows `inventoryUnit.createMany` called separately after `inventoryItem.create`. If the second call fails, you'd have an item with no units.

**Fix:** Wrap in a transaction or use Prisma nested create:

```typescript
const item = await prisma.inventoryItem.create({
  data: {
    ...(parsed.data as any),
    units: {
      create: Array.from({ length: parsed.data.quantity }, () => ({})),
    },
  },
  include: { category: true, hub: true, units: true },
})
```

This uses Prisma's nested create so both records are created atomically.

---

### 🟡 6 — Sprint 4: Admin inventory `?status=` filter UI not called out for removal

**File:** `CLAUDE_SPRINT_4.md`, Section 2.1; `src/app/(admin)/admin/inventory/page.tsx`

Sprint 4 says to remove the `?status=` query param from the API. But the admin inventory page has a status filter dropdown that sends `?status=` to the API. This will become a dead filter (sending a param the API ignores) and may show a TypeScript error since `InventoryItem.status` no longer exists as a type.

**Explicit call-out to add to Sprint 4 type-cleanup (Phase 6):**
- Remove the status filter `<TextField select>` from the admin inventory filter bar
- Remove `const status = searchParams.get('status') as EquipmentStatus | null` from the API route
- Keep `STATUS_CHIP_COLOR` and `STATUS_LABELS` maps — they're still used for unit-level status display in the Units tab

---

### 🟡 7 — Bugfix Sprint 2: `NotePhotoDialog` spec missing `compressImage`

**File:** `CLAUDE_BUGFIX_SPRINT_2.md`, File #3; `src/components/shared/NotePhotoDialog.tsx`

The spec's code block shows the old version without `compressImage`. The actual file is correct (compression was added in a subsequent iteration). This is a historical doc inconsistency only — **no code change needed**.

If Claude Code is ever asked to "rebuild NotePhotoDialog from the sprint doc", it would miss compression. The safest reference is the actual file at `src/components/shared/NotePhotoDialog.tsx`.

---

### 🟡 8 — Disposition Feature: Photo requirement spec vs. implementation

**File:** `CLAUDE_ITEM_DISPOSITION_FEATURE.md`; `src/components/shared/DispositionDialog.tsx`

Original spec: "Inoperable flow: photo required (min 1)"  
Actual code: photos are optional for inoperable items (confirmed correct — requirement was intentionally relaxed)

This is a deliberate product decision made after the spec was written. The code is correct. The spec is stale. **No change needed**, but document this for future reference: DispositionDialog does NOT require photos for inoperable items.

---

### ⏳ 9 — PRD: Deployment Map feature (not yet implemented)

**File:** `PRD_ADDITIONS_V2.md`

Requires `DailyCheck.gpsLat Float?`, `gpsLng Float?`, `gpsAccuracy Float?` — none in the current schema. Also requires Mapbox GL JS integration on the admin dashboard.

**Status:** Not blocking any current sprint. Sprint 5 candidate.

**Pre-work needed before Sprint 5:**
- Add GPS fields to `DailyCheck` in schema
- Update `POST /api/daily-check` to accept and store GPS coordinates
- Update operator daily check page to request `navigator.geolocation` on submit

---

### ⏳ 10 — PRD: Time Tracking / Invoicing (not yet implemented)

**File:** `PRD_ADDITIONS_V2.md`

Requires ~7 new models: `TaskType`, `OperatorRate`, `TimeEntry`, `Expense`, `Invoice`, `InvoiceLineItem`, `Availability`. Also requires `User.hourlyRate` and a PDF invoice generator.

**Status:** Large feature. Sprint 6+ candidate. No conflicts with current sprints.

---

## Sprint Order & Dependencies

Current confirmed order (based on what's in the schema already):

```
Sprint 1 (done) → Bugfix Sprint 2 (done) → Sprint 3 (done — schema confirmed in schema.prisma)
                                                          ↓
                                                    Sprint 4 (pending)
                                                          ↓
                                               Sprint 5: Deployment Map
                                                          ↓
                                               Sprint 6+: Time Tracking
```

Sprint 4 **depends on Sprint 3** being deployed first (uses `RigOperator` for auth checks). Since Sprint 3's schema changes (`RigOperator`, rental fields on `Vehicle`) are already in `prisma/schema.prisma`, Sprint 3 is either deployed or at minimum its migrations have been applied locally.

---

## Files Updated in This Audit

| File | Change |
|------|--------|
| `src/app/api/deployments/[id]/end/route.ts` | ✅ Fixed — secondary operator auth now checks `RigOperator` |
| `src/app/api/deployments/[id]/vehicles/route.ts` | ✅ Fixed — `getAuthorizedActiveRig` now checks `RigOperator` |
| `CLAUDE_SPRINT_4.md` | ✅ Updated — two-step migration in Section 1.6; new Section 2.0 for secondary operator auth; deploy section updated |
| `AUDIT_REPORT.md` | ✅ This file |

## Remaining Before Sprint 4 Deploy

| File | Change |
|------|--------|
| `src/app/api/inventory/route.ts` | Use nested Prisma create for transactional unit seeding (finding #5) |

All other findings are either already fixed, documentation-level observations, or future-sprint concerns.
