'use client'

import * as React from 'react'
import { Box, Paper, Typography, TextField, Button, Stack, Alert } from '@mui/material'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/shared/useToast'

const PIN_RE = /^\d{6}$/

export default function ChangePinPage() {
  const router = useRouter()
  const showToast = useToast()
  const [currentPin, setCurrentPin] = React.useState('')
  const [newPin, setNewPin] = React.useState('')
  const [confirmPin, setConfirmPin] = React.useState('')
  const [mustChange, setMustChange] = React.useState(false)
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => { if (me?.mustChangePin) setMustChange(true) })
      .catch(() => {})
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!PIN_RE.test(newPin)) { setError('New PIN must be exactly 6 digits.'); return }
    if (newPin !== confirmPin) { setError('New PIN and confirmation don’t match.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        const msg = typeof d.error === 'string'
          ? d.error
          : d.error?.newPin?.[0] ?? d.error?.currentPin?.[0] ?? 'Could not change PIN.'
        setError(msg)
        return
      }
      showToast({ message: 'PIN updated.', severity: 'success' })
      router.replace('/operator/dashboard')
    } catch {
      setError('Could not change PIN. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 2 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" mb={1}>Change your PIN</Typography>
        {mustChange ? (
          <Alert severity="info" sx={{ mb: 2 }}>An admin reset your PIN — please set a new one to continue.</Alert>
        ) : (
          <Typography variant="body2" color="text.secondary" mb={2}>Choose a new 6-digit PIN.</Typography>
        )}
        <form onSubmit={submit}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Current PIN"
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ inputMode: 'numeric', autoComplete: 'current-password', maxLength: 6 }}
              fullWidth
              autoFocus
            />
            <TextField
              label="New PIN (6 digits)"
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ inputMode: 'numeric', autoComplete: 'new-password', maxLength: 6 }}
              fullWidth
            />
            <TextField
              label="Confirm new PIN"
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ inputMode: 'numeric', autoComplete: 'new-password', maxLength: 6 }}
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={saving || !currentPin || !newPin || !confirmPin}>
              {saving ? 'Saving…' : 'Update PIN'}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  )
}
