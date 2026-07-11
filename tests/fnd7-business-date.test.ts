import { describe, it, expect } from 'vitest'
import { businessDate, businessDateTime } from '../src/lib/business-date'

// FND-7: the business date must be the APP_TIMEZONE (Central) calendar day, not
// the UTC day. The bug observed live: a check submitted at 11:49pm Central was
// dated "tomorrow" because the client used new Date().toISOString().slice(0,10)
// (UTC), which trips a false DAILY_CHECK_MISSED alert and mis-keys the
// (vehicleId, date, operatorId) unique row.

const TZ = 'America/Chicago'

describe('FND-7 businessDate — APP_TIMEZONE calendar day, not UTC', () => {
  it('an evening Central instant that is already tomorrow in UTC keeps the Central date', () => {
    // 11:49pm Central on Jul 2 == 04:49 UTC on Jul 3.
    const evening = new Date('2026-07-03T04:49:00Z')
    expect(evening.toISOString().slice(0, 10)).toBe('2026-07-03') // the old (buggy) client value
    expect(businessDate(evening, TZ)).toBe('2026-07-02') // the corrected value
  })

  it('businessDateTime returns the Central date plus wall-clock hour/minute', () => {
    const evening = new Date('2026-07-03T04:49:00Z')
    expect(businessDateTime(evening, TZ)).toEqual({ date: '2026-07-02', hour: 23, minute: 49 })
  })

  it('a daytime instant (no UTC rollover) is unchanged', () => {
    const morning = new Date('2026-07-02T15:00:00Z') // 10am Central
    expect(businessDate(morning, TZ)).toBe('2026-07-02')
    expect(businessDateTime(morning, TZ).hour).toBe(10)
  })

  it('handles the winter (CST, UTC-6) boundary as well as summer (CDT, UTC-5)', () => {
    // 6:30pm Central on Jan 15 (CST) == 00:30 UTC Jan 16.
    const winterEvening = new Date('2026-01-16T00:30:00Z')
    expect(winterEvening.toISOString().slice(0, 10)).toBe('2026-01-16')
    expect(businessDate(winterEvening, TZ)).toBe('2026-01-15')
  })
})
