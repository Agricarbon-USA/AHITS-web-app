'use client'

import * as React from 'react'
import {
  Stack, TextField, MenuItem, Typography, Button, Box,
  CircularProgress, Alert,
} from '@mui/material'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

export interface RentalVehicleFields {
  type: string
  name: string
  rentalMake: string
  rentalModel: string
  rentalYear: string
  rentalLength: string
  rentalAgreementUrl: string
  rentalPickupLocation: string
  rentalDropoffLocation: string
}

interface Props {
  value: Partial<RentalVehicleFields>
  onChange: (v: Partial<RentalVehicleFields>) => void
  disabled?: boolean
}

const VEHICLE_TYPES = [
  { value: 'TRUCK', label: 'Truck' },
  { value: 'TRAILER', label: 'Trailer' },
  { value: 'POLARIS_UTV', label: 'Polaris UTV' },
  { value: 'CAN_AM_UTV', label: 'Can-Am UTV' },
  { value: 'ATV', label: 'ATV' },
  { value: 'OTHER', label: 'Other' },
]

export function RentalVehicleForm({ value, onChange, disabled }: Props) {
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  const set = (field: keyof RentalVehicleFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value })

  const handleAgreementFile = async (files: FileList) => {
    setUploadError(null)
    setUploading(true)
    const form = new FormData()
    form.append('file', files[0])
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { setUploadError(json.error ?? 'Upload failed'); return }
      onChange({ ...value, rentalAgreementUrl: json.url })
    } catch {
      setUploadError('Network error — could not upload agreement')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Stack spacing={2}>
      <TextField select label="Vehicle type" value={value.type ?? ''} onChange={set('type')}
        fullWidth required disabled={disabled}>
        {VEHICLE_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
      </TextField>

      <TextField label="Name / identifier" value={value.name ?? ''} onChange={set('name')}
        fullWidth required placeholder='e.g. "Rented Trailer #1"' disabled={disabled} />

      <Stack direction="row" spacing={2}>
        <TextField label="Make" value={value.rentalMake ?? ''} onChange={set('rentalMake')}
          fullWidth disabled={disabled} />
        <TextField label="Model" value={value.rentalModel ?? ''} onChange={set('rentalModel')}
          fullWidth disabled={disabled} />
        <TextField label="Year" value={value.rentalYear ?? ''} onChange={set('rentalYear')}
          type="number" sx={{ width: 120 }} disabled={disabled} />
      </Stack>

      <TextField label="Rental length" value={value.rentalLength ?? ''} onChange={set('rentalLength')}
        fullWidth placeholder='e.g. "7 days", "2 weeks"' disabled={disabled} />

      <Box>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          Rental agreement (photo or scan)
        </Typography>
        {uploadError && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setUploadError(null)}>{uploadError}</Alert>
        )}
        {value.rentalAgreementUrl ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              component="img"
              src={value.rentalAgreementUrl}
              alt="Rental agreement"
              sx={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
            />
            <Button size="small" variant="text" color="error"
              onClick={() => onChange({ ...value, rentalAgreementUrl: '' })} disabled={disabled}>
              Remove
            </Button>
          </Stack>
        ) : (
          <Button
            component="label"
            size="small"
            variant="outlined"
            startIcon={uploading ? <CircularProgress size={16} /> : <CameraAltIcon />}
            disabled={disabled || uploading}
          >
            {uploading ? 'Uploading…' : 'Attach agreement'}
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) handleAgreementFile(e.target.files) }}
            />
          </Button>
        )}
      </Box>

      <TextField
        label="Pickup location"
        value={value.rentalPickupLocation ?? ''}
        onChange={set('rentalPickupLocation')}
        fullWidth disabled={disabled}
      />

      <TextField
        label="Dropoff location (if different from pickup)"
        value={value.rentalDropoffLocation ?? ''}
        onChange={set('rentalDropoffLocation')}
        fullWidth disabled={disabled}
        placeholder="Leave blank if same as pickup"
      />
    </Stack>
  )
}
