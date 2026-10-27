import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { POST as transferPost } from '../src/app/api/deployments/[id]/transfer/route'
import { POST as handoffPost } from '../src/app/api/deployments/[id]/handoff/route'
import { POST as endPost } from '../src/app/api/deployments/[id]/end/route'
import { DELETE as itemsDelete } from '../src/app/api/deployments/[id]/items/route'
import { DELETE as singleReturn } from '../src/app/api/deployments/[id]/items/[kitItemId]/route'
import { POST as vehiclesPost, DELETE as vehiclesDelete } from '../src/app/api/deployments/[id]/vehicles/route'
import { POST as deploymentsPost } from '../src/app/api/deployments/route'
import { POST as acceptTransfer } from '../src/app/api/transfers/[id]/accept/route'
import { POST as declineTransfer } from '../src/app/api/transfers/[id]/decline/route'
import { GET as listTransfers } from '../src/app/api/transfers/route'
import { createHandoff } from '../src/lib/deployment-handoffs'
import { ensureOpenAssignment } from '../src/lib/deployment-assignments'
import {
  createAdminUser, createOperator, createCategory, createInventoryItem, createInventoryUnit,
  createVehicle, addVehicleToRig, createRig, createHub, seedInventoryStock, operatorSession, adminSession,
} from './helpers/fixtures'

// P1-1a · Transfers and End are safe (server): 2.1–2.4 and 2.6–2.8. The deterministic
// race cases (2.5) are in p1-1a-end-claim.test.ts.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({}) }))

const req = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const pk = (id: string, kitItemId: string) => ({ params: Promise.resolve({ id, kitItemId }) })

const transfer = (rigId: string, body: unknown) => transferPost(req(`/api/deployments/${rigId}/transfer`, 'POST', body), p(rigId))
const handoff = (rigId: string, body: unknown) => handoffPost(req(`/api/deployments/${rigId}/handoff`, 'POST', body), p(rigId))
const end = (rigId: string, body: unknown) => endPost(req(`/api/deployments/${rigId}/end`, 'POST', body), p(rigId))
const bulkReturn = (rigId: string, body: unknown, headers?: Record<string, string>) =>
  itemsDelete(req(`/api/deployments/${rigId}/items`, 'DELETE', body, headers), p(rigId))
const oneReturn = (rigId: string, kitItemId: string, body: unknown) =>
  singleReturn(req(`/api/deployments/${rigId}/items/${kitItemId}`, 'DELETE', body), pk(rigId, kitItemId))
const removeVehicles = (rigId: string, body: unknown) => vehiclesDelete(req(`/api/deployments/${rigId}/vehicles`, 'DELETE', body), p(rigId))
const addVehicles = (rigId: string, body: unknown) => vehiclesPost(req(`/api/deployments/${rigId}/vehicles`, 'POST', body), p(rigId))
const accept = (id: string) => acceptTransfer(req(`/api/transfers/${id}/accept`, 'POST', {}), p(id))
const decline = (id: string) => declineTransfer(req(`/api/transfers/${id}/decline`, 'POST', {}), p(id))

const stockAt = async (itemId: string, hubId: string) =>
  (await prisma.$queryRaw<{ quantity: number }[]>`SELECT "quantity" FROM "inventory_stock" WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}`)[0]?.quantity ?? 0

let admin: { id: string; name: string }
let op: { id: string; name: string }
let x: { id: string; name: string }
let cat: { id: string }
let hub: { id: string }

beforeEach(async () => {
  admin = await createAdminUser({ name: 'Ada Admin' })
  op = await createOperator({ name: 'Owen Operator' })
  x = await createOperator({ name: 'Xena Recipient' })
  cat = await createCategory()
  hub = await createHub()
  mockSession = operatorSession(op.id)
})

/** A deployment for `operatorId` with one serialized line (unit CHECKED_OUT). */
async function serializedLine(operatorId: string, name = 'Garmin GPS') {
  const { rig, kit } = await createRig(operatorId)
  const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0, name })
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
  const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
  const line = await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id } })
  return { rig, kit, item, unit, line }
}

/** A deployment with one consumable line of `qty`, all drawn from `hub`. */
async function consumableLine(operatorId: string, qty: number, name = 'Sample bags') {
  const { rig, kit } = await createRig(operatorId)
  const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 0, name })
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
  await seedInventoryStock(item.id, hub.id, 0)
  const line = await prisma.kitItem.create({
    data: { kitId: kit.id, inventoryItemId: item.id, quantity: qty, drawnQuantity: qty, drawnHubId: hub.id },
  })
  return { rig, kit, item, line }
}

