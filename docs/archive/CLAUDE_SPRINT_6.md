# CLAUDE_SPRINT_6.md — Hardening & Infrastructure

**Purpose:** Harden the foundations before adding more features. No new user-facing functionality — only correctness, reliability, and observability improvements.

Stack: Next.js 16 App Router, TypeScript, Prisma 6, MUI v6, Supabase PostgreSQL, GCP Cloud Run. Read `AGENTS.md` before writing any code.

---

## Overview

| # | Area | Change |
|---|------|--------|
| 1 | Automated tests | Vitest + integration test suite for all core flows |
| 2 | N+1 query fix | `GET /api/inventory` currentOperator/currentProject logic |
| 3 | Atomic item creation | `POST /api/inventory` unit seeding wrapped in `$transaction` |
| 4 | Soft deletes | `InventoryItem` and `InventoryUnit` — never hard-delete |
| 5 | Serialized checkout concurrency | Atomic `updateMany` + graceful 409 on collision |
| 6 | Database indexes | Add missing indexes on frequently queried fields |
| 7 | Seed script automation | Makefile target + CI/CD migration step |
| 8 | `hourlyRate` on User | Nullable field now, required for upcoming Time Tracking sprint |
| 9 | Consistent UI error handling | Every mutating action surfaces API errors to the user |

---

## 1 — Automated Tests

### 1.1 Install dependencies

```bash
npm install -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### 1.2 `vitest.config.ts` (repo root)

```typescript
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [tsconfigPaths()],
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['./tests/setup.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      // Swap DATABASE_URL for the test database in all tests
      env: {
        DATABASE_URL: env.DATABASE_URL_TEST ?? env.DATABASE_URL,
        DIRECT_URL: env.DIRECT_URL_TEST ?? env.DIRECT_URL,
        PIN_SESSION_SECRET: env.PIN_SESSION_SECRET ?? 'test-secret-32-chars-minimum-pad',
        NODE_ENV: 'test',
      },
    },
  }
})
```

### 1.3 Test database setup

**For local development** — run a local Postgres instance via Docker. This is faster than a remote Supabase project, works offline, and avoids extra Supabase project costs.

```bash
# docker-compose.test.yml (create in repo root)
# docker compose -f docker-compose.test.yml up -d
services:
  postgres-test:
    image: postgres:16
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: ahits_test
    ports:
      - "5433:5432"   # 5433 to avoid conflict with any local postgres
```

```bash
# Start the test DB and apply migrations
docker compose -f docker-compose.test.yml up -d
DATABASE_URL=postgresql://test:test@localhost:5433/ahits_test \
DIRECT_URL=postgresql://test:test@localhost:5433/ahits_test \
  npx prisma migrate deploy
```

**`.env.test.local`** (add to `.gitignore`):
```
DATABASE_URL_TEST="postgresql://test:test@localhost:5433/ahits_test"
DIRECT_URL_TEST="postgresql://test:test@localhost:5433/ahits_test"
```

Add `docker-compose.test.yml` to `.gitignore` is NOT needed — commit it so all developers have the same setup.

**For CI** — the test job (Section 1.8) already runs a Postgres service container, so no Supabase project is needed there either.

### 1.4 `tests/setup.ts`

```typescript
import { prisma } from '../src/lib/prisma'

// Clean all data between test suites — ORDER MATTERS.
// Every FK must be deleted before the record it points to.
// Violations here cause "Foreign key constraint violated" on the second test.
//
// FK dependency map (child → parent):
//   photo → dailyCheck, checkLog, maintenanceTask, inventoryItem, vehicle, user
//   alert → user
//   checkLog → inventoryItem, inventoryUnit, user, project
//   transferItem → kitItem, transferRequest
//   transferVehicle → vehicle, transferRequest
//   transferRequest → rig, user
//   kitItem → kit, inventoryItem, inventoryUnit
//   kit → rig
//   rigVehicle → rig, vehicle
//   rigOperator → rig, user
//   rig → user, project
//   inventoryUnit → inventoryItem
//   maintenanceTask → inventoryItem, vehicle, hub (repairHubId)
//   dailyCheck → vehicle, user
//   projectEquipment → project, inventoryItem
//   inventoryItem → category, hub
//   vehicle (standalone)
//   project → user (leadId)
//   user (standalone)
//   hub (standalone)
//   category (standalone)
afterEach(async () => {
  await prisma.photo.deleteMany()
  await prisma.alert.deleteMany()
  await prisma.checkLog.deleteMany()
  await prisma.transferItem.deleteMany()
  await prisma.transferVehicle.deleteMany()
  await prisma.transferRequest.deleteMany()
  await prisma.kitItem.deleteMany()
  await prisma.kit.deleteMany()
  await prisma.rigVehicle.deleteMany()
  await prisma.rigOperator.deleteMany()
  await prisma.rig.deleteMany()
  await prisma.inventoryUnit.deleteMany()
  await prisma.maintenanceTask.deleteMany()   // before inventoryItem AND vehicle
  await prisma.dailyCheck.deleteMany()        // before vehicle
  await prisma.projectEquipment.deleteMany()  // before project AND inventoryItem
  await prisma.inventoryItem.deleteMany()     // before hub AND category
  await prisma.vehicle.deleteMany()
  await prisma.project.deleteMany()           // before user (leadId)
  await prisma.inviteToken.deleteMany()
  await prisma.user.deleteMany()
  await prisma.hub.deleteMany()               // after maintenanceTask (repairHubId)
  await prisma.category.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})
