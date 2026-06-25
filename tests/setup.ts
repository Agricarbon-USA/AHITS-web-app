/// <reference types="vitest/globals" />
import { prisma } from '../src/lib/prisma'

// ── SAFETY GUARD (defense in depth) ─────────────────────────────────────────
// This file's afterEach() deletes every row in every table. If the configured
// database is ever a production/remote one, that would erase live data. Before
// importing Prisma or registering any hook, we assert the target database is a
// dedicated test database. This guard complements the one in vitest.config.ts:
// even if the config is bypassed (e.g. running vitest directly with a bad env),
// the destructive hooks will refuse to run against anything that isn't clearly
// a test database.
function assertSafeTestDatabase(rawUrl: string | undefined): void {
  if (!rawUrl) {
    throw new Error(
      'DATABASE_URL is not set for the test run. Aborting — the test suite is ' +
        'destructive and must only run against a dedicated test database.',
    )
  }

  let host: string
  let dbName: string
  try {
    const parsed = new URL(rawUrl)
    host = parsed.hostname
    dbName = parsed.pathname.replace(/^\//, '').split('?')[0]!
  } catch {
    throw new Error('DATABASE_URL for the test run is not a valid URL. Aborting.')
  }

  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const nameLooksLikeTest = /(^|[._-])test([._-]|$)|test$/i.test(dbName)

  if (!isLocalHost && !nameLooksLikeTest) {
    // Note: host + db name only — credentials are never logged.
    throw new Error(
      `✋ Refusing to run destructive tests against "${host}/${dbName}".\n` +
        'The test database must be local (localhost/127.0.0.1) or have a name ' +
        'containing "test". This guard exists to prevent accidentally wiping ' +
        'production data. Run `make test-prepare` to start the local test DB.',
    )
  }
}

// Runs at module load — before any hook is registered or query is issued.
assertSafeTestDatabase(process.env.DATABASE_URL)

afterEach(async () => {
  await prisma.idempotencyKey.deleteMany()
  await prisma.rateLimitHit.deleteMany()
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
