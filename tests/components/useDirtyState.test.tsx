import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { useDirtyState, serialize } from '@/hooks/useDirtyState'

// UXP-6 (6a): snapshot-on-open dirty tracking that feeds EntityFormDialog's
// "Discard changes?" guard.

describe('useDirtyState — snapshot on open', () => {
  it('is clean right after opening and dirty once a value changes', () => {
    const { result, rerender } = renderHook(
      ({ open, values }: { open: boolean; values: { name: string; qty: number } }) => useDirtyState(open, values),
      { initialProps: { open: true, values: { name: 'Truck 1', qty: 1 } } },
    )
    expect(result.current).toBe(false)

    rerender({ open: true, values: { name: 'Truck 1', qty: 1 } }) // new object, same content
    expect(result.current).toBe(false)

    rerender({ open: true, values: { name: 'Truck 12', qty: 1 } })
    expect(result.current).toBe(true)

    rerender({ open: true, values: { name: 'Truck 1', qty: 1 } }) // typed back to the original
    expect(result.current).toBe(false)
  })

  it('re-snapshots on each open transition and reports false while closed', () => {
    const { result, rerender } = renderHook(
      ({ open, values }: { open: boolean; values: { name: string } }) => useDirtyState(open, values),
      { initialProps: { open: false, values: { name: '' } } },
    )
    expect(result.current).toBe(false)

    // Open with the reset values (the click handler reset state before opening).
    rerender({ open: true, values: { name: 'Sample bags' } })
    expect(result.current).toBe(false)
    rerender({ open: true, values: { name: 'Sample bags (copy)' } })
    expect(result.current).toBe(true)

    // Close: never dirty while closed, even with edited values still in state.
    rerender({ open: false, values: { name: 'Sample bags (copy)' } })
    expect(result.current).toBe(false)

    // Re-open with the edited values already in place → that is the new baseline.
    rerender({ open: true, values: { name: 'Sample bags (copy)' } })
    expect(result.current).toBe(false)
  })

  it('treats Set and Map contents as values (the deployment builder picks)', () => {
    const { result, rerender } = renderHook(
      ({ picks }: { picks: { vehicles: Set<string>; kit: Map<string, number> } }) => useDirtyState(true, picks),
      { initialProps: { picks: { vehicles: new Set(['v1']), kit: new Map([['i1', 2]]) } } },
    )
    expect(result.current).toBe(false)
    rerender({ picks: { vehicles: new Set(['v1', 'v2']), kit: new Map([['i1', 2]]) } })
    expect(result.current).toBe(true)
    rerender({ picks: { vehicles: new Set(['v1']), kit: new Map([['i1', 3]]) } })
    expect(result.current).toBe(true)
    rerender({ picks: { vehicles: new Set(['v1']), kit: new Map([['i1', 2]]) } })
    expect(result.current).toBe(false)
  })

  it('with explicit initialValues compares against them regardless of reset timing', () => {
    // Simulates the ItemFormDialog pattern: state is reset in an effect AFTER open.
    function Harness({ item }: { item: { name: string } }) {
      const [name, setName] = React.useState('')
      React.useEffect(() => { setName(item.name) }, [item])
      const dirty = useDirtyState(true, { name }, { name: item.name })
      return { dirty, setName }
    }
    const { result } = renderHook(({ item }) => Harness({ item }), { initialProps: { item: { name: 'GPS unit' } } })
    // After the effect lands the form equals the entity → clean.
    expect(result.current.dirty).toBe(false)
    act(() => result.current.setName('GPS unit 2'))
    expect(result.current.dirty).toBe(true)
    act(() => result.current.setName('GPS unit'))
    expect(result.current.dirty).toBe(false)
  })
})

describe('serialize', () => {
  it('is stable for equal content and distinguishes Set/Map contents', () => {
    expect(serialize({ a: new Set([1, 2]) })).toBe(serialize({ a: new Set([1, 2]) }))
    expect(serialize({ a: new Set([1, 2]) })).not.toBe(serialize({ a: new Set([2, 1]) }))
    expect(serialize(new Map([['k', 1]]))).toBe('[["k",1]]')
    expect(serialize(undefined)).toBe('undefined')
  })
})
