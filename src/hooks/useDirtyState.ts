'use client'

import * as React from 'react'

/**
 * UXP-6 (6a): "has the user changed anything since this form opened?" — the input
 * to EntityFormDialog's `dirty` prop, which turns a backdrop tap / Esc / hardware
 * Back into "Discard changes?" instead of silently dropping 25 fields.
 *
 * Snapshot semantics: the values are serialised on the render where `open` flips
 * false → true (or on mount when already open) and compared by string equality on
 * every render after that. Cheap for the size of form this app has; no deep-equal
 * dependency. `Set`/`Map` values are serialised as arrays so the deployment builder's
 * picks count as changes (plain `JSON.stringify` would collapse both to `{}`).
 *
 * Two ways to call it:
 *  - `useDirtyState(open, values)` — snapshot-on-open. Requires the values to be
 *    ALREADY reset for this open on that first render: initialise state from props
 *    in the `useState` initialiser or in the click handler that opens the dialog,
 *    or remount the dialog with a `key`. A dialog that resets its fields in a
 *    `useEffect([item])` AFTER opening (ItemFormDialog / AccountDialog today) would
 *    read as dirty immediately — use the second form for those.
 *  - `useDirtyState(open, values, initialValues)` — pure comparison against values
 *    the caller derives from the entity (`formStateFor(item)`), no snapshot; robust
 *    to any reset timing.
 *
 * Implemented with React's documented "store information from previous renders"
 * pattern (state adjusted during render) rather than a ref, because the repo's
 * react-hooks lint (`refs`, `set-state-in-effect`) forbids the ref-in-render and
 * setState-in-effect alternatives.
 */
export function useDirtyState<T>(open: boolean, values: T, initialValues?: T): boolean {
  const json = serialize(values)
  const [snap, setSnap] = React.useState<{ open: boolean; json: string | null }>({ open: false, json: null })

  if (snap.open !== open) {
    // Take the snapshot on the open transition (and drop it on close). React
    // re-runs this render immediately with the new state before committing.
    setSnap({ open, json: open ? json : null })
  }

  if (!open) return false
  if (initialValues !== undefined) return serialize(initialValues) !== json
  return snap.json !== null && snap.json !== json
}

/** JSON with Set/Map made comparable (Date already serialises via toJSON). Exported for tests. */
export function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v instanceof Set) return Array.from(v)
    if (v instanceof Map) return Array.from(v.entries())
    return v
  }) ?? 'undefined'
}
