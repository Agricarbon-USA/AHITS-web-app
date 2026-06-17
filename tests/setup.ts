import { prisma } from '../src/lib/prisma'

// Clean all data between test suites — ORDER MATTERS.
// Every FK must be deleted before the record it points to.
afterEach(async () => {
  await prisma.photo.deleteMany()
  await prisma.alert.deleteMany()
  await prisma.checkLog.deleteMany()
  await prisma.transferItem.deleteMany()
  await prisma.transferVehicle.deleteMany()
  await prisma.transferRequest.deleteMany()
  await prisma.kitItem.deleteMany()
  await prisma.kit.deleteMany()
  await prisma.rigVehicle.deleteMany()
  await prisma.rigOperator.deleteMany()
  await prisma.rig.deleteMany()
  await prisma.inventoryUnit.deleteMany()
  await prisma.maintenanceTask.deleteMany()
  await prisma.dailyCheck.deleteMany()
  await prisma.projectEquipment.deleteMany()
  await prisma.inventoryItem.deleteMany()
  await prisma.vehicle.deleteMany()
  await prisma.project.deleteMany()
  await prisma.inviteToken.deleteMany()
  await prisma.user.deleteMany()
  await prisma.hub.deleteMany()
  await prisma.category.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})
