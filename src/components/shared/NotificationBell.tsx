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

/** Admin header bell: unread badge + dropdown, polls the notifications API. */
export function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = React.useState<NotificationRow[]>([])
  const [unread, setUnread] = React.useState(0)
  const [anchor, setAnchor] = React.useState<null | HTMLElement>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const d = await res.json()
      setItems(d.data ?? [])
      setUnread(d.unread ?? 0)
    } catch {
      /* offline / transient — keep last known counts */
    }
  }, [])

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
          <Typography variant="subtitle2">Notifications</Typography>
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
      </Menu>
    </>
  )
}
