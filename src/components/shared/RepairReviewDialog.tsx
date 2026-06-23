'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Alert,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, TextField, MenuItem, CircularProgress,
} from '@mui/material'
import type { HubOption } from '@/components/shared/DispositionDialog'

/**
 * Admin review of an INOPERABLE unit → send for repair (creates a maintenance
 * task via /api/inventory/[itemId]/review-inoperable). Shared by the Inventory
 * detail and the Maintenance "needs review" surface so the review lives where
 * the admin already is, not buried four clicks deep in inventory (UX-13).
 */
export function RepairReviewDialog({
  open, itemId, unitId, hubs, onClose, onSuccess,
}: {
  open: boolean
  itemId: string
  unitId: string
  hubs: HubOption[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [repairType, setRepairType] = React.useState('')
  const [shopName, setShopName] = React.useState('')
  const [shopAddress, setShopAddress] = React.useState('')
  const [dateDelivered, setDateDelivered] = React.useState('')
  const [purchaseOrder, setPurchaseOrder] = React.useState('')
  const [invoiceNumber, setInvoiceNumber] = React.useState('')
  const [repairHubId, setRepairHubId] = React.useState('')
  const [note, setNote] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!open) {
      setRepairType(''); setShopName(''); setShopAddress(''); setDateDelivered('')
      setPurchaseOrder(''); setInvoiceNumber(''); setRepairHubId(''); setNote(''); setError('')
    }
  }, [open])

  const handleSubmit = async () => {
    if (!repairType) { setError('Select a repair type'); return }
    if (!note.trim()) { setError('Note is required'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/inventory/${itemId}/review-inoperable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unitId,
        decision: 'REPAIR', repairType, note,
        shopName: shopName || undefined,
        shopAddress: shopAddress || undefined,
        dateDelivered: dateDelivered || undefined,
        purchaseOrder: purchaseOrder || undefined,
        invoiceNumber: invoiceNumber || undefined,
        repairHubId: repairHubId || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) { onSuccess() }
    else { const d = await res.json().catch(() => ({})); setError(typeof d.error === 'string' ? d.error : 'Failed') }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Send for Repair</DialogTitle>
      <DialogContent>
        <Stack spacing={2} pt={0.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormControl required>
            <FormLabel>Repair Method</FormLabel>
            <RadioGroup value={repairType} onChange={(e) => setRepairType(e.target.value)}>
              <FormControlLabel value="IN_FIELD" control={<Radio />} label="Fix it in the field" />
              <FormControlLabel value="AT_SHOP" control={<Radio />} label="Take it to a shop" />
              <FormControlLabel value="SHIP_TO_HUB" control={<Radio />} label="Ship it to a hub" />
              <FormControlLabel value="SHIP_FOR_REPAIR" control={<Radio />} label="Ship for external repair" />
            </RadioGroup>
          </FormControl>
          {(repairType === 'AT_SHOP' || repairType === 'SHIP_FOR_REPAIR') && (
            <Stack spacing={1.5}>
              <TextField size="small" label="Shop Name (optional)" value={shopName} onChange={(e) => setShopName(e.target.value)} fullWidth />
              <TextField size="small" label="Shop Address (optional)" value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} fullWidth />
              <TextField size="small" label="Date Delivered (optional)" type="date" value={dateDelivered} onChange={(e) => setDateDelivered(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField size="small" label="Purchase Order (optional)" value={purchaseOrder} onChange={(e) => setPurchaseOrder(e.target.value)} fullWidth />
              <TextField size="small" label="Invoice # (optional)" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} fullWidth />
            </Stack>
          )}
          {repairType === 'SHIP_TO_HUB' && (
            <Stack spacing={1.5}>
              <TextField select label="Ship to Hub" value={repairHubId} onChange={(e) => setRepairHubId(e.target.value)} fullWidth required>
                {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Date Shipped (optional)" type="date" value={dateDelivered} onChange={(e) => setDateDelivered(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            </Stack>
          )}
          <TextField label="Admin note (required)" value={note} onChange={(e) => setNote(e.target.value)} multiline rows={2} fullWidth required />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
          {loading ? 'Saving…' : 'Send for Repair'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
