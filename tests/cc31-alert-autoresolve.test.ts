import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { PATCH as patchUser } from '../src/app/api/users/[id]/route'
import { POST as endDeployment } from '../src/app/api/deployments/[id]/end/route'
import { applyRequestTransition, createRequest } from '../src/lib/deployment-requests'
import { applyTransition, resolveStatusLinkById } from '../src/lib/status-links'
import { createAlert, resolveActiveAlert } from '../src/lib/alerts'
import { prisma } from '../src/lib/prisma'
import {
  createOperator,
  createAdminUser,
  adminSession,
  operatorSession,
  createCategory,
  createInventoryItem,
  createHub,
  createRig,
} from './helpers/fixtures'

// CC-31 item 2 (review §3.3): the linger-forever alert set now auto-resolves.
// PIN_LOCKED clears on PIN reset/unlock; MATERIAL_REQUEST clears on any terminal
// transition (converging the public status-link path); EQUIPMENT_NOT_RETURNED clears
// when the rig ends. resolveActiveAlert nulls activeKey (a recurrence re-arms fresh)
// and never touches notifiedAt (no re-notify).

let mockSession: { userId: string; role: string; name?: string; email?: string } | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
}))

const resolvedWith = (type: string, table: string, id: string) =>
  vi.mocked(resolveActiveAlert).mock.calls.some((c) => c[0] === type && c[1] === table && c[2] === id)

beforeEach(() => {
  vi.mocked(createAlert).mockClear()
  vi.mocked(resolveActiveAlert).mockClear()
})

// ── 2a · PIN_LOCKED ────────────────────────────────────────────────────────────
describe('CC-31 §3.3: PIN reset/unlock resolves PIN_LOCKED', () => {
  function patchReq(body: unknown) {
    return new NextRequest('http://localhost/api/users/x', {
      method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    })
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('resolves PIN_LOCKED when the patch unlocks the PIN', async () => {
    const admin = await createAdminUser()
    const target = await createOperator()
    mockSession = adminSession(admin.id)

    const res = await patchUser(patchReq({ unlockPin: true }), ctx(target.id))
    expect(res.status).toBe(200)
    expect(resolvedWith('PIN_LOCKED', 'users', target.id)).toBe(true)
  })

  it('resolves PIN_LOCKED when the patch resets the PIN', async () => {
    const admin = await createAdminUser()
    const target = await createOperator()
    mockSession = adminSession(admin.id)

    const res = await patchUser(patchReq({ pin: '135790' }), ctx(target.id))
    expect(res.status).toBe(200)
    expect(resolvedWith('PIN_LOCKED', 'users', target.id)).toBe(true)
  })

  it('does NOT resolve PIN_LOCKED on an unrelated patch (name only)', async () => {
    const admin = await createAdminUser()
    const target = await createOperator()
    mockSession = adminSession(admin.id)

    const res = await patchUser(patchReq({ name: 'Renamed' }), ctx(target.id))
    expect(res.status).toBe(200)
    expect(resolvedWith('PIN_LOCKED', 'users', target.id)).toBe(false)
  })
})

// ── 2b · MATERIAL_REQUEST ────────────────────────────────────────────────────────
describe('CC-31 §3.3: terminal request transitions resolve MATERIAL_REQUEST', () => {
  async function materialRequest(requestedById: string, status: 'REQUESTED' | 'FORWARDED' = 'REQUESTED') {
    const cat = await createCategory()
    const id = await createRequest(
      { requestType: 'MATERIAL', status: 'REQUESTED', lines: [{ lineType: 'KIT_ITEM', categoryId: cat.id, requestedQty: 1 }] },
      requestedById,
    )
    if (status === 'FORWARDED') {
      await prisma.$executeRaw`UPDATE "deployment_requests" SET "status" = 'FORWARDED' WHERE "id" = ${id}`
    }
    return id
  }

  it('resolves on a successful fulfill (REQUESTED → FULFILLED)', async () => {
    const op = await createOperator()
    const id = await materialRequest(op.id)
    const r = await applyRequestTransition(id, 'fulfill', 'MATERIAL')
    expect(r.ok).toBe(true)
    expect(resolvedWith('MATERIAL_REQUEST', 'deployment_requests', id)).toBe(true)
  })

  it('resolves on decline and on cancel', async () => {
    const op = await createOperator()
    const declineId = await materialRequest(op.id)
    expect((await applyRequestTransition(declineId, 'decline', 'MATERIAL')).ok).toBe(true)
    expect(resolvedWith('MATERIAL_REQUEST', 'deployment_requests', declineId)).toBe(true)

    const cancelId = await materialRequest(op.id)
    expect((await applyRequestTransition(cancelId, 'cancel', 'MATERIAL')).ok).toBe(true)
    expect(resolvedWith('MATERIAL_REQUEST', 'deployment_requests', cancelId)).toBe(true)
  })

  it('does NOT resolve when the transition fails (state mismatch)', async () => {
    const op = await createOperator()
    const id = await materialRequest(op.id)
    // 'complete' requires FORWARDED; this REQUESTED request state-mismatches.
    const r = await applyRequestTransition(id, 'complete', 'MATERIAL')
    expect(r.ok).toBe(false)
    expect(resolvedWith('MATERIAL_REQUEST', 'deployment_requests', id)).toBe(false)
  })

  it('converges through the public status-link path (applyReservationTransition → complete)', async () => {
    const op = await createOperator()
    const admin = await createAdminUser()
    const id = await materialRequest(op.id, 'FORWARDED')
    const link = await prisma.statusLink.create({
      data: {
        type: 'RESERVATION',
        state: 'ISSUED',
        tokenHash: `test-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        deploymentRequestId: id,
        createdById: admin.id,
      },
    })
    const resolved = await resolveStatusLinkById(link.id)
    expect(resolved).toBeTruthy()
    const r = await applyTransition(resolved!, { action: 'CONFIRMED', actorLabel: 'hub' })
    expect(r.ok).toBe(true)
    expect(resolvedWith('MATERIAL_REQUEST', 'deployment_requests', id)).toBe(true)
  })
})

// ── 2c · EQUIPMENT_NOT_RETURNED ──────────────────────────────────────────────────
describe('CC-31 §3.3: ending a deployment resolves EQUIPMENT_NOT_RETURNED per kit item', () => {
  function endReq(body: unknown) {
    return new NextRequest('http://localhost/api/deployments/x/end', {
      method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    })
  }

  it('resolves the alert for each kit item on the ended rig', async () => {
    const op = await createOperator()
    const hub = await createHub()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE' })
    // the auto-disposition routes a bare item back to its home hub — give it one
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
    const { rig, kit } = await createRig(op.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id },
    })
    mockSession = operatorSession(op.id)

    const res = await endDeployment(endReq({ itemDispositions: [] }), { params: Promise.resolve({ id: rig.id }) })
    expect(res.status).toBe(200)
    expect(resolvedWith('EQUIPMENT_NOT_RETURNED', 'kit_items', kitItem.id)).toBe(true)
  })
})
