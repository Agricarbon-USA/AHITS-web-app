import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // FND-28 review: interactive transactions (bulk item disposition / end-of-
    // deployment) do several writes per item — now including an in-band alert
    // upsert. Give them headroom above Prisma's default 5s so a large batch on a
    // cold Cloud Run DB connection can't trip P2028 and fail the whole operation.
    transactionOptions: { maxWait: 5_000, timeout: 15_000 },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
