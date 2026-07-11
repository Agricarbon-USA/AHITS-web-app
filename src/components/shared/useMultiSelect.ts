'use client'

import * as React from 'react'

export interface MultiSelectState {
  selected: Set<string>
  count: number
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  toggleAll: (ids: string[]) => void
  clear: () => void
  allSelected: (ids: string[]) => boolean
}

/**
 * Reusable multi-select state for list views. Tracks a Set of string ids and
 * exposes helpers for row-level and select-all toggles. First consumer: Hubs
 * Inbound. Designed so the operator kit card can adopt the same hook later.
 */
export function useMultiSelect(): MultiSelectState {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const isSelected = React.useCallback((id: string) => selected.has(id), [selected])

  const toggle = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleAll = React.useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allIn = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allIn) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }, [])

  const clear = React.useCallback(() => setSelected(new Set()), [])

  const allSelected = React.useCallback(
    (ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id)),
    [selected],
  )

  return { selected, count: selected.size, isSelected, toggle, toggleAll, clear, allSelected }
}
