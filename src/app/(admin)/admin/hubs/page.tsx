'use client'

import * as React from 'react'
import {
  Box, Typography, Card, CardContent, Stack, Chip, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Divider,
  Tabs, Tab, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip, Checkbox, ToggleButton, ToggleButtonGroup,
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import EmailIcon from '@mui/icons-material/Email'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank'
import CheckBoxIcon from '@mui/icons-material/CheckBox'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCanEdit, MutationButton, MutationIconButton } from '@/components/shared/ReadOnly'
import { useMultiSelect } from '@/components/shared/useMultiSelect'
import { BulkActionBar } from '@/components/shared/BulkActionBar'

// ── Types ──────────────────────────────────────────────────────────

interface Hub {
  id: string
  name: string
  city: string
  state: string
  email?: string | null
  street1?: string | null
  street2?: string | null
  zip?: string | null
  country?: string | null
  isActive: boolean
}

interface EventEntry {
  action: string
  note: string | null
  actorLabel: string
  at: string
}

interface InboundUnit {
  statusLinkId: string
  unitId: string | null
  itemName: string
  serial: string | null
  state: 'ISSUED' | 'VIEWED' | 'ACTED' | 'REVOKED' | 'COMPLETED'
  issuedAt: string
  viewedAt: string | null
  expiresAt: string
  discrepancy: { note: string | null; actorLabel: string; at: string } | null
  allEvents: EventEntry[]
}

interface HubGroup {
  hubId: string | null
  hubName: string
  location: string | null
  email: string | null
  units: InboundUnit[]
}

// ── Helpers ────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const daysAgo = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

const ACTIVE_STATE_CHIP: Partial<Record<InboundUnit['state'], { label: string; color: 'warning' | 'info' | 'error' }>> = {
  ISSUED: { label: 'Awaiting receipt', color: 'warning' },
  VIEWED: { label: 'Viewed by hub', color: 'info' },
  ACTED: { label: 'Discrepancy', color: 'error' },
}

const RESOLVED_STATE_CHIP: Record<'REVOKED' | 'COMPLETED', { label: string; color: 'default' | 'success' }> = {
  REVOKED: { label: 'Dismissed', color: 'default' },
  COMPLETED: { label: 'Received', color: 'success' },
}

function resolveLabel(unit: InboundUnit): string {
  const ev = unit.allEvents.find((e) => e.action === 'DISMISSED' || e.action === 'RECEIVED')
  return ev ? `${ev.actorLabel} · ${fmtDateTime(ev.at)}` : ''
}

function resolutionNote(unit: InboundUnit): string | null {
  const ev = unit.allEvents.find((e) => e.action === 'DISMISSED' && e.note)
  return ev?.note ?? null
}

// ── Page ───────────────────────────────────────────────────────────