/** A waiting (PENDING) selected-equipment transfer from `rigId` to `toId`. */
async function waitingTransfer(rigId: string, toId: string, items: { kitItemId: string; quantity?: number }[], vehicleIds: string[] = []) {
  return prisma.transferRequest.create({
    data: {
      fromRigId: rigId, toOperatorId: toId, initiatedById: op.id, note: '', status: 'PENDING',
      items: { create: items.map((i) => ({ kitItemId: i.kitItemId, quantity: i.quantity })) },
      vehicles: { create: vehicleIds.map((vehicleId) => ({ vehicleId })) },
    },
  })
}

// ─── 2.1 · Transfer note ──────────────────────────────────────────────────────────────
describe('2.1 · the transfer note is optional', () => {
  it('no note → 201, stored as ""', async () => {
    const { rig, line } = await serializedLine(op.id)
    const res = await transfer(rig.id, { toOperatorId: x.id, items: [{ kitItemId: line.id }] })
    expect(res.status).toBe(201)
    expect((await prisma.transferRequest.findFirstOrThrow({ where: { fromRigId: rig.id } })).note).toBe('')
  })

  it('no person → 400 with a plain-string error', async () => {
    const { rig, line } = await serializedLine(op.id)
    const res = await transfer(rig.id, { items: [{ kitItemId: line.id }] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Pick a person to transfer to.' })
  })

  it('a local photo ref still 422s (regression guard)', async () => {
    const { rig, line } = await serializedLine(op.id)
    const res = await transfer(rig.id, { toOperatorId: x.id, items: [{ kitItemId: line.id }], photoUrls: ['localphoto:abc'] })
    expect(res.status).toBe(422)
  })

  it('a quantity above the line → 400 naming the item', async () => {
    const { rig, line } = await consumableLine(op.id, 4)
    const res = await transfer(rig.id, { toOperatorId: x.id, items: [{ kitItemId: line.id, quantity: 5 }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Only 4 of "Sample bags" are on this deployment.')
  })
})

// ─── 2.2 · One recipient rule ─────────────────────────────────────────────────────────
describe('2.2 · "Transfer to a person" names a real, active person', () => {
  it('End with a TRANSFER line and no person → 400 naming the item; nothing ends', async () => {
    const { rig, unit, line } = await serializedLine(op.id)
    const res = await end(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'TRANSFER' }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Pick a person to transfer "Garmin GPS" to.')
    expect((await prisma.rig.findUniqueOrThrow({ where: { id: rig.id } })).endedAt).toBeNull()
    expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: line.id } })).removedAt).toBeNull()
    expect((await prisma.inventoryUnit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe('CHECKED_OUT')
  })

  it('bulk return with a TRANSFER line and no person → 400; the line stays, no transfer', async () => {
    const { rig, line } = await serializedLine(op.id)
    const res = await bulkReturn(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'TRANSFER' }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Pick a person to transfer "Garmin GPS" to.')
    expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: line.id } })).removedAt).toBeNull()
    expect(await prisma.transferRequest.count()).toBe(0)
  })

  it('vehicles DELETE with TRANSFER and no person → 400; the vehicle stays, no transfer', async () => {
    const { rig } = await createRig(op.id)
    const v = await createVehicle({ name: 'Truck 7' })
    await addVehicleToRig(rig.id, v.id)
    const res = await removeVehicles(rig.id, { vehicles: [{ vehicleId: v.id, dispositionType: 'TRANSFER' }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Pick a person to transfer "Truck 7" to.')
    expect(await prisma.rigVehicle.count({ where: { rigId: rig.id, removedAt: null } })).toBe(1)
    expect(await prisma.transferRequest.count()).toBe(0)
  })

  it('an unknown person → 400', async () => {
    const { rig, line } = await serializedLine(op.id)
    const res = await end(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'TRANSFER', toOperatorId: 'nobody' }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('The person picked to receive "Garmin GPS" wasn\'t found.')
  })

  it('a deactivated person → 409 with the existing words', async () => {
    const { rig, line } = await serializedLine(op.id)
    await prisma.user.update({ where: { id: x.id }, data: { isActive: false } })
    const res = await end(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'TRANSFER', toOperatorId: x.id }] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Xena Recipient is deactivated — reactivate them or choose someone else.')
  })

  it("the deployment's own primary → 409", async () => {
    const { rig, line } = await serializedLine(op.id)
    const res = await bulkReturn(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'TRANSFER', toOperatorId: op.id }] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('"Garmin GPS" is already with Owen Operator — pick someone else.')
  })

  it('a valid person → one PENDING transfer', async () => {
    const { rig, line } = await serializedLine(op.id)
    const res = await end(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'TRANSFER', toOperatorId: x.id }] })
    expect(res.status).toBe(200)
    expect(await prisma.transferRequest.count({ where: { fromRigId: rig.id, status: 'PENDING', toOperatorId: x.id } })).toBe(1)
  })

  it('the selected-equipment route, the entire-deployment transfer and Reassign use the no-name wording', async () => {
    const { rig, line } = await serializedLine(op.id)
    const a = await transfer(rig.id, { toOperatorId: op.id, items: [{ kitItemId: line.id }] })
    expect(a.status).toBe(409)
    expect((await a.json()).error).toBe('This equipment is already with Owen Operator — pick someone else.')
    const b = await handoff(rig.id, { toOperatorId: op.id })
    expect(b.status).toBe(409)
    expect((await b.json()).error).toBe('This equipment is already with Owen Operator — pick someone else.')
    mockSession = adminSession(admin.id)
    const c = await handoff(rig.id, { force: true })
    expect(c.status).toBe(400)
    expect(await c.json()).toEqual({ error: 'Pick a person to transfer to.' })
  })
})

