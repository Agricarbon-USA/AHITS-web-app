'use client'

import * as React from 'react'
import { Stack, Box, Typography, Checkbox, TextField } from '@mui/material'
import { StatusChip } from '@/components/shared/StatusChip'

// Canonical entry type for the admin deployment/add-items kit builders.
// UXP-6 (6d): entries carry `itemName` so a 409 recovery can say WHICH pick was
// dropped ("Unit 3 of Corer was taken") and the review step can list the picks.
export type AdminKitEntry =
  | { inventoryItemId: string; itemType: 'CONSUMABLE'; quantity: number; itemName: string }
  | { inventoryItemId: string; itemType: 'SERIALIZED'; inventoryUnitId: string; unitLabel: string; itemName: string }

/** The label a unit shows everywhere in the admin builders: its serial, else the API's position. */
export function unitLabel(u: { serialNumber: string | null; position: number }): string {
  return u.serialNumber ?? `Unit ${u.position}`
}

export interface SelectableItem {
  id: string
  name: string
  itemType: 'CONSUMABLE' | 'SERIALIZED'
  category?: { name: string } | null
  availableUnits: { id: string; serialNumber: string | null; position: number }[]
}

/**
 * One selectable kit item — a serialized item renders a checkbox per available
 * unit; a consumable renders one checkbox + a quantity field. Shared by the
 * admin "New Deployment" and "Add Items" builders, which previously carried two
 * near-identical copies of this block (UX-5). The map of current selections is
 * keyed by unit id (serialized) or item id (consumable).
 */
export function KitItemSelectRow({
  item,
  selected,
  onChange,
  showCategoryChip = false,
}: {
  item: SelectableItem
  selected: Map<string, AdminKitEntry>
  onChange: (next: Map<string, AdminKitEntry>) => void
  showCategoryChip?: boolean
}) {
  if (item.itemType === 'SERIALIZED') {
    return (
      <Stack spacing={0.25}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box flexGrow={1}>
            <Typography variant="body2" fontWeight={500}>{item.name}</Typography>
            <Stack direction="row" spacing={0.5}>
              {showCategoryChip && (
                <StatusChip label={item.category?.name ?? ''} />
              )}
              <StatusChip label="Serialized" variant="outlined" color="primary" />
            </Stack>
          </Box>
        </Stack>
        <Stack spacing={0} pl={1}>
          {/* T8: `position` is the API's own (position among ALL of the item's units), so
              "Unit 3" here is the same "Unit 3" the inventory drawer shows. */}
          {item.availableUnits.map((u) => (
            <Stack key={u.id} direction="row" alignItems="center" spacing={1}>
              <Checkbox size="small" checked={selected.has(u.id)}
                onChange={(e) => {
                  const m = new Map(selected)
                  if (e.target.checked) {
                    m.set(u.id, { inventoryItemId: item.id, itemType: 'SERIALIZED', inventoryUnitId: u.id, unitLabel: unitLabel(u), itemName: item.name })
                  } else {
                    m.delete(u.id)
                  }
                  onChange(m)
                }} />
              <Typography variant="body2">{unitLabel(u)}</Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
    )
  }

  const entry = selected.get(item.id)
  const checked = !!entry
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Checkbox size="small" checked={checked}
        onChange={(e) => {
          const m = new Map(selected)
          if (e.target.checked) {
            m.set(item.id, { inventoryItemId: item.id, itemType: 'CONSUMABLE', quantity: 1, itemName: item.name })
          } else {
            m.delete(item.id)
          }
          onChange(m)
        }} />
      <Box flexGrow={1}>
        <Typography variant="body2">{item.name}</Typography>
        {showCategoryChip && (
          <StatusChip label={item.category?.name ?? ''} />
        )}
      </Box>
      {checked && (
        <TextField type="number" size="small" value={(entry as { quantity: number }).quantity}
          onChange={(e) => {
            const m = new Map(selected)
            m.set(item.id, { inventoryItemId: item.id, itemType: 'CONSUMABLE', quantity: parseInt(e.target.value) || 1, itemName: item.name })
            onChange(m)
          }}
          inputProps={{ min: 1, style: { MozAppearance: 'textfield', width: 60 } }}
          sx={{ width: 80, '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { display: 'none' } }} />
      )}
    </Stack>
  )
}