```

### 1.5 `tests/helpers/fixtures.ts`

Reusable factory functions for test data:

```typescript
import { prisma } from '../../src/lib/prisma'

export async function createCategory(name = 'Test Category') {
  return prisma.category.create({ data: { name } })
}

export async function createHub(overrides = {}) {
  return prisma.hub.create({
    data: { name: 'Test Hub', city: 'Austin', state: 'TX', ...overrides },
  })
}

export async function createAdmin(overrides = {}) {
  return prisma.user.create({
    data: { name: 'Admin User', email: 'admin@test.com', role: 'ADMIN', ...overrides },
  })
}

export async function createOperator(overrides = {}) {
  return prisma.user.create({
    data: { name: 'Test Operator', email: 'operator@test.com', role: 'OPERATOR', ...overrides },
  })
}

export async function createInventoryItem(categoryId: string, overrides = {}) {
  return prisma.inventoryItem.create({
    data: {
      name: 'Test Item',
      categoryId,
      itemType: 'CONSUMABLE',
      quantity: 3,
      ...overrides,
    },
    include: { units: true },
  })
}

export async function createInventoryUnit(inventoryItemId: string, overrides = {}) {
  return prisma.inventoryUnit.create({
    data: { inventoryItemId, status: 'AVAILABLE', ...overrides },
  })
}

export async function createRig(operatorId: string, overrides = {}) {
  const rig = await prisma.rig.create({
    data: { operatorId, ...overrides },
  })
  const kit = await prisma.kit.create({ data: { rigId: rig.id } })
  return { rig, kit }
}

// Session payloads for use with vi.mock
export const adminSession = {
  userId: '', // fill in after createAdmin()
  role: 'ADMIN' as const,
  name: 'Admin User',
  email: 'admin@test.com',
}

export const operatorSession = (userId: string) => ({
  userId,
  role: 'OPERATOR' as const,
  name: 'Test Operator',
  email: 'operator@test.com',
})
```

### 1.6 Route handler test pattern

Route handlers import `getSession` from `@/lib/auth/session` and `prisma` from `@/lib/prisma`. In tests:
- **`getSession`** — mock to return a controlled session
- **`prisma`** — let it use the test database (Vitest env sets `DATABASE_URL` before modules load)

```typescript
// tests/inventory.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET } from '../src/app/api/inventory/route'
import { prisma } from '../src/lib/prisma'
import { createCategory, createHub, createAdmin } from './helpers/fixtures'

// Mock getSession — returns whatever mockSession is set to
let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
}))

