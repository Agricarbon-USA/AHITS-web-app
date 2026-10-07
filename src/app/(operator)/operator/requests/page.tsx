'use client'

import * as React from 'react'
import { formatDate } from '@/lib/utils'
import {
  Box,
  Typography,
  Button,
  Stack,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useFreshList } from '@/hooks/useFreshList'
import { FreshnessIndicator } from '@/components/shared/FreshnessIndicator'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/shared/useToast'
import { StatusChip } from '@/components/shared/StatusChip'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  RequestComposer,
  type HubOption,
  type ProjectOption,
  type CategoryOption,
  type InventoryOption,
  type VehicleOption,
} from '@/components/shared/RequestComposer'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestRow {
  id: string
  status: string
  requestType: string
  label: string | null
  neededBy: string | null
  createdAt: string
  lineCount: number
  decisionNote: string | null
  projectName: string | null
  fulfillerHubName: string | null
  stockReservedAt: string | null
  fulfillerOperatorId: string | null
  // CC-31 item 4: an admin can file a request FOR an operator (forOperatorId); that
  // operator now sees it here (read-only). Gate Cancel to the actual requester.
  requestedById: string
}

const TERMINAL = new Set(['FULFILLED', 'CANCELLED', 'DENIED'])

type RequestsTab = 'ACTIVE' | 'CLOSED'

