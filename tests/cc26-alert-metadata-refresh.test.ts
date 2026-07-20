import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { createAlert, resolveActiveAlert } from '../src/lib/alerts'

// CC-26: the re-raise semantics behind the failed-check deep-link. createAlert dedups on
// (type, sourceTable, sourceId) while unresolved; CC-26 changed its update branch to
// REFRESH metadata (so the link points at the LATEST check) while leaving notifiedAt
// untouched (so a re-raise does NOT re-notify). This is the one acceptance criterion the
// component test can't cover: "a re-raised check alert points at the latest check, not
// the first."

describe('CC-26 alert metadata refresh on re-raise', () => {
  it('refreshes metadata to the latest check while keeping a single unresolved alert', async () => {
    const sourceId = `veh-${Date.now()}-a`
    await createAlert('DAILY_CHECK_FAILED', 'vehicles', sourceId, { checkId: 'check-1', issues: 'first' })
    await createAlert('DAILY_CHECK_FAILED', 'vehicles', sourceId, { checkId: 'check-2', issues: 'second' })

    const alerts = await prisma.alert.findMany({
      where: { type: 'DAILY_CHECK_FAILED', sourceId, resolved: false },
    })
    expect(alerts).toHaveLength(1) // dedup preserved — still one unresolved alert
    expect((alerts[0].metadata as { checkId?: string }).checkId).toBe('check-2') // latest wins

    await resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', sourceId)
  })

  it('does not re-notify on re-raise (notifiedAt preserved) but still refreshes metadata', async () => {
    const sourceId = `veh-${Date.now()}-b`
    const first = await createAlert('DAILY_CHECK_FAILED', 'vehicles', sourceId, { checkId: 'c1' })
    const stamped = new Date('2026-07-19T12:00:00Z')
    await prisma.alert.update({ where: { id: first.id }, data: { notifiedAt: stamped } })

    await createAlert('DAILY_CHECK_FAILED', 'vehicles', sourceId, { checkId: 'c2' })

    const after = await prisma.alert.findUnique({ where: { id: first.id } })
    expect(after!.notifiedAt?.getTime()).toBe(stamped.getTime()) // untouched → not re-notified
    expect((after!.metadata as { checkId?: string }).checkId).toBe('c2') // metadata still refreshed

    await resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', sourceId)
  })
})