describe('POST /api/inventory', () => {
  let categoryId: string

  beforeEach(async () => {
    const admin = await createAdmin()
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
    const cat = await createCategory()
    categoryId = cat.id
  })

  it('creates item and units atomically', async () => {
    const req = new NextRequest('http://localhost/api/inventory', {
      method: 'POST',
      body: JSON.stringify({ name: 'GPS Unit', categoryId, itemType: 'SERIALIZED', quantity: 3 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.data.name).toBe('GPS Unit')
    expect(body.data.units).toHaveLength(3)

    // Verify units exist in DB
    const units = await prisma.inventoryUnit.findMany({
      where: { inventoryItemId: body.data.id },
    })
    expect(units).toHaveLength(3)
    expect(units.every((u) => u.status === 'AVAILABLE')).toBe(true)
  })

  it('returns 403 for non-admin', async () => {
    mockSession = { userId: 'x', role: 'OPERATOR', name: 'Op', email: 'op@test.com' }
    const req = new NextRequest('http://localhost/api/inventory', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', categoryId }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})
```

### 1.7 Key test suites to write

Create these test files. Each tests the most critical paths for that domain.

**`tests/inventory.test.ts`**
- `POST /api/inventory` — creates item + units atomically; 403 for operator
- `PATCH /api/inventory/[id]` — updates item fields
- `DELETE /api/inventory/[id]` — soft-deletes item and its units; item with checked-out units returns 409
- `GET /api/inventory` — returns `unitCounts`; `availableUnits` has correct positions; no soft-deleted items returned

**`tests/checkout.test.ts`**
- `POST /api/deployments` — CONSUMABLE checkout picks available units; SERIALIZED checkout uses specified unit; rejects unavailable unit
- `POST /api/deployments/[id]/items` — adds SERIALIZED unit; rejects unit already checked out (409 concurrency)
- `POST /api/deployments/[id]/end` — marks units AVAILABLE on CHECK_IN; marks units IN_MAINTENANCE or INOPERABLE on disposition

**`tests/transfer.test.ts`**
- `POST /api/transfers` — creates transfer with correct items
- `POST /api/transfers/[id]/accept` — creates new KitItems with `inventoryUnitId` carried over; marks original as removed
- `DELETE /api/transfers/[id]` — cancels pending transfer

**`tests/concurrency.test.ts`**
- Two simultaneous SERIALIZED checkouts for the same unit — first succeeds, second returns 409
- Uses `Promise.all` to simulate concurrent requests

**`tests/auth.test.ts`**
- Operators cannot access admin-only routes
- Secondary operators can call `end` and `vehicles` routes
- Unauthenticated requests return 401

**`tests/soft-delete.test.ts`**
- Soft-deleted items don't appear in `GET /api/inventory`
- `DELETE /api/inventory/[id]` on an item with checked-out units returns 409
- `DELETE /api/inventory/[id]` on an item with a PENDING transfer returns 409
- Units of a soft-deleted item are also soft-deleted

**Note on the `Condition` enum:** `CheckLog.condition` uses the `Condition` enum: `GOOD | MINOR_DAMAGE | NEEDS_REPAIR | MISSING_PARTS` — NOT `EquipmentStatus` values. When writing tests that assert on check log records, use the correct enum values. The unit's `status` (AVAILABLE / CHECKED_OUT / etc.) is separate from the condition logged at check-in time. The existing disposition route (`DELETE /api/deployments/[id]/items`) does NOT set `condition` on the HUB return path — this is intentional, condition is only captured for damage reports.

### 1.8 CI — add test job to `ci.yml`

Update `.github/workflows/ci.yml` to add a `test` job after the existing `lint-typecheck` job. The existing file runs on `pull_request: branches: [production, develop]` — preserve that trigger, don't change it.

```yaml
test:
  name: Integration Tests
  runs-on: ubuntu-latest
  needs: lint-typecheck

  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: test
        POSTGRES_PASSWORD: test
        POSTGRES_DB: ahits_test
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5

  steps:
    - uses: actions/checkout@v4

    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm

    - name: Install deps
      run: npm ci

    - name: Generate Prisma client
      run: npx prisma generate
      env:
        DATABASE_URL: postgresql://test:test@localhost:5432/ahits_test
        DIRECT_URL: postgresql://test:test@localhost:5432/ahits_test

    - name: Run migrations on test DB
      run: npx prisma migrate deploy
      env:
        DATABASE_URL: postgresql://test:test@localhost:5432/ahits_test
        DIRECT_URL: postgresql://test:test@localhost:5432/ahits_test

    - name: Run tests
      run: npm test
      env:
        DATABASE_URL_TEST: postgresql://test:test@localhost:5432/ahits_test
        DIRECT_URL_TEST: postgresql://test:test@localhost:5432/ahits_test
        PIN_SESSION_SECRET: ci-test-secret-at-least-32-chars-long
```

---

## 2 — Fix N+1 Query in `GET /api/inventory`

**File:** `src/app/api/inventory/route.ts`

**Problem:** There are TWO N+1 patterns in this route.

**N+1 #1 (lines ~40–56):** The `operatorId`/`projectId` filter path calls `findFirst` inside a loop — one query per checkout log to check if it was returned. This runs whenever any filter by operator or project is active.

**N+1 #2 (lines ~87–94):** The main `activeByItem` derivation loop also calls `findFirst` inside a loop — one query per item's most recent checkout log, on every page load regardless of filters.

Both are the same pattern: a bulk `findMany` for checkouts followed by per-item `findFirst` for check-ins.

**Fix:** Replace both with a two-query approach — one `findMany` for all relevant check-outs, one `findMany` for all relevant check-ins, then resolve in memory.

**Fix for N+1 #1** — replace the filter-path loop (lines ~40–56):

```typescript
if (operatorId || projectId) {
  const activeCheckouts = await prisma.checkLog.findMany({
    where: {
      action: 'CHECK_OUT',
      ...(operatorId && { operatorId }),
      ...(projectId && { projectId }),
    },
    orderBy: { submittedAt: 'desc' },
    select: { itemId: true, submittedAt: true },
  })

  // Bulk fetch all check-ins for these items
  const checkoutItemIds = [...new Set(activeCheckouts.map((l) => l.itemId))]
  const checkins = await prisma.checkLog.findMany({
    where: { itemId: { in: checkoutItemIds }, action: 'CHECK_IN' },
    select: { itemId: true, submittedAt: true },
  })

  const checkinSet = new Set(checkins.map((ci) => `${ci.itemId}:${ci.submittedAt.toISOString()}`))
  const seen = new Set<string>()
  const checkedOutItemIds: string[] = []
  for (const log of activeCheckouts) {
    if (seen.has(log.itemId)) continue
    seen.add(log.itemId)
    const wasReturned = checkins.some(
      (ci) => ci.itemId === log.itemId && ci.submittedAt > log.submittedAt
    )
    if (!wasReturned) checkedOutItemIds.push(log.itemId)
  }
  where.id = { in: checkedOutItemIds }
}
```

**Fix for N+1 #2** — replace the `activeByItem` derivation block (from line ~77 onward) with:

```typescript
const itemIds = items.map((i) => i.id)

// Single query for most recent checkout per item
const checkoutLogs = await prisma.checkLog.findMany({
  where: { itemId: { in: itemIds }, action: 'CHECK_OUT' },
  orderBy: { submittedAt: 'desc' },
  include: {
    operator: { select: { id: true, name: true } },
    project: { select: { id: true, name: true, location: true } },
  },
})

// Single query for all check-ins that could be returns
const checkinLogs = await prisma.checkLog.findMany({
  where: { itemId: { in: itemIds }, action: 'CHECK_IN' },
  select: { itemId: true, submittedAt: true },
})

// Build a set keyed by itemId+submittedAt for O(1) lookup
const returnSet = new Set(
  checkinLogs.map((l) => `${l.itemId}:${l.submittedAt.toISOString()}`)
)

// Walk checkouts from newest to oldest; first one with no return is the active one
const activeByItem: Record<string, typeof checkoutLogs[0]> = {}
for (const log of checkoutLogs) {
  if (activeByItem[log.itemId]) continue // already found for this item
  // Any check-in after this checkout date means it was returned
  const wasReturned = checkinLogs.some(
    (ci) => ci.itemId === log.itemId && ci.submittedAt > log.submittedAt
  )
  if (!wasReturned) activeByItem[log.itemId] = log
}
```

This reduces the checkout detection from N+1 queries to exactly 2 queries, regardless of item count.

---

## 3 — Atomic Item Creation

**File:** `src/app/api/inventory/route.ts`

**Problem:** `POST /api/inventory` creates the `InventoryItem` first, then creates `InventoryUnit` records in a separate call. A server crash between the two leaves an item with no units.

**Fix:** Wrap in `$transaction`:

```typescript
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: parsed.data as never,
    })
    if (parsed.data.quantity > 0) {
      await tx.inventoryUnit.createMany({
        data: Array.from({ length: parsed.data.quantity }, (_, i) => ({
          inventoryItemId: created.id,
          // Copy legacy unitId string to the first unit's serialNumber
          serialNumber: i === 0 ? (parsed.data.unitId ?? null) : null,
        })),
      })
    }
    return tx.inventoryItem.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        category: true,
        hub: true,
        units: { orderBy: { createdAt: 'asc' } },
      },
    })
  })

  return NextResponse.json({
    data: {
      ...item,
      unitCounts: computeUnitCounts(item.units),
    },
  }, { status: 201 })
}
```

---

## 4 — Soft Deletes

### 4.1 Schema — add `deletedAt` to `InventoryItem` and `InventoryUnit`

**File:** `prisma/schema.prisma`

In `InventoryItem`, add:
```prisma
deletedAt  DateTime?
```

In `InventoryUnit`, add:
```prisma
deletedAt  DateTime?
```

Generate and apply migration:
```bash
make db-generate
make db-migrate-dev  # or db-migrate for production
```

### 4.2 `DELETE /api/inventory/[id]` — soft delete

**File:** `src/app/api/inventory/[id]/route.ts`

Replace the hard delete with a soft delete that also cascades to units:

```typescript
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  // Block deletion if any units are currently checked out
  const checkedOut = await prisma.inventoryUnit.count({
    where: { inventoryItemId: id, status: 'CHECKED_OUT', deletedAt: null },
  })
  if (checkedOut > 0) {
    return NextResponse.json(
      { error: `Cannot delete item — ${checkedOut} unit(s) are currently checked out.` },
      { status: 409 }
    )
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.inventoryUnit.updateMany({
      where: { inventoryItemId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: now },
    }),
  ])

  return NextResponse.json({ ok: true })
}
```

### 4.3 Filter soft-deleted records in all queries

Add `deletedAt: null` to every `where` clause that queries `InventoryItem` or `InventoryUnit`. Key locations:

**`GET /api/inventory`** — `prisma.inventoryItem.findMany`:
```typescript
where: { ...existingWhere, deletedAt: null },
```
and `prisma.inventoryItem.count`:
```typescript
where: { ...existingWhere, deletedAt: null },
```

**`GET /api/inventory/[id]`**:
```typescript
const item = await prisma.inventoryItem.findUnique({
  where: { id, deletedAt: null },
  ...
})
```

**`GET /api/inventory/[id]/units`** — add to `where`:
```typescript
where: { inventoryItemId: id, deletedAt: null },
```

**`GET /api/inventory` units include** — filter out soft-deleted units when computing `unitCounts` and `availableUnits`:
```typescript
units: {
  where: { deletedAt: null },
  select: { id: true, status: true, qrCodeId: true, serialNumber: true },
  orderBy: { createdAt: 'asc' },
},
```

**`POST /api/deployments` and `POST /api/deployments/[id]/items`** — unit queries for CONSUMABLE checkout:
```typescript
where: { inventoryItemId, status: 'AVAILABLE', deletedAt: null },
```

**All other routes that query `InventoryUnit` or `InventoryItem`** — grep for `prisma.inventoryItem.find` and `prisma.inventoryUnit.find` across the entire codebase and add `deletedAt: null` to each. Run `npx tsc --noEmit` to catch any type gaps.

### 4.4 Soft delete + pending transfers edge case

If an `InventoryItem` is soft-deleted while a `TransferRequest` referencing one of its `KitItem` records is still PENDING, the receiving operator will accept a transfer for an item that no longer officially exists. The 409 guard in `DELETE /api/inventory/[id]` only blocks if units are `CHECKED_OUT` — a PENDING transfer doesn't change unit status until it's accepted.

**Fix:** In the soft-delete handler, also block if any `KitItem` belonging to this item appears in a PENDING `TransferItem`:

```typescript
const pendingTransfers = await prisma.transferItem.count({
  where: {
    kitItem: { inventoryItemId: id, removedAt: null },
    transferRequest: { status: 'PENDING' },
  },
})
if (pendingTransfers > 0) {
  return NextResponse.json(
    { error: 'Cannot delete item — it has pending transfers. Decline the transfers first.' },
    { status: 409 }
  )
}
```

### 4.5 Admin UI — show confirmation for items with units

**File:** `src/app/(admin)/admin/inventory/page.tsx`

The retire/delete confirmation dialog should mention that all units will also be soft-deleted. Update the message on the item retirement confirm dialog:

```typescript
message={`This will retire all ${retireItem?.unitCounts?.available ?? 0} available unit(s). Check-out history is preserved. Items and units can be recovered by contacting support.`}
```

For the actual delete button (if one exists beyond retire), surface the 409 error if checked-out units block deletion.

---

## 5 — Serialized Checkout Concurrency

**Problem:** Two operators simultaneously select the same serialized unit. The Prisma transaction prevents data corruption, but the second operator receives a generic 500 error with no useful message.

**Fix:** Use atomic `updateMany` as the checkout step so only one request can succeed. The loser gets a clean 409 with a descriptive error.

### 5.0 What already exists vs. what needs changing

Reading the actual code (as of Sprint 4):

- `POST /api/deployments/[id]/items` (SERIALIZED path, lines ~104–129): uses `tx.inventoryUnit.findUnique()` → check `unit.status !== 'AVAILABLE'` → `tx.inventoryUnit.update()`. This is **two separate operations** — another request can slip in between the check and the update. The fix below makes it atomic.

- `POST /api/deployments` (SERIALIZED path, lines ~120–132): same pattern — `findUnique` then `update`. Same fix applies.

The existing code throws a generic `Error` that surfaces as a 409 (`catch (err)` block already returns 409 with the message). So the error *status* is already correct; only the *message* and *atomicity* need fixing.

### 5.1 `POST /api/deployments/[id]/items` — SERIALIZED path

**File:** `src/app/api/deployments/[id]/items/route.ts`

In the SERIALIZED branch of the transaction, replace the `findUnique` + `update` pattern with an atomic `updateMany`:

```typescript
if (entry.itemType === 'SERIALIZED') {
  // Atomic: only succeeds if unit is still AVAILABLE at this exact moment
  const result = await tx.inventoryUnit.updateMany({
    where: { id: entry.inventoryUnitId, status: 'AVAILABLE', deletedAt: null },
    data: { status: 'CHECKED_OUT' },
  })
  if (result.count === 0) {
    // Unit was taken by another operator between selection and submission
    throw Object.assign(new Error('UNIT_CONFLICT'), { unitId: entry.inventoryUnitId })
  }
  await tx.kitItem.create({
    data: { kitId, inventoryItemId: entry.inventoryItemId, quantity: 1, inventoryUnitId: entry.inventoryUnitId },
  })
  await tx.checkLog.create({
    data: {
      action: 'CHECK_OUT',
      itemId: entry.inventoryItemId,
      inventoryUnitId: entry.inventoryUnitId,
      operatorId: session.userId,
      notes: parsed.data.note,
    },
  })
}
```

Catch the conflict outside the transaction and return a 409:

```typescript
try {
  await prisma.$transaction(async (tx) => { /* ... */ })
} catch (err: unknown) {
  if (err instanceof Error && err.message === 'UNIT_CONFLICT') {
    return NextResponse.json(
      { error: 'This unit was just checked out by someone else. Please select a different unit and try again.' },
      { status: 409 }
    )
  }
  throw err
}
```

### 5.2 `POST /api/deployments` — same fix for initial deployment creation

**File:** `src/app/api/deployments/route.ts`

Apply the same `updateMany` + conflict detection pattern in the `for (const ki of kitItems)` loop for SERIALIZED items (covered in Sprint 5 Section 1.7 — make sure the atomic pattern is used there too).

### 5.3 Frontend — graceful 409 handling

**`src/app/(operator)/operator/my-rig/page.tsx`** — when `POST /api/deployments/[id]/items` returns 409:

```typescript
if (res.status === 409) {
  const err = await res.json()
  // Clear the unit selection so operator must re-pick
  const m = new Map(pendingItems)
  m.forEach((entry, itemId) => {
    if (entry.itemType === 'SERIALIZED') {
      m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: null, unitLabel: null })
    }
  })
  setPendingItems(m)
  // Reload available units to show current state
  await load()
  setError(err.error ?? 'A unit was just taken. Please reselect.')
  return
}
```

**`src/app/(admin)/admin/deployments/page.tsx`** — same pattern in `handleAddItems` and `launch`.

---

## 6 — Database Indexes

**File:** `prisma/schema.prisma`

Add `@@index` directives to models that are queried with non-unique filters. Missing indexes are the most common cause of slow queries as data grows.

```prisma
model CheckLog {
  // ...existing fields unchanged...

  @@index([itemId])
  @@index([itemId, action])          // most common combined filter
  @@index([inventoryUnitId])
  @@index([operatorId])
  @@index([submittedAt])
  @@map("check_logs")
}

