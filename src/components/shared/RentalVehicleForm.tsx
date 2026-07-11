'use client'

import * as React from 'react'
import {
  Stack, TextField, MenuItem, Box, Button, Typography, Switch,
  FormControlLabel, InputAdornment, CircularProgress, Link, IconButton,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import { uploadDocument } from '@/lib/photoStore'
import { VEHICLE_TYPES, vehicleTypeLabel } from '@/lib/vehicle-types'

// NEW-5 Rental Vehicles.
//
// A rental is a Vehicle with `isRental = true` plus the rental metadata block.
// This form collects that metadata in the deployment "Add Rental" flow (operator
// My Deployment + admin Deployments). It owns string-shaped fields for easy
// binding and exposes `rentalFieldsToVehiclePayload()` so every caller posts an
// identical, API-shaped body to POST /api/vehicles.

export interface RentalVehicleFields {
  name: string
  type: string
  year?: string
  makeModel?: string
  rentalCompany?: string
  /** Free-text company when `rentalCompany === 'Other'`. */
  rentalCompanyOther?: string
  rentalAgreementNumber?: string
  rentalAgreementUrl?: string
  rentalStartDate?: string // yyyy-mm-dd
  rentalEndDate?: string // yyyy-mm-dd
  rentalLocation?: string
  rentalOneWay?: boolean
  rentalReturnLocation?: string
  rentalCostAmount?: string
  rentalCostPeriod?: 'DAY' | 'WEEK' | 'MONTH' | 'FLAT'
}

const RENTAL_COMPANIES = ['Enterprise', 'United Rentals', 'Other']

const COST_PERIODS: { value: NonNullable<RentalVehicleFields['rentalCostPeriod']>; label: string }[] = [
  { value: 'DAY', label: '/ day' },
  { value: 'WEEK', label: '/ week' },
  { value: 'MONTH', label: '/ month' },
  { value: 'FLAT', label: 'flat' },
]

/** API-shaped body for POST /api/vehicles from the collected rental fields. */
export function rentalFieldsToVehiclePayload(f: Partial<RentalVehicleFields>) {
  const company =
    f.rentalCompany === 'Other' ? f.rentalCompanyOther?.trim() || undefined : f.rentalCompany || undefined
  const year = f.year && /^\d{4}$/.test(f.year.trim()) ? parseInt(f.year.trim(), 10) : undefined
  const amount =
    f.rentalCostAmount && f.rentalCostAmount.trim() !== '' && !Number.isNaN(Number(f.rentalCostAmount))
      ? Number(f.rentalCostAmount)
      : undefined
  return {
    isRental: true,
    name: f.name?.trim() ?? '',
    type: f.type ?? '',
    year,
    makeModel: f.makeModel?.trim() || undefined,
    location: f.rentalLocation?.trim() || undefined,
    rentalCompany: company,
    rentalAgreementNumber: f.rentalAgreementNumber?.trim() || undefined,
    rentalAgreementUrl: f.rentalAgreementUrl || undefined,
    rentalStartDate: f.rentalStartDate || undefined,
    rentalEndDate: f.rentalEndDate || undefined,
    rentalLocation: f.rentalLocation?.trim() || undefined,
    rentalReturnLocation: f.rentalOneWay ? f.rentalReturnLocation?.trim() || undefined : undefined,
    rentalCostAmount: amount,
    rentalCostPeriod: f.rentalCostPeriod || undefined,
    rentalOneWay: !!f.rentalOneWay,
  }
}

/** Minimum to create the rental vehicle (name + type). Agreement is intentionally
 *  NOT required here — it's non-blocking and flagged until uploaded. */
export function isRentalFormValid(f: Partial<RentalVehicleFields>): boolean {
  return !!f.name?.trim() && !!f.type
}

interface RentalVehicleFormProps {
  value: Partial<RentalVehicleFields>
  onChange: (v: Partial<RentalVehicleFields>) => void
  disabled?: boolean
}

export function RentalVehicleForm({ value, onChange, disabled = false }: RentalVehicleFormProps) {
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)

  function set(patch: Partial<RentalVehicleFields>) {
    onChange({ ...value, ...patch })
  }

  async function handleAgreement(file: File | undefined) {
    if (!file) return
    setUploadError('')
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUploadError('You’re offline — you can attach the agreement later from the rig.')
      return
    }
    setUploading(true)
    try {
      const url = await uploadDocument(file)
      set({ rentalAgreementUrl: url })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const isOther = value.rentalCompany === 'Other'

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
          <MenuItem key={t} value={t}>{vehicleTypeLabel(t)}</MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="Rental company"
        value={value.rentalCompany ?? ''}
        onChange={(e) => set({ rentalCompany: e.target.value })}
        disabled={disabled}
        fullWidth
      >
        {RENTAL_COMPANIES.map((c) => (
          <MenuItem key={c} value={c}>{c}</MenuItem>
        ))}
      </TextField>
      {isOther && (
        <TextField
          label="Company name"
          value={value.rentalCompanyOther ?? ''}
          onChange={(e) => set({ rentalCompanyOther: e.target.value })}
          disabled={disabled}
          fullWidth
        />
      )}

      <Stack direction="row" spacing={2}>
        <TextField
          label="Year"
          value={value.year ?? ''}
          onChange={(e) => set({ year: e.target.value })}
          disabled={disabled}
          sx={{ width: 120 }}
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4 }}
        />
        <TextField
          label="Make / model"
          value={value.makeModel ?? ''}
          onChange={(e) => set({ makeModel: e.target.value })}
          disabled={disabled}
          fullWidth
        />
      </Stack>

      <Stack direction="row" spacing={2}>
        <TextField
          label="Rental start"
          type="date"
          value={value.rentalStartDate ?? ''}
          onChange={(e) => set({ rentalStartDate: e.target.value })}
          disabled={disabled}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="Rental end"
          type="date"
          value={value.rentalEndDate ?? ''}
          onChange={(e) => set({ rentalEndDate: e.target.value })}
          disabled={disabled}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
      </Stack>

      <TextField
        label="Pickup location"
        value={value.rentalLocation ?? ''}
        onChange={(e) => set({ rentalLocation: e.target.value })}
        disabled={disabled}
        fullWidth
      />

      <FormControlLabel
        control={
          <Switch
            checked={!!value.rentalOneWay}
            onChange={(e) => set({ rentalOneWay: e.target.checked })}
            disabled={disabled}
          />
        }
        label="One-way rental (return to a different location)"
      />
      {value.rentalOneWay && (
        <TextField
          label="Return location"
          value={value.rentalReturnLocation ?? ''}
          onChange={(e) => set({ rentalReturnLocation: e.target.value })}
          disabled={disabled}
          fullWidth
        />
      )}

      <Stack direction="row" spacing={2}>
        <TextField
          label="Cost"
          value={value.rentalCostAmount ?? ''}
          onChange={(e) => set({ rentalCostAmount: e.target.value })}
          disabled={disabled}
          sx={{ flex: 1 }}
          inputProps={{ inputMode: 'decimal' }}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
        />
        <TextField
          select
          label="Per"
          value={value.rentalCostPeriod ?? ''}
          onChange={(e) => set({ rentalCostPeriod: e.target.value as RentalVehicleFields['rentalCostPeriod'] })}
          disabled={disabled}
          sx={{ width: 130 }}
        >
          {COST_PERIODS.map((p) => (
            <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
          ))}
        </TextField>
      </Stack>

      <TextField
        label="Agreement number"
        value={value.rentalAgreementNumber ?? ''}
        onChange={(e) => set({ rentalAgreementNumber: e.target.value })}
        disabled={disabled}
        fullWidth
      />

      <Box>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={(e) => handleAgreement(e.target.files?.[0])}
        />
        {value.rentalAgreementUrl ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CheckCircleIcon color="success" fontSize="small" />
            <Link href={value.rentalAgreementUrl} target="_blank" rel="noopener" variant="body2" sx={{ flex: 1 }}>
              Agreement attached
            </Link>
            <IconButton size="small" aria-label="Remove agreement" disabled={disabled}
              onClick={() => set({ rentalAgreementUrl: undefined })}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : (
          <Button
            variant="outlined"
            size="small"
            startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
          >
            {uploading ? 'Uploading…' : 'Upload agreement (PDF or image)'}
          </Button>
        )}
        {!value.rentalAgreementUrl && !uploadError && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
            No agreement attached — the rental will be flagged until one is uploaded.
          </Typography>
        )}
        {uploadError && (
          <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
            {uploadError}
          </Typography>
        )}
      </Box>
    </Stack>
  )
}
