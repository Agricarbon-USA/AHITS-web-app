'use client'

import * as React from 'react'
import {
  IconButton, Badge, Menu, MenuItem, Box, Typography, Divider, Button, Tooltip, ListItemText,
} from '@mui/material'
import NotificationsIcon from '@mui/icons-material/Notifications'
import { useRouter } from 'next/navigation'

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

function relTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Admin header bell: unread badge + dropdown, polls the notifications API.
 *
 * PR-1b (L-5): the badge counts every unread row; the list is paged 30 at a time.
 * Those two numbers disagreed silently — the badge said 38, the list showed 30,
 * and nothing explained the gap. Now the header says so in words and **Load more**
 * reaches the rest, so the bell is either complete or says how much it is not
 * showing (D-h).
 */
const BELL_PAGE_SIZE = 30

export function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = React.useState<NotificationRow[]>([])
  const [unread, setUnread] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [anchor, setAnchor] = React.useState<null | HTMLElement>(null)

  /** `page` is 1-based, as the API takes it. Page 1 replaces; later pages append. */
  const loadPage = React.useCallback(async (page: number) => {
    try {
      const res = await fetch(`/api/notifications?page=${page}&pageSize=${BELL_PAGE_SIZE}`)
      if (!res.ok) return
      const d = await res.json()
      const rows: NotificationRow[] = d.data ?? []
      setItems((prev) => {
        if (page === 1) return rows
        // De-dupe on id: a row can shift pages between reads if one is minted
        // while the menu is open.
        const seen = new Set(prev.map((r) => r.id))
        return [...prev, ...rows.filter((r) => !seen.has(r.id))]
      })
      setUnread(d.unread ?? 0)
      setTotal(typeof d.total === 'number' ? d.total : rows.length)
    } catch {
      /* offline / transient — keep last known counts */
    }
  }, [])

  const load = React.useCallback(() => loadPage(1), [loadPage])

  const loadMore = React.useCallback(async () => {
    setLoadingMore(true)
    try {
      await loadPage(Math.floor(items.length / BELL_PAGE_SIZE) + 1)
    } finally {
      setLoadingMore(false)
    }
  }, [loadPage, items.length])

  React.useEffect(() => {
    load()
    const t = window.setInterval(load, 45_000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  async function markRead(id?: string, all?: boolean) {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(all ? { all: true } : { id }),
    }).catch(() => {})
    load()
  }

  function openItem(n: NotificationRow) {
    setAnchor(null)
    if (!n.readAt) markRead(n.id)
    if (n.link) router.push(n.link)
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton color="inherit" onClick={(e) => { setAnchor(e.currentTarget); load() }}>
          <Badge badgeContent={unread || undefined} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        PaperProps={{ sx: { width: 360, maxHeight: 460 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
          <Box>
            <Typography variant="subtitle2">Notifications</Typography>
            {/* L-5: the badge counts every unread row — say what this list holds. */}
            {items.length < total && (
              <Typography variant="caption" color="text.secondary">
                {unread} unread · showing {items.length} of {total}
              </Typography>
            )}
          </Box>
          {unread > 0 && <Button size="small" onClick={() => markRead(undefined, true)}>Mark all read</Button>}
        </Box>
        <Divider />
        {items.length === 0 && (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary" align="center">You&rsquo;re all caught up.</Typography>
          </Box>
        )}
        {items.map((n) => (
          <MenuItem
            key={n.id}
            onClick={() => openItem(n)}
            sx={{ whiteSpace: 'normal', alignItems: 'flex-start', bgcolor: n.readAt ? undefined : 'action.hover' }}
          >
            <ListItemText
              primary={<Typography variant="body2" fontWeight={n.readAt ? 400 : 600}>{n.title}</Typography>}
              secondary={
                <>
                  {n.body && <Typography variant="caption" color="text.secondary" display="block">{n.body}</Typography>}
                  <Typography variant="caption" color="text.disabled">{relTime(n.createdAt)}</Typography>
                </>
              }
            />
          </MenuItem>
        ))}
        {items.length < total && (
          <Box sx={{ px: 2, py: 1, textAlign: 'center' }}>
            <Button size="small" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : `Load more (${total - items.length} left)`}
            </Button>
          </Box>
        )}
      </Menu>
    </>
  )
}