model InventoryUnit {
  // ...existing fields unchanged...

  @@index([inventoryItemId])
  @@index([inventoryItemId, status]) // used in every checkout query
  @@index([status])
  @@map("inventory_units")
}

model InventoryItem {
  // ...existing fields unchanged...

  @@index([categoryId])
  @@index([hubId])
  @@index([deletedAt])               // new from soft-delete
  @@map("inventory_items")
}

model KitItem {
  // ...existing fields unchanged...

  @@index([kitId])
  @@index([inventoryUnitId])
  @@index([removedAt])
  @@map("kit_items")
}

model Rig {
  // ...existing fields unchanged...

  @@index([operatorId])
  @@index([endedAt])
  @@map("rigs")
}

model RigVehicle {
  // ...existing fields unchanged...

  @@index([rigId, removedAt])        // most kit item queries filter both
  @@map("rig_vehicles")
}

model DailyCheck {
  // ...existing fields unchanged...
  // @@unique([vehicleId, date, operatorId]) already exists — good
  @@index([operatorId])
  @@index([vehicleId])
  @@map("daily_checks")
}
```

Run `make db-migrate-dev` to generate and apply the index migration.

---

## 7 — Seed Script Automation

### 7.1 Add `Makefile` target

```makefile
db-seed-units: ## Seed InventoryUnit records for all existing items (idempotent — safe to run multiple times)
	npx tsx scripts/migrate-inventory-units.ts
