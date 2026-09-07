'use client'

import * as React from 'react'
import {
  Box, Card, CardContent, Typography, TextField,
  Button, Alert, CircularProgress, Tabs, Tab, Stack,
} from '@mui/material'
import AgricultureIcon from '@mui/icons-material/Agriculture'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'

// UXP-3 (3b): who a locked-out operator should reach. A plain string on purpose —
// no ops-lead config exists (no env var, no Cloud Run --set-env-vars entry), and the
// owner names the person in a strings PR (D11). Promoting it to an env var needs a
// Makefile edit → optional follow-up.
const LOCKOUT_CONTACT = 'your ops lead'

/**
 * UXP-3 (3b): the honest lockout line. `lockedUntil` is the server's ISO stamp,
 * rendered device-local as HH:MM (same pattern as FreshnessIndicator's "Data as
 * of"); an unparsable/missing value falls back to the lock's fixed length.
 */
function lockoutMessage(lockedUntil: unknown): string {
  const until = typeof lockedUntil === 'string' ? new Date(lockedUntil) : null
  const when = until && !Number.isNaN(until.getTime())
    ? `until ${until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'for 15 minutes'
  return `Too many attempts — locked ${when}. Contact ${LOCKOUT_CONTACT} if urgent.`
}

export default function LoginPage() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [tab, setTab] = React.useState(0) // 0 = Operator PIN, 1 = Admin
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  // 3b: a lock is a WARNING with a time on it, not a red "Invalid credentials".
  // The button stays enabled — auto-unlock is server-side, so a retry after HH:MM
  // simply works.
  const [lockout, setLockout] = React.useState<string | null>(null)

  // Operator state
  const [email, setEmail] = React.useState('')
  const [pin, setPin] = React.useState('')

  // Admin state
  const [adminEmail, setAdminEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  // UR-027: if already signed in, skip the form and send the user to their role
  // home rather than rendering a login form to an authenticated session.
  React.useEffect(() => {
    let active = true
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.role) {
          router.replace(d.role === 'ADMIN' ? '/admin/dashboard' : '/operator/dashboard')
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setLockout(null)
    try {
      const body = tab === 0
        ? { mode: 'pin', email, pin }
        : { mode: 'admin', email: adminEmail, password }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        // 3b: the server flags an active per-account lock; the 429 IP limiter
        // never carries `locked`, so its copy still renders through `error`.
        if (data?.locked) { setLockout(lockoutMessage(data.lockedUntil)); return }
        setError(data.error ?? 'Login failed')
        return
      }
      // UR-003: refresh the cached identity to the new user before navigating so
      // the dashboard never flashes the previous user's name on a shared device.
      await mutate('/api/auth/me')
      router.push(data.role === 'ADMIN' ? '/admin/dashboard' : '/operator/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 400 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack alignItems="center" spacing={1} mb={3}>
            <AgricultureIcon sx={{ fontSize: 48, color: 'primary.main' }} />
            <Typography variant="h5" fontWeight={700}>AHITS</Typography>
            <Typography variant="body2" color="text.secondary">
              Agricarbon Hardware Tracking
            </Typography>
          </Stack>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }} centered>
            <Tab label="Field Operator" />
            <Tab label="Admin" />
          </Tabs>

          {lockout && <Alert severity="warning" sx={{ mb: 2 }}>{lockout}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {tab === 0 ? (
                <>
                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required fullWidth autoComplete="email"
                  />
                  <TextField
                    label="6-Digit PIN"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.slice(0, 6))}
                    required fullWidth inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
                  />
                </>
              ) : (
                <>
                  <TextField
                    label="Admin Email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required fullWidth autoComplete="email"
                  />
                  <TextField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required fullWidth autoComplete="current-password"
                  />
                </>
              )}
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
