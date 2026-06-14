'use client'

import * as React from 'react'
import {
  Box, Card, CardContent, Typography, TextField,
  Button, Alert, CircularProgress, Tabs, Tab, Stack,
} from '@mui/material'
import AgricultureIcon from '@mui/icons-material/Agriculture'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = React.useState(0) // 0 = Operator PIN, 1 = Admin
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  // Operator state
  const [email, setEmail] = React.useState('')
  const [pin, setPin] = React.useState('')

  // Admin state
  const [adminEmail, setAdminEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
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
      if (!res.ok) { setError(data.error ?? 'Login failed'); return }
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
