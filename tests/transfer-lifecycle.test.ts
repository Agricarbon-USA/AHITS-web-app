import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as endDeployment } from '../src/app/api/deployments/[id]/end/route'
import { POST as acceptTransfer } from '../src/app/api/transfers/[id]/accept/route'
import { POST as declineTransfer } from '../src/app/api/transfers/[id]/decline/route'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createCategory, createInventoryItem,
  createInventoryUnit, createRig, operatorSession,
} from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
}))

vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}) }))

describe('End-of-deployment TRANSFER lifecycle', () => {
  let op1: Awaited<ReturnType<typeof createOperator>>
  let op2: Awaited<ReturnType<typeof createOperator>>
  let cat: Awaited<ReturnType<typeof createCategory>>

  beforeEach(async () => {
    op1 = await createOperator({ email: 'op1@test.com', name: 'Op1' })
    op2 = await createOperator({ email: 'op2@test.com', name: 'Op2' })
    cat = await createCategory()
  })

  it('end-deployment TRANSFER items are not marked removedAt until accepted', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op1.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    mockSession = operatorSession(op1.id)
    const endReq = new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
      method: 'POST',
      body: JSON.stringify({
        note: 'Test end',
        itemDispositions: [{ kitItemId: kitItem.id, type: 'TRANSFER', toOperatorId: op2.id }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const endRes = await endDeployment(endReq, { params: Promise.resolve({ id: rig.id }) })
    expect(endRes.status).toBe(200)

    // Kit item should NOT have removedAt set (kept pending for transfer)
    const kiAfterEnd = await prisma.kitItem.findUnique({ where: { id: kitItem.id } })
    expect(kiAfterEnd?.removedAt).toBeNull()

    // Transfer should exist in PENDING state
    const transfer = await prisma.transferRequest.findFirst({ where: { fromRigId: rig.id, toOperatorId: op2.id } })
    expect(transfer).not.toBeNull()
    expect(transfer?.status).toBe('PENDING')

    // Now accept the transfer
    mockSession = operatorSession(op2.id)
    const acceptReq = new NextRequest(`http://localhost/api/transfers/${transfer!.id}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const acceptRes = await acceptTransfer(acceptReq, { params: Promise.resolve({ id: transfer!.id }) })
    expect(acceptRes.status).toBe(200)

    // Kit item in source should now be marked removed
    const kiAfterAccept = await prisma.kitItem.findUnique({ where: { id: kitItem.id } })
    expect(kiAfterAccept?.removedAt).not.toBeNull()

    // New kit item should exist for op2
    const destRig = await prisma.rig.findFirst({ where: { operatorId: op2.id, endedAt: null } })
    expect(destRig).not.toBeNull()
    const newKitItem = await prisma.kitItem.findFirst({
      where: { kit: { rigId: destRig!.id }, inventoryItemId: item.id, removedAt: null },
    })
    expect(newKitItem).not.toBeNull()
    expect(newKitItem?.inventoryUnitId).toBe(unit.id)
  })

  it('declining an end-of-deployment transfer restores units to AVAILABLE', async () => {
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED', quantity: 0 })
    const unit = await createInventoryUnit(item.id, { status: 'CHECKED_OUT' })
    const { rig, kit } = await createRig(op1.id)
    const kitItem = await prisma.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: item.id, quantity: 1, inventoryUnitId: unit.id },
    })

    mockSession = operatorSession(op1.id)
    const endReq = new NextRequest(`http://localhost/api/deployments/${rig.id}/end`, {
      method: 'POST',
      body: JSON.stringify({
        note: 'Test end',
        itemDispositions: [{ kitItemId: kitItem.id, type: 'TRANSFER', toOperatorId: op2.id }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    await endDeployment(endReq, { params: Promise.resolve({ id: rig.id }) })

    const transfer = await prisma.transferRequest.findFirst({ where: { fromRigId: rig.id, toOperatorId: op2.id } })

    mockSession = operatorSession(op2.id)
    const declineReq = new NextRequest(`http://localhost/api/transfers/${transfer!.id}/decline`, {
      method: 'POST',
      body: JSON.stringify({ responseNote: 'Not needed' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const declineRes = await declineTransfer(declineReq, { params: Promise.resolve({ id: transfer!.id }) })
    expect(declineRes.status).toBe(200)

    // Unit should be restored to AVAILABLE
    const unitAfter = await prisma.inventoryUnit.findUnique({ where: { id: unit.id } })
    expect(unitAfter?.status).toBe('AVAILABLE')

    // Kit item should be marked removed
    const kiAfterDecline = await prisma.kitItem.findUnique({ where: { id: kitItem.id } })
    expect(kiAfterDecline?.removedAt).not.toBeNull()
  })
})
