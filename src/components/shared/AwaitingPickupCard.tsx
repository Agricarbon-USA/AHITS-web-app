'use client'

import * as React from 'react'
import { Box, Typography, Card, CardContent, Button, Stack, Chip, List, ListItem, ListItemText } from '@mui/material'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import { formatDate } from '@/lib/utils'

// CC-32 (2.7): a hold inside this window is emphasised — the operator is about to
// lose the stock if they don't collect it.
const HOLD_SOON_MS = 24 * 60 * 60 * 1000

export interface AwaitingPickupLine {
  id: string
  heldItemId: string
  itemName: string | null
  remainingQty: number
  heldHubId: string
}

export interface AwaitingPickupRequest {
  id: string
  label: string | null
  fulfilledAt: string | null
  holdExpiresAt: string | null
  hubId: string | null
  hubName: string | null
  lines: AwaitingPickupLine[]
}

interface Props {
  request: AwaitingPickupRequest
  onPickUp: (request: AwaitingPickupRequest) => void
}

// CC-09: composable "Ready for Pickup" card. Placed on the operator dashboard now;
// designed for the CC-14 Today view — receives all data as props, owns no fetching.
export function AwaitingPickupCard({ request, onPickUp }: Props) {
  // CC-32 (2.7): holdExpiresAt was received and never rendered — so "is my stuff still
  // at the hub?" was a phone call. Date.now() is impure in render, so the wall-clock is
  // stamped once on mount (0 until then, which simply defers the amber emphasis by a
  // tick — the date line itself does not depend on it).
  const [now, setNow] = React.useState(0)
  React.useEffect(() => { setNow(Date.now()) }, [])
  const holdExpiresSoon =
    now > 0 && request.holdExpiresAt != null &&
    new Date(request.holdExpiresAt).getTime() - now < HOLD_SOON_MS

  return (
    <Card sx={{ border: '1px solid', borderColor: 'warning.main' }}>
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={1}>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <LocalShippingIcon sx={{ fontSize: 36, color: 'warning.main' }} />
            <Box>
              <Typography variant="h6" lineHeight={1.2}>
                {request.label ?? 'Reservation'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ready for Pickup
              </Typography>
            </Box>
          </Stack>
          <Chip label="Ready for Pickup" color="warning" size="small" />
        </Stack>

        {request.hubName && (
          <Typography variant="body2" color="text.secondary" mb={1}>
            Pick up from: <strong>{request.hubName}</strong>
          </Typography>
        )}

        {/* CC-32 (2.7): the hold deadline, finally shown. */}
        {request.holdExpiresAt && (
          <Typography
            variant="body2"
            mb={1}
            color={holdExpiresSoon ? 'warning.main' : 'text.secondary'}
            fontWeight={holdExpiresSoon ? 600 : 400}
          >
            Held until {formatDate(request.holdExpiresAt)}
          </Typography>
        )}

        <List dense disablePadding>
          {request.lines.slice(0, 4).map((line) => (
            <ListItem key={line.id} disablePadding sx={{ py: 0 }}>
              <ListItemText
                primary={
                  <Typography variant="body2">
                    {line.remainingQty}× {line.itemName ?? line.heldItemId.slice(0, 8)}
                  </Typography>
                }
              />
            </ListItem>
          ))}
          {request.lines.length > 4 && (
            <ListItem disablePadding sx={{ py: 0 }}>
              <ListItemText
                primary={
                  <Typography variant="body2" color="text.secondary">
                    +{request.lines.length - 4} more item{request.lines.length - 4 !== 1 ? 's' : ''}
                  </Typography>
                }
              />
            </ListItem>
          )}
        </List>

        <Button
          variant="contained"
          color="warning"
          size="small"
          sx={{ mt: 1.5 }}
          onClick={() => onPickUp(request)}
        >
          Pick Up
        </Button>
      </CardContent>
    </Card>
  )
}
