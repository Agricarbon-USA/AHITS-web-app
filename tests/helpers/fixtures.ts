import { ItemType } from '@prisma/client'
import { prisma } from '../../src/lib/prisma'

let counter = 0
function uid() {
  return `test-${Date.now()}-${++counter}`
}

export async function createOperator(overrides?: { name?: string; email?: string }) {
  return prisma.user.create({
    data: {
      name: overrides?.name ?? `Test Operator ${uid()}`,
      email: overrides?.email ?? `op-${uid()}@test.example`,
      role: 'OPERATOR',
    },
  })
}

export async function createAdminUser(overrides?: { name?: string; email?: string }) {
  return prisma.user.create({
    data: {
      name: overrides?.name ?? `Test Admin ${uid()}`,
      email: overrides?.email ?? `admin-${uid()}@test.example`,
      role: 'ADMIN',
    },
  })
}

export async function createCategory(overrides?: { name?: string }) {
  return prisma.category.create({
    data: { name: overrides?.name ?? `Cat-${uid()}` },
  })
}

export async function createInventoryItem(
  categoryId: string,
  overrides?: {
    itemType?: ItemType
    quantity?: number
    name?: string
    status?: string
  },
) {
  return prisma.inventoryItem.create({
    data: {
      name: overrides?.name ?? `Item-${uid()}`,
      categoryId,
      itemType: overrides?.itemType ?? ItemType.CONSUMABLE,
      quantity: overrides?.quantity ?? 1,
      status: (overrides?.status ?? 'AVAILABLE') as never,
    },
  })
}

export async function createInventoryUnit(
  inventoryItemId: string,
  overrides?: { status?: string; serialNumber?: string },
) {
  return prisma.inventoryUnit.create({
    data: {
      inventoryItemId,
      status: (overrides?.status ?? 'AVAILABLE') as never,
      serialNumber: overrides?.serialNumber ?? null,
    },
  })
}

export async function createRig(operatorId: string) {
  const rig = await prisma.rig.create({
    data: { operatorId },
  })
  const kit = await prisma.kit.create({
    data: { rigId: rig.id },
  })
  return { rig, kit }
}

export function operatorSession(userId: string) {
  return { userId, role: 'OPERATOR', name: 'Test Operator', email: `${userId}@test.example` }
}

export function adminSession(userId: string) {
  return { userId, role: 'ADMIN', name: 'Test Admin', email: `${userId}@test.example` }
}
