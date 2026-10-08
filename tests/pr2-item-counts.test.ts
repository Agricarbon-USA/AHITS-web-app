// PR-2 (RC-3): one vocabulary for an item's numbers — `tally` and `itemCounts`.
//
// Pure: no database. (It runs inside the node suite, whose setup wipes tables
// after each test; nothing here touches them.) Closes B3 / C-6 / C-7 / C-10 at
// the helper level: totals exclude retired, IN_TRANSIT has a bucket, consumable
// Out is the on-rig quantity, and a legacy consumable keeps its stored count.
import { describe, it, expect } from 'vitest'
import { EquipmentStatus } from '@prisma/client'
import { tally, itemCounts, isLiveKitLine, computeUnitCounts, type StatusTally } from '../src/lib/inventory'
import { PICKABLE_STATUSES } from '../src/lib/populations'

// Compile-time exhaustiveness: if a status is added to the enum and not to
// `tally`, this line stops type-checking (and `npm run type-check` fails in CI).
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const exhaustive: Exact<keyof StatusTally, EquipmentStatus> = true

const units = (...statuses: string[]) => statuses.map((status) => ({ status }))

describe('tally', () => {
  it('has a bucket for every EquipmentStatus — none can vanish from a count', () => {
    expect(exhaustive).toBe(true)
    expect(Object.keys(tally([]).byStatus).sort()).toEqual(Object.values(EquipmentStatus).sort())
  })

  // PR-3a widened PICKABLE_STATUSES with `pickUnit` (D-n): a Returning unit is pickable.
  it('counts IN_TRANSIT in its own bucket, as active and — since PR-3a — pickable (D-e, D-n)', () => {
    const t = tally(units('AVAILABLE', 'IN_TRANSIT', 'IN_TRANSIT', 'RETIRED'))
    expect(t.byStatus.IN_TRANSIT).toBe(2)
    expect(t.total).toBe(4)
    expect(t.retired).toBe(1)
    expect(t.active).toBe(3)
    expect(t.pickable).toBe(3)
    expect([...PICKABLE_STATUSES]).toEqual(['AVAILABLE', 'IN_TRANSIT'])
  })

  it('computeUnitCounts reads from tally, IN_TRANSIT included', () => {
    expect(computeUnitCounts(units('IN_TRANSIT', 'CHECKED_OUT'))).toMatchObject({ totalUnits: 2, inTransit: 1, checkedOut: 1 })
  })
})

describe('itemCounts — serialized', () => {
  // B3's acceptance was 11 · 0 · 14 in PR-2; from PR-3a the Returning unit is pickable, so 12.
  it('Manual Corer: 12 available (11 on the shelf + 1 Returning) · 0 out · 14 owned, 1 retired (B3)', () => {
    const c = itemCounts({
      itemType: 'SERIALIZED',
      quantity: 999, // the stored column is never read for serialized items
      units: units(
        ...Array(11).fill('AVAILABLE'),
        'IN_MAINTENANCE', 'INOPERABLE', 'IN_TRANSIT',
        'RETIRED',
      ),
    })
    expect(c).toEqual({
      owned: 14, onHand: 14, available: 12, reserved: 0, out: 0,
      inMaintenance: 1, inoperable: 1, inTransit: 1, retired: 1,
    })
  })

  it('out is CHECKED_OUT and is not on hand', () => {
    const c = itemCounts({ itemType: 'SERIALIZED', quantity: 0, units: units('CHECKED_OUT', 'CHECKED_OUT', 'AVAILABLE') })
    expect(c.out).toBe(2)
    expect(c.onHand).toBe(1)
    expect(c.owned).toBe(3)
  })
})

describe('itemCounts — consumable', () => {
  const stock = [
    { quantity: 30, reservedQty: 5, available: 25 },
    { quantity: 10, reservedQty: 0, available: 10 },
  ]

  it('on hand from stock rows, out from live kit lines (C-7)', () => {
    const c = itemCounts({
      itemType: 'CONSUMABLE',
      quantity: 0,
      stockRows: stock,
      liveKitLines: [
        { quantity: 6, drawnQuantity: 6, drawnHubId: 'h1' },
        { quantity: 4, drawnQuantity: 3, drawnHubId: 'h2' }, // drawn 3 of 4: 3 left the shelf
      ],
    })
    expect(c).toEqual({
      owned: 49, onHand: 40, available: 35, reserved: 5, out: 9,
      inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0,
    })
  })

  it('a kit line with no drawnHubId predates per-hub draws and counts its quantity', () => {
    const c = itemCounts({ itemType: 'CONSUMABLE', quantity: 0, stockRows: stock, liveKitLines: [{ quantity: 7, drawnQuantity: 0, drawnHubId: null }] })
    expect(c.out).toBe(7)
  })

  it('legacy fallback: no stock rows → the stored quantity is on hand, not zero', () => {
    const c = itemCounts({ itemType: 'CONSUMABLE', quantity: 12, stockRows: [] })
    expect(c.onHand).toBe(12)
    expect(c.available).toBe(12)
    expect(c.owned).toBe(12)
  })
})

describe('isLiveKitLine (LIVE_KIT_ITEM in memory)', () => {
  it('live only when not removed and the rig has not ended', () => {
    expect(isLiveKitLine({ removedAt: null, kit: { rig: { endedAt: null } } })).toBe(true)
    expect(isLiveKitLine({ removedAt: new Date(), kit: { rig: { endedAt: null } } })).toBe(false)
    expect(isLiveKitLine({ removedAt: null, kit: { rig: { endedAt: new Date() } } })).toBe(false)
    expect(isLiveKitLine({ removedAt: null, kit: { rig: null } })).toBe(false)
  })
})
