import { PrismaClient, UserRole, VehicleType, VehicleStatus, EquipmentStatus, EquipmentCategory, ProjectStatus, ProjectType } from '@prisma/client'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// CC-30 / D16 — hosts that mean "a real, shared, fleet-serving database".
// Supabase serves both the direct connection (db.<ref>.supabase.co) and the
// poolers (aws-0-<region>.pooler.supabase.com), so match either.
const LIVE_DB_HOST_RE = /supabase\.co$|pooler\.supabase\.com$/
const DANGEROUS_OVERRIDE = 'yes-i-mean-staging'

/**
 * Refuse to seed a live/shared database.
 *
 * Prefers DIRECT_URL (what `prisma db seed`/migrate actually use for a direct
 * connection) and falls back to DATABASE_URL. Fails CLOSED: a URL that cannot be
 * parsed is treated as suspect and refused, matching the philosophy of
 * scripts/check-migration-safety.sh — a guard you can't trust is worse than none.
 */
function assertNotLiveDatabase() {
  if (process.env.AHITS_DANGEROUS_TARGET === DANGEROUS_OVERRIDE) {
    console.warn(
      `⚠️  AHITS_DANGEROUS_TARGET=${DANGEROUS_OVERRIDE} — live-database seed guard BYPASSED on purpose.`,
    )
    return
  }

  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!raw) return // no URL configured — Prisma will fail on its own terms.

  let host: string
  try {
    host = new URL(raw).hostname
  } catch {
    // A connection string we can't parse (e.g. an unescaped character in the
    // password) might still point at the live fleet. Refuse rather than guess.
    throw new Error(
      '✋ Refusing to seed: could not parse the database URL, so its host could not be ' +
        'checked against the live-fleet guard. Fix the URL, or set ' +
        `AHITS_DANGEROUS_TARGET=${DANGEROUS_OVERRIDE} if you truly mean to seed it.`,
    )
  }

  if (LIVE_DB_HOST_RE.test(host)) {
    throw new Error(
      `✋ Refusing to seed: the database URL points at '${host}', which is a live/shared ` +
        'Supabase database. Under D16 the fleet operates on staging, so seeding it would ' +
        'inject sample data and the well-known PIN 123456 into real accounts. ' +
        `If you REALLY mean to seed '${host}', re-run with AHITS_DANGEROUS_TARGET=${DANGEROUS_OVERRIDE}.`,
    )
  }
}

async function main() {
  // Safety: this seed creates sample data and well-known accounts. Refuse to
  // run against a production environment unless explicitly overridden.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== '1') {
    throw new Error(
      '✋ Refusing to seed: NODE_ENV=production. The seed creates sample data and ' +
        'default accounts. If you really intend to seed production, set ALLOW_PROD_SEED=1.',
    )
  }

  // CC-30 / D16: NODE_ENV is not the fence that matters. A laptop with a
  // staging-pointed .env has NODE_ENV unset (i.e. not 'production'), so the check
  // above passes and this seed cheerfully upserts ops@agricarbon.com and two
  // operators with the well-known PIN 123456 into the LIVE FLEET's database.
  // Under D16 staging is home, so gate on WHERE the connection points, not on a
  // label. PrismaClient has already loaded .env by the time this module runs, so
  // reading process.env here sees the same URL Prisma will actually connect to.
  assertNotLiveDatabase()

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
