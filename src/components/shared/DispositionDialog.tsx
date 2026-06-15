'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Box, Typography, IconButton,
  CircularProgress, MenuItem, Alert, Table, TableBody,
  TableCell, TableHead, TableRow, Radio, RadioGroup,
  FormControlLabel, Card, CardActionArea, CardContent,
} from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import PersonIcon from '@mui/icons-material/Person'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CloseIcon from '@mui/icons-material/Close'
import { createClient } from '@/lib/supabase/client'

export interface KitItemSummary {
  kitItemId: string
  itemId: string
  name: string
  quantity: number
  itemType?: string
}

export interface HubOption { id: string; name: string; city: string; state: string }
export interface UserOption { id: string; name: string; role: string }

type DispType = 'HUB' | 'TRANSFER' | 'INOPERABLE'
type RepairT = 'IN_FIELD' | 'AT_SHOP' | 'SHIP_TO_HUB' | 'SHIP_FOR_REPAIR'

interface ItemDisp {
  type: DispType
  hubId?: string
  toOperatorId?: string
  canBeFixed?: boolean
  repairType?: RepairT
  shopName?: string
  shopAddress?: string
  dateDelivered?: string
  purchaseOrder?: string
  invoiceNumber?: string
  repairHubId?: string
  inoperableNotes?: string
  photoUrls?: string[]
}

type Phase = 'bulk' | 'review' | 'inop-photo-desc' | 'inop-can-fix' | 'inop-repair-type' | 'confirm'

interface UploadingPhoto { name: string; uploading: boolean; url: string | null }

export interface DispositionDialogProps {
  open: boolean
  items: KitItemSummary[]
  deploymentId: string
  currentOperatorId: string
  operators: UserOption[]
  hubs: HubOption[]
  onComplete: () => void
  onClose: () => void
  mode: 'end-deployment' | 'remove-items'
}

