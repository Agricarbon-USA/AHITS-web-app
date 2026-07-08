import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { endAssignmentByRole, ensureOpenAssignment , getActivePrimaryForRig } from '@/lib/deployment-assignments'
import type { PrismaClient } from '@prisma/client'

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export type HandoffStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'

export interface HandoffRow {
  id: string
  rigId: string
  fromOperatorId: string
  toOperatorId: string
  initiatedById: string
  status: HandoffStatus
  note: string
  responseNote: string | null
  respondedAt: Date | null
  createdAt: Date
  updatedAt: Date
  fromOperatorName: string | null
  toOperatorName: string | null
  initiatedByName: string | null
}

/** Atomically reassign a deployment's PRIMARY operator (call inside a transaction). */
export async function reassignPrimary(
  tx: Tx,
  rig: { id: string; operatorId: string },
  toOperatorId: string,
  actorId: string,
  note: string,
): Promise<void> {
  // W0-10 PR-1: end the CURRENT open PRIMARY (roster) with legacy fallback.
  const currentPrimary = (await getActivePrimaryForRig(rig.id, tx)) ?? rig.operatorId
  await endAssignmentByRole(rig.id, currentPrimary, 'PRIMARY', tx)
  await ensureOpenAssignment({ rigId: rig.id, operatorId: toOperatorId, role: 'PRIMARY', addedById: actorId, note }, tx)
  await tx.rig.update({ where: { id: rig.id }, data: { operatorId: toOperatorId } })
  const rvs = await tx.rigVehicle.findMany({ where: { rigId: rig.id, removedAt: null }, select: { vehicleId: true } })
  if (rvs.length) {
    await tx.vehicle.updateMany({ where: { id: { in: rvs.map((v) => v.vehicleId) } }, data: { assignedOperatorId: toOperatorId } })
  }
}

export async function createHandoff(input: {
  rigId: string
  fromOperatorId: string
  toOperatorId: string
  initiatedById: string
  note: string
  status?: HandoffStatus
  respondedAt?: Date | null
}): Promise<string> {
  const id = randomUUID()
  const status = input.status ?? 'PENDING'
  const respondedAt = input.respondedAt ?? null
  await prisma.$executeRaw`
    INSERT INTO "deployment_handoffs"
      ("id", "rigId", "fromOperatorId", "toOperatorId", "initiatedById", "status", "note", "respondedAt")
    VALUES
      (${id}, ${input.rigId}, ${input.fromOperatorId}, ${input.toOperatorId}, ${input.initiatedById},
       ${status}::"DeploymentHandoffStatus", ${input.note}, ${respondedAt})`
  return id
}

export async function getHandoff(id: string): Promise<HandoffRow | null> {
  const rows = await prisma.$queryRaw<HandoffRow[]>`
    SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
           h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
           h."createdAt", h."updatedAt",
           f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
    FROM "deployment_handoffs" h
    LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
    LEFT JOIN "users" t ON t."id" = h."toOperatorId"
    LEFT JOIN "users" i ON i."id" = h."initiatedById"
    WHERE h."id" = ${id}`
  return rows[0] ?? null
}

export async function listHandoffs(opts: {
  userId: string
  role: string
  direction?: string | null
  status?: string | null
}): Promise<HandoffRow[]> {
  const { userId, role, direction, status } = opts
  const isAdmin = role === 'ADMIN'

  if (isAdmin && !direction) {
    if (status) {
      return prisma.$queryRaw<HandoffRow[]>`
        SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
               h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
               h."createdAt", h."updatedAt",
               f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
        FROM "deployment_handoffs" h
        LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
        LEFT JOIN "users" t ON t."id" = h."toOperatorId"
        LEFT JOIN "users" i ON i."id" = h."initiatedById"
        WHERE h."status"::text = ${status}
        ORDER BY h."createdAt" DESC`
    }
    return prisma.$queryRaw<HandoffRow[]>`
      SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
             h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
             h."createdAt", h."updatedAt",
             f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
      FROM "deployment_handoffs" h
      LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
      LEFT JOIN "users" t ON t."id" = h."toOperatorId"
      LEFT JOIN "users" i ON i."id" = h."initiatedById"
      ORDER BY h."createdAt" DESC`
  }

  if (direction === 'incoming') {
    if (status) {
      return prisma.$queryRaw<HandoffRow[]>`
        SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
               h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
               h."createdAt", h."updatedAt",
               f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
        FROM "deployment_handoffs" h
        LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
        LEFT JOIN "users" t ON t."id" = h."toOperatorId"
        LEFT JOIN "users" i ON i."id" = h."initiatedById"
        WHERE h."toOperatorId" = ${userId} AND h."status"::text = ${status}
        ORDER BY h."createdAt" DESC`
    }
    return prisma.$queryRaw<HandoffRow[]>`
      SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
             h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
             h."createdAt", h."updatedAt",
             f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
      FROM "deployment_handoffs" h
      LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
      LEFT JOIN "users" t ON t."id" = h."toOperatorId"
      LEFT JOIN "users" i ON i."id" = h."initiatedById"
      WHERE h."toOperatorId" = ${userId}
      ORDER BY h."createdAt" DESC`
  }

  if (direction === 'outgoing') {
    if (status) {
      return prisma.$queryRaw<HandoffRow[]>`
        SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
               h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
               h."createdAt", h."updatedAt",
               f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
        FROM "deployment_handoffs" h
        LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
        LEFT JOIN "users" t ON t."id" = h."toOperatorId"
        LEFT JOIN "users" i ON i."id" = h."initiatedById"
        WHERE h."initiatedById" = ${userId} AND h."status"::text = ${status}
        ORDER BY h."createdAt" DESC`
    }
    return prisma.$queryRaw<HandoffRow[]>`
      SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
             h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
             h."createdAt", h."updatedAt",
             f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
      FROM "deployment_handoffs" h
      LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
      LEFT JOIN "users" t ON t."id" = h."toOperatorId"
      LEFT JOIN "users" i ON i."id" = h."initiatedById"
      WHERE h."initiatedById" = ${userId}
      ORDER BY h."createdAt" DESC`
  }

  // No direction: show both sides (non-admin or admin with explicit no direction)
  if (status) {
    return prisma.$queryRaw<HandoffRow[]>`
      SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
             h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
             h."createdAt", h."updatedAt",
             f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
      FROM "deployment_handoffs" h
      LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
      LEFT JOIN "users" t ON t."id" = h."toOperatorId"
      LEFT JOIN "users" i ON i."id" = h."initiatedById"
      WHERE (h."toOperatorId" = ${userId} OR h."initiatedById" = ${userId}) AND h."status"::text = ${status}
      ORDER BY h."createdAt" DESC`
  }
  return prisma.$queryRaw<HandoffRow[]>`
    SELECT h."id", h."rigId", h."fromOperatorId", h."toOperatorId", h."initiatedById",
           h."status"::text AS "status", h."note", h."responseNote", h."respondedAt",
           h."createdAt", h."updatedAt",
           f."name" AS "fromOperatorName", t."name" AS "toOperatorName", i."name" AS "initiatedByName"
    FROM "deployment_handoffs" h
    LEFT JOIN "users" f ON f."id" = h."fromOperatorId"
    LEFT JOIN "users" t ON t."id" = h."toOperatorId"
    LEFT JOIN "users" i ON i."id" = h."initiatedById"
    WHERE h."toOperatorId" = ${userId} OR h."initiatedById" = ${userId}
    ORDER BY h."createdAt" DESC`
}
