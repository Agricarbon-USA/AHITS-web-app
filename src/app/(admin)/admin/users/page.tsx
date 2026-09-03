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
import { useToast } from '@/components/shared/useToast'
import { EntityFormDialog, RequiredLegend } from '@/components/ui/EntityFormDialog'
import { useDirtyState } from '@/hooks/useDirtyState'
import { parseApiError } from '@/lib/api-error-shape'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import EditIcon from '@mui/icons-material/Edit'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import BlockIcon from '@mui/icons-material/Block'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SendIcon from '@mui/icons-material/Send'
import LogoutIcon from '@mui/icons-material/Logout'
import HistoryIcon from '@mui/icons-material/History'
import LinkIcon from '@mui/icons-material/Link'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { formatDateTime } from '@/lib/utils'

interface InviteRow {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'OPERATOR'
  expiresAt: string
  createdAt: string
}
type LinkPayload = { url: string; expiresAt: string }

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
function InviteDialog({ open, onClose, onSuccess, onLink }: {
  open: boolean; onClose: () => void; onSuccess: (msg: string) => void; onLink: (p: LinkPayload) => void
}) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<'ADMIN' | 'OPERATOR'>('OPERATOR')
  // Delivery: EMAIL sends the setup link (existing behavior); LINK returns a copy-able
  // URL for email-independent onboarding (no email is sent).
  const [delivery, setDelivery] = React.useState<'EMAIL' | 'LINK'>('EMAIL')
  const [loading, setLoading] = React.useState(false)
  // UXP-6 (6c / C7): on EntityFormDialog — pinned Cancel/Send, Enter submits, dirty
  // guard, and the invite route's zod field errors land on their fields.
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const dirty = useDirtyState(open, { name, email, role, delivery })

  const reset = () => { setName(''); setEmail(''); setRole('OPERATOR'); setDelivery('EMAIL'); setFormError(null); setFieldErrors({}) }
  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async () => {
    setFormError(null)
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (!email.trim()) errs.email = 'Email is required'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return false }
    setFieldErrors({})
    setLoading(true)
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, delivery }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const parsed = parseApiError(data, 'Failed to create invite')
        setFieldErrors(parsed.fieldErrors)
        setFormError(parsed.formError)
        return false
      }
      if (delivery === 'LINK') {
        onLink({ url: data.setupUrl, expiresAt: data.expiresAt })
      } else {
        onSuccess(`Invite sent to ${email}`)
      }
      handleClose()
    } catch {
      setFormError('Network error. Please try again.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const isLink = delivery === 'LINK'
  return (
    <EntityFormDialog
      open={open}
      title="Invite team member"
      onClose={handleClose}
      onSubmit={handleSubmit}
      saving={loading}
      dirty={dirty}
      formError={formError}
      legend={<RequiredLegend />}
      submitLabel={isLink ? 'Create link' : 'Send Invite'}
      savingLabel={isLink ? 'Creating…' : 'Sending…'}
      submitIcon={isLink ? <LinkIcon /> : <SendIcon />}
      maxWidth="xs"
    >
      <Stack spacing={2.5} pt={0.5}>
        <TextField label="Full Name" value={name} onChange={(e) => { setName(e.target.value); setFieldErrors({}) }} required fullWidth autoFocus
          error={!!fieldErrors.name} helperText={fieldErrors.name} />
        <TextField label="Email Address" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors({}) }} required fullWidth
          error={!!fieldErrors.email} helperText={fieldErrors.email} />
        <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'OPERATOR')} fullWidth
          error={!!fieldErrors.role} helperText={fieldErrors.role}>
          <MenuItem value="OPERATOR">Field Operator — logs in with a 6-digit PIN on their phone</MenuItem>
          <MenuItem value="ADMIN">Admin — full access to the web dashboard</MenuItem>
        </TextField>
        <TextField select label="How to send" value={delivery} onChange={(e) => setDelivery(e.target.value as 'EMAIL' | 'LINK')} fullWidth
          error={!!fieldErrors.delivery} helperText={fieldErrors.delivery}>
          <MenuItem value="EMAIL">Email the invite</MenuItem>
          <MenuItem value="LINK">Create a link to copy (no email)</MenuItem>
        </TextField>
        {isLink && (
          <Typography variant="caption" color="text.secondary">
            We&apos;ll show a one-time setup link to copy and share. They set their own PIN when they open it — no email required.
          </Typography>
        )}
      </Stack>
    </EntityFormDialog>
  )
}

