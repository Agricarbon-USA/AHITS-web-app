'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Stack, Alert, Divider,
  Chip, IconButton, Tooltip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Avatar, Skeleton, List, ListItem, ListItemText,
} from '@mui/material'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import EditIcon from '@mui/icons-material/Edit'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import BlockIcon from '@mui/icons-material/Block'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SendIcon from '@mui/icons-material/Send'
import LogoutIcon from '@mui/icons-material/Logout'
import HistoryIcon from '@mui/icons-material/History'
import { formatDateTime } from '@/lib/utils'

interface HubRow { id: string; name: string }

interface UserRow {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'OPERATOR'
  isActive: boolean
  lastLoginAt: string | null
  failedPinAttempts: number
  pinLockedAt: string | null
  mustChangePin?: boolean
  hourlyRate?: number | string | null
  homeHubId?: string | null
  homeHub?: HubRow | null
  activeProjects?: { id: string; name: string }[]
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
            <TextField label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth autoFocus />
            <TextField label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
            <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'OPERATOR')} fullWidth>
              <MenuItem value="OPERATOR">Field Operator — logs in with a 6-digit PIN on their phone</MenuItem>
              <MenuItem value="ADMIN">Admin — full access to the web dashboard</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}>
            {loading ? 'Sending…' : 'Send Invite'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

// ── Account Dialog (manage a single user) ─────────────────────────
function AccountDialog({
  user, hubs, onClose, onSuccess,
}: {
  user: UserRow | null
  hubs: HubRow[]
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [name, setName] = React.useState('')
  const [role, setRole] = React.useState<'ADMIN' | 'OPERATOR'>('OPERATOR')
  const [homeHubId, setHomeHubId] = React.useState('')
  const [hourlyRate, setHourlyRate] = React.useState('')
  const [resetPin, setResetPin] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (user) {
      setName(user.name)
      setRole(user.role)
      setHomeHubId(user.homeHubId ?? '')
      setHourlyRate(user.hourlyRate != null ? String(user.hourlyRate) : '')
      setResetPin('')
      setError('')
    }
  }, [user])

  const patch = async (body: object, successMsg: string) => {
    if (!user) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Update failed')
        return false
      }
      onSuccess(successMsg)
      return true
    } catch {
      setError('Network error.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (resetPin && !/^\d{6}$/.test(resetPin)) { setError('A reset PIN must be exactly 6 digits.'); return }
    const body: Record<string, unknown> = {
      name,
      role,
      homeHubId: homeHubId || null,
      hourlyRate: hourlyRate === '' ? null : Number(hourlyRate),
    }
    if (resetPin) body.pin = resetPin
    const ok = await patch(body, `${name} updated`)
    if (ok) onClose()
  }

  return (
    <Dialog open={!!user} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage {user?.name}</DialogTitle>
      <Box component="form" onSubmit={handleSave}>
        <DialogContent>
          <Stack spacing={2.5} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
            <TextField label="Email" value={user?.email ?? ''} disabled fullWidth helperText="Email cannot be changed" />
            <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'OPERATOR')} fullWidth>
              <MenuItem value="OPERATOR">Field Operator</MenuItem>
              <MenuItem value="ADMIN">Admin</MenuItem>
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField select label="Home Hub" value={homeHubId} onChange={(e) => setHomeHubId(e.target.value)} fullWidth>
                <MenuItem value="">— None —</MenuItem>
                {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
              </TextField>
              <TextField label="Hourly Rate ($)" type="number" value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)} fullWidth inputProps={{ min: 0, step: '0.01' }} />
            </Stack>

            <Divider />
            <Typography variant="subtitle2" color="text.secondary">Security</Typography>
            <TextField label="Reset PIN (optional)" value={resetPin}
              onChange={(e) => setResetPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              fullWidth placeholder="Set a temporary 6-digit PIN"
              helperText="Leave blank to keep the current PIN. The operator is asked to change it on next login."
              inputProps={{ inputMode: 'numeric' }} />
            <Button variant="outlined" color="warning" startIcon={<LogoutIcon />} disabled={loading}
              onClick={() => patch({ forceLogout: true }, `${user?.name}'s sessions revoked`)}>
              Log out of all devices
            </Button>
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

// ── Activity Log Dialog ───────────────────────────────────────────
interface AuditRow {
  id: string
  action: string
  createdAt: string
  actor: { id: string; name: string } | null
  targetUser: { id: string; name: string } | null
}
function ActivityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [logs, setLogs] = React.useState<AuditRow[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/users/audit')
      .then((r) => r.json())
      .then((d) => setLogs(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  const label = (a: string) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Account Activity</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Stack alignItems="center" py={3}><CircularProgress size={24} /></Stack>
        ) : logs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" py={2}>No account activity yet.</Typography>
        ) : (
          <List dense>
            {logs.map((l) => (
              <ListItem key={l.id} disableGutters>
                <ListItemText
                  primary={`${label(l.action)}${l.targetUser ? ` — ${l.targetUser.name}` : ''}`}
                  secondary={`${l.actor?.name ?? 'System'} · ${formatDateTime(l.createdAt)}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserRow[]>([])
  const [hubs, setHubs] = React.useState<HubRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [toast, setToast] = React.useState('')
  const [filterProject, setFilterProject] = React.useState('')
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([])
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [activityOpen, setActivityOpen] = React.useState(false)
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

  React.useEffect(() => {
    load()
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(d ?? d?.data ?? [])).catch(() => {})
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(d.data ?? d ?? [])).catch(() => {})
  }, [load])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const patchUser = async (id: string, body: object) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(typeof d.error === 'string' ? d.error : 'Action failed') }
    await load()
  }

  const roleChip = (role: string) => (
    <Chip size="small" label={role === 'ADMIN' ? 'Admin' : 'Field Operator'} color={role === 'ADMIN' ? 'primary' : 'default'} />
  )

  const statusChip = (user: UserRow) => {
    if (!user.isActive) return <Chip size="small" label="Inactive" color="default" />
    if (user.pinLockedAt) return <Chip size="small" label="PIN Locked" color="warning" />
    return <Chip size="small" label="Active" color="success" />
  }

  const initials = (name: string) => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()

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
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setActivityOpen(true)}>Activity</Button>
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setInviteOpen(true)}>Invite Member</Button>
        </Stack>
      </Stack>

      {toast && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setToast('')}>{toast}</Alert>}

      {projects.length > 0 && (
        <Stack direction="row" spacing={1.5} mb={2} alignItems="center">
          <TextField select size="small" label="All Projects" value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="">All Projects</MenuItem>
            {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          {filterProject && (
            <Button size="small" onClick={() => setFilterProject('')}>Clear</Button>
          )}
        </Stack>
      )}

      {/* Users table */}
      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
              <TableCell>NAME</TableCell>
              <TableCell>ROLE</TableCell>
              <TableCell>STATUS</TableCell>
              <TableCell>HOME HUB</TableCell>
              <TableCell>PROJECT</TableCell>
              <TableCell>LAST LOGIN</TableCell>
              <TableCell align="right">ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton width={j === 6 ? 80 : 110} /></TableCell>
                    ))}
                  </TableRow>
                ))
              : users.filter((u) => !filterProject || (u.activeProjects ?? []).some((p) => p.id === filterProject)).map((user) => (
                  <TableRow key={user.id} sx={{ opacity: user.isActive ? 1 : 0.5, '&:last-child td': { border: 0 } }}>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main' }}>{initials(user.name)}</Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{user.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>{roleChip(user.role)}</TableCell>
                    <TableCell>{statusChip(user)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{user.homeHub?.name ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      {user.role === 'OPERATOR' && (user.activeProjects ?? []).length > 0
                        ? <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {(user.activeProjects ?? []).map((p) => <Chip key={p.id} size="small" label={p.name} variant="outlined" />)}
                          </Stack>
                        : <Typography variant="body2" color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Manage account">
                          <IconButton size="small" onClick={() => setEditUser(user)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>

                        {user.pinLockedAt && (
                          <Tooltip title="Unlock PIN">
                            <IconButton size="small" color="warning"
                              onClick={() => setConfirmAction({
                                title: 'Unlock PIN',
                                message: `Unlock ${user.name}'s PIN so they can log in again?`,
                                label: 'Unlock', color: 'warning',
                                action: async () => { await patchUser(user.id, { unlockPin: true }); showToast(`${user.name}'s PIN unlocked`) },
                              })}>
                              <LockOpenIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}

                        {user.isActive ? (
                          <Tooltip title="Deactivate account">
                            <IconButton size="small" color="error"
                              onClick={() => setConfirmAction({
                                title: 'Deactivate Account',
                                message: `${user.name} will be logged out immediately and unable to log in. Their history is preserved; you can reactivate them any time.`,
                                label: 'Deactivate', color: 'error',
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
                                label: 'Reactivate', color: 'primary',
                                action: async () => { await patchUser(user.id, { isActive: true }); showToast(`${user.name} reactivated`) },
                              })}>
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}

            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No team members yet. Click &quot;Invite Member&quot; to add your first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialogs */}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onSuccess={(msg) => { showToast(msg); load() }} />
      <AccountDialog user={editUser} hubs={hubs} onClose={() => setEditUser(null)} onSuccess={(msg) => { showToast(msg); load() }} />
      <ActivityDialog open={activityOpen} onClose={() => setActivityOpen(false)} />
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
