/**
 * Data-integrity regression tests for the 10-bug fix batch.
 * Each describe block targets one bug.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createAdminUser, createCategory, createInventoryItem,
  createInventoryUnit, createRig, createHub, seedInventoryStock,
  addVehicleToRig, createVehicle, operatorSession, adminSession,
} from './helpers/fixtures'
import {
  createRequest,
  applyRequestTransition,
  setLineFulfillment,
} from '../src/lib/deployment-requests'
import { POST as endDeployment } from '../src/app/api/deployments/[id]/end/route'
import { POST as acceptTransfer } from '../src/app/api/transfers/[id]/accept/route'
import { POST as declineTransfer } from '../src/app/api/transfers/[id]/decline/route'
import { DELETE as cancelTransfer } from '../src/app/api/transfers/[id]/route'
import { DELETE as removeVehicles } from '../src/app/api/deployments/[id]/vehicles/route'
import { POST as revokeLink } from '../src/app/api/status-links/[id]/revoke/route'

let mockSession: object | null = null

vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}), resolveActiveAlert: vi.fn().mockResolvedValue({}) }))
vi.mock('../src/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({}) }))

// ── helpers ─────────────────────────────────────────────────────────────────

async function confirmAllLines(requestId: string) {
  const lines = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "deployment_request_lines" WHERE "requestId" = ${requestId}
  `
  for (const { id } of lines) {
    await setLineFulfillment(id, { status: 'CONFIRMED', actor: { label: 'test' } })
  }
}

async function getStockRow(itemId: string, hubId: string) {
  const rows = await prisma.$queryRaw<{ quantity: number; reservedQty: number }[]>`
    SELECT quantity, "reservedQty" FROM inventory_stock WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}
  `
  return rows[0] ?? null
}

// ── Bug 1a: atomic cancel (flip before release) ──────────────────────────────

describe('Bug 1a — cancel flip-before-release: STATE_MISMATCH does not leak stock', () => {
  it('cancel from STAGED releases reserved stock and marks CANCELLED', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const op = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 5 })
    await seedInventoryStock(item.id, hub.id, 5)
    const requestId = await createRequest(
      { requestType: 'RESERVATION', status: 'REQUESTED', fulfillerHubId: hub.id,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 2, specificInventoryItemId: item.id }] },
      op.id,
    )
    await confirmAllLines(requestId)
    await applyRequestTransition(requestId, 'confirm', 'RESERVATION')

    const stockAfterStage = await getStockRow(item.id, hub.id)
    expect(stockAfterStage?.reservedQty).toBe(2)

    const result = await applyRequestTransition(requestId, 'cancel', 'RESERVATION')
    expect(result).toEqual({ ok: true })

    const stockAfterCancel = await getStockRow(item.id, hub.id)
    expect(stockAfterCancel?.reservedQty).toBe(0)
  })

  it('cancel from wrong state returns STATE_MISMATCH without leaking stock', async () => {
    const hub = await createHub()
    const cat = await createCategory()
    const op = await createOperator()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 5 })
    await seedInventoryStock(item.id, hub.id, 5)
    const requestId = await createRequest(
      { requestType: 'RESERVATION', status: 'REQUESTED', fulfillerHubId: hub.id,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 2, specificInventoryItemId: item.id }] },
      op.id,
    )
    await confirmAllLines(requestId)
    await applyRequestTransition(requestId, 'confirm', 'RESERVATION')
    // Force into FULFILLED state directly to create a state mismatch on cancel
    await prisma.$executeRaw`UPDATE "deployment_requests" SET "status" = 'FULFILLED', "fulfilledAt" = now() WHERE "id" = ${requestId}`

    const stockBeforeMismatch = await getStockRow(item.id, hub.id)
    expect(stockBeforeMismatch?.reservedQty).toBe(2)

    const result = await applyRequestTransition(requestId, 'cancel', 'RESERVATION')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('STATE_MISMATCH')

    // Stock MUST NOT have been released despite the mismatch
    const stockAfterMismatch = await getStockRow(item.id, hub.id)
    expect(stockAfterMismatch?.reservedQty).toBe(2)
  })
})

// ── Bug 2: decline of ended-rig consumable transfer restores stock ────────────

describe('Bug 2 — decline restores consumable stock for ended-rig transfers', () => {
  let op1: Awaited<ReturnType<typeof createOperator>>
  let op2: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>

  beforeEach(async () => {
    op1 = await createOperator()
    op2 = await createOperator()
    cat = await createCategory()
  })

  it('consumable stock is restored when an ended-rig transfer is declined', async () => {
    const hub = await createHub()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })

    const { rig, kit } = await createRig(op1.id)
    // Simulate drawn consumable (drawnQuantity set, stock already drawn from hub)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 3, drawnQuantity: 3, drawnHubId: hub.id },
    })
    await seedInventoryStock(item.id, hub.id, 7) // 10 - 3 drawn
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: 7 } })

    mockSession = operatorSession(op1.id)
    const endRes = await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({ note: 'end', itemDispositions: [{ kitItemId: kitItem.id, type: 'TRANSFER', toOperatorId: op2.id }] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(endRes.status).toBe(200)

    const transfer = await prisma.transferRequest.findFirst({ where: { fromRigId: rig.id } })
    expect(transfer).not.toBeNull()

    mockSession = operatorSession(op2.id)
    const declineRes = await declineTransfer(
      new NextRequest(`http://localhost/api/transfers/${transfer!.id}/decline`, {
        method: 'POST',
        body: JSON.stringify({ responseNote: 'not needed' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: transfer!.id }) },
    )
    expect(declineRes.status).toBe(200)

    // Hub stock must be restored
    const stockAfter = await getStockRow(item.id, hub.id)
    expect(stockAfter?.quantity).toBe(10)

    // Item total must be restored
    const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: item.id } })
    expect(itemAfter?.quantity).toBe(10)
  })
})

// ── Bug 3: cancel of ended-rig transfer restores kit items ───────────────────

describe('Bug 3 — cancel restores kit items for ended-rig transfers', () => {
  let op1: Awaited<ReturnType<typeof createOperator>>
  let op2: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>

  beforeEach(async () => {
    op1 = await createOperator()
    op2 = await createOperator()
    cat = await createCategory()
  })

  it('serialized unit is restored to AVAILABLE when an ended-rig transfer is cancelled', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op1.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    mockSession = operatorSession(op1.id)
    await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({ note: 'end', itemDispositions: [{ kitItemId: kitItem.id, type: 'TRANSFER', toOperatorId: op2.id }] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )

    const transfer = await prisma.transferRequest.findFirst({ where: { fromRigId: rig.id } })

    mockSession = operatorSession(op1.id) // initiator cancels
    const cancelRes = await cancelTransfer(
      new Request(`http://localhost/api/transfers/${transfer!.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: transfer!.id }) },
    )
    expect(cancelRes.status).toBe(200)

    const unitAfter = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(unitAfter?.status).toBe('AVAILABLE')

    const kiAfter = await prisma.kitItem.findUnique({ where: { id: kitItem.id } })
    expect(kiAfter?.removedAt).not.toBeNull()
  })

  it('consumable stock is restored when an ended-rig transfer is cancelled', async () => {
    const hub = await createHub()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 7 })
    await seedInventoryStock(item.id, hub.id, 7)
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
    const { rig, kit } = await createRig(op1.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 4, drawnQuantity: 4, drawnHubId: hub.id },
    })
    await seedInventoryStock(item.id, hub.id, 3)
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: 3 } })

    mockSession = operatorSession(op1.id)
    await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({ note: 'end', itemDispositions: [{ kitItemId: kitItem.id, type: 'TRANSFER', toOperatorId: op2.id }] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )

    const transfer = await prisma.transferRequest.findFirst({ where: { fromRigId: rig.id } })

    mockSession = operatorSession(op1.id)
    const cancelRes = await cancelTransfer(
      new Request(`http://localhost/api/transfers/${transfer!.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: transfer!.id }) },
    )
    expect(cancelRes.status).toBe(200)

    const stockAfter = await getStockRow(item.id, hub.id)
    expect(stockAfter?.quantity).toBe(7)

    const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: item.id } })
    expect(itemAfter?.quantity).toBe(7)
  })
})

// ── Bug 4: double-transfer prevention ────────────────────────────────────────

describe('Bug 4 — double-transfer: second accept is rejected when item already removed', () => {
  it('accepts the first transfer and rejects a second accept on the same item', async () => {
    const op1 = await createOperator()
    const op2 = await createOperator()
    const op3 = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op1.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    mockSession = operatorSession(op1.id)
    await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({
          note: 'end',
          itemDispositions: [{ kitItemId: kitItem.id, type: 'TRANSFER', toOperatorId: op2.id }],
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )

    const transfer1 = await prisma.transferRequest.findFirst({ where: { fromRigId: rig.id, toOperatorId: op2.id } })

    // Manually create a second transfer for the same kit item (simulates admin / race)
    const transfer2 = await prisma.transferRequest.create({
      data: {
        fromRigId: rig.id,
        toOperatorId: op3.id,
        initiatedById: op1.id,
        note: 'race transfer',
        status: 'PENDING',
        items: { create: [{ kitItemId: kitItem.id }] },
      },
    })

    // Accept transfer1 first
    mockSession = operatorSession(op2.id)
    const res1 = await acceptTransfer(
      new NextRequest(`http://localhost/api/transfers/${transfer1!.id}/accept`, {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: transfer1!.id }) },
    )
    expect(res1.status).toBe(200)

    // Now accept transfer2 — kit item is already removed, must reject
    mockSession = operatorSession(op3.id)
    const res2 = await acceptTransfer(
      new NextRequest(`http://localhost/api/transfers/${transfer2.id}/accept`, {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: transfer2.id }) },
    )
    expect(res2.status).toBe(409)
  })
})

// ── Bug 5: vehicle TRANSFER keeps RigVehicle open ────────────────────────────

describe('Bug 5 — vehicle TRANSFER: RigVehicle stays open until accept', () => {
  it('vehicle RigVehicle row is NOT closed when TRANSFER disposition is used', async () => {
    const op1 = await createOperator()
    const op2 = await createOperator()
    const vehicle = await createVehicle()
    const { rig } = await createRig(op1.id)
    await addVehicleToRig(rig.id, vehicle.id)

    mockSession = operatorSession(op1.id)
    const removeRes = await removeVehicles(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/vehicles`, {
        method: 'DELETE',
        body: JSON.stringify({
          note: 'transferring vehicle',
          vehicles: [{ vehicleId: vehicle.id, dispositionType: 'TRANSFER', toOperatorId: op2.id }],
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(removeRes.status).toBe(200)

    // RigVehicle row must remain open (removedAt null) for the accept path
    const rigVehicle = await prisma.rigVehicle.findFirst({
      where: { rigId: rig.id, vehicleId: vehicle.id, removedAt: null },
    })
    expect(rigVehicle).not.toBeNull()

    // A PENDING transfer request for the vehicle must exist
    const transfer = await prisma.transferRequest.findFirst({
      where: { fromRigId: rig.id, toOperatorId: op2.id, status: 'PENDING' },
    })
    expect(transfer).not.toBeNull()
  })

  it('accepting the vehicle transfer closes the RigVehicle in the source rig', async () => {
    const op1 = await createOperator()
    const op2 = await createOperator()
    const vehicle = await createVehicle()
    const { rig } = await createRig(op1.id)
    await addVehicleToRig(rig.id, vehicle.id)

    mockSession = operatorSession(op1.id)
    await removeVehicles(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/vehicles`, {
        method: 'DELETE',
        body: JSON.stringify({
          note: 'transfer',
          vehicles: [{ vehicleId: vehicle.id, dispositionType: 'TRANSFER', toOperatorId: op2.id }],
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )

    const transfer = await prisma.transferRequest.findFirst({ where: { fromRigId: rig.id } })

    mockSession = operatorSession(op2.id)
    const acceptRes = await acceptTransfer(
      new NextRequest(`http://localhost/api/transfers/${transfer!.id}/accept`, {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: transfer!.id }) },
    )
    expect(acceptRes.status).toBe(200)

    // Source RigVehicle must now be closed
    const sourceRow = await prisma.rigVehicle.findFirst({
      where: { rigId: rig.id, vehicleId: vehicle.id, removedAt: null },
    })
    expect(sourceRow).toBeNull()
  })
})

// ── Bug 6+9: return condition mapping + IN_TRANSIT for serialized HUB returns ─

describe('Bug 6+9 — HUB return condition mapping and IN_TRANSIT for serialized units', () => {
  let op: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>
  let hub: Awaited<ReturnType<typeof createHub>>

  beforeEach(async () => {
    op = await createOperator()
    cat = await createCategory()
    hub = await createHub()
  })

  it('GOOD serialized HUB return sets unit to IN_TRANSIT', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    mockSession = operatorSession(op.id)
    const res = await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({ note: 'end', itemDispositions: [{ kitItemId: kitItem.id, type: 'HUB', hubId: hub.id, returnCondition: 'GOOD', photoUrls: [] }] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)

    const unitAfter = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(unitAfter?.status).toBe('IN_TRANSIT')
  })

  it('IN_MAINTENANCE serialized HUB return sets unit to IN_MAINTENANCE', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    mockSession = operatorSession(op.id)
    const res = await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({ note: 'end', itemDispositions: [{ kitItemId: kitItem.id, type: 'HUB', hubId: hub.id, returnCondition: 'IN_MAINTENANCE', photoUrls: [] }] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)

    const unitAfter = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(unitAfter?.status).toBe('IN_MAINTENANCE')
  })

  it('revoking a HUB_RETURN link flips the unit from IN_TRANSIT back to AVAILABLE', async () => {
    const admin = await createAdminUser()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    mockSession = operatorSession(op.id)
    await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({ note: 'end', itemDispositions: [{ kitItemId: kitItem.id, type: 'HUB', hubId: hub.id, returnCondition: 'GOOD', photoUrls: [] }] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )

    const unitMid = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(unitMid?.status).toBe('IN_TRANSIT')

    // Find the HUB_RETURN link
    const link = await prisma.statusLink.findFirst({
      where: { type: 'HUB_RETURN', inventoryUnitId: unit.id, state: { not: 'REVOKED' } },
    })
    expect(link).not.toBeNull()

    mockSession = adminSession(admin.id)
    const revokeRes = await revokeLink(
      new NextRequest(`http://localhost/api/status-links/${link!.id}/revoke`, { method: 'POST' }),
      { params: Promise.resolve({ id: link!.id }) },
    )
    expect(revokeRes.status).toBe(200)

    const unitAfter = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(unitAfter?.status).toBe('AVAILABLE')
  })
})

// ── Bug 7a: guarded kit item update in accept ────────────────────────────────

describe('Bug 7a — accept: guarded updateMany prevents double-apply on kit items', () => {
  it('second concurrent accept on same kit item is rejected', async () => {
    const op1 = await createOperator()
    const op2 = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op1.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    // Create a transfer for op2
    const transfer = await prisma.transferRequest.create({
      data: {
        fromRigId: rig.id, toOperatorId: op2.id, initiatedById: op1.id,
        note: 'test', status: 'PENDING',
        items: { create: [{ kitItemId: kitItem.id }] },
      },
    })

    // Manually pre-remove the kit item (simulates a race where first accept already ran)
    await prisma.kitItem.update({ where: { id: kitItem.id }, data: { removedAt: new Date() } })

    mockSession = operatorSession(op2.id)
    const res = await acceptTransfer(
      new NextRequest(`http://localhost/api/transfers/${transfer.id}/accept`, {
        method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: transfer.id }) },
    )
    expect(res.status).toBe(409)
  })
})

// ── Bug 8: auto-fill missing dispositions with home hub ──────────────────────

describe('Bug 8 — end-of-deployment: items without disposition default to home hub', () => {
  it('items not in itemDispositions are auto-returned to their home hub', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const hub = await createHub()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 5 })
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
    await seedInventoryStock(item.id, hub.id, 5)

    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 3, drawnQuantity: 3, drawnHubId: hub.id },
    })
    await seedInventoryStock(item.id, hub.id, 2)
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: 2 } })

    mockSession = operatorSession(op.id)
    // Send an EMPTY itemDispositions — the item should auto-fill to its home hub
    const res = await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({ note: 'end', itemDispositions: [] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)

    // Stock must have been restored
    const stockAfter = await getStockRow(item.id, hub.id)
    expect(stockAfter?.quantity).toBe(5)

    const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: item.id } })
    expect(itemAfter?.quantity).toBe(5)

    // Kit item must be closed
    const kiAfter = await prisma.kitItem.findUnique({ where: { id: kitItem.id } })
    expect(kiAfter?.removedAt).not.toBeNull()
  })

  it('returns 400 when an item has no disposition and no home hub', async () => {
    const op = await createOperator()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 2 })
    // hubId intentionally not set

    const { rig, kit } = await createRig(op.id)
    await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1 },
    })

    mockSession = operatorSession(op.id)
    const res = await endDeployment(
      new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
        method: 'POST',
        body: JSON.stringify({ note: 'end', itemDispositions: [] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(400)
  })
})
