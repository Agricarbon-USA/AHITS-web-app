'use client'

import * as React from 'react'
import {
  TextField, IconButton, InputAdornment, CircularProgress, Tooltip,
} from '@mui/material'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import { parseScannedCode } from '@/lib/qr'

interface QrScanFieldProps {
  value: string
  onChange: (code: string) => void
  label?: string
  helperText?: string
  size?: 'small' | 'medium'
  fullWidth?: boolean
  disabled?: boolean
}

/**
 * "Scan or enter code" input for associating an existing physical QR label with
 * a record on create (PRD §7.7, Wave 1). Works three ways:
 *  - type the code manually,
 *  - paste from a handheld USB scanner (which types into the focused field),
 *  - tap the camera icon to scan with the device camera (jsQR).
 * The app does not generate labels — it only registers/reads existing ones.
 */
export function QrScanField({
  value,
  onChange,
  label = 'QR label code',
  helperText,
  size = 'small',
  fullWidth = true,
  disabled,
}: QrScanFieldProps) {
  const [scanning, setScanning] = React.useState(false)
  const [err, setErr] = React.useState('')

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setErr('')
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
        setErr('No QR detected — try again or type the code.')
        return
      }
      onChange(parseScannedCode(result.data))
    } catch {
      setErr('Could not read the image — type the code instead.')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  return (
    <TextField
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size={size}
      fullWidth={fullWidth}
      disabled={disabled}
      error={!!err}
      helperText={err || helperText}
      placeholder="Scan, or type / USB-scan the code"
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title="Scan with camera">
              <span>
                <IconButton component="label" edge="end" disabled={disabled || scanning}>
                  {scanning ? <CircularProgress size={18} /> : <QrCodeScannerIcon />}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={handleCapture}
                  />
                </IconButton>
              </span>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  )
}