export function DispositionDialog({
  open, items, deploymentId, currentOperatorId, operators, hubs,
  onComplete, onClose, mode,
}: DispositionDialogProps) {
  const [phase, setPhase] = React.useState<Phase>('bulk')
  const [bulkType, setBulkType] = React.useState<DispType | null>(null)
  const [bulkHubId, setBulkHubId] = React.useState('')
  const [bulkOperatorId, setBulkOperatorId] = React.useState('')
  const [dispositions, setDispositions] = React.useState<Record<string, ItemDisp>>({})
  const [inopQueue, setInopQueue] = React.useState<string[]>([])
  const [inopIdx, setInopIdx] = React.useState(0)
  const [inopPhotos, setInopPhotos] = React.useState<Record<string, UploadingPhoto[]>>({})
  const [inopNotes, setInopNotes] = React.useState<Record<string, string>>({})
  const [repairType, setRepairType] = React.useState<RepairT | ''>('')
  const [shopName, setShopName] = React.useState('')
  const [shopAddress, setShopAddress] = React.useState('')
  const [dateDelivered, setDateDelivered] = React.useState('')
  const [purchaseOrder, setPurchaseOrder] = React.useState('')
  const [invoiceNumber, setInvoiceNumber] = React.useState('')
  const [repairHubId, setRepairHubId] = React.useState('')
  const [overallNote, setOverallNote] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) {
      setPhase('bulk')
      setBulkType(null)
      setBulkHubId('')
      setBulkOperatorId('')
      setDispositions({})
      setInopQueue([])
      setInopIdx(0)
      setInopPhotos({})
      setInopNotes({})
      setRepairType('')
      setShopName(''); setShopAddress(''); setDateDelivered('')
      setPurchaseOrder(''); setInvoiceNumber(''); setRepairHubId('')
      setOverallNote('')
      setError('')
    }
  }, [open])

  const otherOperators = operators.filter((o) => o.id !== currentOperatorId)
  const currentInopId = inopQueue[inopIdx] ?? ''
  const currentInopItem = items.find((i) => i.kitItemId === currentInopId)
  const currentPhotos = currentInopId ? (inopPhotos[currentInopId] ?? []) : []
  const currentNote = currentInopId ? (inopNotes[currentInopId] ?? '') : ''

  const handleFiles = async (files: FileList) => {
    if (!currentInopId) return
    const supabase = createClient()
    const offset = (inopPhotos[currentInopId] ?? []).length
    const newPhotos: UploadingPhoto[] = Array.from(files).map((f) => ({ name: f.name, uploading: true, url: null }))
    setInopPhotos((prev) => ({ ...prev, [currentInopId]: [...(prev[currentInopId] ?? []), ...newPhotos] }))

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = `rig-events/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const { data, error: upErr } = await supabase.storage.from('photos').upload(path, file, { upsert: false })
      const url = upErr || !data ? null : supabase.storage.from('photos').getPublicUrl(data.path).data.publicUrl
      setInopPhotos((prev) => {
        const list = [...(prev[currentInopId] ?? [])]
        list[offset + i] = { ...list[offset + i], uploading: false, url }
        return { ...prev, [currentInopId]: list }
      })
    }
  }

  const removePhoto = (idx: number) => {
    if (!currentInopId) return
    setInopPhotos((prev) => ({ ...prev, [currentInopId]: (prev[currentInopId] ?? []).filter((_, i) => i !== idx) }))
  }

  const buildDisps = (): Record<string, ItemDisp> => {
    const base: ItemDisp = { type: bulkType! }
    if (bulkType === 'HUB') base.hubId = bulkHubId
    if (bulkType === 'TRANSFER') base.toOperatorId = bulkOperatorId
    const next: Record<string, ItemDisp> = {}
    for (const item of items) next[item.kitItemId] = { ...base }
    return next
  }

  const collectInopQueue = (disps: Record<string, ItemDisp>) =>
    items.filter((i) => disps[i.kitItemId]?.type === 'INOPERABLE').map((i) => i.kitItemId)

  const proceedFromBulk = () => {
    const disps = buildDisps()
    setDispositions(disps)
    if (items.length > 1) {
      setPhase('review')
    } else if (bulkType === 'INOPERABLE') {
      setInopQueue([items[0].kitItemId])
      setInopIdx(0)
      setPhase('inop-photo-desc')
    } else {
      setPhase('confirm')
    }
  }

  const proceedFromReview = () => {
    const queue = collectInopQueue(dispositions)
    setInopQueue(queue)
    setInopIdx(0)
    setPhase(queue.length > 0 ? 'inop-photo-desc' : 'confirm')
  }

  const resetRepairFields = () => {
    setRepairType('')
    setShopName(''); setShopAddress(''); setDateDelivered('')
    setPurchaseOrder(''); setInvoiceNumber(''); setRepairHubId('')
  }

  const advanceInopQueue = (idx: number) => {
    const nextIdx = idx + 1
    if (nextIdx < inopQueue.length) {
      setInopIdx(nextIdx)
      resetRepairFields()
      setPhase('inop-photo-desc')
    } else {
      setPhase('confirm')
    }
  }

  const confirmInopNoFix = () => {
    const id = inopQueue[inopIdx]
    setDispositions((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        canBeFixed: false,
        inoperableNotes: inopNotes[id] ?? '',
        photoUrls: (inopPhotos[id] ?? []).filter((p) => p.url).map((p) => p.url!),
      },
    }))
    advanceInopQueue(inopIdx)
  }

  const confirmInopRepair = () => {
    const id = inopQueue[inopIdx]
    setDispositions((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        canBeFixed: true,
        repairType: (repairType as RepairT) || undefined,
        shopName: shopName || undefined,
        shopAddress: shopAddress || undefined,
        dateDelivered: dateDelivered || undefined,
        purchaseOrder: purchaseOrder || undefined,
        invoiceNumber: invoiceNumber || undefined,
        repairHubId: repairHubId || undefined,
        inoperableNotes: inopNotes[id] ?? '',
        photoUrls: (inopPhotos[id] ?? []).filter((p) => p.url).map((p) => p.url!),
      },
    }))
    advanceInopQueue(inopIdx)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    const itemDispositions = items.map((item) => ({
      kitItemId: item.kitItemId,
      ...(dispositions[item.kitItemId] ?? { type: 'HUB' as DispType }),
    }))
    const url = mode === 'end-deployment'
      ? `/api/deployments/${deploymentId}/end`
      : `/api/deployments/${deploymentId}/items`
    const res = await fetch(url, {
      method: mode === 'end-deployment' ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: overallNote, itemDispositions }),
    })
    setSubmitting(false)
    if (res.ok) {
      onComplete()
    } else {
      const d = await res.json().catch(() => ({}))
      setError(typeof d.error === 'string' ? d.error : 'Something went wrong')
    }
  }

  const stillUploading = currentPhotos.some((p) => p.uploading)
  const hasEnoughPhotos = currentPhotos.filter((p) => p.url).length >= 1
  const hasEnoughNote = currentNote.length >= 10
  const bulkCanProceed = bulkType !== null
    && (bulkType !== 'HUB' || !!bulkHubId)
    && (bulkType !== 'TRANSFER' || !!bulkOperatorId)

  const getDispLabel = (disp: ItemDisp | undefined) => {
    if (!disp) return '—'
    if (disp.type === 'HUB') {
      const h = hubs.find((h) => h.id === disp.hubId)
      return h ? `Return to ${h.name} (${h.city})` : 'Return to Hub'
    }
    if (disp.type === 'TRANSFER') {
      const o = operators.find((o) => o.id === disp.toOperatorId)
      return o ? `Transfer to ${o.name}` : 'Transfer'
    }
    return disp.canBeFixed === false
      ? 'Inoperable — pending admin review'
      : 'Inoperable — sent for repair'
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>

      {/* ── BULK ─────────────────────────────────────────────────── */}
      {phase === 'bulk' && (
        <>
          <DialogTitle>
            {items.length === 1 ? `Where is ${items[0].name} going?` : 'Where is this equipment going?'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} pt={0.5}>
              <Stack direction="row" spacing={2}>
                {(['HUB', 'TRANSFER', 'INOPERABLE'] as DispType[]).map((t) => (
                  <Card key={t} variant="outlined" sx={{
                    flex: 1,
                    borderColor: bulkType === t ? 'primary.main' : 'divider',
                    borderWidth: bulkType === t ? 2 : 1,
                  }}>
                    <CardActionArea onClick={() => { setBulkType(t) }} sx={{ p: 2, height: '100%' }}>
                      <CardContent sx={{ p: 0 }}>
                        <Box mb={0.75}>
                          {t === 'HUB' && <HomeIcon color={bulkType === 'HUB' ? 'primary' : 'action'} />}
                          {t === 'TRANSFER' && <PersonIcon color={bulkType === 'TRANSFER' ? 'primary' : 'action'} />}
                          {t === 'INOPERABLE' && <WarningAmberIcon color={bulkType === 'INOPERABLE' ? 'warning' : 'action'} />}
                        </Box>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {t === 'HUB' && 'Return to Hub'}
                          {t === 'TRANSFER' && 'Transfer to Operator'}
                          {t === 'INOPERABLE' && 'Inoperable'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t === 'HUB' && 'Item goes back to a hub'}
                          {t === 'TRANSFER' && 'Initiate a pending transfer'}
                          {t === 'INOPERABLE' && 'Item is damaged or broken'}
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>

              {bulkType === 'HUB' && (
                <TextField select label="Select Hub" value={bulkHubId}
                  onChange={(e) => setBulkHubId(e.target.value)} fullWidth>
                  {hubs.map((h) => (
                    <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>
                  ))}
                </TextField>
              )}

              {bulkType === 'TRANSFER' && (
                <TextField select label="Transfer to Operator" value={bulkOperatorId}
                  onChange={(e) => setBulkOperatorId(e.target.value)} fullWidth>
                  {otherOperators.map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" disabled={!bulkCanProceed} onClick={proceedFromBulk}>
              {items.length > 1 && bulkType !== 'INOPERABLE' ? 'Apply to All & Review' : 'Continue'}
            </Button>
          </DialogActions>
        </>
      )}

      {/* ── REVIEW ───────────────────────────────────────────────── */}
      {phase === 'review' && (
        <>
          <DialogTitle>Review Item Dispositions</DialogTitle>
          <DialogContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Destination</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => {
                  const disp = dispositions[item.kitItemId]
                  const isInop = disp?.type === 'INOPERABLE'
                  return (
                    <TableRow key={item.kitItemId}
                      sx={{ bgcolor: isInop ? 'warning.50' : 'inherit' }}>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {isInop && <WarningAmberIcon color="warning" fontSize="small" />}
                          <Typography variant="body2">{item.name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell><Typography variant="body2">×{item.quantity}</Typography></TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <TextField select size="small" value={disp?.type ?? 'HUB'}
                            onChange={(e) => {
                              const type = e.target.value as DispType
                              setDispositions((prev) => ({
                                ...prev,
                                [item.kitItemId]: {
                                  type,
                                  hubId: type === 'HUB' ? (bulkHubId || undefined) : undefined,
                                  toOperatorId: type === 'TRANSFER' ? (bulkOperatorId || undefined) : undefined,
                                },
                              }))
                            }}
                            sx={{ minWidth: 150 }}>
                            <MenuItem value="HUB">Return to Hub</MenuItem>
                            <MenuItem value="TRANSFER">Transfer</MenuItem>
                            <MenuItem value="INOPERABLE">Inoperable</MenuItem>
                          </TextField>
                          {disp?.type === 'HUB' && (
                            <TextField select size="small" value={disp.hubId ?? ''} sx={{ minWidth: 130 }}
                              onChange={(e) => setDispositions((prev) => ({
                                ...prev, [item.kitItemId]: { ...prev[item.kitItemId], hubId: e.target.value },
                              }))}>
                              {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.city}</MenuItem>)}
                            </TextField>
                          )}
                          {disp?.type === 'TRANSFER' && (
                            <TextField select size="small" value={disp.toOperatorId ?? ''} sx={{ minWidth: 130 }}
                              onChange={(e) => setDispositions((prev) => ({
                                ...prev, [item.kitItemId]: { ...prev[item.kitItemId], toOperatorId: e.target.value },
                              }))}>
                              {otherOperators.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
                            </TextField>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPhase('bulk')}>Back</Button>
            <Button variant="contained" onClick={proceedFromReview}>Continue</Button>
          </DialogActions>
        </>
      )}

      {/* ── INOP PHOTO + DESC ────────────────────────────────────── */}
      {phase === 'inop-photo-desc' && currentInopItem && (
        <>
          <DialogTitle>{currentInopItem.name} — What happened?</DialogTitle>
          <DialogContent>
            <Stack spacing={2} pt={0.5}>
              <Alert severity="warning">Attach at least one photo showing the damage</Alert>
              <Box>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files) }}
                />
                <Button size="small" variant="outlined" startIcon={<CameraAltIcon />}
                  onClick={() => fileInputRef.current?.click()} disabled={stillUploading}>
                  Add Photos
                </Button>
                {currentPhotos.length > 0 && (
                  <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap">
                    {currentPhotos.map((p, i) => (
                      <Box key={i} sx={{ position: 'relative', width: 64, height: 64 }}>
                        {p.uploading ? (
                          <Box sx={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                            <CircularProgress size={24} />
                          </Box>
                        ) : p.url ? (
                          <Box component="img" src={p.url} alt={p.name}
                            sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }} />
                        ) : (
                          <Box sx={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'error.main', borderRadius: 1 }}>
                            <Typography variant="caption" color="error">!</Typography>
                          </Box>
                        )}
                        <IconButton size="small" onClick={() => removePhoto(i)}
                          sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: 0.25 }}>
                          <CloseIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
              <TextField
                label="Describe the issue (required, min 10 chars)"
                value={currentNote}
                onChange={(e) => setInopNotes((prev) => ({ ...prev, [currentInopId]: e.target.value }))}
                multiline rows={3}
                fullWidth required
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPhase(items.length > 1 ? 'review' : 'bulk')}>Back</Button>
            <Button variant="contained"
              disabled={!hasEnoughPhotos || !hasEnoughNote || stillUploading}
              onClick={() => setPhase('inop-can-fix')}>
              Next
            </Button>
          </DialogActions>
        </>
      )}

      {/* ── INOP CAN FIX ─────────────────────────────────────────── */}
      {phase === 'inop-can-fix' && currentInopItem && (
        <>
          <DialogTitle>Can the {currentInopItem.name} be repaired?</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" pt={0.5}>
              If yes, select a repair method. If no, an admin will review and approve retirement.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
            <Button onClick={() => setPhase('inop-photo-desc')}>Back</Button>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" color="error" onClick={confirmInopNoFix}>
                No — flag for retirement
              </Button>
              <Button variant="contained" onClick={() => setPhase('inop-repair-type')}>
                Yes — it can be repaired
              </Button>
            </Stack>
          </DialogActions>
        </>
      )}

      {/* ── INOP REPAIR TYPE ─────────────────────────────────────── */}
      {phase === 'inop-repair-type' && currentInopItem && (
        <>
          <DialogTitle>How will the {currentInopItem.name} be repaired?</DialogTitle>
          <DialogContent>
            <Stack spacing={2} pt={0.5}>
              <RadioGroup value={repairType}
                onChange={(e) => { setRepairType(e.target.value as RepairT); resetRepairFields(); setRepairType(e.target.value as RepairT) }}>
                <FormControlLabel value="IN_FIELD" control={<Radio />} label="Fix it in the field" />
                <FormControlLabel value="AT_SHOP" control={<Radio />} label="Take it to a shop" />
                <FormControlLabel value="SHIP_TO_HUB" control={<Radio />} label="Ship it to a hub" />
                <FormControlLabel value="SHIP_FOR_REPAIR" control={<Radio />} label="Ship it for external repair" />
              </RadioGroup>

              {(repairType === 'AT_SHOP' || repairType === 'SHIP_FOR_REPAIR') && (
                <Stack spacing={1.5} pl={1}>
                  <TextField size="small" label="Shop Name (optional)" value={shopName} onChange={(e) => setShopName(e.target.value)} fullWidth />
                  <TextField size="small" label="Shop Address (optional)" value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} fullWidth />
                  <TextField size="small" label="Date Delivered (optional)" type="date" value={dateDelivered} onChange={(e) => setDateDelivered(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
                  <TextField size="small" label="Purchase Order (optional)" value={purchaseOrder} onChange={(e) => setPurchaseOrder(e.target.value)} fullWidth />
                  <TextField size="small" label="Invoice # (optional)" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} fullWidth />
                  {/* TODO: Shippo integration */}
                  <Button disabled variant="outlined" size="small">Create Shipping Label (coming soon)</Button>
                </Stack>
              )}

              {repairType === 'SHIP_TO_HUB' && (
                <Stack spacing={1.5} pl={1}>
                  <TextField select label="Ship to Hub (required)" value={repairHubId}
                    onChange={(e) => setRepairHubId(e.target.value)} fullWidth>
                    {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="Date Shipped (optional)" type="date" value={dateDelivered} onChange={(e) => setDateDelivered(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
                  {/* TODO: Shippo integration */}
                  <Button disabled variant="outlined" size="small">Create Shipping Label (coming soon)</Button>
                </Stack>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPhase('inop-can-fix')}>Back</Button>
            <Button variant="contained"
              disabled={!repairType || (repairType === 'SHIP_TO_HUB' && !repairHubId)}
              onClick={confirmInopRepair}>
              Next
            </Button>
          </DialogActions>
        </>
      )}

      {/* ── CONFIRM ──────────────────────────────────────────────── */}
      {phase === 'confirm' && (
        <>
          <DialogTitle>
            {mode === 'end-deployment' ? 'Confirm — End Deployment' : 'Confirm — Remove Items'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} pt={0.5}>
              {error && <Alert severity="error">{error}</Alert>}
              <Box>
                <Typography variant="subtitle2" fontWeight={600} mb={0.75}>Summary</Typography>
                <Stack spacing={0.5}>
                  {items.map((item) => (
                    <Typography key={item.kitItemId} variant="body2">
                      • {item.name}{item.quantity > 1 ? ` (×${item.quantity})` : ''} → {getDispLabel(dispositions[item.kitItemId])}
                    </Typography>
                  ))}
                </Stack>
              </Box>
              <TextField
                label="Overall note (required)"
                value={overallNote}
                onChange={(e) => setOverallNote(e.target.value)}
                multiline rows={3}
                fullWidth required
                placeholder="Describe what happened overall"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button
              variant="contained"
              color={mode === 'end-deployment' ? 'error' : 'primary'}
              disabled={overallNote.trim().length < 1 || submitting}
              onClick={handleSubmit}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {submitting ? 'Submitting…' : mode === 'end-deployment' ? 'End Deployment' : 'Remove Items'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}
