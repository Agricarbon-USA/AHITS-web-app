import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '../src/lib/prisma'
import { POST as endPost } from '../src/app/api/deployments/[id]/end/route'
import { POST as itemsPost } from '../src/app/api/deployments/[id]/items/route'
import { POST as handoffPost } from '../src/app/api/deployments/[id]/handoff/route'
import { POST as acceptTransfer } from '../src/app/api/transfers/[id]/accept/route'
import { POST as declineTransfer } from '../src/app/api/transfers/[id]/decline/route'
import { POST as acceptHandoff } from '../src/app/api/handoffs/[id]/accept/route'
import { createHandoff } from '../src/lib/deployment-handoffs'
import {
  createAdminUser, createOperator, createCategory, createInventoryItem, createInventoryUnit,
  createRig, createHub, seedInventoryStock, adminSession,
} from './helpers/fixtures'

// P1-1a 2.5 · deterministic races. Every deployment write takes the deployment first, so
// two writers end in {200, 409} — never a 500, a deadlock or double-counted stock. Hooks
// on the auth helpers and on claimActiveRig let a test end the deployment (or add a line)
// at an exact point between a route's reads and its transaction.

const hook = vi.hoisted(() => ({
  auth: null as null | ((rigId: string) => Promise<void>),
  active: null as null | ((rigId: string) => Promise<void>),
  claim: null as null | ((rigId: string) => Promise<void>),
  lock: null as null | ((ids: (string | null | undefined)[]) => Promise<void>),
}))
vi.mock('../src/lib/deployment-auth', async (orig) => {
  const a = await orig<typeof import('../src/lib/deployment-auth')>()
  return { ...a,
    isAuthorizedForRig: async (r: Parameters<typeof a.isAuthorizedForRig>[0], s: Parameters<typeof a.isAuthorizedForRig>[1]) => { await hook.auth?.(r.id); return a.isAuthorizedForRig(r, s) },
    getAuthorizedActiveRig: async (id: string, s: Parameters<typeof a.getAuthorizedActiveRig>[1]) => { const r = await a.getAuthorizedActiveRig(id, s); await hook.active?.(id); return r },
    claimActiveRig: async (...args: Parameters<typeof a.claimActiveRig>) => { await hook.claim?.(args[1]); return a.claimActiveRig(...args) },
    lockRigs: async (...args: Parameters<typeof a.lockRigs>) => { await hook.lock?.(args[1]); return a.lockRigs(...args) },
  }
})

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue({}) }))

const req = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const end = (rigId: string, body: unknown = {}, headers?: Record<string, string>) => endPost(req(`/api/deployments/${rigId}/end`, body, headers), p(rigId))
const reassign = (rigId: string, toOperatorId: string) => handoffPost(req(`/api/deployments/${rigId}/handoff`, { toOperatorId, force: true }), p(rigId))
const accept = (id: string) => acceptTransfer(req(`/api/transfers/${id}/accept`, {}), p(id))
const decline = (id: string) => declineTransfer(req(`/api/transfers/${id}/decline`, {}), p(id))

/** End a deployment the way End does, outside any route. */
const endIt = async (rigId: string) => {
  await prisma.$executeRaw`UPDATE "rigs" SET "endedAt" = now() WHERE "id" = ${rigId}`
  await prisma.$executeRaw`UPDATE "deployment_assignments" SET "endedAt" = now() WHERE "rigId" = ${rigId}`
}
const stockAt = async (itemId: string, hubId: string) =>
  (await prisma.$queryRaw<{ quantity: number }[]>`SELECT "quantity" FROM "inventory_stock" WHERE "itemId" = ${itemId} AND "hubId" = ${hubId}`)[0]?.quantity ?? 0

/** Never a 500, never a deadlock message. */
async function expectNamed(res: Response) {
  expect(res.status).not.toBe(500)
  const body = await res.clone().json().catch(() => ({}))
  expect(JSON.stringify(body)).not.toMatch(/deadlock/i)
  return { status: res.status, error: (body as { error?: string }).error }
}

/** No open kit line or vehicle row on an ended deployment unless a PENDING transfer holds it. */
async function expectNothingStranded() {
  const lines = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "kit_items" ki JOIN "kits" k ON k."id" = ki."kitId" JOIN "rigs" r ON r."id" = k."rigId"
    WHERE r."endedAt" IS NOT NULL AND ki."removedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "transfer_items" ti JOIN "transfer_requests" tr ON tr."id" = ti."transferRequestId"
                      WHERE ti."kitItemId" = ki."id" AND tr."status" = 'PENDING')`
  const vehicles = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "rig_vehicles" rv JOIN "rigs" r ON r."id" = rv."rigId"
    WHERE r."endedAt" IS NOT NULL AND rv."removedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "transfer_vehicles" tv JOIN "transfer_requests" tr ON tr."id" = tv."transferRequestId"
                      WHERE tv."vehicleId" = rv."vehicleId" AND tr."status" = 'PENDING')`
  expect(lines[0].n).toBe(0)
  expect(vehicles[0].n).toBe(0)
}

