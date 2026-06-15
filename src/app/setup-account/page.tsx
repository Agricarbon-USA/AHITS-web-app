'use client'

import * as React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Box, Card, CardContent, Typography, TextField,
  Button, Alert, CircularProgress, Stack, Chip,
} from '@mui/material'
import AgricultureIcon from '@mui/icons-material/Agriculture'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

interface InviteData {
  name: string
  email: string
  role: 'ADMIN' | 'OPERATOR'
}

export default function SetupAccountPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [invite, setInvite] = React.useState<InviteData | null>(null)
  const [loadError, setLoadError] = React.useState('')
  const [credential, setCredential] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState('')
  const [done, setDone] = React.useState(false)

  // Validate token on mount
  React.useEffect(() => {
    if (!token) { setLoadError('No invite token found in this link.'); return }
    fetch(`/api/users/invite/validate?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setLoadError(d.error)
        else setInvite(d.data)
      })
      .catch(() => setLoadError('Could not load invite. Please check your link.'))
  }, [token])

  const isOperator = invite?.role === 'OPERATOR'
  const credentialLabel = isOperator ? '6-Digit PIN' : 'Password (8+ characters)'
  const inputType = isOperator ? 'password' : 'password'
  const inputProps = isOperator
    ? { maxLength: 6, inputMode: 'numeric' as const, pattern: '[0-9]*' }
    : { minLength: 8 }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    if (credential !== confirm) { setSubmitError('Entries do not match — please try again.'); return }
    if (isOperator && !/^\d{6}$/.test(credential)) { setSubmitError('PIN must be exactly 6 digits.'); return }
    if (!isOperator && credential.length < 8) { setSubmitError('Password must be at least 8 characters.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/users/invite/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, credential }),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitError(data.error ?? 'Something went wrong.'); return }
      setDone(true)
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack alignItems="center" spacing={1} mb={3}>
            <AgricultureIcon sx={{ fontSize: 48, color: 'primary.main' }} />
            <Typography variant="h5" fontWeight={700}>AHITS</Typography>
            <Typography variant="body2" color="text.secondary">Agricarbon Hardware Tracking</Typography>
          </Stack>

          {loadError && <Alert severity="error">{loadError}</Alert>}

          {done && (
            <Stack alignItems="center" spacing={2}>
              <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main' }} />
              <Typography variant="h6" textAlign="center">Account ready!</Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Your account has been set up. You can now sign in.
              </Typography>
              <Button variant="contained" fullWidth onClick={() => router.push('/login')}>
                Go to Sign In
              </Button>
            </Stack>
          )}

          {invite && !done && (
            <>
              <Stack spacing={0.5} mb={3}>
                <Typography variant="h6">Welcome, {invite.name}!</Typography>
                <Typography variant="body2" color="text.secondary">{invite.email}</Typography>
                <Chip
                  size="small"
                  label={invite.role === 'ADMIN' ? 'Admin' : 'Field Operator'}
                  color={invite.role === 'ADMIN' ? 'primary' : 'default'}
                  sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                />
              </Stack>

              <Typography variant="body2" color="text.secondary" mb={2}>
                {isOperator
                  ? 'Choose a 6-digit PIN. You\'ll use this every time you log in on your phone.'
                  : 'Choose a password for your admin account.'}
              </Typography>

              {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}

              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <TextField
                    label={credentialLabel}
                    type={inputType}
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    inputProps={inputProps}
                    required fullWidth
                  />
                  <TextField
                    label={`Confirm ${isOperator ? 'PIN' : 'Password'}`}
                    type={inputType}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    inputProps={inputProps}
                    required fullWidth
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
                  >
                    {submitting ? 'Setting up…' : 'Activate Account'}
                  </Button>
                </Stack>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
