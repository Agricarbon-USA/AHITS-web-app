'use client'

import * as React from 'react'
import { Stack, TextField, MenuItem } from '@mui/material'

export interface RentalVehicleFields {
  name: string
  type: string
  rentalMake?: string
  rentalModel?: string
  rentalYear?: string
  rentalLength?: string
  rentalAgreementUrl?: string
  rentalPickupLocation?: string
  rentalDropoffLocation?: string
}

const VEHICLE_TYPES = [
  'TRUCK', 'TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV', 'CHRISTIE_DRILL', 'ATV', 'OTHER',
]

interface RentalVehicleFormProps {
  value: Partial<RentalVehicleFields>
  onChange: (v: Partial<RentalVehicleFields>) => void
  disabled?: boolean
}

export function RentalVehicleForm({ value, onChange, disabled = false }: RentalVehicleFormProps) {
  function set(patch: Partial<RentalVehicleFields>) {
    onChange({ ...value, ...patch })
  }

  return (
    <Stack spacing={2}>
      <TextField
        label="Vehicle name / identifier"
        value={value.name ?? ''}
        onChange={(e) => set({ name: e.target.value })}
        disabled={disabled}
        required
        fullWidth
      />
      <TextField
        select
        label="Type"
        value={value.type ?? ''}
        onChange={(e) => set({ type: e.target.value })}
        disabled={disabled}
        required
        fullWidth
      >
        {VEHICLE_TYPES.map((t) => (
          <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>
        ))}
      </TextField>
      <TextField
        label="Make"
        value={value.rentalMake ?? ''}
        onChange={(e) => set({ rentalMake: e.target.value })}
        disabled={disabled}
        fullWidth
      />
      <TextField
        label="Model"
        value={value.rentalModel ?? ''}
        onChange={(e) => set({ rentalModel: e.target.value })}
        disabled={disabled}
        fullWidth
      />
      <TextField
        label="Year"
        value={value.rentalYear ?? ''}
        onChange={(e) => set({ rentalYear: e.target.value })}
        disabled={disabled}
        fullWidth
        inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
      />
      <TextField
        label="Length (ft)"
        value={value.rentalLength ?? ''}
        onChange={(e) => set({ rentalLength: e.target.value })}
        disabled={disabled}
        fullWidth
      />
      <TextField
        label="Rental agreement URL"
        value={value.rentalAgreementUrl ?? ''}
        onChange={(e) => set({ rentalAgreementUrl: e.target.value })}
        disabled={disabled}
        fullWidth
      />
      <TextField
        label="Pickup location"
        value={value.rentalPickupLocation ?? ''}
        onChange={(e) => set({ rentalPickupLocation: e.target.value })}
        disabled={disabled}
        fullWidth
      />
      <TextField
        label="Dropoff location"
        value={value.rentalDropoffLocation ?? ''}
        onChange={(e) => set({ rentalDropoffLocation: e.target.value })}
        disabled={disabled}
        fullWidth
      />
    </Stack>
  )
}
