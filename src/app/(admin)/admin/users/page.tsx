'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Stack, Alert,
  Chip, IconButton, Tooltip, CircularProgress, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Avatar, Skeleton,
} from '@mui/material'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import EditIcon from '@mui/icons-material/Edit'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import BlockIcon from '@mui/icons-material/Block'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SendIcon from '@mui/icons-material/Send'
import { formatDateTime } from '@/lib/utils'

interface UserRow {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'OPERATOR'
  isActive: boolean
  lastLoginAt: string | null
  failedPinAttempts: number
  pinLockedAt: string | null
  hourlyRate: number | null
}

// ── Invite Dialog ─────────────────────────────────────────────────
function InviteDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: (msg: string) => void }) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<'ADMIN' | 'OPERATOR'>('OPERATOR')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const reset = () => { setName(''); setEmail(''); setRole('OPERATOR'); setError('') }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = typeof data.error === 'object'
          ? Object.values(data.error).flat().join(', ')
          : (data.error ?? 'Failed to send invite')
        setError(msg)
        return
      }
      onSuccess(`Invite sent to ${email}`)
      handleClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Invite Team Member</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2.5} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required fullWidth autoFocus
            />
            <TextField
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required fullWidth
            />
            <TextField
              select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'OPERATOR')}
              fullWidth
            >
              <MenuItem value="OPERATOR">Field Operator — logs in with a 6-digit PIN on their phone</MenuItem>
              <MenuItem value="ADMIN">Admin — full access to the web dashboard</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          >
            {loading ? 'Sending…' : 'Send Invite'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

// ── Edit Dialog ───────────────────────────────────────────────────
function EditDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: UserRow | null
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [name, setName] = React.useState('')
  const [hourlyRate, setHourlyRate] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (user) { setName(user.name); setHourlyRate(user.hourlyRate ?? null); setError('') }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError('')
    setLoading(true)
    try {
      const body: Record<string, unknown> = { name }
      if (user.role === 'OPERATOR') body.hourlyRate = hourlyRate
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to update'); return }
      onSuccess(`${name} updated`)
      onClose()
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!user} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit {user?.name}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2.5} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required fullWidth autoFocus
            />
            <TextField
              label="Email"
              value={user?.email ?? ''}
              disabled fullWidth
              helperText="Email cannot be changed"
            />
            <TextField
              label="Role"
              value={user?.role === 'ADMIN' ? 'Admin' : 'Field Operator'}
              disabled fullWidth
              helperText="Role cannot be changed — deactivate and re-invite to change roles"
            />
            {user?.role === 'OPERATOR' && (
              <TextField
                label="Hourly Rate ($/hr)"
                type="number"
                value={hourlyRate ?? ''}
                onChange={(e) => setHourlyRate(e.target.value ? parseFloat(e.target.value) : null)}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                inputProps={{ min: 0, step: 0.01 }}
                fullWidth
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
            {loading ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

// ── Confirm Dialog ────────────────────────────────────────────────
function ConfirmDialog({
  open, title, message, confirmLabel, confirmColor, onClose, onConfirm,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  confirmColor?: 'error' | 'warning' | 'primary'
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [loading, setLoading] = React.useState(false)
  const handle = async () => {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" color={confirmColor ?? 'primary'} onClick={handle} disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [toast, setToast] = React.useState('')
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [editUser, setEditUser] = React.useState<UserRow | null>(null)
  const [confirmAction, setConfirmAction] = React.useState<{
    title: string; message: string; label: string; color?: 'error' | 'warning' | 'primary'; action: () => Promise<void>
  } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      setUsers(data.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const patchUser = async (id: string, body: object) => {
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await load()
  }

  const roleChip = (role: string) => (
    <Chip
      size="small"
      label={role === 'ADMIN' ? 'Admin' : 'Field Operator'}
      color={role === 'ADMIN' ? 'primary' : 'default'}
    />
  )

  const statusChip = (user: UserRow) => {
    if (!user.isActive) return <Chip size="small" label="Inactive" color="default" />
    if (user.pinLockedAt) return <Chip size="small" label="PIN Locked" color="warning" />
    return <Chip size="small" label="Active" color="success" />
  }

  const initials = (name: string) =>
    name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5">Team</Typography>
          <Typography variant="body2" color="text.secondary">
            {users.filter((u) => u.isActive).length} active member{users.filter((u) => u.isActive).length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setInviteOpen(true)}
        >
          Invite Member
        </Button>
      </Stack>

      {/* Success toast */}
      {toast && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setToast('')}>{toast}</Alert>}

      {/* Users table */}
      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
              <TableCell>NAME</TableCell>
              <TableCell>ROLE</TableCell>
              <TableCell>STATUS</TableCell>
              <TableCell>LAST LOGIN</TableCell>
              <TableCell align="right">ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton width={j === 4 ? 80 : 120} /></TableCell>
                    ))}
                  </TableRow>
                ))
              : users.map((user) => (
                  <TableRow key={user.id} sx={{ opacity: user.isActive ? 1 : 0.5, '&:last-child td': { border: 0 } }}>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main' }}>
                          {initials(user.name)}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{user.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>{roleChip(user.role)}</TableCell>
                    <TableCell>{statusChip(user)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {/* Edit name */}
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => setEditUser(user)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        {/* Unlock PIN */}
                        {user.pinLockedAt && (
                          <Tooltip title="Unlock PIN">
                            <IconButton size="small" color="warning"
                              onClick={() => setConfirmAction({
                                title: 'Unlock PIN',
                                message: `Unlock ${user.name}'s PIN so they can log in again?`,
                                label: 'Unlock',
                                color: 'warning',
                                action: async () => { await patchUser(user.id, { unlockPin: true }); showToast(`${user.name}'s PIN unlocked`) },
                              })}>
                              <LockOpenIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}

                        {/* Activate / Deactivate */}
                        {user.isActive ? (
                          <Tooltip title="Deactivate account">
                            <IconButton size="small" color="error"
                              onClick={() => setConfirmAction({
                                title: 'Deactivate Account',
                                message: `${user.name} will no longer be able to log in. Their history will be preserved. You can reactivate them at any time.`,
                                label: 'Deactivate',
                                color: 'error',
                                action: async () => { await patchUser(user.id, { isActive: false }); showToast(`${user.name} deactivated`) },
                              })}>
                              <BlockIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Reactivate account">
                            <IconButton size="small" color="success"
                              onClick={() => setConfirmAction({
                                title: 'Reactivate Account',
                                message: `Reactivate ${user.name}'s account so they can log in again?`,
                                label: 'Reactivate',
                                color: 'primary',
                                action: async () => { await patchUser(user.id, { isActive: true }); showToast(`${user.name} reactivated`) },
                              })}>
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}

                        {/* Resend invite (for users who never logged in) */}
                        {user.isActive && !user.lastLoginAt && (
                          <Tooltip title="Resend invite email">
                            <IconButton size="small"
                              onClick={() => setConfirmAction({
                                title: 'Resend Invite',
                                message: `Send a new invite email to ${user.email}? Their previous link will be replaced.`,
                                label: 'Resend',
                                action: async () => {
                                  await fetch('/api/users/invite', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: user.name, email: user.email, role: user.role }),
                                  })
                                  showToast(`Invite resent to ${user.email}`)
                                },
                              })}>
                              <SendIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}

            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No team members yet. Click "Invite Member" to add your first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialogs */}
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={(msg) => { showToast(msg); load() }}
      />
      <EditDialog
        user={editUser}
        onClose={() => setEditUser(null)}
        onSuccess={(msg) => { showToast(msg); load() }}
      />
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.label ?? 'Confirm'}
        confirmColor={confirmAction?.color}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => { await confirmAction?.action(); setConfirmAction(null) }}
      />
    </Box>
  )
}