```

### 7.2 Update `CLAUDE.md` deploy steps

In the "Make the code change" section of `CLAUDE.md`, after `make db-migrate`, add:

```bash
# If this PR includes or follows the Sprint 4 per-unit inventory migration:
make db-seed-units
```

### 7.3 Startup health check — `src/app/api/health/route.ts`

Create a health endpoint that logs a warning if any inventory items have no units (indicating the seed script was not run):

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const [totalItems, unseededItems] = await Promise.all([
    prisma.inventoryItem.count({ where: { deletedAt: null } }),
    prisma.inventoryItem.count({
      where: { deletedAt: null, units: { none: { deletedAt: null } } },
    }),
  ])

  const healthy = unseededItems === 0

  if (!healthy) {
    console.warn(
      `[HEALTH] ${unseededItems} of ${totalItems} inventory items have no units. ` +
      `Run: make db-seed-units`
    )
  }

  return NextResponse.json({
    status: healthy ? 'ok' : 'degraded',
    unseededItems,
    totalItems,
  }, { status: healthy ? 200 : 503 })
}
```

Call `GET /api/health` after every staging deploy to confirm the seed ran.

**Important:** Return HTTP 200 even when degraded — many healthcheck monitors treat any non-200 as "service down" and may trigger an alert or restart the container before the seed script has time to run. Use the `status` field in the JSON body to distinguish `'ok'` from `'degraded'`, and use HTTP 503 only if the database itself is unreachable.

