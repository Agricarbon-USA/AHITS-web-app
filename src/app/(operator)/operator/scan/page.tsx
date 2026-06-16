'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Alert, Chip, CircularProgress, Paper,
} from '@mui/material'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'

interface UnitInfo {
  id: string
  qrCodeId: string
  serialNumber: string | null
  status: string
  notes: string | null
  inventoryItem: {
    id: string
    name: string
    itemType: string
    category: { name: string }
  }
}

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  CHECKED_OUT: 'Checked Out',
  IN_MAINTENANCE: 'In Maintenance',
  INOPERABLE: 'Inoperable',
  RETIRED: 'Retired',
}

const STATUS_COLORS: Record<string, 'success' | 'primary' | 'warning' | 'error' | 'default'> = {
  AVAILABLE: 'success',
  CHECKED_OUT: 'primary',
  IN_MAINTENANCE: 'warning',
  INOPERABLE: 'error',
  RETIRED: 'default',
}

export default function OperatorScanPage() {
  const [scanning, setScanning] = React.useState(false)
  const [unit, setUnit] = React.useState<UnitInfo | null>(null)
  const [error, setError] = React.useState('')

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setError('')
    setUnit(null)
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      const jsQR = (await import('jsqr')).default
      const result = jsQR(imgData.data, bitmap.width, bitmap.height)
      if (!result?.data) {
        setError('No QR code detected in the image. Try again.')
        return
      }
      const res = await fetch(`/api/inventory/units/by-qr/${encodeURIComponent(result.data)}`)
      if (!res.ok) {
        setError('QR code not recognised — this unit is not in the system.')
        return
      }
      const json = await res.json()
      setUnit({ ...json.unit, inventoryItem: json.item })
    } catch {
      setError('Failed to process image. Please try again.')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  return (
    <Box>
      <Typography variant="h5" mb={0.5}>Scan Equipment</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Scan a QR label to identify any piece of equipment.
      </Typography>

      <Stack alignItems="center" spacing={2}>
        <Button
          component="label"
          variant="contained"
          size="large"
          startIcon={scanning ? <CircularProgress size={20} color="inherit" /> : <QrCodeScannerIcon />}
          disabled={scanning}
          sx={{ minWidth: 220 }}
        >
          {scanning ? 'Scanning…' : 'Scan QR Label'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleCapture}
          />
        </Button>

        {error && (
          <Alert severity="error" sx={{ width: '100%', maxWidth: 480 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {unit && (
          <Paper variant="outlined" sx={{ p: 3, width: '100%', maxWidth: 480 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="h6" fontWeight={700}>{unit.inventoryItem.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{unit.inventoryItem.category.name}</Typography>
                </Box>
                <Chip
                  label={STATUS_LABELS[unit.status] ?? unit.status}
                  color={STATUS_COLORS[unit.status] ?? 'default'}
                  size="small"
                />
              </Stack>

              {unit.serialNumber && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Serial Number</Typography>
                  <Typography variant="body2">{unit.serialNumber}</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Unit ID</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{unit.qrCodeId}</Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Item Type</Typography>
                <Typography variant="body2">{unit.inventoryItem.itemType === 'SERIALIZED' ? 'Serialized' : 'Consumable'}</Typography>
              </Box>

              {unit.status === 'CHECKED_OUT' && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  This unit is currently checked out on a deployment.
                </Alert>
              )}

              {unit.status === 'INOPERABLE' && (
                <Alert severity="error" sx={{ py: 0.5 }}>
                  This unit is marked inoperable and is pending admin review.
                </Alert>
              )}

              {unit.notes && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Notes</Typography>
                  <Typography variant="body2">{unit.notes}</Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  )
}
