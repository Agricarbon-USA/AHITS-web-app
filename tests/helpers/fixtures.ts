import { randomUUID } from 'crypto'
import { ensureOpenAssignment } from '../../src/lib/deployment-assignments'
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
    itemType?: 'SERIALIZED' | 'CONSUMABLE'
    quantity?: number
    name?: string
    status?: string
  },
) {
  return prisma.inventoryItem.create({
    data: {
      name: overrides?.name ?? `Item-${uid()}`,
      categoryId,
      itemType: overrides?.itemType ?? 'CONSUMABLE',
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

export async function createVehicle(overrides?: {
  name?: string
  type?: string
  status?: string
}) {
  return prisma.vehicle.create({
    data: {
      name: overrides?.name ?? `Vehicle-${uid()}`,
      type: (overrides?.type ?? 'TRUCK') as never,
      status: (overrides?.status ?? 'ACTIVE') as never,
    },
  })
}

/** Attach a vehicle to a rig via an open RigVehicle row. */
export async function addVehicleToRig(rigId: string, vehicleId: string) {
  return prisma.rigVehicle.create({
    data: { rigId, vehicleId, addNote: 'fixture' },
  })
}

export async function createRig(operatorId: string) {
  const rig = await prisma.rig.create({ data: { operatorId } })
  // W0-10 PR-4a: readers now use the open PRIMARY assignment; operatorId column drops in PR-4b.
  await ensureOpenAssignment({ rigId: rig.id, operatorId, role: 'PRIMARY', addedById: operatorId, note: 'fixture' })
  const kit = await prisma.kit.create({
    data: { rigId: rig.id },
  })
  return { rig, kit }
}

export async function createHub(overrides?: { name?: string; city?: string; state?: string }) {
  return prisma.hub.create({
    data: {
      name: overrides?.name ?? `Hub-${uid()}`,
      city: overrides?.city ?? 'Austin',
      state: overrides?.state ?? 'TX',
    },
  })
}

/** Seed (or overwrite) inventory_stock for a given item+hub pair. */
export async function seedInventoryStock(itemId: string, hubId: string, quantity: number) {
  await prisma.$executeRaw`
    INSERT INTO "inventory_stock" ("id", "itemId", "hubId", "quantity", "updatedAt")
    VALUES (${randomUUID()}, ${itemId}, ${hubId}, ${quantity}, now())
    ON CONFLICT ("itemId", "hubId") DO UPDATE SET "quantity" = ${quantity}, "updatedAt" = now()
  `
}

export function operatorSession(userId: string) {
  return { userId, role: 'OPERATOR', name: 'Test Operator', email: `${userId}@test.example` }
}

export function adminSession(userId: string) {
  return { userId, role: 'ADMIN', name: 'Test Admin', email: `${userId}@test.example` }
}