---

## 8 — Pre-populate `hourlyRate` on User

The upcoming Time Tracking sprint (PRD) requires an hourly rate per operator. Add it now as a nullable field so admins can fill it in before Time Tracking is shipped.

### 8.1 Schema change

**File:** `prisma/schema.prisma`

In the `User` model, add:
```prisma
hourlyRate  Decimal?  @db.Decimal(10, 2)
```

### 8.2 Admin user edit form

**File:** `src/app/(admin)/admin/team/page.tsx` (or wherever the user edit dialog is)

Add a "Hourly Rate ($)" field to the user edit dialog. Only visible when `role === 'OPERATOR'`. Number input, nullable, formatted as currency:

```tsx
{editUser?.role === 'OPERATOR' && (
  <TextField
    label="Hourly Rate ($/hr)"
    type="number"
    value={hourlyRate ?? ''}
    onChange={(e) => setHourlyRate(e.target.value ? parseFloat(e.target.value) : null)}
    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
    fullWidth
  />
)}
```

Include `hourlyRate` in the `PATCH /api/users/[id]` payload.

### 8.3 `PATCH /api/users/[id]`

If this route exists, add `hourlyRate: z.number().positive().optional().nullable()` to its Zod schema. If it doesn't exist yet, create it (or note it for the Time Tracking sprint).

