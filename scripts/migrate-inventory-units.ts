import { prisma } from '../src/lib/prisma'

async function main() {
  const items = await prisma.inventoryItem.findMany()
  for (const item of items) {
    const existing = await prisma.inventoryUnit.count({ where: { inventoryItemId: item.id } })
    if (existing > 0) continue

    const count = Math.max(item.quantity, 1)
    await prisma.inventoryUnit.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        inventoryItemId: item.id,
        serialNumber: i === 0 ? (item.unitId ?? null) : null,
        status: 'AVAILABLE' as const,
      })),
    })
    console.log(`Created ${count} unit(s) for "${item.name}"`)
  }
  console.log('Done seeding inventory units')
}

main().finally(() => prisma.$disconnect())
