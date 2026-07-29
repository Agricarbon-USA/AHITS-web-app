'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Box, Typography,
} from '@mui/material'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import Inventory2Icon from '@mui/icons-material/Inventory2'

// CC-33 (D22): the single operator-facing entry point for "gear moves to someone
// else". The first choice picks WHICH kind of move — the whole rig (today's handoff:
// ownership of record flips) or specific gear (today's transfer). Pure router: no
// fetches, no business logic; it calls back into my-deployment's existing flows.
export function TransferEntryDialog({
  open,
  onClose,
  onEntireRig,
  onSelectedGear,
}: {
  open: boolean
  onClose: () => void
  onEntireRig: () => void
  onSelectedGear: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Transfer</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <Button
            variant="outlined"
            onClick={onEntireRig}
            sx={{ textAlign: 'left', p: 2, minHeight: 44, justifyContent: 'flex-start', alignItems: 'flex-start' }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <DirectionsCarIcon fontSize="small" />
                <Typography variant="subtitle2" fontWeight={700}>Entire rig</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, textTransform: 'none' }}>
                Hands the whole deployment to them. Once they accept, they become the primary
                operator — daily checks and gear custody move to them.
              </Typography>
            </Box>
          </Button>
          <Button
            variant="outlined"
            onClick={onSelectedGear}
            sx={{ textAlign: 'left', p: 2, minHeight: 44, justifyContent: 'flex-start', alignItems: 'flex-start' }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Inventory2Icon fontSize="small" />
                <Typography variant="subtitle2" fontWeight={700}>Selected gear</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, textTransform: 'none' }}>
                Send specific vehicles or kit items. You keep the deployment.
              </Typography>
            </Box>
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}
