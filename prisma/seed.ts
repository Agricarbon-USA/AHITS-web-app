import { PrismaClient, UserRole, VehicleType, VehicleStatus, EquipmentStatus, EquipmentCategory, ProjectStatus, ProjectType } from '@prisma/client'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Safety: this seed creates sample data and well-known accounts. Refuse to
  // run against a production environment unless explicitly overridden.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== '1') {
    throw new Error(
      '✋ Refusing to seed: NODE_ENV=production. The seed creates sample data and ' +
        'default accounts. If you really intend to seed production, set ALLOW_PROD_SEED=1.',
    )
  }

  console.log('🌱 Seeding database...')

  // Admin user. Password comes from SEED_ADMIN_PASSWORD if set, otherwise a
  // random one is generated and printed ONCE (no hard-coded credential in repo).
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString('base64url')
  const adminPw = await bcrypt.hash(adminPassword, 12)
  const admin = await prisma.user.upsert({
    where: { email: 'ops@agricarbon.com' },
    update: {},
    create: {
      name: 'Ops Admin',
      email: 'ops@agricarbon.com',
      role: UserRole.ADMIN,
      pinHash: adminPw,
      isActive: true,
    },
  })
  console.log(`  ✓ Admin: ${admin.email}`)
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`  🔑 Generated admin password (shown once — save it now): ${adminPassword}`)
    console.log('     (applies only when the admin is first created; change it after first login.)')
  }

  // Operator users with PINs
  const pin = await bcrypt.hash('123456', 12)
  const operators = await Promise.all([
    prisma.user.upsert({
      where: { email: 'operator1@agricarbon.com' },
      update: {},
      create: { name: 'Field Op 1', email: 'operator1@agricarbon.com', role: UserRole.OPERATOR, pinHash: pin, isActive: true },
    }),
    prisma.user.upsert({
      where: { email: 'operator2@agricarbon.com' },
      update: {},
      create: { name: 'Field Op 2', email: 'operator2@agricarbon.com', role: UserRole.OPERATOR, pinHash: pin, isActive: true },
    }),
  ])
  console.log(`  ✓ Operators: ${operators.length}`)

  // Vehicles
  const vehicles = await Promise.all([
    prisma.vehicle.upsert({ where: { name: 'Truck-01' }, update: {}, create: { name: 'Truck-01', type: VehicleType.TRUCK, year: 2021, makeModel: 'Ford F-250', odometer: 42000, status: VehicleStatus.ACTIVE, location: 'HQ' } }),
    prisma.vehicle.upsert({ where: { name: 'Truck-02' }, update: {}, create: { name: 'Truck-02', type: VehicleType.TRUCK, year: 2020, makeModel: 'Ford F-250', odometer: 58000, status: VehicleStatus.ACTIVE, location: 'HQ' } }),
    prisma.vehicle.upsert({ where: { name: 'Polaris-Blue' }, update: {}, create: { name: 'Polaris-Blue', type: VehicleType.POLARIS_UTV, year: 2022, makeModel: 'Polaris Ranger', odometer: 1200, status: VehicleStatus.ACTIVE, location: 'HQ' } }),
    prisma.vehicle.upsert({ where: { name: 'Can-Am-Red' }, update: {}, create: { name: 'Can-Am-Red', type: VehicleType.CAN_AM_UTV, year: 2023, makeModel: 'Can-Am Defender', odometer: 800, status: VehicleStatus.ACTIVE, location: 'HQ' } }),
    prisma.vehicle.upsert({ where: { name: 'Trailer-01' }, update: {}, create: { name: 'Trailer-01', type: VehicleType.TRAILER, year: 2019, makeModel: '16ft Utility', status: VehicleStatus.ACTIVE, location: 'HQ' } }),
    prisma.vehicle.upsert({ where: { name: 'Christie-Drill-1' }, update: {}, create: { name: 'Christie-Drill-1', type: VehicleType.CHRISTIE_DRILL, year: 2021, makeModel: 'Christie Drill', odometer: 0, status: VehicleStatus.ACTIVE, location: 'HQ' } }),
  ])
  console.log(`  ✓ Vehicles: ${vehicles.length}`)

  // Inventory items
  const items = await Promise.all([
    prisma.inventoryItem.upsert({ where: { qrCodeId: 'seed-gps-001' }, update: {}, create: { name: 'Trimble GPS Unit', category: EquipmentCategory.ELECTRONICS_GPS, quantity: 4, status: EquipmentStatus.AVAILABLE, location: 'Storage A', qrCodeId: 'seed-gps-001' } }),
    prisma.inventoryItem.upsert({ where: { qrCodeId: 'seed-probe-001' }, update: {}, create: { name: 'Soil Probe Set', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 10, status: EquipmentStatus.AVAILABLE, location: 'Storage A', qrCodeId: 'seed-probe-001' } }),
    prisma.inventoryItem.upsert({ where: { qrCodeId: 'seed-bag-001' }, update: {}, create: { name: 'Sample Bags (box/100)', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 20, status: EquipmentStatus.AVAILABLE, location: 'Storage B', lowStockThreshold: 5, qrCodeId: 'seed-bag-001' } }),
    prisma.inventoryItem.upsert({ where: { qrCodeId: 'seed-safety-001' }, update: {}, create: { name: 'Safety Vest', category: EquipmentCategory.SAFETY_GEAR, quantity: 15, status: EquipmentStatus.AVAILABLE, location: 'Storage B', qrCodeId: 'seed-safety-001' } }),
    prisma.inventoryItem.upsert({ where: { qrCodeId: 'seed-tablet-001' }, update: {}, create: { name: 'Rugged Tablet', category: EquipmentCategory.ELECTRONICS_GPS, quantity: 6, status: EquipmentStatus.AVAILABLE, location: 'Storage A', qrCodeId: 'seed-tablet-001' } }),
  ])
  console.log(`  ✓ Inventory: ${items.length}`)

  // Sample project
  await prisma.project.upsert({
    where: { id: 'seed-project-001' },
    update: {},
    create: {
      id: 'seed-project-001',
      name: 'Smith Ranch Baseline Survey',
      type: ProjectType.CROPLAND,
      location: 'Smith Ranch, CA',
      status: ProjectStatus.ACTIVE,
      leadId: admin.id,
    },
  })
  console.log(`  ✓ Projects: 1`)

  console.log('✅ Seed complete')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