---

## 9 — Consistent UI Error Handling

### 9.1 Global toast hook

**File:** `src/components/shared/useToast.tsx` (new file)

```typescript
'use client'
import * as React from 'react'
import { Snackbar, Alert } from '@mui/material'

interface Toast {
  message: string
  severity: 'success' | 'error' | 'warning' | 'info'
}

const ToastContext = React.createContext<(t: Toast) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<Toast | null>(null)

  return (
    <ToastContext.Provider value={setToast}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return React.useContext(ToastContext)
}
```

Add `<ToastProvider>` to both the admin and operator layout files:
- `src/app/(admin)/layout.tsx`
- `src/app/(operator)/layout.tsx`

### 9.2 Error extraction helper

**File:** `src/lib/api-error.ts` (new file)

```typescript
export async function extractApiError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body.error === 'string') return body.error
    if (body.error?.formErrors?.length) return body.error.formErrors[0]
    return `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}
```

### 9.3 Apply to all mutating actions

In every `fetch()` call that modifies data (POST, PATCH, DELETE), add error handling:

```typescript
const showToast = useToast()

// Before:
const res = await fetch('/api/...', { method: 'POST', ... })
if (res.ok) { /* success */ }

// After:
const res = await fetch('/api/...', { method: 'POST', ... })
if (res.ok) {
  showToast({ message: 'Saved successfully', severity: 'success' })
  // success logic
} else {
  const msg = await extractApiError(res)
  showToast({ message: msg, severity: 'error' })
}
```

Key locations to update (not exhaustive — grep for `await fetch` in `src/app`):
- Admin inventory: create, edit, delete, unit status change, retire
- Admin deployments: launch, add/remove items and vehicles, end deployment
- Operator my-rig: build kit, end rig
- Transfer: create, accept, decline, cancel

---

## 10 — Schema Notes & Invariants

These are facts about the schema that should guide implementation decisions in this sprint and future ones.

**`Condition` enum** (used in `CheckLog.condition`): `GOOD | MINOR_DAMAGE | NEEDS_REPAIR | MISSING_PARTS`. Completely separate from `EquipmentStatus`. Do not mix these up.

**`TransferItem` does NOT need `inventoryUnitId`**: The unit is already accessible via `transferItem → kitItem → inventoryUnit`. The schema already has `KitItem.inventoryUnitId` (nullable). Any code that processes a transfer accept should carry `kitItem.inventoryUnitId` forward to the new `KitItem` for the receiving rig. No schema migration needed for this.

**`Photo.gpsLat` / `Photo.gpsLng` already exist**: The Sprint 8 Deployment Map requires GPS on `DailyCheck`, not `Photo` — those are separate. Don't add GPS to `Photo` (it's already there).

**`CheckLog` has no `onDelete` → RESTRICT**: Hard-deleting an `InventoryItem` or `InventoryUnit` with associated `CheckLog` records will fail at the DB level. This is by design — soft deletes are the only safe path.

**`InventoryItem.qrCodeId`** — this is the *item-level* QR code (legacy, from before per-unit tracking). Each `InventoryUnit` also has its own `qrCodeId`. Scanning a unit QR should route to the unit, not the item. The item-level QR is still used in the operator inventory read-only view for displaying a printable label.

## 11 — TypeScript Check & Deploy

```bash
# Confirm clean typecheck
npx tsc --noEmit

