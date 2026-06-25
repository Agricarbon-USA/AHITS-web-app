'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Stack, Alert,
  IconButton, Tooltip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Card, CardContent, Switch, FormControlLabel,
} from '@mui/material'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ChecklistTemplatesSection } from '@/components/admin/ChecklistTemplatesSection'
import { ALERT_LABELS } from '@/lib/alert-display'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'

// ── Types ─────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  sortOrder: number
}

// ── Settings Page ─────────────────────────────────────────────────

export default function SettingsPage() {
  const [categories, setCategories] = React.useState<Category[]>([])
  const [toast, setToast] = React.useState('')
  const [error, setError] = React.useState('')

  // Category state
  const [editingCatId, setEditingCatId] = React.useState<string | null>(null)
  const [editingCatName, setEditingCatName] = React.useState('')
  const [savingCatId, setSavingCatId] = React.useState<string | null>(null)
  const [addCatOpen, setAddCatOpen] = React.useState(false)
  const [newCatName, setNewCatName] = React.useState('')
  const [addingCat, setAddingCat] = React.useState(false)
  const [deleteCat, setDeleteCat] = React.useState<Category | null>(null)

  // Notification config state
  const [notifCutoff, setNotifCutoff] = React.useState('18:00')
  const [notifDisabled, setNotifDisabled] = React.useState<string[]>([])
  const [notifTypes, setNotifTypes] = React.useState<string[]>([])
  const [notifSaving, setNotifSaving] = React.useState(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 6000) }

  const loadCategories = React.useCallback(async () => {
    const res = await fetch('/api/categories')
    const data = await res.json()
    setCategories(data)
  }, [])

  const loadConfig = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notification-config')
      if (!res.ok) return
      const { data } = await res.json()
      setNotifCutoff(data.dailyCheckCutoff ?? '18:00')
      setNotifDisabled(data.disabledAlertTypes ?? [])
      setNotifTypes(data.configurableTypes ?? [])
    } catch {
      /* non-fatal — section just shows defaults */
    }
  }, [])

  React.useEffect(() => {
    loadCategories()
    loadConfig()
  }, [loadCategories, loadConfig])

  const saveConfig = async () => {
    setNotifSaving(true)
    try {
      const res = await fetch('/api/admin/notification-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyCheckCutoff: notifCutoff, disabledAlertTypes: notifDisabled }),
      })
      if (!res.ok) { showError('Could not save notification settings.'); return }
      showToast('Notification settings saved')
    } catch {
      showError('Could not save notification settings.')
    } finally {
      setNotifSaving(false)
    }
  }

  // Category CRUD
  const startEditCat = (cat: Category) => {
    setEditingCatId(cat.id)
    setEditingCatName(cat.name)
  }
  const cancelEditCat = () => { setEditingCatId(null); setEditingCatName('') }

  const saveCat = async (id: string) => {
    setSavingCatId(id)
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingCatName }),
    })
    setSavingCatId(null)
    if (res.ok) {
      setEditingCatId(null)
      showToast('Category updated')
      loadCategories()
    } else {
      const d = await res.json()
      showError(d.error ?? 'Failed to update')
    }
  }

  const addCat = async () => {
    if (!newCatName.trim()) return
    setAddingCat(true)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim() }),
    })
    setAddingCat(false)
    if (res.ok) {
      setAddCatOpen(false)
      setNewCatName('')
      showToast('Category added')
      loadCategories()
    } else {
      const d = await res.json()
      showError(d.error ?? 'Failed to add')
    }
  }

  const deleteCatConfirm = async () => {
    if (!deleteCat) return
    const res = await fetch(`/api/categories/${deleteCat.id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteCat(null)
      showToast('Category deleted')
      loadCategories()
    } else {
      const d = await res.json()
      setDeleteCat(null)
      showError(d.error ?? 'Failed to delete')
    }
  }

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h5">Settings</Typography>
        <Typography variant="body2" color="text.secondary">Manage dropdown lists used across the application</Typography>
      </Box>

      {toast && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setToast('')}>{toast}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Notifications */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} mb={0.5}>Notifications</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Control which alerts notify admins and the daily-check cutoff time.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Daily-check cutoff"
              type="time"
              value={notifCutoff}
              onChange={(e) => setNotifCutoff(e.target.value)}
              sx={{ width: 200 }}
              InputLabelProps={{ shrink: true }}
              helperText="Checks not submitted by this time count as missed."
            />
            <Box>
              <Typography variant="subtitle2" mb={0.5}>Alert notifications</Typography>
              <Stack>
                {notifTypes.map((t) => (
                  <FormControlLabel
                    key={t}
                    control={
                      <Switch
                        checked={!notifDisabled.includes(t)}
                        onChange={(e) =>
                          setNotifDisabled((prev) => (e.target.checked ? prev.filter((x) => x !== t) : [...prev, t]))
                        }
                      />
                    }
                    label={ALERT_LABELS[t] ?? t}
                  />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Operator PIN-lock alerts always notify and aren&rsquo;t listed.
              </Typography>
            </Box>
            <Box>
              <Button variant="contained" onClick={saveConfig} disabled={notifSaving}>
                {notifSaving ? 'Saving…' : 'Save notification settings'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Daily-Check Checklists (M5-25) */}
      <ChecklistTemplatesSection onToast={showToast} onError={showError} />

      {/* Equipment Categories */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600}>Equipment Categories</Typography>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setAddCatOpen(true)}>
              Add Category
            </Button>
          </Stack>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
                  <TableCell>NAME</TableCell>
                  <TableCell align="right">ACTIONS</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id} sx={{ '&:last-child td': { border: 0 } }}>
                    <TableCell>
                      {editingCatId === cat.id ? (
                        <TextField
                          size="small"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          autoFocus
                          sx={{ minWidth: 200 }}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCat(cat.id); if (e.key === 'Escape') cancelEditCat() }}
                        />
                      ) : (
                        <Typography variant="body2">{cat.name}</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {editingCatId === cat.id ? (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Save">
                            <IconButton size="small" color="primary" onClick={() => saveCat(cat.id)}
                              disabled={savingCatId === cat.id}>
                              {savingCatId === cat.id ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Cancel">
                            <IconButton size="small" onClick={cancelEditCat}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Rename">
                            <IconButton size="small" onClick={() => startEditCat(cat)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => setDeleteCat(cat)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No categories yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Hub Locations */}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" fontWeight={600}>Hub Locations</Typography>
              <Typography variant="body2" color="text.secondary">Add, edit, and deactivate hub locations.</Typography>
            </Box>
            <Button variant="outlined" component="a" href="/admin/hubs">Manage hubs →</Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Add Category Dialog */}
      <Dialog open={addCatOpen} onClose={() => { setAddCatOpen(false); setNewCatName('') }} maxWidth="xs" fullWidth>
        <DialogTitle>Add Category</DialogTitle>
        <DialogContent>
          <TextField
            label="Category Name"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') addCat() }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddCatOpen(false); setNewCatName('') }} disabled={addingCat}>Cancel</Button>
          <Button variant="contained" onClick={addCat} disabled={!newCatName.trim() || addingCat}
            startIcon={addingCat ? <CircularProgress size={16} color="inherit" /> : null}>
            {addingCat ? 'Adding…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Category Confirm */}
      <ConfirmDialog
        open={!!deleteCat}
        title={`Delete "${deleteCat?.name ?? ''}"?`}
        message="This will permanently delete this category. Any items using it must be reassigned first."
        confirmLabel="Delete"
        confirmColor="error"
        onClose={() => setDeleteCat(null)}
        onConfirm={deleteCatConfirm}
      />
    </Box>
  )
}
