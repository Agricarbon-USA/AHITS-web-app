// UXP-3 (3g) / D36 — server half of "no-camera never blocks a submit" for the INOPERABLE
// disposition. Node DB suite (CI-only here). Both disposition routes used to superRefine
// `type === 'INOPERABLE' && photoUrls.length === 0` into a 400; D36 says a denied/missing
// camera must never block, so a photo-less damage disposition is now an honest 200 with
// the unit flipped and zero photo rows. The unit report-problem flip lives in
// tests/cc34-report-and-promote.test.ts; the localphoto: 422 guard (CC-29 7b) is untouched
// and still pinned by tests/cc29-localphoto-rejection.test.ts.
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE as bulkReturn } from '../src/app/api/deployments/[id]/items/route'
import { POST as endDeployment } from '../src/app/api/deployments/[id]/end/route'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createCategory, createInventoryItem, createInventoryUnit, createRig, createHub,
  operatorSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}), resolveActiveAlert: vi.fn().mockResolvedValue({}) }))

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

/** An operator with an active rig holding ONE serialized unit (CHECKED_OUT) in its kit. */
async function rigWithUnit() {
  const op = await createOperator()
  const cat = await createCategory()
  const hub = await createHub()
  const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: hub.id } })
  const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
  const { rig, kit } = await createRig(op.id)
  const kitItem = await prisma.kitItem.create({
    data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
  })
  mockSession = operatorSession(op.id)
  return { op, rig, unit, kitItem }
}

describe('UXP-3 (3g) / D36: INOPERABLE dispositions no longer require a damage photo', () => {
  it('DELETE /items with INOPERABLE + photoUrls [] → 200, unit flipped, zero photo rows', async () => {
    const { rig, unit, kitItem } = await rigWithUnit()
    const res = await bulkReturn(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items`, 'DELETE', {
        note: '',
        itemDispositions: [{ kitItemId: kitItem.id, type: 'INOPERABLE', inoperableNotes: 'cracked housing', photoUrls: [] }],
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)
    const after = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(after?.status).toBe('INOPERABLE')
    expect(after?.inoperableNotes).toBe('cracked housing')
    expect(await prisma.photo.count({ where: { inventoryItemId: unit.inventoryItemId } })).toBe(0)
    const removed = await prisma.kitItem.findUnique({ where: { id: kitItem.id } })
    expect(removed?.removedAt).not.toBeNull()
  })

  it('POST /end with INOPERABLE + photoUrls [] → 200, deployment ended, unit flipped, zero photo rows', async () => {
    const { rig, unit, kitItem } = await rigWithUnit()
    const res = await endDeployment(
      jsonReq(`http://localhost/api/deployments/${rig.id}/end`, 'POST', {
        note: '',
        itemDispositions: [{ kitItemId: kitItem.id, type: 'INOPERABLE', photoUrls: [] }],
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)
    const endedRig = await prisma.rig.findUnique({ where: { id: rig.id } })
    expect(endedRig?.endedAt).not.toBeNull()
    const after = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(after?.status).toBe('INOPERABLE')
    expect(await prisma.photo.count({ where: { inventoryItemId: unit.inventoryItemId } })).toBe(0)
  })

  it('a photo, when given, still lands as a DAMAGE photo row (the optional path is not a dropped path)', async () => {
    const { rig, unit, kitItem } = await rigWithUnit()
    const res = await bulkReturn(
      jsonReq(`http://localhost/api/deployments/${rig.id}/items`, 'DELETE', {
        note: '',
        itemDispositions: [{ kitItemId: kitItem.id, type: 'INOPERABLE', photoUrls: ['/api/photos/damage.jpg'] }],
      }),
      { params: Promise.resolve({ id: rig.id }) },
    )
    expect(res.status).toBe(200)
    const photos = await prisma.photo.findMany({ where: { inventoryItemId: unit.inventoryItemId } })
    expect(photos).toHaveLength(1)
    expect(photos[0].context).toBe('DAMAGE')
  })
})
