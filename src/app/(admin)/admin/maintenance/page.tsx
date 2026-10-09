'use client'

import * as React from 'react'
import { formatDate } from '@/lib/utils'
import {
  Box, Typography, Stack, Chip, Divider, Button, TextField, MenuItem,
  TableCell, TableRow, Paper,
  Tabs, Tab, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { PagedTable } from '@/components/ui/PagedTable'
import { useListQuery } from '@/hooks/useListQuery'
import { fetchPickerOptions } from '@/lib/inventory-options'
import BuildIcon from '@mui/icons-material/Build'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { useToast } from '@/components/shared/useToast'
import { useInvalidation } from '@/hooks/useInvalidation'
import { copy } from '@/lib/copy/admin-actions'
import { apiErrorMessage } from '@/lib/api-error-shape'
import { StatusChip } from '@/components/shared/StatusChip'
import { RepairReviewDialog } from '@/components/shared/RepairReviewDialog'
import { PhotoGallery } from '@/components/shared/PhotoGallery'
import { useCanEdit, MutationButton } from '@/components/shared/ReadOnly'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { emailOutcomeToast, type EmailReport } from '@/lib/email-outcome'

interface InoperableUnit {
  id: string
  itemId: string
  itemName: string
  label: string
  inoperableNotes: string | null
  reportedAt: string | null
}

// ── Types ─────────────────────────────────────────────────────────
interface Ref { id: string; name: string }
interface UnitRef { id: string; qrCodeId: string; serialNumber: string | null; status: string }
interface PhotoRef { id: string; url: string; takenAt: string }

interface MaintenanceTask {
  id: string
  taskName: string
  status: string
  priority: string
  isDamageReport: boolean
  repairType: string | null
  resolutionPath: string | null
  intervalType: string
  intervalValue: number
  nextDue: string | null
  nextOdometer: number | null
  completedAt: string | null
  dateDelivered: string | null
  shopName: string | null
  shopAddress: string | null
  purchaseOrder: string | null
  invoiceNumber: string | null
  locationNote: string | null
  estimatedCost: string | null
  actualCost: string | null
  notes: string | null
  createdAt: string
  vehicle: Ref | null
  item: Ref | null
  unit: UnitRef | null
  repairHub: Ref | null
  hub: Ref | null
  photos: PhotoRef[]
  // CC-34 (1b): the deployment a damage report came from + who reported it (scalar FKs
  // resolved server-side). Null for schedules / admin field-fix / review-inoperable.
  rig: { id: string; label: string | null } | null
  reportedBy: { id: string; name: string } | null
}

type HubOption = { id: string; name: string; city: string; state: string }

type FilterKey = 'damage' | 'overdue' | 'active' | 'completed' | 'all'

const REPAIR_TYPES = [
  { value: 'IN_FIELD', label: 'Fixed in field' },
  { value: 'AT_SHOP', label: 'At a shop' },
  { value: 'SHIP_TO_HUB', label: 'Ship to hub' },
  { value: 'SHIP_FOR_REPAIR', label: 'Ship for repair' },
]

const fmtDate = (s: string | null | undefined) =>
  formatDate(s)
const fmtMoney = (s: string | null | undefined) =>
  s != null && s !== '' ? `$${Number(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const toDateInput = (s: string | null | undefined) => (s ? new Date(s).toISOString().slice(0, 10) : '')

// Editable draft of the fields the admin can change from this screen.
interface Draft {
  repairType: string
  repairHubId: string
  shopName: string
  shopAddress: string
  purchaseOrder: string
  invoiceNumber: string
  dateDelivered: string
  estimatedCost: string
  actualCost: string
  locationNote: string
  notes: string
}

function draftFrom(t: MaintenanceTask): Draft {
  return {
    repairType: t.repairType ?? '',
    repairHubId: t.repairHub?.id ?? '',
    shopName: t.shopName ?? '',
    shopAddress: t.shopAddress ?? '',
    purchaseOrder: t.purchaseOrder ?? '',
    invoiceNumber: t.invoiceNumber ?? '',
    dateDelivered: toDateInput(t.dateDelivered),
    estimatedCost: t.estimatedCost ?? '',
    actualCost: t.actualCost ?? '',
    locationNote: t.locationNote ?? '',
    notes: t.notes ?? '',
  }
}

// Compact chip for a task's most-recent work-order link state (shop scoreboard).
const WO_CHIP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'success' }> = {
  ISSUED: { label: 'Sent', color: 'info' },
  VIEWED: { label: 'Viewed', color: 'info' },
  ACTED: { label: 'In progress', color: 'warning' },
  COMPLETED: { label: 'Completed', color: 'success' },
  REVOKED: { label: 'Dismissed', color: 'default' }, // CC-24: one verb — matches the hub flow's "Dismissed" (DB enum stays REVOKED)
  EXPIRED: { label: 'Expired', color: 'default' },
}
function woChip(state?: string) {
  if (!state) return <Typography variant="body2" color="text.secondary">—</Typography>
  const c = WO_CHIP[state] ?? { label: state, color: 'default' as const }
  return <Chip size="small" variant="outlined" color={c.color} label={c.label} />
}

export default function AdminMaintenancePage() {
  const canEdit = useCanEdit()
  const showToast = useToast()
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [filter, setFilter] = React.useState<FilterKey>('damage')
  // PR-1a (L-1/C-1/U-4/P-11): the tab is a SERVER filter and the rows are paged.
  // This page used to fetch `/api/maintenance` bare — the first 25 tasks, sorted
  // so scheduled "upcoming" items came first — then regroup THAT page under the
  // tabs. Past 25 tasks the Damage and Overdue tabs silently lost rows, their
  // counts were the counts of a page, and an alert's "View" opened nothing.
  const q = useListQuery<MaintenanceTask>({
    endpoint: '/api/maintenance',
    params: { tab: filter },
    errorMessage: 'Could not load maintenance tasks.',
  })
  const tasks = q.rows
  const loading = q.loading
  // `q.reload` is stable for a given query, so this stays a safe effect dep.
  const reload = q.reload
  const load = React.useCallback(() => { void reload({ bypassCache: true }) }, [reload])
  // C-1: the tab badges are the server's facet counts over the SAME `where` as
  // the rows — never the length of what this page happened to fetch.
  const facets = (q.extra.facets ?? null) as { damage: number; overdue: number; active: number; completed: number } | null
  const [selected, setSelected] = React.useState<MaintenanceTask | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [completionOdo, setCompletionOdo] = React.useState('')
  // A.4: close-repair return-destination picker (damage reports only).
  const [closeOpen, setCloseOpen] = React.useState(false)
  const [closeHubId, setCloseHubId] = React.useState('')
  const [closeMethod, setCloseMethod] = React.useState<'' | 'DELIVER' | 'SHIP'>('')
  const [shopEmail, setShopEmail] = React.useState('')
  // maintenanceTaskId → most-recent WORK_ORDER link state (the shop scoreboard).
  const [woLinks, setWoLinks] = React.useState<Map<string, string>>(new Map())
  // The raw URL of the link just issued (only available right after sending —
  // the token is never stored), shown so the admin can copy it manually.
  const [lastLink, setLastLink] = React.useState<string | null>(null)
  const autoOpenedRef = React.useRef(false)
  const [inoperable, setInoperable] = React.useState<InoperableUnit[]>([])
  const [repairUnit, setRepairUnit] = React.useState<InoperableUnit | null>(null)
  const [retireUnit, setRetireUnit] = React.useState<InoperableUnit | null>(null)
  const [retireNote, setRetireNote] = React.useState('')
  const [retiring, setRetiring] = React.useState(false)
  // CC-10: Log field fix dialog
  const [fieldFixOpen, setFieldFixOpen] = React.useState(false)
  const [fieldFixVehicles, setFieldFixVehicles] = React.useState<{ id: string; name: string }[]>([])
  const [fieldFixVehicleId, setFieldFixVehicleId] = React.useState('')
  const [fieldFixNotes, setFieldFixNotes] = React.useState('')
  const [fieldFixSaving, setFieldFixSaving] = React.useState(false)
  // CC-34 (2b): the admin field-fix can now log against a vehicle OR an inventory item —
  // the field-fix API has accepted itemId since CC-10, but every mount was vehicle-only.
  const [fieldFixSubject, setFieldFixSubject] = React.useState<'vehicle' | 'item'>('vehicle')
  const [fieldFixItems, setFieldFixItems] = React.useState<{ id: string; name: string }[]>([])
  const [fieldFixItemId, setFieldFixItemId] = React.useState('')
  // CC-34 (3a): Add scheduled task — the first UI caller of POST /api/maintenance, so
  // D24's named Wintex/Giddings service rows are finally enterable. PER_DEPLOYMENT is not
  // offered (D29-4); the zod enum keeps it dormant.
  const [schedOpen, setSchedOpen] = React.useState(false)
  const [schedSubject, setSchedSubject] = React.useState<'vehicle' | 'item'>('vehicle')
  const [schedVehicleId, setSchedVehicleId] = React.useState('')
  const [schedItemId, setSchedItemId] = React.useState('')
  const [schedVehicles, setSchedVehicles] = React.useState<{ id: string; name: string }[]>([])
  const [schedItems, setSchedItems] = React.useState<{ id: string; name: string }[]>([])
  const [schedTaskName, setSchedTaskName] = React.useState('')
  const [schedIntervalType, setSchedIntervalType] = React.useState<'DAYS' | 'MONTHS' | 'MILEAGE'>('DAYS')
  const [schedIntervalValue, setSchedIntervalValue] = React.useState('')
  const [schedPriority, setSchedPriority] = React.useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM')
  const [schedNextDue, setSchedNextDue] = React.useState('')
  const [schedNextOdometer, setSchedNextOdometer] = React.useState('')
  const [schedSaving, setSchedSaving] = React.useState(false)
  // CC-34 (3c): close a unit repair back to an active deployment (DEPLOYMENT destination),
  // not just a hub — the complete route already validates + stores it.
  const [closeDestType, setCloseDestType] = React.useState<'HUB' | 'DEPLOYMENT'>('HUB')
  const [closeRigId, setCloseRigId] = React.useState('')
  const [activeRigs, setActiveRigs] = React.useState<{ id: string; label: string; operatorName: string | null }[]>([])

  const loadInoperable = React.useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/inoperable-units')
      const json = await res.json()
      setInoperable(json.data ?? [])
    } catch {
      /* non-fatal — the review panel simply stays empty */
    }
  }, [])

  const submitRetire = async () => {
    if (!retireUnit || !retireNote.trim()) return
    setRetiring(true)
    try {
      const res = await fetch(`/api/inventory/${retireUnit.itemId}/review-inoperable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: retireUnit.id, decision: 'RETIRE', note: retireNote }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Retire failed', severity: 'error' })
        return
      }
      showToast({ message: copy('unit.retireInoperable').success(retireUnit.label), severity: 'success' })
      setRetireUnit(null); setRetireNote('')
      loadInoperable()
    } catch {
      showToast({ message: 'Retire failed', severity: 'error' })
    } finally {
      setRetiring(false)
    }
  }

  const loadLinks = React.useCallback(async () => {
    try {
      const res = await fetch('/api/status-links?type=WORK_ORDER')
      const json = await res.json()
      // Rows come newest-first, so the first link seen per task is the latest.
      const map = new Map<string, string>()
      for (const l of (json.data ?? []) as { maintenanceTaskId: string | null; state: string }[]) {
        if (l.maintenanceTaskId && !map.has(l.maintenanceTaskId)) map.set(l.maintenanceTaskId, l.state)
      }
      setWoLinks(map)
    } catch {
      /* non-fatal — the column simply shows no link state */
    }
  }, [])

  // PR-5: the task list re-reads through useListQuery; the side panels re-read here.
  useInvalidation(['maintenance', 'inventory'], () => { void loadInoperable(); void loadLinks() })

  React.useEffect(() => {
    // No `load()` here — useListQuery owns the task read and fetches on mount.
    loadLinks()
    loadInoperable()
    fetch('/api/hubs').then((r) => r.json()).then((d) => setHubs(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {})
    // CC-34 (3c): active deployments for the "return to a deployment" close destination.
    fetch('/api/deployments?active=true')
      .then((r) => r.json())
      .then((d: { id: string; label: string | null; operator?: { name: string | null } | null }[]) =>
        setActiveRigs((Array.isArray(d) ? d : []).map((r) => ({ id: r.id, label: r.label ?? 'Deployment', operatorName: r.operator?.name ?? null }))))
      .catch(() => {})
  }, [loadLinks, loadInoperable])

  const listError = q.error
  React.useEffect(() => {
    if (listError) showToast({ message: listError, severity: 'error' })
  }, [listError, showToast])

  // Deep link from a dashboard alert (?task=<id>) auto-opens that task once.
  // PR-1a (U-4/P-11): fetched by id through the new `GET /api/maintenance/[id]`,
  // so it opens whatever page or tab the task lives on. It used to search the one
  // page of rows this screen had loaded — past 25 tasks the link was a dead end
  // that silently did nothing. A closed-or-deleted task now says so.
  React.useEffect(() => {
    if (autoOpenedRef.current) return
    const taskId = new URLSearchParams(window.location.search).get('task')
    autoOpenedRef.current = true
    if (!taskId) return
    void (async () => {
      try {
        const res = await fetch(`/api/maintenance/${taskId}`)
        if (!res.ok) {
          showToast({ message: 'That repair is closed or no longer exists.', severity: 'info' })
          return
        }
        const json = await res.json()
        if (json?.data) openTask(json.data as MaintenanceTask)
      } catch {
        showToast({ message: 'Could not open that repair. Check your connection.', severity: 'error' })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [])

  // UXP-6 (6b): `?sched=vehicle:<id>` (the vehicle drawer's Setup block → "Service
  // schedules · Add") opens the Add-scheduled-task dialog prefilled with that vehicle —
  // the same URL grammar as ?task= / ?check= (D12-transitive), read once on mount.
  // `item:<id>` is accepted too so an inventory drawer can use the same door later.
  React.useEffect(() => {
    const sched = new URLSearchParams(window.location.search).get('sched')
    const m = sched ? /^(vehicle|item):(.+)$/.exec(sched) : null
    if (m) void openSched({ subject: m[1] as 'vehicle' | 'item', id: m[2] })
  }, [])

  // The rows ARE the tab — the server filtered them. No client re-filtering, which
  // is what made the tabs show a subset of a subset.
  const visible = tasks

  function openTask(t: MaintenanceTask) {
    setSelected(t)
    setDraft(draftFrom(t))
    setLastLink(null)
    setShopEmail('')
  }
  function closeDrawer() {
    setSelected(null)
    setDraft(null)
    setLastLink(null)
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      showToast({ message: copy('repair.copyLink').success, severity: 'success' })
    } catch {
      showToast({ message: 'Could not copy automatically — select the link and copy it.', severity: 'error' })
    }
  }

  async function patch(id: string, body: Record<string, unknown>, successMsg: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/maintenance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: apiErrorMessage(d, 'Update failed.'), severity: 'error' })
        return false
      }
      const d = await res.json()
      const updated: MaintenanceTask = { ...(selected as MaintenanceTask), ...d.data }
      setSelected((s) => (s && s.id === id ? updated : s))
      // The rows and the tab counts are server-owned; refetch rather than splice,
      // so a status change that moves the task to another tab is reflected.
      load()
      showToast({ message: successMsg, severity: 'success' })
      return true
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function sendToShop() {
    if (!selected) return
    if (!shopEmail.trim()) { showToast({ message: 'Enter the shop email first.', severity: 'error' }); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/maintenance/${selected.id}/send-to-shop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: shopEmail.trim(), recipientName: draft?.shopName || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not send work order.', severity: 'error' })
        return
      }
      // PR-4 (D-j · P-1): say where the work order actually went (the link is shown below to copy).
      showToast(emailOutcomeToast(d as EmailReport, 'Work order'))
      setLastLink(typeof d.url === 'string' ? d.url : null)
      setShopEmail('')
      loadLinks()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function saveDraft() {
    if (!selected || !draft) return
    await patch(selected.id, {
      repairType: draft.repairType || null,
      repairHubId: draft.repairHubId || null,
      shopName: draft.shopName || null,
      shopAddress: draft.shopAddress || null,
      purchaseOrder: draft.purchaseOrder || null,
      invoiceNumber: draft.invoiceNumber || null,
      dateDelivered: draft.dateDelivered ? new Date(draft.dateDelivered).toISOString() : null,
      estimatedCost: draft.estimatedCost === '' ? null : Number(draft.estimatedCost),
      actualCost: draft.actualCost === '' ? null : Number(draft.actualCost),
      locationNote: draft.locationNote || null,
      notes: draft.notes || null,
    }, copy('repair.saveDetails').success)
  }

  async function completeTask(
    t: MaintenanceTask,
    closeData?: { returnDestinationType: string; returnDestinationId: string; repairMethod?: string },
  ) {
    setSaving(true)
    try {
      const res = await fetch(`/api/maintenance/${t.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualCost: draft && draft.actualCost !== '' ? Number(draft.actualCost) : undefined,
          actualOdometer: completionOdo !== '' ? Number(completionOdo) : undefined,
          ...(closeData ?? {}),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not complete.', severity: 'error' })
        return
      }
      const d = await res.json()
      setSelected((s) => (s && s.id === t.id ? { ...s, ...d.data } : s))
      load()
      setCompletionOdo('')
      showToast({
        message: copy('repair.complete').success(t.isDamageReport ? (t.vehicle && !t.unit ? 'vehicle' : 'unit') : 'scheduled'),
        severity: 'success',
      })
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(t: MaintenanceTask, status: string) {
    const body: Record<string, unknown> = { status }
    if (status === 'COMPLETED') body.completedAt = new Date().toISOString()
    if (status === 'IN_PROGRESS') body.completedAt = null
    await patch(t.id, body, copy('repair.setStatus').success(status))
  }

  const setD = (patchObj: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patchObj } : d))

  async function openFieldFix() {
    setFieldFixSubject('vehicle')
    setFieldFixVehicleId('')
    setFieldFixItemId('')
    setFieldFixNotes('')
    setFieldFixOpen(true)
    try {
      // PR-1b (L-2): `?mode=options` — the whole catalog, not the first 100 by
      // name. A field fix is most often logged against gear that is OUT, which is
      // exactly the gear the alphabetical cap tended to hide.
      const [vRes, picker] = await Promise.all([fetch('/api/vehicles'), fetchPickerOptions()])
      const vd = await vRes.json()
      setFieldFixVehicles((vd.data ?? []).map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })))
      setFieldFixItems(picker.options.map((i) => ({ id: i.id, name: i.name })))
    } catch {
      setFieldFixVehicles([])
      setFieldFixItems([])
    }
  }

  async function submitFieldFix() {
    const subjectId = fieldFixSubject === 'vehicle' ? fieldFixVehicleId : fieldFixItemId
    if (!subjectId || !fieldFixNotes.trim()) return
    setFieldFixSaving(true)
    try {
      const res = await fetch('/api/maintenance/field-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          fieldFixSubject === 'vehicle'
            ? { vehicleId: fieldFixVehicleId, notes: fieldFixNotes.trim() }
            : { itemId: fieldFixItemId, notes: fieldFixNotes.trim() },
        ),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not log fix.', severity: 'error' })
        return
      }
      showToast({ message: copy('repair.fieldFix').success, severity: 'success' })
      setFieldFixOpen(false)
      load()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setFieldFixSaving(false)
    }
  }

  // CC-34 (3a): open the Add-scheduled-task dialog. Reuses /api/vehicles + /api/inventory
  // for the subject picker (SearchableSelect). `prefill` (UXP-6 6b, from ?sched=) selects
  // the subject up front; the picker shows its name once the list lands.
  async function openSched(prefill?: { subject: 'vehicle' | 'item'; id: string }) {
    setSchedSubject(prefill?.subject ?? 'vehicle')
    setSchedVehicleId(prefill?.subject === 'vehicle' ? prefill.id : '')
    setSchedItemId(prefill?.subject === 'item' ? prefill.id : '')
    setSchedTaskName('')
    setSchedIntervalType('DAYS')
    setSchedIntervalValue('')
    setSchedPriority('MEDIUM')
    setSchedNextDue('')
    setSchedNextOdometer('')
    setSchedOpen(true)
    try {
      // PR-1b (L-2): the whole catalog — a service schedule may be added to any
      // item, including one with nothing currently available.
      const [vRes, picker] = await Promise.all([fetch('/api/vehicles'), fetchPickerOptions()])
      const vd = await vRes.json()
      setSchedVehicles((vd.data ?? []).map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })))
      setSchedItems(picker.options.map((i) => ({ id: i.id, name: i.name })))
    } catch {
      setSchedVehicles([])
      setSchedItems([])
    }
  }

  async function submitSched() {
    const subjectId = schedSubject === 'vehicle' ? schedVehicleId : schedItemId
    const interval = Number(schedIntervalValue)
    if (!subjectId || !schedTaskName.trim() || !Number.isInteger(interval) || interval < 1) return
    setSchedSaving(true)
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(schedSubject === 'vehicle' ? { vehicleId: schedVehicleId } : { itemId: schedItemId }),
          taskName: schedTaskName.trim(),
          intervalType: schedIntervalType,
          intervalValue: interval,
          priority: schedPriority,
          // Native date input → ISO datetime; server defaults it from the interval when omitted.
          ...(schedNextDue && (schedIntervalType === 'DAYS' || schedIntervalType === 'MONTHS')
            ? { nextDue: new Date(schedNextDue).toISOString() } : {}),
          ...(schedNextOdometer && schedIntervalType === 'MILEAGE'
            ? { nextOdometer: Number(schedNextOdometer) } : {}),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not add scheduled task.', severity: 'error' })
        return
      }
      showToast({ message: copy('repair.addSchedule').success, severity: 'success' })
      setSchedOpen(false)
      load()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setSchedSaving(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5} flexWrap="wrap" gap={1}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <BuildIcon color="action" />
          <Typography variant="h5">Maintenance</Typography>
          {!canEdit && <Chip size="small" label="View only" variant="outlined" />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <MutationButton size="small" variant="outlined" onClick={() => openSched()}>Add scheduled task</MutationButton>
          <MutationButton size="small" variant="outlined" onClick={openFieldFix}>Log field fix</MutationButton>
        </Stack>
      </Stack>
      <Typography color="text.secondary" mb={2} variant="body2">
        Damage reports from the field and scheduled vehicle/equipment service. Assign a shop or hub, track the repair, and close it out.
      </Typography>

      {inoperable.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'error.main' }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}>
            <WarningAmberIcon color="error" fontSize="small" />
            <Typography variant="subtitle2">Inoperable units — needs review ({inoperable.length})</Typography>
          </Stack>
          <Stack divider={<Divider />}>
            {inoperable.map((u) => (
              <Stack key={u.id} direction="row" alignItems="center" spacing={1} py={0.75} flexWrap="wrap">
                <Box flexGrow={1} minWidth={180}>
                  <Typography variant="body2" fontWeight={500}>{u.itemName} · {u.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {u.inoperableNotes ? u.inoperableNotes : 'Reported inoperable'}{u.reportedAt ? ` · ${fmtDate(u.reportedAt)}` : ''}
                  </Typography>
                </Box>
                <MutationButton size="small" variant="outlined" onClick={() => setRepairUnit(u)}>Send for repair</MutationButton>
                <MutationButton size="small" variant="outlined" color="error" onClick={() => { setRetireUnit(u); setRetireNote('') }}>Retire</MutationButton>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      {/* C-1: the badges are the server's facet counts over the same `where` as the
          rows, so a tab's number and its row count cannot disagree. Changing tab
          re-reads the server and goes back to page 1. */}
      <Tabs
        value={filter}
        onChange={(_, v: FilterKey) => { setFilter(v); q.setPage(0) }}
        sx={{ mb: 2 }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab value="damage" label={<Stack direction="row" spacing={1} alignItems="center"><span>Damage reports</span>{!!facets && facets.damage > 0 && <Chip size="small" color="error" label={facets.damage} />}</Stack>} />
        <Tab value="overdue" label={<Stack direction="row" spacing={1} alignItems="center"><span>Overdue</span>{!!facets && facets.overdue > 0 && <Chip size="small" color="warning" label={facets.overdue} />}</Stack>} />
        <Tab value="active" label={`In progress${facets && facets.active ? ` (${facets.active})` : ''}`} />
        <Tab value="completed" label={`Completed${facets && facets.completed ? ` (${facets.completed})` : ''}`} />
        <Tab value="all" label="All" />
      </Tabs>

      <PagedTable
        colSpan={9}
        total={q.total}
        page={q.page}
        pageSize={q.pageSize}
        truncated={q.truncated}
        loading={loading}
        onPageChange={q.setPage}
        onPageSizeChange={q.setPageSize}
        itemNoun="repairs"
        skeletonRows={4}
        emptyMessage={filter === 'damage'
          ? 'No open damage reports. Field-reported damage will appear here.'
          : 'Nothing here right now.'}
        head={
            <TableRow>
              <TableCell>Subject</TableCell>
              <TableCell>Task</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Reported / Due</TableCell>
              <TableCell>Shop / Hub</TableCell>
              <TableCell>Work order</TableCell>
              <TableCell align="right">Cost</TableCell>
            </TableRow>
        }
      >
            {visible.map((t) => (
              <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => openTask(t)}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{t.item?.name ?? t.vehicle?.name ?? '—'}</Typography>
                  {t.unit?.serialNumber && <Typography variant="caption" color="text.secondary">S/N {t.unit.serialNumber}</Typography>}
                </TableCell>
                <TableCell><Typography variant="body2">{t.taskName}</Typography></TableCell>
                <TableCell>
                  {t.isDamageReport
                    ? <Chip size="small" color="error" variant="outlined" icon={<WarningAmberIcon />} label="Damage" />
                    : <Chip size="small" variant="outlined" label="Scheduled" />}
                </TableCell>
                <TableCell><StatusChip status={t.status} kind="maintenance" /></TableCell>
                <TableCell><StatusChip status={t.priority} kind="priority" variant="outlined" /></TableCell>
                <TableCell>
                  {/* CC-34 (1b): damage rows show who reported it and from which deployment,
                      not just a bare date; schedules keep the due date. */}
                  {t.isDamageReport ? (
                    <>
                      <Typography variant="body2">
                        {[t.reportedBy?.name, t.rig?.label].filter(Boolean).join(' · ') || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{fmtDate(t.createdAt)}</Typography>
                    </>
                  ) : (
                    <Typography variant="body2">{fmtDate(t.nextDue)}</Typography>
                  )}
                </TableCell>
                <TableCell><Typography variant="body2">{t.shopName ?? t.repairHub?.name ?? '—'}</Typography></TableCell>
                <TableCell>{woChip(woLinks.get(t.id))}</TableCell>
                <TableCell align="right"><Typography variant="body2">{fmtMoney(t.actualCost ?? t.estimatedCost)}</Typography></TableCell>
              </TableRow>
            ))}
      </PagedTable>

      <DetailDrawer open={!!selected} onClose={closeDrawer} width={460} paperSx={{ p: 0 }}>
        {selected && draft && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* UXP-1f: close X moved into DetailDrawer (44px, below the AppBar, never
                the bell). pr:6 keeps a long task name clear of it. */}
            <Box sx={{ p: 2, pb: 1 }}>
              <Typography variant="h6" sx={{ pr: 6 }}>{selected.taskName}</Typography>
            </Box>
            <Divider />
            <Box sx={{ p: 2, overflowY: 'auto', flexGrow: 1 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1}>
                <StatusChip status={selected.status} kind="maintenance" />
                <StatusChip status={selected.priority} kind="priority" variant="outlined" />
                {selected.isDamageReport && <Chip size="small" color="error" variant="outlined" icon={<WarningAmberIcon />} label="Damage report" />}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {selected.item?.name ?? selected.vehicle?.name ?? 'Unassigned subject'}
                {selected.unit?.serialNumber ? ` · S/N ${selected.unit.serialNumber}` : ''}
              </Typography>
              {selected.unit && (
                <Box mt={0.5}><StatusChip status={selected.unit.status} kind="equipment" /></Box>
              )}
              {/* CC-34 (1b): who reported this damage and from which deployment. */}
              {selected.isDamageReport && (selected.reportedBy || selected.rig) && (
                <Typography variant="body2" color="text.secondary" mt={1}>
                  Reported{selected.reportedBy ? ` by ${selected.reportedBy.name}` : ''}
                  {selected.rig ? ` · from ${selected.rig.label ?? 'a deployment'}` : ''}
                </Typography>
              )}
              {!selected.isDamageReport && (
                <Typography variant="body2" color="text.secondary" mt={1}>
                  Every {selected.intervalValue} {selected.intervalType.toLowerCase()} · Next due {fmtDate(selected.nextDue)}
                </Typography>
              )}

              {selected.photos.length > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" color="text.secondary">Photos</Typography>
                  <Box mt={0.5}>
                    <PhotoGallery
                      photos={selected.photos.map((p) => ({ id: p.id, url: p.url, takenAt: p.takenAt, damage: selected.isDamageReport }))}
                    />
                  </Box>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" mb={1.5}>Repair details</Typography>
              {/* CC-34 (3c): one-tap shop status (D29-3 "≤2 clicks") — each chip PATCHes immediately. */}
              {canEdit && selected.status !== 'COMPLETED' && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.5}>
                  <Chip
                    size="small"
                    variant="outlined"
                    clickable
                    disabled={saving}
                    label="Delivered to shop today"
                    onClick={() => patch(selected.id, { dateDelivered: new Date().toISOString() }, copy('repair.markDelivered').success)}
                  />
                  {selected.status !== 'IN_PROGRESS' && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="warning"
                      clickable
                      disabled={saving}
                      label="Repair started"
                      onClick={() => setStatus(selected, 'IN_PROGRESS')}
                    />
                  )}
                </Stack>
              )}
              <Stack spacing={2}>
                <TextField select size="small" label="Repair type" value={draft.repairType}
                  onChange={(e) => setD({ repairType: e.target.value })} disabled={!canEdit}>
                  <MenuItem value="">— Not set —</MenuItem>
                  {REPAIR_TYPES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Repair hub (optional)" value={draft.repairHubId}
                  onChange={(e) => setD({ repairHubId: e.target.value })} disabled={!canEdit}>
                  <MenuItem value="">— None —</MenuItem>
                  {hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>)}
                </TextField>
                <TextField size="small" label="Shop name" value={draft.shopName} onChange={(e) => setD({ shopName: e.target.value })} disabled={!canEdit} />
                <TextField size="small" label="Shop address" value={draft.shopAddress} onChange={(e) => setD({ shopAddress: e.target.value })} disabled={!canEdit} />
                <Stack direction="row" spacing={2}>
                  <TextField size="small" label="PO #" value={draft.purchaseOrder} onChange={(e) => setD({ purchaseOrder: e.target.value })} fullWidth disabled={!canEdit} />
                  <TextField size="small" label="Invoice #" value={draft.invoiceNumber} onChange={(e) => setD({ invoiceNumber: e.target.value })} fullWidth disabled={!canEdit} />
                </Stack>
                <TextField size="small" type="date" label="Date delivered" InputLabelProps={{ shrink: true }}
                  value={draft.dateDelivered} onChange={(e) => setD({ dateDelivered: e.target.value })} disabled={!canEdit} />
                <Stack direction="row" spacing={2}>
                  <TextField size="small" label="Est. cost" value={draft.estimatedCost} onChange={(e) => setD({ estimatedCost: e.target.value })} fullWidth
                    InputProps={{ startAdornment: <Typography color="text.secondary" mr={0.5}>$</Typography> }} disabled={!canEdit} />
                  <TextField size="small" label="Actual cost" value={draft.actualCost} onChange={(e) => setD({ actualCost: e.target.value })} fullWidth
                    InputProps={{ startAdornment: <Typography color="text.secondary" mr={0.5}>$</Typography> }} disabled={!canEdit} />
                </Stack>
                <TextField size="small" label="Location note" value={draft.locationNote} onChange={(e) => setD({ locationNote: e.target.value })}
                  helperText="Where the item physically is right now" disabled={!canEdit} />
                <TextField size="small" label="Notes" value={draft.notes} onChange={(e) => setD({ notes: e.target.value })} multiline rows={3} disabled={!canEdit} />
              </Stack>
            </Box>

            <Divider />
            <Stack spacing={1} sx={{ p: 2 }}>
              {!selected.isDamageReport && selected.intervalType === 'MILEAGE' && selected.status !== 'COMPLETED' && (
                <TextField
                  size="small"
                  label="Odometer at completion (optional)"
                  value={completionOdo}
                  onChange={(e) => setCompletionOdo(e.target.value.replace(/[^0-9]/g, ''))}
                  helperText="Next service is set to this + the interval. Defaults to the vehicle's latest reading."
                />
              )}
              <Stack direction="row" spacing={1}>
                {selected.status !== 'IN_PROGRESS' && selected.status !== 'COMPLETED' && (
                  <MutationButton variant="outlined" fullWidth disabled={saving} onClick={() => setStatus(selected, 'IN_PROGRESS')}>Start repair</MutationButton>
                )}
                {selected.status !== 'COMPLETED' ? (
                  <MutationButton
                    variant="outlined"
                    color="success"
                    fullWidth
                    disabled={saving}
                    onClick={() => {
                      if (selected.isDamageReport) {
                        // Vehicle damage: no return destination needed — close directly.
                        if (selected.vehicle && !selected.unit) { completeTask(selected) }
                        else { setCloseHubId(''); setCloseMethod(''); setCloseDestType('HUB'); setCloseRigId(''); setCloseOpen(true) }
                      } else {
                        completeTask(selected)
                      }
                    }}
                  >
                    {selected.isDamageReport ? 'Close repair…' : 'Complete & reschedule'}
                  </MutationButton>
                ) : (
                  <MutationButton variant="outlined" fullWidth disabled={saving} onClick={() => setStatus(selected, 'IN_PROGRESS')}>Reopen</MutationButton>
                )}
              </Stack>
              <MutationButton variant="contained" fullWidth disabled={saving} onClick={saveDraft}
                startIcon={saving ? <CircularProgress size={16} /> : undefined}>
                {saving ? 'Saving…' : 'Save repair details'}
              </MutationButton>

              <Divider textAlign="left" sx={{ fontSize: 12, color: 'text.secondary', pt: 1 }}>Send to shop</Divider>
              <Typography variant="caption" color="text.secondary">
                Email the shop a private work-order link (problem, asset, photos, ship-to hub). They update status without logging in.
                {woLinks.has(selected.id) && ' Resending supersedes the previous link.'}
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField size="small" type="email" label="Shop email" value={shopEmail} fullWidth
                  onChange={(e) => setShopEmail(e.target.value)} placeholder="repairs@shop.com" disabled={!canEdit} />
                <MutationButton variant="outlined" disabled={saving || !shopEmail.trim()} onClick={sendToShop} sx={{ whiteSpace: 'nowrap' }}>
                  {woLinks.has(selected.id) ? 'Resend' : 'Send WO'}
                </MutationButton>
              </Stack>
              {lastLink && (
                <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
                  <Typography variant="caption" color="text.secondary">Private link (copy if email isn’t configured):</Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>{lastLink}</Typography>
                    <Button size="small" variant="text" onClick={() => copyLink(lastLink)} sx={{ whiteSpace: 'nowrap' }}>Copy link</Button>
                  </Stack>
                </Box>
              )}
            </Stack>
          </Box>
        )}
      </DetailDrawer>

      {/* Inoperable review — send for repair (shared dialog) */}
      {repairUnit && (
        <RepairReviewDialog
          open
          itemId={repairUnit.itemId}
          unitId={repairUnit.id}
          hubs={hubs}
          onClose={() => setRepairUnit(null)}
          onSuccess={() => { setRepairUnit(null); loadInoperable(); load() }}
        />
      )}

      {/* Inoperable review — retire */}
      <Dialog open={!!retireUnit} onClose={() => setRetireUnit(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Retire unit</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2">
              Retire <strong>{retireUnit?.itemName} · {retireUnit?.label}</strong>? It will be marked RETIRED and removed from service. History is preserved.
            </Typography>
            <TextField label="Reason (required)" value={retireNote} onChange={(e) => setRetireNote(e.target.value)} multiline rows={2} fullWidth required />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRetireUnit(null)} disabled={retiring}>Cancel</Button>
          <MutationButton color="error" variant="contained" onClick={submitRetire} disabled={retiring || !retireNote.trim()}>
            {retiring ? 'Retiring…' : 'Retire'}
          </MutationButton>
        </DialogActions>
      </Dialog>

      {/* CC-10: Log field fix */}
      <Dialog open={fieldFixOpen} onClose={() => setFieldFixOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Log field fix</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Record an issue that was noticed and fixed on the spot. No repair task is opened and no alert is fired.
            </Typography>
            {/* CC-34 (2b): choose the subject — a vehicle or an inventory item. */}
            <TextField
              select
              label="Subject"
              value={fieldFixSubject}
              onChange={(e) => setFieldFixSubject(e.target.value as 'vehicle' | 'item')}
              fullWidth
            >
              <MenuItem value="vehicle">Vehicle</MenuItem>
              <MenuItem value="item">Inventory item</MenuItem>
            </TextField>
            {fieldFixSubject === 'vehicle' ? (
              <TextField
                select
                label="Vehicle"
                value={fieldFixVehicleId}
                onChange={(e) => setFieldFixVehicleId(e.target.value)}
                fullWidth
                required
              >
                {fieldFixVehicles.length === 0
                  ? <MenuItem value="" disabled>Loading vehicles…</MenuItem>
                  : fieldFixVehicles.map((v) => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
              </TextField>
            ) : (
              <TextField
                select
                label="Item"
                value={fieldFixItemId}
                onChange={(e) => setFieldFixItemId(e.target.value)}
                fullWidth
                required
              >
                {fieldFixItems.length === 0
                  ? <MenuItem value="" disabled>Loading items…</MenuItem>
                  : fieldFixItems.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
              </TextField>
            )}
            <TextField
              label="What was fixed"
              value={fieldFixNotes}
              onChange={(e) => setFieldFixNotes(e.target.value)}
              multiline
              rows={3}
              fullWidth
              required
              placeholder="Brief description of the issue and what was done"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFieldFixOpen(false)} disabled={fieldFixSaving}>Cancel</Button>
          <MutationButton
            color="primary"
            variant="contained"
            disabled={fieldFixSaving || !(fieldFixSubject === 'vehicle' ? fieldFixVehicleId : fieldFixItemId) || !fieldFixNotes.trim()}
            onClick={submitFieldFix}
          >
            {fieldFixSaving ? 'Saving…' : 'Log fix'}
          </MutationButton>
        </DialogActions>
      </Dialog>

      {/* CC-34 (3a): Add scheduled task — the D24 bridge (named service rows become enterable) */}
      <Dialog open={schedOpen} onClose={() => setSchedOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add scheduled task</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              A recurring service on a vehicle or item — e.g. &ldquo;Wintex: hydraulic oil service&rdquo; every 90 days.
              It shows as Upcoming and flags Overdue when due.
            </Typography>
            <TextField
              select
              label="Subject"
              value={schedSubject}
              onChange={(e) => { setSchedSubject(e.target.value as 'vehicle' | 'item'); setSchedVehicleId(''); setSchedItemId('') }}
              fullWidth
            >
              <MenuItem value="vehicle">Vehicle</MenuItem>
              <MenuItem value="item">Inventory item</MenuItem>
            </TextField>
            {schedSubject === 'vehicle' ? (
              <SearchableSelect
                label="Vehicle"
                value={schedVehicleId}
                onChange={setSchedVehicleId}
                options={schedVehicles.map((v) => ({ value: v.id, label: v.name }))}
                required
              />
            ) : (
              <SearchableSelect
                label="Item"
                value={schedItemId}
                onChange={setSchedItemId}
                options={schedItems.map((i) => ({ value: i.id, label: i.name }))}
                required
              />
            )}
            <TextField
              label="Task name"
              value={schedTaskName}
              onChange={(e) => setSchedTaskName(e.target.value)}
              fullWidth
              required
              placeholder="e.g. Wintex: hydraulic oil service"
            />
            <Stack direction="row" spacing={2}>
              <TextField
                select
                label="Interval"
                value={schedIntervalType}
                onChange={(e) => setSchedIntervalType(e.target.value as 'DAYS' | 'MONTHS' | 'MILEAGE')}
                fullWidth
              >
                <MenuItem value="DAYS">Every N days</MenuItem>
                <MenuItem value="MONTHS">Every N months</MenuItem>
                <MenuItem value="MILEAGE">Every N miles</MenuItem>
              </TextField>
              <TextField
                label={schedIntervalType === 'MILEAGE' ? 'Miles' : schedIntervalType === 'MONTHS' ? 'Months' : 'Days'}
                value={schedIntervalValue}
                onChange={(e) => setSchedIntervalValue(e.target.value.replace(/[^0-9]/g, ''))}
                fullWidth
                required
                inputProps={{ inputMode: 'numeric' }}
              />
            </Stack>
            <TextField
              select
              label="Priority"
              value={schedPriority}
              onChange={(e) => setSchedPriority(e.target.value as 'HIGH' | 'MEDIUM' | 'LOW')}
              fullWidth
            >
              <MenuItem value="HIGH">High</MenuItem>
              <MenuItem value="MEDIUM">Medium</MenuItem>
              <MenuItem value="LOW">Low</MenuItem>
            </TextField>
            {schedIntervalType === 'MILEAGE' ? (
              <TextField
                label="Next-service odometer (optional)"
                value={schedNextOdometer}
                onChange={(e) => setSchedNextOdometer(e.target.value.replace(/[^0-9]/g, ''))}
                fullWidth
                inputProps={{ inputMode: 'numeric' }}
                helperText="Defaults to the vehicle's current odometer + the interval."
              />
            ) : (
              <TextField
                type="date"
                label="First due (optional)"
                value={schedNextDue}
                onChange={(e) => setSchedNextDue(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Defaults to today + the interval."
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSchedOpen(false)} disabled={schedSaving}>Cancel</Button>
          <MutationButton
            color="primary"
            variant="contained"
            disabled={schedSaving || !(schedSubject === 'vehicle' ? schedVehicleId : schedItemId) || !schedTaskName.trim() || !(Number(schedIntervalValue) >= 1)}
            onClick={submitSched}
          >
            {schedSaving ? 'Saving…' : 'Add task'}
          </MutationButton>
        </DialogActions>
      </Dialog>

      {/* A.4: close repair — choose return destination (no default) */}
      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close repair</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Choose where this unit returns. There is no default — the repair can&rsquo;t be closed until a destination is selected.
              The unit returns to service either way; physically getting it there is the human step.
            </Typography>
            {/* CC-34 (3c): equipment can return wherever needed — a hub or straight to an active deployment. */}
            <TextField select label="Return to" value={closeDestType}
              onChange={(e) => { setCloseDestType(e.target.value as 'HUB' | 'DEPLOYMENT'); setCloseHubId(''); setCloseRigId('') }} fullWidth>
              <MenuItem value="HUB">A hub</MenuItem>
              <MenuItem value="DEPLOYMENT">An active deployment</MenuItem>
            </TextField>
            {closeDestType === 'HUB' ? (
              <TextField select label="Hub" value={closeHubId} onChange={(e) => setCloseHubId(e.target.value)} fullWidth required>
                {hubs.length === 0
                  ? <MenuItem value="" disabled>No hubs configured</MenuItem>
                  : hubs.map((h) => <MenuItem key={h.id} value={h.id}>{h.name} — {h.city}, {h.state}</MenuItem>)}
              </TextField>
            ) : (
              <TextField select label="Deployment" value={closeRigId} onChange={(e) => setCloseRigId(e.target.value)} fullWidth required>
                {activeRigs.length === 0
                  ? <MenuItem value="" disabled>No active deployments</MenuItem>
                  : activeRigs.map((r) => <MenuItem key={r.id} value={r.id}>{r.label}{r.operatorName ? ` — ${r.operatorName}` : ''}</MenuItem>)}
              </TextField>
            )}
            <TextField select label="How it gets there (optional)" value={closeMethod} onChange={(e) => setCloseMethod(e.target.value as '' | 'DELIVER' | 'SHIP')} fullWidth>
              <MenuItem value="">Not specified</MenuItem>
              <MenuItem value="DELIVER">Deliver</MenuItem>
              <MenuItem value="SHIP">Ship</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCloseOpen(false)} disabled={saving}>Cancel</Button>
          <MutationButton
            color="success"
            variant="contained"
            disabled={saving || (closeDestType === 'HUB' ? !closeHubId : !closeRigId)}
            onClick={async () => {
              if (!selected) return
              await completeTask(selected, {
                returnDestinationType: closeDestType,
                returnDestinationId: closeDestType === 'HUB' ? closeHubId : closeRigId,
                repairMethod: closeMethod || undefined,
              })
              setCloseOpen(false)
            }}
          >
            {saving ? 'Closing…' : 'Complete repair'}
          </MutationButton>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