// UXP-3 (3c rider): the "handled" notification deep-links to /operator/requests?tab=closed,
// because a handled request lives on the Closed tab — the bell tap used to land on a list
// that no longer contained it. Read AFTER hydration via useSyncExternalStore: the server
// snapshot is always ACTIVE (matches the server HTML, no #418), and React re-renders with
// the real URL once hydrated. No effect, no synchronous setState. window.location (not
// useSearchParams) so this stays outside the Suspense requirement — same call as
// my-deployment's ?fromRequestId read.
const subscribeToNothing = () => () => {}
function readUrlTab(): RequestsTab {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return tab?.toLowerCase() === 'closed' ? 'CLOSED' : 'ACTIVE'
}
const serverTab = (): RequestsTab => 'ACTIVE'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const [hubs, setHubs] = React.useState<HubOption[]>([])
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [inventory, setInventory] = React.useState<InventoryOption[]>([])
  const [vehicles, setVehicles] = React.useState<VehicleOption[]>([])
  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dialogDataLoaded, setDialogDataLoaded] = React.useState(false)
  const [cancellingId, setCancellingId] = React.useState<string | null>(null)
  // CC-14: confirm before cancelling a request (was a one-tap irreversible action).
  const [confirmCancelId, setConfirmCancelId] = React.useState<string | null>(null)
  // UXP-3 (3c rider): the URL's ?tab seeds the tab; an explicit toggle wins after that.
  const urlTab = React.useSyncExternalStore(subscribeToNothing, readUrlTab, serverTab)
  const [pickedTab, setActiveTab] = React.useState<RequestsTab | null>(null)
  const activeTab: RequestsTab = pickedTab ?? urlTab
  const showToast = useToast()
  const { mutate, isOffline } = useOfflineQueue()
  const { user } = useAuth()

  // CC-12 PR2: the requests list read now goes through SWR (revalidateOnReconnect)
  // with a "data as of HH:MM" freshness indicator. `refreshRequests` replaces the
  // old manual load() at every post-action refresh site.
  const { data: reqData, isValidating, mutate: refreshRequests, updatedAt } =
    useFreshList<{ data: RequestRow[] }>('/api/deployment-requests')
  const requests = reqData?.data ?? null
  const load = React.useCallback(async () => { await refreshRequests() }, [refreshRequests])

  // UXP-3 (3f / F-09): the composer's common case. An operator with an ACTIVE rig is
  // almost always asking for materials, not reserving a rig — probe once on mount (the same
  // read my-deployment makes) so the answer is settled before the dialog can open; opening
  // is never delayed by it. Offline / error → null → the RESERVATION fallback. A remembered
  // last-used mode (stored by the composer) beats this heuristic.
  const [hasActiveRig, setHasActiveRig] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    let cancelled = false
    fetch('/api/deployments?active=true')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d !== null) setHasActiveRig(Array.isArray(d) && d.length > 0) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const openDialog = async () => {
    setDialogOpen(true)
    if (!dialogDataLoaded) {
      const [hubsRes, projectsRes, inventoryRes, vehiclesRes, categoriesRes] = await Promise.all([
        fetch('/api/hubs'),
        fetch('/api/projects'),
        fetch('/api/inventory?pageSize=200'),
        fetch('/api/vehicles'),
        fetch('/api/categories'),
      ])
      if (hubsRes.ok) { const hd = await hubsRes.json(); setHubs((Array.isArray(hd) ? hd : (hd?.data ?? [])) as HubOption[]) }
      if (projectsRes.ok) {
        const d = await projectsRes.json()
        setProjects((d.data as ProjectOption[]) ?? [])
      }
      if (inventoryRes.ok) {
        const d = await inventoryRes.json()
        setInventory((d.data as InventoryOption[]) ?? [])
      }
      if (vehiclesRes.ok) {
        const d = await vehiclesRes.json()
        setVehicles((d.data as VehicleOption[]) ?? [])
      }
      if (categoriesRes.ok) setCategories((await categoriesRes.json()) as CategoryOption[])
      setDialogDataLoaded(true)
    }
  }

  const handleCancel = async (id: string) => {
    setCancellingId(id)
    const result = await mutate({
      endpoint: `/api/deployment-requests/${id}`,
      method: 'PATCH',
      body: { action: 'cancel' },
      label: 'Cancel request',
    })
    setCancellingId(null)
    if (result.ok && result.queued) {
      showToast({ message: 'Cancellation queued — will sync when online.', severity: 'info' })
    } else if (result.ok) {
      showToast({ message: 'Request cancelled.', severity: 'success' })
      await load()
    } else {
      showToast({ message: result.error, severity: 'error' })
    }
  }

  // CC-33 (E2): removed handleFulfill + the operator "Mark Handled" path — the
  // Forward→Operator branch is gone (D21). Admin "Mark Handled" closes any stale
  // FORWARDED-to-operator row; operators only ever Cancel their own requests.

  const displayed = (requests ?? []).filter((r) =>
    activeTab === 'ACTIVE' ? !TERMINAL.has(r.status) : TERMINAL.has(r.status),
  )

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="h5">Requests</Typography>
          <FreshnessIndicator updatedAt={updatedAt} isValidating={isValidating} onRefresh={() => void refreshRequests()} />
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => void openDialog()}>
          New Request
        </Button>
      </Stack>

      {requests === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
          <CircularProgress />
        </Box>
      ) : requests.length === 0 ? (
        <Box sx={{ textAlign: 'center', pt: 8 }}>
          <PlaylistAddCheckIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No requests yet
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Reserve a rig from a hub, or request materials from admin.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => void openDialog()}>
            New Request
          </Button>
        </Box>
      ) : (
        <>
          <ToggleButtonGroup
            value={activeTab}
            exclusive
            onChange={(_e, v) => { if (v) setActiveTab(v as RequestsTab) }}
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="ACTIVE">Active</ToggleButton>
            <ToggleButton value="CLOSED">Closed</ToggleButton>
          </ToggleButtonGroup>
          {displayed.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" pt={4}>
              No {activeTab === 'ACTIVE' ? 'active' : 'closed'} requests.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {displayed.map((req) => (
                <Card key={req.id} variant="outlined">
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      spacing={1}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          mb={0.5}
                          flexWrap="wrap"
                        >
                          <StatusChip kind="request" status={req.status} />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={req.requestType === 'RESERVATION' ? 'Reservation' : 'Material'}
                          />
                        </Stack>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {req.label ||
                            (req.requestType === 'RESERVATION'
                              ? 'Rig Reservation'
                              : 'Material Request')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {req.lineCount} line{req.lineCount !== 1 ? 's' : ''}
                          {req.neededBy &&
                            ` · Needed ${formatDate(req.neededBy)}`}
                          {req.projectName && ` · ${req.projectName}`}
                        </Typography>
                        {req.decisionNote && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            Admin note: {req.decisionNote}
                          </Typography>
                        )}
                        {req.status === 'STAGED' && req.requestType === 'RESERVATION' && req.stockReservedAt && req.fulfillerHubName && (
                          /* CC-32 (1.3): say "Staged" to the operator the same way the
                             chip does (chip labels in lib/status.ts are UNTOUCHED — D9). */
                          <Typography variant="caption" display="block" color="success.main">
                            Staged at {req.fulfillerHubName} for pickup
                          </Typography>
                        )}
                      </Box>
                      {/* CC-33 (E2): forward→operator removed — the "Mark Handled" arm is gone.
                          Cancel is the sole action, and (CC-31 item 4) only the actual requester
                          may cancel. A request surfaced only because it was filed FOR this operator
                          (forOperatorId) is read-only here — the write route 403s a non-requester
                          cancel, so showing the button would just error. */}
                      {!TERMINAL.has(req.status) && req.requestedById === user?.userId && (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          disabled={cancellingId === req.id}
                          startIcon={
                            cancellingId === req.id ? (
                              <CircularProgress size={12} color="inherit" />
                            ) : null
                          }
                          onClick={() => setConfirmCancelId(req.id)}
                          sx={{ flexShrink: 0 }}
                        >
                          Cancel
                        </Button>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}

      {dialogOpen && (
        <RequestComposer
          hubs={hubs}
          projects={projects}
          inventory={inventory}
          vehicles={vehicles}
          categories={categories}
          defaultHubId={user?.homeHubId}
          offline={isOffline}
          initialMode={hasActiveRig ? 'MATERIAL' : 'RESERVATION'} // UXP-3 (3f)
          onClose={() => setDialogOpen(false)}
          onSubmit={async (body) => {
            const r = await mutate({
              endpoint: '/api/deployment-requests',
              method: 'POST',
              body,
              label: body.requestType === 'RESERVATION' ? 'Reserve rig' : 'Material request',
            })
            if (r.ok && r.queued) {
              showToast({ message: 'Request queued — will sync when online.', severity: 'info' })
            } else if (r.ok) {
              showToast({ message: 'Request submitted.', severity: 'success' })
              await load()
            }
            return r.ok ? { ok: true } : { ok: false, error: r.error }
          }}
        />
      )}

      <ConfirmDialog
        open={confirmCancelId !== null}
        title="Cancel this request?"
        message="This can't be undone. The request will be marked cancelled."
        confirmLabel="Cancel request"
        confirmColor="error"
        onClose={() => setConfirmCancelId(null)}
        onConfirm={async () => {
          const id = confirmCancelId
          setConfirmCancelId(null)
          if (id) await handleCancel(id)
        }}
      />
    </Box>
  )
}