let admin: { id: string }
let cat: { id: string }
let hub: { id: string }

beforeEach(async () => {
  admin = await createAdminUser()
  mockSession = adminSession(admin.id)
  cat = await createCategory()
  hub = await createHub()
})
afterEach(() => {
  hook.auth = null
  hook.active = null
  hook.claim = null
  hook.lock = null
})

async function deploymentWithStock(qty = 5) {
  const op = await createOperator()
  const { rig, kit } = await createRig(op.id)
  const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 0, name: 'Sample bags' })
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
  await seedInventoryStock(item.id, hub.id, 0)
  const line = await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: qty, drawnQuantity: qty, drawnHubId: hub.id } })
  return { op, rig, kit, item, line }
}

async function serializedOn(kitId: string) {
  const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0, name: 'Garmin GPS' })
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
  const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
  return prisma.kitItem.create({ data: { kitId, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id } })
}

describe('2.5 · End takes the deployment first', () => {
  it('two admin Ends at once → exactly {200, 409}; stock restored once, one CHECK_IN per line, transfers once', async () => {
    const { rig, kit, item, line } = await deploymentWithStock(5)
    const gps = await serializedOn(kit.id)
    const x = await createOperator()
    const body = {
      itemDispositions: [
        { kitItemId: line.id, type: 'HUB', hubId: hub.id },
        { kitItemId: gps.id, type: 'TRANSFER', toOperatorId: x.id },
      ],
    }
    const results = await Promise.all([end(rig.id, body), end(rig.id, body)])
    const named = await Promise.all(results.map(expectNamed))
    expect(named.map((r) => r.status).sort()).toEqual([200, 409])
    expect(named.find((r) => r.status === 409)?.error).toBe('This deployment has already ended.')
    expect(await stockAt(item.id, hub.id)).toBe(5)
    expect(await prisma.checkLog.count({ where: { rigId: rig.id, action: 'CHECK_IN', itemId: item.id } })).toBe(1)
    expect(await prisma.transferRequest.count({ where: { fromRigId: rig.id } })).toBe(1)
  })

  it('the deployment ends between the read and the transaction → 409, nothing else changed', async () => {
    const { rig, kit, item, line } = await deploymentWithStock(5)
    const gps = await serializedOn(kit.id)
    const x = await createOperator()
    hook.auth = async (id) => { if (id === rig.id) await endIt(id) }
    const res = await end(rig.id, {
      itemDispositions: [
        { kitItemId: line.id, type: 'HUB', hubId: hub.id },
        { kitItemId: gps.id, type: 'TRANSFER', toOperatorId: x.id },
      ],
    })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('This deployment has already ended.')
    expect(await stockAt(item.id, hub.id)).toBe(0)
    expect((await prisma.kitItem.findUniqueOrThrow({ where: { id: line.id } })).removedAt).toBeNull()
    expect(await prisma.checkLog.count({ where: { rigId: rig.id, action: 'CHECK_IN' } })).toBe(0)
    expect(await prisma.transferRequest.count()).toBe(0)
    // The assignments as the hook left them (all ended, none reopened).
    const open = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "deployment_assignments" WHERE "rigId" = ${rig.id} AND "endedAt" IS NULL`
    expect(open[0].n).toBe(0)
  })

  it('the same Idempotency-Key replayed → the cached 200', async () => {
    const { rig } = await deploymentWithStock(2)
    const first = await end(rig.id, {}, { 'Idempotency-Key': 'end-once' })
    expect(first.status).toBe(200)
    const again = await end(rig.id, {}, { 'Idempotency-Key': 'end-once' })
    expect(again.status).toBe(200)
  })

  it('add items while the deployment ends → 409, no line, stock unchanged', async () => {
    const op = await createOperator()
    const { rig, kit } = await createRig(op.id)
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 5 })
    await seedInventoryStock(item.id, hub.id, 5)
    hook.active = async (id) => { if (id === rig.id) await endIt(id) }
    const res = await itemsPost(req(`/api/deployments/${rig.id}/items`, {
      items: [{ itemType: 'CONSUMABLE', inventoryItemId: item.id, quantity: 2 }], sourceHubId: hub.id,
    }), p(rig.id))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('This deployment has already ended.')
    expect(await prisma.kitItem.count({ where: { kitId: kit.id } })).toBe(0)
    expect(await stockAt(item.id, hub.id)).toBe(5)
  })

  it('Reassign while the deployment ends → 409', async () => {
    const op = await createOperator()
    const c = await createOperator()
    const { rig } = await createRig(op.id)
    hook.claim = async (id) => { if (id === rig.id) await endIt(id) }
    const res = await reassign(rig.id, c.id)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('This deployment has already ended.')
  })

  it("a line added between End's read and its claim → 409 \"Equipment was added…\", nothing changed", async () => {
    const { rig, kit, item, line } = await deploymentWithStock(5)
    hook.auth = async (id) => {
      if (id === rig.id) await prisma.kitItem.create({ data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1 } })
    }
    const res = await end(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'HUB', hubId: hub.id }] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Equipment was added to this deployment while it was ending. Open End deployment again.')
    expect((await prisma.rig.findUniqueOrThrow({ where: { id: rig.id } })).endedAt).toBeNull()
    expect(await stockAt(item.id, hub.id)).toBe(0)
  })
})

describe('2.5 · transfer answers and Reassign race without a 500', () => {
  it('Reassign vs accept of a transfer of the whole deployment, 20 runs → one wins, the other a named 409', async () => {
    for (let run = 0; run < 20; run++) {
      const { rig, line } = await deploymentWithStock(3)
      const x = await createOperator()
      const c = await createOperator()
      const t = await prisma.transferRequest.create({
        data: { fromRigId: rig.id, toOperatorId: x.id, initiatedById: admin.id, note: '', status: 'PENDING', items: { create: [{ kitItemId: line.id }] } },
      })
      const named = await Promise.all((await Promise.all([reassign(rig.id, c.id), accept(t.id)])).map(expectNamed))
      const ok = named.filter((r) => r.status === 200 || r.status === 201)
      expect(ok).toHaveLength(1)
      expect(named.filter((r) => r.status === 409)).toHaveLength(1)
    }
  })

  it('hook-staged, accept wins: the accept commits inside Reassign\'s first statement → Reassign gets 409', async () => {
    const { rig, line } = await deploymentWithStock(3)
    const x = await createOperator()
    const t = await prisma.transferRequest.create({
      data: { fromRigId: rig.id, toOperatorId: x.id, initiatedById: admin.id, note: '', status: 'PENDING', items: { create: [{ kitItemId: line.id }] } },
    })
    let staged: Response | null = null
    hook.claim = async (id) => {
      if (id !== rig.id || staged) return
      hook.claim = null
      staged = await accept(t.id)
    }
    const res = await reassign(rig.id, (await createOperator()).id)
    expect(staged!.status).toBe(200)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('This deployment has already ended.')
  })

  it('hook-staged, Reassign wins: Reassign commits inside accept\'s first statement → accept gets 409', async () => {
    const { rig, line } = await deploymentWithStock(3)
    const x = await createOperator()
    const t = await prisma.transferRequest.create({
      data: { fromRigId: rig.id, toOperatorId: x.id, initiatedById: admin.id, note: '', status: 'PENDING', items: { create: [{ kitItemId: line.id }] } },
    })
    let staged: Response | null = null
    hook.lock = async (ids) => {
      if (!ids.includes(rig.id) || staged) return
      hook.lock = null
      staged = await reassign(rig.id, (await createOperator()).id)
    }
    const res = await accept(t.id)
    expect(staged!.status).toBe(201)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Transfer is no longer pending')
  })

  it('Reassign vs handoff accept, 20 runs → never a 500; any 409 is "Transfer is no longer pending"; one open PRIMARY', async () => {
    for (let run = 0; run < 20; run++) {
      const op = await createOperator()
      const x = await createOperator()
      const c = await createOperator()
      const { rig } = await createRig(op.id)
      const handoffId = await createHandoff({ rigId: rig.id, fromOperatorId: op.id, toOperatorId: x.id, initiatedById: op.id, note: '' })
      const named = await Promise.all(
        (await Promise.all([reassign(rig.id, c.id), acceptHandoff(req(`/api/handoffs/${handoffId}/accept`, {}), p(handoffId))])).map(expectNamed),
      )
      for (const r of named.filter((n) => n.status === 409)) expect(r.error).toBe('Transfer is no longer pending')
      const primaries = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "deployment_assignments" WHERE "rigId" = ${rig.id} AND "role" = 'PRIMARY' AND "endedAt" IS NULL`
      expect(primaries[0].n).toBe(1)
    }
  })

  it('End vs decline, 20 runs → nothing stranded, stock restored once', async () => {
    for (let run = 0; run < 20; run++) {
      const { rig, item, line } = await deploymentWithStock(4)
      const x = await createOperator()
      const t = await prisma.transferRequest.create({
        data: { fromRigId: rig.id, toOperatorId: x.id, initiatedById: admin.id, note: '', status: 'PENDING', items: { create: [{ kitItemId: line.id }] } },
      })
      await Promise.all((await Promise.all([end(rig.id, { itemDispositions: [{ kitItemId: line.id, type: 'HUB', hubId: hub.id }] }), decline(t.id)])).map(expectNamed))
      await expectNothingStranded()
      expect(await stockAt(item.id, hub.id)).toBe(4)
    }
  })

  it("the recipient's End vs accept → never an open line or vehicle row on an ended deployment", async () => {
    for (let run = 0; run < 10; run++) {
      const source = await deploymentWithStock(2)
      const x = await createOperator()
      const mine = await createRig(x.id)
      await serializedOn(mine.kit.id)
      const t = await prisma.transferRequest.create({
        data: { fromRigId: source.rig.id, toOperatorId: x.id, initiatedById: admin.id, note: '', status: 'PENDING', items: { create: [{ kitItemId: source.line.id }] } },
      })
      const named = await Promise.all((await Promise.all([end(mine.rig.id), accept(t.id)])).map(expectNamed))
      const endResult = named[0]
      if (endResult.status === 409) {
        expect(endResult.error).toBe('Equipment was added to this deployment while it was ending. Open End deployment again.')
      }
      await expectNothingStranded()
    }
  })

  it('the recipient starts and ends a deployment during the accept → the gear never lands on an ended deployment', async () => {
    const source = await deploymentWithStock(2)
    const x = await createOperator()
    const mine = await createRig(x.id)
    const t = await prisma.transferRequest.create({
      data: { fromRigId: source.rig.id, toOperatorId: x.id, initiatedById: admin.id, note: '', status: 'PENDING', items: { create: [{ kitItemId: source.line.id }] } },
    })
    // Between accept's read of x's deployment and its lock: x's deployment ends and x starts
    // another. Accept must use the deployment it locked (now ended → a new one), never the
    // unlocked newcomer, which a racing End could close under it.
    let started: string | null = null
    hook.lock = async () => {
      hook.lock = null
      await endIt(mine.rig.id)
      started = (await createRig(x.id)).rig.id
    }
    const res = await expectNamed(await accept(t.id))
    // The newcomer ends (an End that never saw the accepted gear).
    await endIt(started!)
    const moved = await prisma.kitItem.findMany({
      where: { inventoryItemId: source.item.id, removedAt: null, kit: { rigId: { not: source.rig.id } } },
      select: { kit: { select: { rigId: true, rig: { select: { endedAt: true } } } } },
    })
    if (res.status === 200) {
      expect(moved).toHaveLength(1)
      expect(moved[0].kit.rig.endedAt).toBeNull()
    } else {
      expect(res.status).toBe(409)
      expect(moved).toHaveLength(0)
      expect((await prisma.transferRequest.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('PENDING')
    }
    expect(moved.map((m) => m.kit.rigId)).not.toContain(started)
    expect(moved.map((m) => m.kit.rigId)).not.toContain(mine.rig.id)
    await expectNothingStranded()
  })

  it('accept of everything ends the source, ends its assignments and cancels its waiting handoff', async () => {
    const { op, rig, line } = await deploymentWithStock(2)
    const x = await createOperator()
    const c = await createOperator()
    await createHandoff({ rigId: rig.id, fromOperatorId: op.id, toOperatorId: c.id, initiatedById: op.id, note: '' })
    const t = await prisma.transferRequest.create({
      data: { fromRigId: rig.id, toOperatorId: x.id, initiatedById: admin.id, note: '', status: 'PENDING', items: { create: [{ kitItemId: line.id }] } },
    })
    expect((await accept(t.id)).status).toBe(200)
    expect((await prisma.rig.findUniqueOrThrow({ where: { id: rig.id } })).endedAt).not.toBeNull()
    const open = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "deployment_assignments" WHERE "rigId" = ${rig.id} AND "endedAt" IS NULL`
    expect(open[0].n).toBe(0)
    const h = await prisma.$queryRaw<{ status: string }[]>`SELECT "status"::text AS status FROM "deployment_handoffs" WHERE "rigId" = ${rig.id}`
    expect(h.map((r) => r.status)).toEqual(['CANCELLED'])
  })

  it("if End already ended the source, accept doesn't overwrite endedAt", async () => {
    const { rig, line } = await deploymentWithStock(2)
    const x = await createOperator()
    const t = await prisma.transferRequest.create({
      data: { fromRigId: rig.id, toOperatorId: x.id, initiatedById: admin.id, note: '', status: 'PENDING', items: { create: [{ kitItemId: line.id }] } },
    })
    expect((await end(rig.id)).status).toBe(200)
    const endedAt = (await prisma.rig.findUniqueOrThrow({ where: { id: rig.id } })).endedAt
    expect(endedAt).not.toBeNull()
    expect((await accept(t.id)).status).toBe(200)
    expect((await prisma.rig.findUniqueOrThrow({ where: { id: rig.id } })).endedAt).toEqual(endedAt)
  })
})
