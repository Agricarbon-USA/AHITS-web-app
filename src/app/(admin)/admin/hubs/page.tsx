'use client'

import * as React from 'react'
import {
  Box, Typography, Card, CardContent, Stack, Chip, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Divider,
  Tabs, Tab, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip,
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import EmailIcon from '@mui/icons-material/Email'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCanEdit, MutationButton, MutationIconButton } from '@/components/shared/ReadOnly'

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

interface InboundUnit {
  statusLinkId: string
  unitId: string | null
  itemName: string
  serial: string | null
  state: 'ISSUED' | 'VIEWED' | 'ACTED'
  issuedAt: string
  viewedAt: string | null
  expiresAt: string
  discrepancy: { note: string | null; actorLabel: string; at: string } | null
}
interface HubGroup {
  hubId: string | null
  hubName: string
  location: string | null
  email: string | null
  units: InboundUnit[]
}

// ── Inbound helpers ────────────────────────────────────────────────

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

const STATE_CHIP: Record<InboundUnit['state'], { label: string; color: 'warning' | 'info' | 'error' }> = {
  ISSUED: { label: 'Awaiting receipt', color: 'warning' },
  VIEWED: { label: 'Viewed by hub', color: 'info' },
  ACTED: { label: 'Discrepancy', color: 'error' },
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
  const [hubForm, setHubForm] = React.useState({ name: '', city: '', state: '', email: '', street1: '', street2: '', zip: '', country: 'US' })
  const [savingHub, setSavingHub] = React.useState(false)
  const [deleteHub, setDeleteHub] = React.useState<Hub | null>(null)
  const [toast, setToast] = React.useState('')
  const [hubError, setHubError] = React.useState('')

  // Inbound state
  const [inboundData, setInboundData] = React.useState<HubGroup[] | null>(null)
  const [counts, setCounts] = React.useState<{ totalPending: number; discrepancies: number }>({ totalPending: 0, discrepancies: 0 })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const showError = (msg: string) => { setHubError(msg); setTimeout(() => setHubError(''), 6000) }

  const loadHubs = React.useCallback(async () => {
    setHubsLoading(true)
    const res = await fetch('/api/hubs')
    const data = await res.json()
    setHubs(data)
    setHubsLoading(false)
  }, [])

  const loadInbound = React.useCallback(async () => {
    try {
      const r = await fetch('/api/hubs/inbound')
      if (!r.ok) return
      const d = await r.json()
      setInboundData(d.data ?? [])
      setCounts(d.counts ?? { totalPending: 0, discrepancies: 0 })
    } catch {
      setInboundData([])
    }
  }, [])

  React.useEffect(() => {
    loadHubs()
    loadInbound()
  }, [loadHubs, loadInbound])

  // W0-9: admin actions for the hub-return loop — usable even for email-less hubs
  // (both staging hubs), where the auto-delivery links can't reach anyone.
  const markReceived = async (statusLinkId: string) => {
    const res = await fetch(`/api/status-links/${statusLinkId}/receive`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    showToast(res.ok ? 'Marked received.' : typeof d.error === 'string' ? d.error : 'Could not mark received.')
    await loadInbound()
  }
  const dismissLink = async (statusLinkId: string) => {
    const res = await fetch(`/api/status-links/${statusLinkId}/revoke`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    showToast(res.ok ? 'Dismissed.' : typeof d.error === 'string' ? d.error : 'Could not dismiss.')
    await loadInbound()
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
    await loadInbound()
  }

  const openAddHub = () => { setHubForm({ name: '', city: '', state: '', email: '', street1: '', street2: '', zip: '', country: 'US' }); setAddHubOpen(true) }
  const openEditHub = (hub: Hub) => {
    setEditHub(hub)
    setHubForm({ name: hub.name, city: hub.city, state: hub.state, email: hub.email ?? '', street1: hub.street1 ?? '', street2: hub.street2 ?? '', zip: hub.zip ?? '', country: hub.country ?? 'US' })
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

      {tab === 1 && (
        <Box>
          {inboundData && inboundData.length > 0 && (
            <Stack direction="row" spacing={1} mb={2}>
              <Chip label={`${counts.totalPending} awaiting receipt`} color={counts.totalPending ? 'warning' : 'default'} />
              {counts.discrepancies > 0 && (
                <Chip icon={<WarningAmberIcon />} label={`${counts.discrepancies} discrepancy${counts.discrepancies !== 1 ? 's' : ''}`} color="error" />
              )}
            </Stack>
          )}

          {inboundData === null ? (
            <CircularProgress size={24} />
          ) : inboundData.length === 0 ? (
            <Alert severity="success">Nothing inbound right now — every returned unit has been received.</Alert>
          ) : (
            <Stack spacing={3}>
              {inboundData.map((hub) => (
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
                            <TableCell>ITEM</TableCell>
                            <TableCell>SERIAL</TableCell>
                            <TableCell>STATUS</TableCell>
                            <TableCell align="right">SENT</TableCell>
                            <TableCell align="right">EXPIRES</TableCell>
                            <TableCell align="right">ACTIONS</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {hub.units.map((u) => (
                            <TableRow key={u.statusLinkId} sx={{ '&:last-child td': { border: 0 } }}>
                              <TableCell>
                                <Typography variant="body2">{u.itemName}</Typography>
                                {u.discrepancy && (
                                  <Typography variant="caption" color="error">
                                    {u.discrepancy.actorLabel}: {u.discrepancy.note || 'reported a discrepancy'}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" color="text.secondary">{u.serial ?? '—'}</Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={STATE_CHIP[u.state].label}
                                  color={STATE_CHIP[u.state].color}
                                  variant={u.state === 'ACTED' ? 'filled' : 'outlined'}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" color="text.secondary">
                                  {fmtDate(u.issuedAt)} · {daysAgo(u.issuedAt)}d ago
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography
                                  variant="body2"
                                  color={new Date(u.expiresAt).getTime() < Date.now() ? 'error' : 'text.secondary'}
                                >
                                  {fmtDate(u.expiresAt)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                  <MutationButton size="small" onClick={() => markReceived(u.statusLinkId)}>Received</MutationButton>
                                  <MutationButton size="small" variant="outlined" onClick={() => reissueLink(u.statusLinkId)}>Copy link</MutationButton>
                                  <MutationButton size="small" color="error" onClick={() => dismissLink(u.statusLinkId)}>Dismiss</MutationButton>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* Add/Edit Hub Dialog */}
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

      <ConfirmDialog
        open={!!deleteHub}
        title={`Deactivate "${deleteHub?.name ?? ''}"?`}
        message="This hub will be hidden from the hub list. Items assigned to it will retain their assignment."
        confirmLabel="Delete"
        confirmColor="error"
        onClose={() => setDeleteHub(null)}
        onConfirm={deleteHubConfirm}
      />
    </Box>
  )
}
