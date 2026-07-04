import { describe, it, expect } from 'vitest'
import { stockAvailabilityLabel } from '../src/lib/stock-format'

describe('stockAvailabilityLabel (UR-010 U3 visibility)', () => {
  it('shows the reserved breakdown when a hub has a live reserve', () => {
    expect(stockAvailabilityLabel({ quantity: 8, reservedQty: 3, available: 5 }, 0)).toBe('5 available · 3 reserved')
  })

  it('shows just the available count when nothing is reserved', () => {
    expect(stockAvailabilityLabel({ quantity: 8, reservedQty: 0, available: 8 }, 0)).toBe('8 avail.')
  })

  it('falls back to the cross-hub total when no hub row is present', () => {
    expect(stockAvailabilityLabel(null, 12)).toBe('12 avail.')
    expect(stockAvailabilityLabel(undefined, 7)).toBe('7 avail.')
  })

  it('never renders a negative fallback', () => {
    expect(stockAvailabilityLabel(null, -3)).toBe('0 avail.')
  })

  it('reflects a fully-reserved hub (0 available, all reserved)', () => {
    expect(stockAvailabilityLabel({ quantity: 4, reservedQty: 4, available: 0 }, 0)).toBe('0 available · 4 reserved')
  })
})
