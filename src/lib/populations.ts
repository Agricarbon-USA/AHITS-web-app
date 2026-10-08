import { Prisma } from '@prisma/client'

/**
 * One definition per population. Every count, filter and picker reads its
 * population from here rather than re-spelling the rule — "available" meaning
 * three different things on three screens is RC-3 in the 2026-10-05 screening.
 *
 * PR-2 ("One vocabulary for numbers"): the Prisma `where` fragments below and,
 * where raw SQL needs the same rule, their SQL twins. A twin is built FROM the
 * fragment's constants (never a re-typed literal), so widening a constant here
 * reaches the raw queries too. The only "today" is `businessDate()` in
 * `src/lib/business-date.ts` — there is deliberately no date fragment here.
 *
 * Server-only: the SQL twins import the runtime `Prisma` namespace.
 */

/**
 * The unit statuses a picker may offer — i.e. the ones the server will accept on
 * a kit/reservation write.
 *
 * **AVAILABLE and IN_TRANSIT ("Returning") — D-e, D-n.** A returned unit the hub
 * has not yet confirmed can go straight back out; picking it completes its open
 * HUB_RETURN link, so the hub never needs to confirm gear that has already left
 * again. Widened in PR-3a in the same commit as `pickUnit`
 * (`src/lib/asset-status.ts`), the one write path that accepts it — so no picker
 * ever offers a unit the server would refuse. Until then it was AVAILABLE only.
 */
export const PICKABLE_STATUSES = ['AVAILABLE', 'IN_TRANSIT'] as const

export type PickableStatus = (typeof PICKABLE_STATUSES)[number]

/** A unit that exists and is in circulation: not soft-deleted, not retired. */
export const ACTIVE_UNIT = { deletedAt: null, status: { not: 'RETIRED' as const } }

/** A unit a picker may offer (D-n). */
export const PICKABLE_UNIT = { ...ACTIVE_UNIT, status: { in: [...PICKABLE_STATUSES] } }

/** A kit line still on a deployment that has not ended. */
export const LIVE_KIT_ITEM = { removedAt: null, kit: { rig: { endedAt: null } } }

/** A maintenance task that is still open: not soft-deleted, not completed. */
export const OPEN_TASK = { deletedAt: null, status: { not: 'COMPLETED' as const } }

/** A vehicle in the fleet: not soft-deleted, not retired. */
export const LIVE_VEHICLE = { deletedAt: null, status: { not: 'RETIRED' as const } }

/** An item that is still carried: not soft-deleted, not retired (D-a). */
export const LIVE_ITEM = { deletedAt: null, status: { not: 'RETIRED' as const } }

export const ACTIVE_HUB = { isActive: true }

export const ACTIVE_USER = { isActive: true }

export const OPEN_ALERT = { resolved: false }

// ── SQL twins ──────────────────────────────────────────────────────────────
// For `$queryRaw` reads. Each takes the table alias the caller used, and is
// built from the constants above so the two can never disagree.

/** `PICKABLE_UNIT` for raw SQL, e.g. `WHERE ${pickableUnitSql('u')}`. */
export function pickableUnitSql(alias: string): Prisma.Sql {
  const a = Prisma.raw(`"${alias}"`)
  return Prisma.sql`${a}."deletedAt" IS NULL AND ${a}."status"::text IN (${Prisma.join([...PICKABLE_STATUSES])})`
}

/** `LIVE_ITEM` for raw SQL. */
export function liveItemSql(alias: string): Prisma.Sql {
  const a = Prisma.raw(`"${alias}"`)
  return Prisma.sql`${a}."deletedAt" IS NULL AND ${a}."status"::text <> 'RETIRED'`
}

/** `ACTIVE_HUB` for raw SQL. */
export function activeHubSql(alias: string): Prisma.Sql {
  const a = Prisma.raw(`"${alias}"`)
  return Prisma.sql`${a}."isActive" = true`
}