// ─── 2.3 · Waiting transfers and Reassign ─────────────────────────────────────────────
describe('2.3 · one waiting transfer per deployment; Reassign cancels what waits', () => {
  let createdIndex = false
  beforeAll(async () => {
    const exists = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'deployment_handoffs_one_pending_per_rig'`
    if (exists[0].n === 0) {
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "deployment_handoffs_one_pending_per_rig" ON "deployment_handoffs" ("rigId") WHERE "status" = 'PENDING'`,
      )
      createdIndex = true
    }
  })
  afterAll(async () => {
    if (createdIndex) await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "deployment_handoffs_one_pending_per_rig"`)
  })

  it('A then B → 409 naming A; one PENDING row; no bell for B', async () => {
    const { rig } = await createRig(op.id)
    const b = await createOperator({ name: 'Bea Second' })
    expect((await handoff(rig.id, { toOperatorId: x.id })).status).toBe(201)
    const res = await handoff(rig.id, { toOperatorId: b.id })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('This deployment already has a transfer waiting for Xena Recipient to answer. Cancel it first.')
    const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "deployment_handoffs" WHERE "rigId" = ${rig.id} AND "status" = 'PENDING'`
    expect(rows[0].n).toBe(1)
    expect(await prisma.notification.count({ where: { userId: b.id } })).toBe(0)
  })

  it('a race of two → one 201 and one 409, never a 500', async () => {
    const { rig } = await createRig(op.id)
    const b = await createOperator()
    const statuses = (await Promise.all([handoff(rig.id, { toOperatorId: x.id }), handoff(rig.id, { toOperatorId: b.id })])).map((r) => r.status)
    expect(statuses.sort()).toEqual([201, 409])
  })

  it('createHandoff writes on the client it is given', async () => {
    const fake = { $executeRaw: vi.fn().mockResolvedValue(1) }
    await createHandoff({ rigId: 'r', fromOperatorId: 'a', toOperatorId: 'b', initiatedById: 'a', note: '' }, fake as never)
    expect(fake.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it('Reassign cancels the waiting entire-deployment and selected-equipment transfers, and tells everyone once', async () => {
    const { rig, line } = await serializedLine(op.id)
    const b = await createOperator({ name: 'Bea Second' })
    const c = await createOperator({ name: 'Cal Third' })
    expect((await handoff(rig.id, { toOperatorId: x.id })).status).toBe(201)
    expect((await transfer(rig.id, { toOperatorId: b.id, items: [{ kitItemId: line.id }] })).status).toBe(201)
    expect(await prisma.notification.count({ where: { userId: { in: [x.id, b.id] }, readAt: null } })).toBe(2)

    mockSession = adminSession(admin.id)
    const res = await handoff(rig.id, { toOperatorId: c.id, force: true })
    expect(res.status).toBe(201)

    const handoffs = await prisma.$queryRaw<{ status: string; toOperatorId: string }[]>`
      SELECT "status"::text AS status, "toOperatorId" FROM "deployment_handoffs" WHERE "rigId" = ${rig.id}`
    expect(handoffs.filter((h) => h.status === 'CANCELLED').map((h) => h.toOperatorId)).toEqual([x.id])
    expect(handoffs.filter((h) => h.status === 'ACCEPTED')).toHaveLength(1)
    expect((await prisma.transferRequest.findFirstOrThrow({ where: { fromRigId: rig.id } })).status).toBe('CANCELLED')

    const cancelledBells = await prisma.notification.findMany({ where: { type: 'TRANSFER_CANCELLED' } })
    expect(cancelledBells.filter((n) => n.userId === x.id)).toHaveLength(1)
    expect(cancelledBells.filter((n) => n.userId === b.id)).toHaveLength(1)
    const oldOp = cancelledBells.filter((n) => n.userId === op.id)
    expect(oldOp).toHaveLength(1)
    expect(oldOp[0].body).toBe('Test Admin reassigned the deployment and cancelled the waiting transfer to Xena Recipient, Bea Second.')
    expect(cancelledBells.find((n) => n.userId === x.id)?.body).toBe('Test Admin reassigned the deployment, so the transfer waiting for you was cancelled.')
    // Their earlier request bells are read.
    expect(await prisma.notification.count({ where: { userId: { in: [x.id, b.id] }, type: { not: 'TRANSFER_CANCELLED' }, readAt: null } })).toBe(0)
  })

  it('End cancels a waiting entire-deployment transfer and marks its bell read', async () => {
    const { rig } = await createRig(op.id)
    expect((await handoff(rig.id, { toOperatorId: x.id })).status).toBe(201)
    expect((await end(rig.id, {})).status).toBe(200)
    const rows = await prisma.$queryRaw<{ status: string }[]>`SELECT "status"::text AS status FROM "deployment_handoffs" WHERE "rigId" = ${rig.id}`
    expect(rows.map((r) => r.status)).toEqual(['CANCELLED'])
    expect(await prisma.notification.count({ where: { userId: x.id, readAt: null } })).toBe(0)
  })

  it('Reassign after the deployment ended → 409', async () => {
    const { rig } = await createRig(op.id)
    expect((await end(rig.id, {})).status).toBe(200)
    mockSession = adminSession(admin.id)
    const res = await handoff(rig.id, { toOperatorId: x.id, force: true })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('This deployment has already ended.')
  })

  it('the request bell says "transfer", not "handoff"', async () => {
    const { rig } = await createRig(op.id)
    await handoff(rig.id, { toOperatorId: x.id })
    const bell = await prisma.notification.findFirstOrThrow({ where: { userId: x.id } })
    expect(bell.title).toBe('Transfer requested')
    expect(bell.body).toBe('Test Operator wants to transfer a deployment to you.')
  })
})

// ─── 2.4 · Raw-insert races ───────────────────────────────────────────────────────────
describe('2.4 · unique-index races are 409s', () => {
  it('two Start deployments for one operator at once → one 201, one 409', async () => {
    const start = () => deploymentsPost(req('/api/deployments', 'POST', {}))
    const statuses = (await Promise.all([start(), start()])).map((r) => r.status)
    expect(statuses.sort()).toEqual([201, 409])
  })

  it('two deployments adding the same vehicle → one 200, one 409; the winner keeps it', async () => {
    const other = await createOperator()
    const a = await createRig(op.id)
    const b = await createRig(other.id)
    const v = await createVehicle()
    mockSession = adminSession(admin.id)
    const [ra, rb] = await Promise.all([addVehicles(a.rig.id, { vehicleIds: [v.id] }), addVehicles(b.rig.id, { vehicleIds: [v.id] })])
    expect([ra.status, rb.status].sort()).toEqual([200, 409])
    const winner = ra.status === 200 ? a : b
    const loser = ra.status === 200 ? b : a
    expect(await prisma.rigVehicle.count({ where: { rigId: loser.rig.id, removedAt: null } })).toBe(0)
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).assignedOperatorId).toBe(winner.rig.operatorId)
  })

  it('a vehicle waiting on a transfer from an ended deployment → 409', async () => {
    const old = await createOperator()
    const { rig: oldRig } = await createRig(old.id)
    const v = await createVehicle({ name: 'Truck 9' })
    await addVehicleToRig(oldRig.id, v.id)
    await prisma.rig.update({ where: { id: oldRig.id }, data: { endedAt: new Date() } })
    await waitingTransfer(oldRig.id, x.id, [], [v.id])
    const { rig } = await createRig(op.id)
    const res = await addVehicles(rig.id, { vehicleIds: [v.id] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Truck 9 is waiting on transfer from an ended deployment — answer that transfer first.')
  })

  it('re-adding a vehicle already here → 200 (regression guard)', async () => {
    const { rig } = await createRig(op.id)
    const v = await createVehicle()
    await addVehicleToRig(rig.id, v.id)
    expect((await addVehicles(rig.id, { vehicleIds: [v.id] })).status).toBe(200)
  })
})

// ─── 2.6 · Only this deployment's gear ────────────────────────────────────────────────
describe("2.6 · operators act only on their own deployment's gear", () => {
  it("a line from another deployment in a bulk return → 400; that line unchanged", async () => {
    const other = await createOperator()
    await createRig(op.id)
    const theirs = await serializedLine(other.id)
    const mine = await prisma.rig.findFirstOrThrow({ where: { operatorId: op.id } })
    const res = await bulkReturn(mine.id, { itemDispositions: [{ kitItemId: theirs.line.id, type: 'HUB', hubId: hub.id }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Some of this equipment isn't on this deployment any more. Refresh and try again.")
    expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: theirs.line.id } })).removedAt).toBeNull()
  })

  it('a double return of one line with two keys → both 200 (regression guard)', async () => {
    const { rig, line } = await serializedLine(op.id)
    const body = { itemDispositions: [{ kitItemId: line.id, type: 'HUB', hubId: hub.id }] }
    expect((await bulkReturn(rig.id, body, { 'Idempotency-Key': 'k1' })).status).toBe(200)
    expect((await bulkReturn(rig.id, body, { 'Idempotency-Key': 'k2' })).status).toBe(200)
  })

  it("End with a TRANSFER naming another deployment's line → no transfer of it", async () => {
    const other = await createOperator()
    const theirs = await serializedLine(other.id)
    const { rig } = await createRig(op.id)
    const res = await end(rig.id, { itemDispositions: [{ kitItemId: theirs.line.id, type: 'TRANSFER', toOperatorId: x.id }] })
    expect(res.status).toBe(200)
    expect(await prisma.transferRequest.count()).toBe(0)
    expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: theirs.line.id } })).removedAt).toBeNull()
  })

  it('accept of a transfer whose line moved to another deployment → 409', async () => {
    const { rig, line } = await serializedLine(op.id)
    const t = await waitingTransfer(rig.id, x.id, [{ kitItemId: line.id }])
    const other = await createOperator()
    const elsewhere = await createRig(other.id)
    await prisma.kitItem.update({ where: { id: line.id }, data: { kitId: elsewhere.kit.id } })
    mockSession = operatorSession(x.id)
    const res = await accept(t.id)
    expect(res.status).toBe(409)
    expect((await prisma.transferRequest.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('PENDING')
  })
})

