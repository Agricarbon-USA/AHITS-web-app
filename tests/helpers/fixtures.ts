import { prisma } from '../../src/lib/prisma'

export async function createCategory(name = 'Test Category') {
  return prisma.category.create({ data: { name } })
}

export async function createHub(overrides: Record<string, unknown> = {}) {
  return prisma.hub.create({
    data: { name: 'Test Hub', city: 'Austin', state: 'TX', ...overrides },
  })
}

export async function createAdmin(overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { name: 'Admin User', email: 'admin@test.com', role: 'ADMIN', ...overrides },
  })
}

export async function createOperator(overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { name: 'Test Operator', email: 'operator@test.com', role: 'OPERATOR', ...overrides },
  })
}

export async function createInventoryItem(categoryId: string, overrides: Record<string, unknown> = {}) {
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

export async function createInventoryUnit(inventoryItemId: string, overrides: Record<string, unknown> = {}) {
  return prisma.inventoryUnit.create({
    data: { inventoryItemId, status: 'AVAILABLE', ...overrides },
  })
}

export async function createRig(operatorId: string, overrides: Record<string, unknown> = {}) {
  const rig = await prisma.rig.create({
    data: { operatorId, ...overrides },
  })
  const kit = await prisma.kit.create({ data: { rigId: rig.id } })
  return { rig, kit }
}

export const adminSession = {
  userId: '',
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