// ── Invite Link Dialog (shows a one-time setup URL to copy) ────────
function InviteLinkDialog({ payload, onClose }: { payload: LinkPayload | null; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => { setCopied(false) }, [payload])

  const copy = async () => {
    if (!payload) return
    try { await navigator.clipboard.writeText(payload.url); setCopied(true) } catch { /* clipboard blocked — the field is selectable */ }
  }

  return (
    <Dialog open={!!payload} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Invite link</DialogTitle>
      <DialogContent>
        <Stack spacing={2} pt={0.5}>
          <Alert severity="warning">
            Shown once — copy it now. If you lose it, use <strong>Regenerate link</strong> on the pending invite to make a new one (which disables this one).
          </Alert>
          <TextField
            value={payload?.url ?? ''}
            fullWidth
            multiline
            InputProps={{ readOnly: true }}
            onFocus={(e) => e.target.select()}
          />
          <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </Button>
          {payload?.expiresAt && (
            <Typography variant="caption" color="text.secondary">
              Expires {formatDateTime(payload.expiresAt)}. The operator sets their own PIN when they open it.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Account Dialog (manage a single user) ─────────────────────────

/** The form's values for a user — the reset target and the dirty-guard baseline (same key order). */
function accountFormValues(user: UserRow | null) {
  return {
    name: user?.name ?? '',
    role: user?.role ?? 'OPERATOR',
    homeHubId: user?.homeHubId ?? '',
    hourlyRate: user?.hourlyRate != null ? String(user.hourlyRate) : '',
    resetPin: '',
  }
}

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
  // UXP-6 (6c / C7): on EntityFormDialog — pinned Cancel/Save, Enter submits, dirty
  // guard, and the route's zod field errors land on their fields. The fields are
  // still reset in the effect below, so `dirty` compares against values derived
  // from the user (robust to that timing) rather than a snapshot.
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const dirty = useDirtyState(!!user, { name, role, homeHubId, hourlyRate, resetPin }, accountFormValues(user))

  React.useEffect(() => {
    if (user) {
      const v = accountFormValues(user)
      setName(v.name)
      setRole(v.role)
      setHomeHubId(v.homeHubId)
      setHourlyRate(v.hourlyRate)
      setResetPin('')
      setFormError(null)
      setFieldErrors({})
    }
  }, [user])

  const patch = async (body: object, successMsg: string) => {
    if (!user) return
    setFormError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const parsed = parseApiError(data, 'Update failed')
        // The route's field for the reset PIN is `pin`; show it on that field.
        const { pin, ...rest } = parsed.fieldErrors
        setFieldErrors(pin ? { ...rest, resetPin: pin } : rest)
        setFormError(parsed.formError)
        return false
      }
      onSuccess(successMsg)
      return true
    } catch {
      setFormError('Network error.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!user) return
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (resetPin && !/^\d{6}$/.test(resetPin)) errs.resetPin = 'A reset PIN must be exactly 6 digits.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return false }
    setFieldErrors({})
    const body: Record<string, unknown> = {
      name,
      role,
      homeHubId: homeHubId || null,
      hourlyRate: hourlyRate === '' ? null : Number(hourlyRate),
    }
    if (resetPin) body.pin = resetPin
    const ok = await patch(body, `${name} updated`)
    if (ok) onClose()
    else return false
  }

  return (
    <EntityFormDialog
      open={!!user}
      title={`Manage ${user?.name ?? ''}`}
      onClose={onClose}
      onSubmit={handleSave}
      saving={loading}
      dirty={dirty}
      formError={formError}
      legend={<RequiredLegend />}
      submitLabel="Save Changes"
      maxWidth="sm"
    >
      <Stack spacing={2.5} pt={0.5}>
        <TextField label="Full Name" value={name} onChange={(e) => { setName(e.target.value); setFieldErrors({}) }} required fullWidth
          error={!!fieldErrors.name} helperText={fieldErrors.name} />
        <TextField label="Email" value={user?.email ?? ''} disabled fullWidth helperText="Email cannot be changed" />
        <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'OPERATOR')} fullWidth
          error={!!fieldErrors.role} helperText={fieldErrors.role}>
          <MenuItem value="OPERATOR">Field Operator</MenuItem>
          <MenuItem value="ADMIN">Admin</MenuItem>
        </TextField>
        <Stack direction="row" spacing={2}>
          <TextField select label="Home Hub" value={homeHubId} onChange={(e) => setHomeHubId(e.target.value)} fullWidth
            error={!!fieldErrors.homeHubId} helperText={fieldErrors.homeHubId}>
            <MenuItem value="">— None —</MenuItem>
            {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
          </TextField>
          <TextField label="Hourly Rate ($)" type="number" value={hourlyRate}
            onChange={(e) => { setHourlyRate(e.target.value); setFieldErrors({}) }} fullWidth inputProps={{ min: 0, step: '0.01' }}
            error={!!fieldErrors.hourlyRate} helperText={fieldErrors.hourlyRate} />
        </Stack>

        <Divider />
        <Typography variant="subtitle2" color="text.secondary">Security</Typography>
        <TextField label="Reset PIN (optional)" value={resetPin}
          onChange={(e) => { setResetPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setFieldErrors({}) }}
          fullWidth placeholder="Set a temporary 6-digit PIN"
          error={!!fieldErrors.resetPin}
          helperText={fieldErrors.resetPin ?? 'Leave blank to keep the current PIN. The operator is asked to change it on next login.'}
          inputProps={{ inputMode: 'numeric' }} />
        <Button variant="outlined" color="warning" startIcon={<LogoutIcon />} disabled={loading}
          onClick={() => patch({ forceLogout: true }, `${user?.name}'s sessions revoked`)}>
          Log out of all devices
        </Button>
      </Stack>
    </EntityFormDialog>
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
  const [filterProject, setFilterProject] = React.useState('')
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([])
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [activityOpen, setActivityOpen] = React.useState(false)
  const [editUser, setEditUser] = React.useState<UserRow | null>(null)
  const [invites, setInvites] = React.useState<InviteRow[]>([])
  const [linkPayload, setLinkPayload] = React.useState<LinkPayload | null>(null)
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

  const loadInvites = React.useCallback(async () => {
    try {
      const res = await fetch('/api/users/invite')
      const data = await res.json()
      setInvites(data.data ?? [])
    } catch { /* leave the pending list as-is on a transient error */ }
  }, [])

  React.useEffect(() => {
    load()
    loadInvites()
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {})
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(d.data ?? d ?? [])).catch(() => {})
  }, [load, loadInvites])

  // CC-23: route through the single shared Snackbar host (was an inline
  // top-of-page Alert). Adapter preserves the (msg, sev) call-site signature.
  const pushToast = useToast()
  const showToast = (msg: string, sev: 'success' | 'error' = 'success') => pushToast({ message: msg, severity: sev })

  const patchUser = async (id: string, body: object): Promise<boolean> => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      showToast(typeof d.error === 'string' ? d.error : 'Action failed', 'error')
      await load()
      return false
    }
    await load()
    return true
  }

  // Regenerate a pending invite's link (resend route in LINK mode). The old link dies
  // (its token is rehashed server-side); the fresh URL is shown once to copy.
  const regenerateLink = async (inv: InviteRow) => {
    const res = await fetch(`/api/users/invite/${inv.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery: 'LINK' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { showToast(typeof data.error === 'string' ? data.error : 'Could not regenerate the link', 'error'); return }
    setLinkPayload({ url: data.setupUrl, expiresAt: data.expiresAt })
    await loadInvites()
  }

  const revokeInvite = (inv: InviteRow) => setConfirmAction({
    title: 'Revoke invite',
    message: `Revoke the invite for ${inv.email}? Their setup link will stop working immediately.`,
    label: 'Revoke', color: 'error',
    action: async () => {
      const res = await fetch(`/api/users/invite/${inv.id}`, { method: 'DELETE' })
      if (res.ok) { showToast('Invite revoked'); await loadInvites() }
      else showToast('Could not revoke the invite', 'error')
    },
  })

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

      {/* Pending invites — outstanding, unclaimed invite links */}
      {invites.length > 0 && (
        <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2, p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" mb={1}>
            Pending invites ({invites.length})
          </Typography>
          <Stack divider={<Divider flexItem />} spacing={0}>
            {invites.map((inv) => (
              <Stack key={inv.id} direction={{ xs: 'column', sm: 'row' }} spacing={1}
                alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ py: 1 }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" fontWeight={500}>{inv.name}</Typography>
                    {roleChip(inv.role)}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {inv.email} · expires {formatDateTime(inv.expiresAt)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => regenerateLink(inv)}>
                    Regenerate link
                  </Button>
                  <Button size="small" color="error" onClick={() => revokeInvite(inv)}>
                    Revoke
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Users table */}
      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        {/* CC-23: minWidth so columns keep readable widths and the container
            scrolls horizontally on narrow screens instead of crushing cells. */}
        <Table sx={{ minWidth: 640 }}>
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
                                action: async () => { if (await patchUser(user.id, { unlockPin: true })) showToast(`${user.name}'s PIN unlocked`) },
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
                                action: async () => { if (await patchUser(user.id, { isActive: false })) showToast(`${user.name} deactivated`) },
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
                                action: async () => { if (await patchUser(user.id, { isActive: true })) showToast(`${user.name} reactivated`) },
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
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={(msg) => { showToast(msg); loadInvites() }}
        onLink={(p) => { setLinkPayload(p); loadInvites() }}
      />
      <InviteLinkDialog payload={linkPayload} onClose={() => setLinkPayload(null)} />
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