# Run tests
npm test

# Commit
git add -A
git commit -m "feat: hardening — tests, soft deletes, N+1 fix, concurrency, indexes (Sprint 6)"
git push -u origin feature/<branch>

# PR + staging deploy
gh pr create \
  --title "feat: Sprint 6 — hardening & infrastructure" \
  --body "Adds automated tests, fixes N+1 inventory query, atomic item creation, soft deletes, serialized checkout concurrency protection, DB indexes, seed automation, hourlyRate on User, consistent UI error toasts." \
  --base main

PR_NUMBER=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR_NUMBER
gh run watch

# After deploy, verify health
curl https://<staging-url>/api/health
```

---

## 12 — Implementation Order

1. Schema changes (soft delete fields, `hourlyRate`, indexes) → single migration
2. `POST /api/inventory` atomic transaction (Section 3)
3. Soft delete — `DELETE /api/inventory/[id]` + filter `deletedAt: null` everywhere (Section 4)
4. N+1 fix in `GET /api/inventory` (Section 2)
5. Concurrency — `updateMany` checkout + 409 handling (Section 5)
6. Seed automation — Makefile target + health endpoint (Section 7)
7. `hourlyRate` field on user edit form (Section 8)
8. Toast provider + error extraction helper + apply to all mutations (Section 9)
9. Test infrastructure — vitest config, test database, setup file, fixtures (Section 1.2–1.5)
10. Write test suites (Section 1.7)
11. CI test job (Section 1.8)
12. `npx tsc --noEmit` → `npm test` → commit