// ─── 2.7 · Vehicle remove ─────────────────────────────────────────────────────────────
describe('2.7 · vehicle remove checks the vehicle is here; only admins retire', () => {
  it("a vehicle that isn't here → 409; the vehicle unchanged", async () => {
    const { rig } = await createRig(op.id)
    const v = await createVehicle({ name: 'Truck 3' })
    const res = await removeVehicles(rig.id, { vehicles: [{ vehicleId: v.id, dispositionType: 'IN_MAINTENANCE' }] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Truck 3 isn't on this deployment any more.")
    const after = await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })
    expect(after.status).toBe('ACTIVE')
    expect(after.assignedOperatorId).toBeNull()
    expect(await prisma.maintenanceTask.count({ where: { vehicleId: v.id } })).toBe(0)
  })

  it('an operator sending RETIRED → 403', async () => {
    const { rig } = await createRig(op.id)
    const v = await createVehicle()
    await addVehicleToRig(rig.id, v.id)
    const res = await removeVehicles(rig.id, { vehicles: [{ vehicleId: v.id, dispositionType: 'RETIRED' }] })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Only an admin can retire a vehicle.')
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('ACTIVE')
  })

  it('an admin sending RETIRED → retired', async () => {
    const { rig } = await createRig(op.id)
    const v = await createVehicle()
    await addVehicleToRig(rig.id, v.id)
    mockSession = adminSession(admin.id)
    const res = await removeVehicles(rig.id, { vehicles: [{ vehicleId: v.id, dispositionType: 'RETIRED' }] })
    expect(res.status).toBe(200)
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('RETIRED')
  })
})

