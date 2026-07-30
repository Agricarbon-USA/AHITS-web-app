import { Box, CircularProgress } from '@mui/material'

// UXP-1d: a minimal branded route-transition fallback. Renders inside the admin shell
// (the layout is already mounted), so the nav stays put while the page content loads.
export default function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress color="primary" />
    </Box>
  )
}
