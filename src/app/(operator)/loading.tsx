import { Box, CircularProgress } from '@mui/material'

// UXP-1d: a minimal branded route-transition fallback. Renders inside the operator
// shell (the layout is already mounted), so the bottom nav / header stay put while the
// page content loads — no blank flash, no frozen skeletons.
export default function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress color="primary" />
    </Box>
  )
}