// ─── 2.8 · Gear waiting on a transfer stays with it ───────────────────────────────────
describe('2.8 · gear waiting on a transfer stays with it', () => {
  it('a wholly waiting line survives End (HUB, then TRANSFER), and X can still accept', async () => {
    for (const disp of ['HUB', 'TRANSFER'] as const) {
      const { rig, line } = await serializedLine(op.id)
      const t = await waitingTransfer(rig.id, x.id, [{ kitItemId: line.id }])
      const d = disp === 'HUB' ? { type: 'HUB', hubId: hub.id } : { type: 'TRANSFER', toOperatorId: (await createOperator()).id }
      mockSession = operatorSession(op.id)
      const res = await end(rig.id, { itemDispositions: [{ kitItemId: line.id, ...d }] })
      expect(res.status).toBe(200)
      expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: line.id } })).removedAt).toBeNull()
      expect((await prisma.transferRequest.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('PENDING')
      expect(await prisma.transferRequest.count({ where: { fromRigId: rig.id } })).toBe(1)
      mockSession = operatorSession(x.id)
      expect((await accept(t.id)).status).toBe(200)
      await prisma.$executeRaw`UPDATE "deployment_assignments" SET "endedAt" = now() WHERE "operatorId" = ${x.id}`
    }
  })

  it('10 with 3 waiting, End to hub → 7 restored, the line open with 3 (drawn 3); X accepts → X has 3', async () => {
    const { rig, item, line } = await consumableLine(op.id, 10)
    const t = await waitingTransfer(rig.id, x.id, [{ kitItemId: line.id, quantity: 3 }])
    expect((await end(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'HUB', hubId: hub.id }] })).status).toBe(200)
    expect(await stockAt(item.id, hub.id)).toBe(7)
    const open = await prisma.kitItem.findUniqueOrThrow({ where: { id: line.id } })
    expect([open.removedAt, open.quantity, open.drawnQuantity]).toEqual([null, 3, 3])
    mockSession = operatorSession(x.id)
    expect((await accept(t.id)).status).toBe(200)
    const xRig = await prisma.rig.findFirstOrThrow({ where: { operatorId: x.id, endedAt: null }, include: { kits: { include: { items: true } } } })
    expect(xRig.kits[0].items.map((i) => i.quantity)).toEqual([3])
  })

  it('10 with 3 waiting, End to hub, then X declines → +3 to the hub, the line closed', async () => {
    const { rig, item, line } = await consumableLine(op.id, 10)
    const t = await waitingTransfer(rig.id, x.id, [{ kitItemId: line.id, quantity: 3 }])
    expect((await end(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'HUB', hubId: hub.id }] })).status).toBe(200)
    mockSession = operatorSession(x.id)
    expect((await decline(t.id)).status).toBe(200)
    expect(await stockAt(item.id, hub.id)).toBe(10)
    expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: line.id } })).removedAt).not.toBeNull()
  })

  it('a partly waiting serialized line with no unit (legacy) blocks End, naming the transfer', async () => {
    const { rig, kit } = await createRig(op.id)
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0, name: 'Hand corer' })
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
    const line = await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: 3 } })
    await waitingTransfer(rig.id, x.id, [{ kitItemId: line.id, quantity: 1 }])
    const res = await end(rig.id, {})
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('"Hand corer" is partly waiting on transfer to Xena Recipient. Cancel that transfer first.')
    expect((await prisma.rig.findUniqueOrThrow({ where: { id: rig.id } })).endedAt).toBeNull()
  })

  it('a wholly waiting line can\'t be returned (bulk or single); 10 with 3 waiting: Log usage 2 → 200, return 8 → 409', async () => {
    const s = await serializedLine(op.id)
    await waitingTransfer(s.rig.id, x.id, [{ kitItemId: s.line.id }])
    const bulk = await bulkReturn(s.rig.id, { itemDispositions: [{ kitItemId: s.line.id, type: 'HUB', hubId: hub.id }] })
    expect(bulk.status).toBe(409)
    expect((await bulk.json()).error).toBe('"Garmin GPS" is waiting on transfer to Xena Recipient. Cancel that transfer first.')
    expect((await oneReturn(s.rig.id, s.line.id, { hubId: hub.id })).status).toBe(409)

    const other = await createOperator()
    const c = await consumableLine(other.id, 10)
    await waitingTransfer(c.rig.id, x.id, [{ kitItemId: c.line.id, quantity: 3 }])
    mockSession = operatorSession(other.id)
    expect((await oneReturn(c.rig.id, c.line.id, { quantity: 2, consumed: true })).status).toBe(200)
    expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: c.line.id } })).quantity).toBe(8)
    const res = await oneReturn(c.rig.id, c.line.id, { quantity: 8, hubId: hub.id })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Only 5 of "Sample bags" are free — 3 are waiting on transfer to Xena Recipient.')
  })

  it('two returns of one line at once → both 200 (regression guard)', async () => {
    const { rig, line } = await consumableLine(op.id, 4)
    const body = { itemDispositions: [{ kitItemId: line.id, type: 'HUB', hubId: hub.id }] }
    const statuses = (await Promise.all([bulkReturn(rig.id, body), bulkReturn(rig.id, body)])).map((r) => r.status)
    expect(statuses).toEqual([200, 200])
  })

  it('a second transfer of a waiting line or vehicle → 409', async () => {
    const { rig, line } = await serializedLine(op.id)
    const v = await createVehicle({ name: 'Truck 5' })
    await addVehicleToRig(rig.id, v.id)
    await waitingTransfer(rig.id, x.id, [{ kitItemId: line.id }], [v.id])
    const b = await createOperator()
    const a = await transfer(rig.id, { toOperatorId: b.id, items: [{ kitItemId: line.id }] })
    expect(a.status).toBe(409)
    expect((await a.json()).error).toBe('"Garmin GPS" is waiting on transfer to Xena Recipient. Cancel that transfer first.')
    const c = await transfer(rig.id, { toOperatorId: b.id, vehicleIds: [v.id] })
    expect(c.status).toBe(409)
    expect((await c.json()).error).toBe('"Truck 5" is waiting on transfer to Xena Recipient. Cancel that transfer first.')
  })

  it('removing a waiting vehicle as Available → 409; its row stays open and X can accept', async () => {
    const { rig } = await createRig(op.id)
    const v = await createVehicle({ name: 'Truck 6' })
    await addVehicleToRig(rig.id, v.id)
    const t = await waitingTransfer(rig.id, x.id, [], [v.id])
    const res = await removeVehicles(rig.id, { vehicles: [{ vehicleId: v.id, dispositionType: 'AVAILABLE' }] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('"Truck 6" is waiting on transfer to Xena Recipient. Cancel that transfer first.')
    expect(await prisma.rigVehicle.count({ where: { rigId: rig.id, vehicleId: v.id, removedAt: null } })).toBe(1)
    mockSession = operatorSession(x.id)
    expect((await accept(t.id)).status).toBe(200)
  })

  it("End's auto-fill doesn't touch a waiting line", async () => {
    const { rig, line } = await serializedLine(op.id)
    await waitingTransfer(rig.id, x.id, [{ kitItemId: line.id }])
    expect((await end(rig.id, {})).status).toBe(200)
    expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: line.id } })).removedAt).toBeNull()
    expect(await prisma.checkLog.count({ where: { rigId: rig.id, action: 'CHECK_IN' } })).toBe(0)
  })

  it("a SECONDARY's outgoing transfers hold the PRIMARY's waiting transfer", async () => {
    const { rig, line } = await serializedLine(op.id)
    const crew = await createOperator()
    await ensureOpenAssignment({ rigId: rig.id, operatorId: crew.id, role: 'SECONDARY' })
    const t = await waitingTransfer(rig.id, x.id, [{ kitItemId: line.id }])
    mockSession = operatorSession(crew.id)
    const res = await listTransfers(req('/api/transfers?direction=outgoing&status=PENDING', 'GET'))
    expect((await res.json()).map((r: { id: string }) => r.id)).toEqual([t.id])
  })
})
