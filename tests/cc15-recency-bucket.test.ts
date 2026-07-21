import { describe, it, expect } from 'vitest'
import { recencyBucket, businessDayDiff, dbDateToBusinessDate } from '@/lib/deployment-map'

// CC-15 (D2): the admin map colours each rig's pin by how stale its latest GPS-bearing
// daily check is — businessDate-aware (FND-7) so the buckets never inherit the UTC skew.
describe('CC-15 recency bucketing (businessDate boundaries)', () => {
  const TODAY = '2026-07-20'

  it('checked today → fresh (green, <24h)', () => {
    expect(recencyBucket('2026-07-20', TODAY)).toBe('fresh')
  })

  it('checked yesterday → aging (amber, 24–48h)', () => {
    expect(recencyBucket('2026-07-19', TODAY)).toBe('aging')
  })

  it('the 48h boundary: two business days ago → stale (red, >48h)', () => {
    expect(recencyBucket('2026-07-18', TODAY)).toBe('stale')
  })

  it('older still → stale', () => {
    expect(recencyBucket('2026-07-01', TODAY)).toBe('stale')
  })

  it('a future-dated check (queued-replay clock skew) is fresh, never stale', () => {
    expect(recencyBucket('2026-07-21', TODAY)).toBe('fresh')
  })

  it('crosses a month boundary correctly (Jul 1 vs Jun 30 = 1 day = aging)', () => {
    expect(recencyBucket('2026-06-30', '2026-07-01')).toBe('aging')
  })

  it('businessDayDiff counts whole days both directions', () => {
    expect(businessDayDiff('2026-07-18', '2026-07-20')).toBe(2)
    expect(businessDayDiff('2026-07-20', '2026-07-20')).toBe(0)
    expect(businessDayDiff('2026-07-21', '2026-07-20')).toBe(-1)
  })

  it('FND-7 guard: an evening check stored as a @db.Date recovers its business date in UTC', () => {
    // The POST stores businessDate() as UTC midnight of the business day; reading it back
    // in UTC (not Central) recovers the same YYYY-MM-DD it was filed under.
    const stored = new Date('2026-07-20T00:00:00.000Z') // what Prisma returns for @db.Date
    expect(dbDateToBusinessDate(stored)).toBe('2026-07-20')
    expect(recencyBucket(dbDateToBusinessDate(stored), '2026-07-20')).toBe('fresh')
  })
})