export default function AdminHubsPage() {
  const canEdit = useCanEdit()
  const [tab, setTab] = React.useState(0)

  // Hub CRUD state
  const [hubs, setHubs] = React.useState<Hub[]>([])
  const [hubsLoading, setHubsLoading] = React.useState(true)
  const [addHubOpen, setAddHubOpen] = React.useState(false)
  const [editHub, setEditHub] = React.useState<Hub | null>(null)
  const [hubForm, setHubForm] = React.useState({
    name: '', city: '', state: '', email: '', street1: '', street2: '', zip: '', country: 'US',
  })
  const [savingHub, setSavingHub] = React.useState(false)
  const [deleteHub, setDeleteHub] = React.useState<Hub | null>(null)
  const [toast, setToast] = React.useState('')
  const [hubError, setHubError] = React.useState('')

  // Inbound state
  const [inboundData, setInboundData] = React.useState<HubGroup[] | null>(null)
  const [counts, setCounts] = React.useState<{ totalPending: number; discrepancies: number }>({
    totalPending: 0, discrepancies: 0,
  })
  const [inboundFilter, setInboundFilter] = React.useState<'active' | 'resolved'>('active')

  // Dismiss dialog state (single or bulk)
  const [dismissTarget, setDismissTarget] = React.useState<string[] | null>(null) // statusLinkIds
  const [dismissNote, setDismissNote] = React.useState('')
  const [dismissing, setDismissing] = React.useState(false)

  // Discrepancy resolve dialog
  const [resolveUnit, setResolveUnit] = React.useState<InboundUnit | null>(null)
  const [resolving, setResolving] = React.useState(false)

  // Multi-select
  const multiSelect = useMultiSelect()
  const allVisibleIds = React.useMemo(
    () => inboundData?.flatMap((g) => g.units.map((u) => u.statusLinkId)) ?? [],
    [inboundData],
  )

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }
  const showError = (msg: string) => {
    setHubError(msg)
    setTimeout(() => setHubError(''), 6000)
  }

  const loadHubs = React.useCallback(async () => {
    setHubsLoading(true)
    try {
      const res = await fetch('/api/hubs')
      const data = res.ok ? await res.json() : null
      setHubs(Array.isArray(data) ? data : (data?.data ?? []))
    } catch {
      setHubs([])
    } finally {
      setHubsLoading(false)
    }
  }, [])

  const loadInbound = React.useCallback(async (filter: 'active' | 'resolved' = 'active') => {
    try {
      const qs = filter === 'resolved' ? '?filter=resolved' : ''
      const r = await fetch(`/api/hubs/inbound${qs}`)
      if (!r.ok) return
      const d = await r.json()
      setInboundData(d.data ?? [])
      setCounts(d.counts ?? { totalPending: 0, discrepancies: 0 })
      multiSelect.clear()
    } catch {
      setInboundData([])
    }
  }, [multiSelect])  // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    loadHubs()
    loadInbound('active')
  }, [loadHubs]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (_: React.MouseEvent, val: 'active' | 'resolved' | null) => {
    if (!val) return
    setInboundFilter(val)
    loadInbound(val)
  }

  // ── Single-item actions ────────────────────────────────────────

  const markReceived = async (statusLinkId: string) => {
    const res = await fetch(`/api/status-links/${statusLinkId}/receive`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    showToast(res.ok ? 'Marked received.' : typeof d.error === 'string' ? d.error : 'Could not mark received.')
    await loadInbound(inboundFilter)
  }

  const openDismiss = (statusLinkIds: string[]) => {
    setDismissTarget(statusLinkIds)
    setDismissNote('')
  }

  const confirmDismiss = async () => {
    if (!dismissTarget) return
    setDismissing(true)
    try {
      const results = await Promise.all(
        dismissTarget.map((id) =>
          fetch(`/api/status-links/${id}/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: dismissNote || undefined }),
          }),
        ),
      )
      const allOk = results.every((r) => r.ok)
      showToast(allOk
        ? dismissTarget.length === 1 ? 'Dismissed.' : `${dismissTarget.length} items dismissed.`
        : 'Some items could not be dismissed.')
      setDismissTarget(null)
      await loadInbound(inboundFilter)
    } finally {
      setDismissing(false)
    }
  }

  const reissueLink = async (statusLinkId: string) => {
    const res = await fetch(`/api/status-links/${statusLinkId}/reissue`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.url) {
      try {
        await navigator.clipboard.writeText(d.url)
        showToast('New link copied to clipboard.')
      } catch {
        showToast(`New link: ${d.url}`)
      }
    } else {
      showToast(typeof d.error === 'string' ? d.error : 'Could not reissue link.')
    }
    await loadInbound(inboundFilter)
  }

  // ── Discrepancy resolution ─────────────────────────────────────

  const resolveAccept = async () => {
    if (!resolveUnit) return
    setResolving(true)
    try {
      const res = await fetch(`/api/status-links/${resolveUnit.statusLinkId}/receive`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      showToast(res.ok ? 'Marked received — discrepancy closed.' : typeof d.error === 'string' ? d.error : 'Could not mark received.')
      setResolveUnit(null)
      await loadInbound(inboundFilter)
    } finally {
      setResolving(false)
    }
  }

  // ── Hub CRUD ───────────────────────────────────────────────────

  const openAddHub = () => {
    setHubForm({ name: '', city: '', state: '', email: '', street1: '', street2: '', zip: '', country: 'US' })
    setAddHubOpen(true)
  }
  const openEditHub = (hub: Hub) => {
    setEditHub(hub)
    setHubForm({
      name: hub.name, city: hub.city, state: hub.state, email: hub.email ?? '',
      street1: hub.street1 ?? '', street2: hub.street2 ?? '', zip: hub.zip ?? '',
      country: hub.country ?? 'US',
    })
  }

  const saveHub = async () => {
    setSavingHub(true)
    const url = editHub ? `/api/hubs/${editHub.id}` : '/api/hubs'
    const method = editHub ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hubForm),
    })
    setSavingHub(false)
    if (res.ok) {
      setAddHubOpen(false)
      setEditHub(null)
      showToast(editHub ? 'Hub updated' : 'Hub added')
      loadHubs()
    } else {
      const d = await res.json()
      showError(d.error ?? 'Failed to save hub')
    }
  }

  const deleteHubConfirm = async () => {
    if (!deleteHub) return
    const res = await fetch(`/api/hubs/${deleteHub.id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteHub(null)
      showToast('Hub deactivated')
      loadHubs()
    } else {
      const d = await res.json()
      setDeleteHub(null)
      showError(d.error ?? 'Failed to deactivate')
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  const bulkSelectedInView = allVisibleIds.filter((id) => multiSelect.isSelected(id))

  return (
    <Box>
      <Box mb={3}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h5">Hubs</Typography>
          {!canEdit && <Chip size="small" label="View only" variant="outlined" />}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Manage hub locations and view inbound equipment.
        </Typography>
      </Box>

      {toast && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setToast('')}>{toast}</Alert>}
      {hubError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setHubError('')}>{hubError}</Alert>}

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Hubs" />
        <Tab label={counts.totalPending ? `Inbound (${counts.totalPending})` : 'Inbound'} />
      </Tabs>

      {/* ── Hubs tab ── */}
      {tab === 0 && (
        <Box>
          <Stack direction="row" justifyContent="flex-end" mb={2}>
            <MutationButton variant="contained" startIcon={<AddIcon />} onClick={openAddHub}>
              Add Hub
            </MutationButton>
          </Stack>
          {hubsLoading ? (
            <CircularProgress size={24} />
          ) : (
            <Card>
              <CardContent>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
                        <TableCell>HUB NAME</TableCell>
                        <TableCell>CITY</TableCell>
                        <TableCell>STATE</TableCell>
                        <TableCell>EMAIL</TableCell>
                        <TableCell align="right">ACTIONS</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {hubs.map((hub) => (
                        <TableRow key={hub.id} sx={{ '&:last-child td': { border: 0 } }}>
                          <TableCell><Typography variant="body2">{hub.name}</Typography></TableCell>
                          <TableCell><Typography variant="body2">{hub.city}</Typography></TableCell>
                          <TableCell><Typography variant="body2">{hub.state}</Typography></TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">{hub.email ?? '—'}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <MutationIconButton size="small" tooltip="Edit" onClick={() => openEditHub(hub)}>
                                <EditIcon fontSize="small" />
                              </MutationIconButton>
                              <MutationIconButton size="small" tooltip="Deactivate" color="error" onClick={() => setDeleteHub(hub)}>
                                <DeleteIcon fontSize="small" />
                              </MutationIconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                      {hubs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                            No hubs yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* ── Inbound tab ── */}
      {tab === 1 && (
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" useFlexGap>
            {inboundFilter === 'active' && inboundData && inboundData.length > 0 && (
              <Stack direction="row" spacing={1}>
                <Chip
                  label={`${counts.totalPending} awaiting receipt`}
                  color={counts.totalPending ? 'warning' : 'default'}
                />
                {counts.discrepancies > 0 && (
                  <Chip
                    icon={<WarningAmberIcon />}
                    label={`${counts.discrepancies} discrepancy${counts.discrepancies !== 1 ? 's' : ''}`}
                    color="error"
                  />
                )}
              </Stack>
            )}
            {inboundFilter === 'resolved' && <Box />}
            <ToggleButtonGroup
              size="small"
              exclusive
              value={inboundFilter}
              onChange={handleFilterChange}
            >
              <ToggleButton value="active">Active</ToggleButton>
              <ToggleButton value="resolved">Dismissed &amp; Received</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {inboundData === null ? (
            <CircularProgress size={24} />
          ) : inboundData.length === 0 ? (
            inboundFilter === 'active'
              ? <Alert severity="success">Nothing inbound right now — every returned unit has been received.</Alert>
              : <Alert severity="info">No dismissed or received items to show.</Alert>
          ) : (
            <Stack spacing={3}>
              {inboundData.map((hub) => {
                const hubIds = hub.units.map((u) => u.statusLinkId)
                const allHubSelected = multiSelect.allSelected(hubIds)
                return (
                  <Card key={hub.hubId ?? 'unassigned'}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1} flexWrap="wrap" useFlexGap>
                        <Box>
                          <Typography variant="h6" fontWeight={600}>{hub.hubName}</Typography>
                          {hub.location && <Typography variant="body2" color="text.secondary">{hub.location}</Typography>}
                        </Box>
                        {hub.hubId && (
                          hub.email
                            ? <Chip size="small" icon={<EmailIcon sx={{ fontSize: 15 }} />} label={hub.email} variant="outlined" />
                            : <Chip size="small" color="warning" variant="outlined" label="No contact email — share links manually" />
                        )}
                      </Stack>
                      <Divider sx={{ mb: 1 }} />
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
                              {inboundFilter === 'active' && (
                                <TableCell padding="checkbox">
                                  <Tooltip title={allHubSelected ? 'Deselect all in this hub' : 'Select all in this hub'}>
                                    <Checkbox
                                      size="small"
                                      checked={allHubSelected}
                                      indeterminate={hubIds.some((id) => multiSelect.isSelected(id)) && !allHubSelected}
                                      onChange={() => multiSelect.toggleAll(hubIds)}
                                      icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                                      checkedIcon={<CheckBoxIcon fontSize="small" />}
                                    />
                                  </Tooltip>
                                </TableCell>
                              )}
                              <TableCell>ITEM</TableCell>
                              <TableCell>SERIAL</TableCell>
                              <TableCell>STATUS</TableCell>
                              <TableCell align="right">SENT</TableCell>
                              <TableCell align="right">{inboundFilter === 'active' ? 'EXPIRES' : 'RESOLVED'}</TableCell>
                              {inboundFilter === 'active' && <TableCell align="right">ACTIONS</TableCell>}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {hub.units.map((u) => {
                              const isResolved = u.state === 'REVOKED' || u.state === 'COMPLETED'
                              const stateChip = isResolved
                                ? RESOLVED_STATE_CHIP[u.state as 'REVOKED' | 'COMPLETED']
                                : ACTIVE_STATE_CHIP[u.state as 'ISSUED' | 'VIEWED' | 'ACTED']
                              const resNote = resolutionNote(u)
                              const resolvedBy = resolveLabel(u)

                              return (
                                <TableRow
                                  key={u.statusLinkId}
                                  selected={multiSelect.isSelected(u.statusLinkId)}
                                  sx={{ '&:last-child td': { border: 0 } }}
                                >
                                  {inboundFilter === 'active' && (
                                    <TableCell padding="checkbox">
                                      <Checkbox
                                        size="small"
                                        checked={multiSelect.isSelected(u.statusLinkId)}
                                        onChange={() => multiSelect.toggle(u.statusLinkId)}
                                      />
                                    </TableCell>
                                  )}
                                  <TableCell>
                                    <Typography variant="body2">{u.itemName}</Typography>
                                    {u.discrepancy && (
                                      <Typography variant="caption" color="error" display="block">
                                        {u.discrepancy.actorLabel}: {u.discrepancy.note || 'reported a discrepancy'}
                                      </Typography>
                                    )}
                                    {resNote && (
                                      <Typography variant="caption" color="text.secondary" display="block">
                                        Note: {resNote}
                                      </Typography>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" color="text.secondary">{u.serial ?? '—'}</Typography>
                                  </TableCell>
                                  <TableCell>
                                    {stateChip && (
                                      <Chip
                                        size="small"
                                        label={stateChip.label}
                                        color={stateChip.color as 'warning' | 'info' | 'error' | 'success' | 'default'}
                                        variant={u.state === 'ACTED' ? 'filled' : 'outlined'}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell align="right">
                                    <Typography variant="body2" color="text.secondary">
                                      {fmtDate(u.issuedAt)} · {daysAgo(u.issuedAt)}d ago
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right">
                                    {isResolved ? (
                                      <Typography variant="caption" color="text.secondary">
                                        {resolvedBy}
                                      </Typography>
                                    ) : (
                                      <Typography
                                        variant="body2"
                                        color={new Date(u.expiresAt).getTime() < Date.now() ? 'error' : 'text.secondary'}
                                      >
                                        {fmtDate(u.expiresAt)}
                                      </Typography>
                                    )}
                                  </TableCell>
                                  {inboundFilter === 'active' && (
                                    <TableCell align="right">
                                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                        {u.state === 'ACTED' ? (
                                          // Discrepancy row — review required before receive/dismiss
                                          <>
                                            <MutationButton
                                              size="small"
                                              color="warning"
                                              variant="contained"
                                              onClick={() => setResolveUnit(u)}
                                            >
                                              Review
                                            </MutationButton>
                                            <MutationButton
                                              size="small"
                                              variant="outlined"
                                              onClick={() => reissueLink(u.statusLinkId)}
                                            >
                                              Copy link
                                            </MutationButton>
                                          </>
                                        ) : (
                                          <>
                                            <MutationButton size="small" onClick={() => markReceived(u.statusLinkId)}>
                                              Received
                                            </MutationButton>
                                            <MutationButton
                                              size="small"
                                              variant="outlined"
                                              onClick={() => reissueLink(u.statusLinkId)}
                                            >
                                              Copy link
                                            </MutationButton>
                                            <MutationButton
                                              size="small"
                                              color="error"
                                              onClick={() => openDismiss([u.statusLinkId])}
                                            >
                                              Dismiss
                                            </MutationButton>
                                          </>
                                        )}
                                      </Stack>
                                    </TableCell>
                                  )}
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                )
              })}
            </Stack>
          )}
        </Box>
      )}

      {/* ── Add/Edit Hub Dialog ── */}
      <Dialog
        open={addHubOpen || !!editHub}
        onClose={() => { setAddHubOpen(false); setEditHub(null) }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{editHub ? 'Edit Hub' : 'Add Hub'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Hub Name"
              value={hubForm.name}
              onChange={(e) => setHubForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              label="City"
              value={hubForm.city}
              onChange={(e) => setHubForm((f) => ({ ...f, city: e.target.value }))}
              fullWidth
            />
            <TextField
              label="State (2-letter)"
              value={hubForm.state}
              onChange={(e) => setHubForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
              fullWidth
              inputProps={{ maxLength: 2 }}
            />
            <TextField
              label="Contact email (optional)"
              type="email"
              value={hubForm.email}
              onChange={(e) => setHubForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
              helperText="If set, return-to-hub confirmation links are emailed here automatically."
            />
            <TextField
              label="Street address (optional)"
              value={hubForm.street1}
              onChange={(e) => setHubForm((f) => ({ ...f, street1: e.target.value }))}
              fullWidth
              placeholder="e.g. 123 Main St"
            />
            <TextField
              label="Street 2 (optional)"
              value={hubForm.street2}
              onChange={(e) => setHubForm((f) => ({ ...f, street2: e.target.value }))}
              fullWidth
              placeholder="e.g. Suite 200"
            />
            <Stack direction="row" spacing={1}>
              <TextField
                label="Zip"
                value={hubForm.zip}
                onChange={(e) => setHubForm((f) => ({ ...f, zip: e.target.value }))}
                sx={{ flex: 1 }}
                helperText={hubForm.street1 ? 'Required with address' : undefined}
              />
              <TextField
                label="Country"
                value={hubForm.country}
                onChange={(e) => setHubForm((f) => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))}
                inputProps={{ maxLength: 2 }}
                sx={{ width: 90 }}
                helperText="2-letter"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddHubOpen(false); setEditHub(null) }} disabled={savingHub}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveHub}
            disabled={!hubForm.name.trim() || !hubForm.city.trim() || hubForm.state.length !== 2 || savingHub}
            startIcon={savingHub ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {savingHub ? 'Saving…' : editHub ? 'Save' : 'Add Hub'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dismiss Dialog ── */}
      <Dialog
        open={!!dismissTarget}
        onClose={() => !dismissing && setDismissTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {dismissTarget?.length === 1 ? 'Dismiss this item?' : `Dismiss ${dismissTarget?.length ?? 0} items?`}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {dismissTarget && dismissTarget.length !== 1 ? 'The units' : 'The unit'}{' '}
            will be marked available and removed from the inbound queue.
            Viewable later under &quot;Dismissed &amp; Received&quot;.
          </Typography>
          <TextField
            label="Resolution note (optional)"
            value={dismissNote}
            onChange={(e) => setDismissNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            placeholder="e.g. Hub confirmed equipment was received informally; no formal receipt needed."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDismissTarget(null)} disabled={dismissing}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDismiss}
            disabled={dismissing}
            startIcon={dismissing ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {dismissing ? 'Working…' : 'Dismiss'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Discrepancy Review Dialog ── */}
      <Dialog
        open={!!resolveUnit}
        onClose={() => !resolving && setResolveUnit(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Review Discrepancy</DialogTitle>
        <DialogContent>
          {resolveUnit && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2">{resolveUnit.itemName}</Typography>
                {resolveUnit.serial && (
                  <Typography variant="body2" color="text.secondary">Serial: {resolveUnit.serial}</Typography>
                )}
              </Box>
              {resolveUnit.discrepancy && (
                <Alert severity="warning" icon={<WarningAmberIcon />}>
                  <Typography variant="body2" fontWeight={600}>
                    {resolveUnit.discrepancy.actorLabel} · {fmtDateTime(resolveUnit.discrepancy.at)}
                  </Typography>
                  <Typography variant="body2">
                    {resolveUnit.discrepancy.note || 'Hub reported a discrepancy but left no note.'}
                  </Typography>
                </Alert>
              )}
              <Divider />
              <Typography variant="body2" color="text.secondary">
                Choose a resolution:
              </Typography>
              <Stack direction="row" spacing={2}>
                <Box flex={1} border={1} borderColor="divider" borderRadius={1} p={2}>
                  <Typography variant="subtitle2" gutterBottom>Accept hub&apos;s report</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Mark the item received as-is. The unit returns to Available.
                  </Typography>
                  <MutationButton
                    fullWidth
                    variant="contained"
                    color="success"
                    onClick={resolveAccept}
                    disabled={resolving}
                    startIcon={resolving ? <CircularProgress size={16} color="inherit" /> : null}
                  >
                    {resolving ? 'Working…' : 'Mark Received'}
                  </MutationButton>
                </Box>
                <Box flex={1} border={1} borderColor="divider" borderRadius={1} p={2}>
                  <Typography variant="subtitle2" gutterBottom>Dismiss</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Close without receiving — add a note explaining the decision.
                  </Typography>
                  <MutationButton
                    fullWidth
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      const id = resolveUnit.statusLinkId
                      setResolveUnit(null)
                      openDismiss([id])
                    }}
                    disabled={resolving}
                  >
                    Dismiss with Note
                  </MutationButton>
                </Box>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResolveUnit(null)} disabled={resolving}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Hub deactivate confirm ── */}
      <ConfirmDialog
        open={!!deleteHub}
        title={`Deactivate "${deleteHub?.name ?? ''}"?`}
        message="This hub will be hidden from the hub list. Items assigned to it will retain their assignment."
        confirmLabel="Delete"
        confirmColor="error"
        onClose={() => setDeleteHub(null)}
        onConfirm={deleteHubConfirm}
      />

      {/* ── Bulk action bar ── */}
      {tab === 1 && inboundFilter === 'active' && (
        <BulkActionBar
          count={bulkSelectedInView.length}
          noun="unit"
          onClear={multiSelect.clear}
          actions={[
            {
              label: 'Receive',
              color: 'primary',
              onClick: async () => {
                const ids = [...bulkSelectedInView]
                multiSelect.clear()
                await Promise.all(ids.map((id) =>
                  fetch(`/api/status-links/${id}/receive`, { method: 'POST' }),
                ))
                showToast(`${ids.length} item${ids.length !== 1 ? 's' : ''} marked received.`)
                await loadInbound('active')
              },
            },
            {
              label: 'Dismiss',
              color: 'error',
              variant: 'outlined',
              onClick: () => openDismiss([...bulkSelectedInView]),
            },
          ]}
        />
      )}
    </Box>
  )
}
