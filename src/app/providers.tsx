'use client'

import * as React from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { color, font, density } from '@/theme/tokens'

// CC-23: the `dense` Chip variant (height 20 / fontSize 11) replaces the 15+
// hand-rolled height:18/fontSize:10 chip sites that clipped descenders. Consumed
// by StatusChip v2 and any dense-chip site.
declare module '@mui/material/Chip' {
  interface ChipPropsVariantOverrides {
    dense: true
  }
}

const theme = createTheme({
  palette: {
    primary: { main: color.brand, contrastText: color.brandContrast }, // Agricarbon green
    // AA amber (5.4:1 on white) for secondary/warning text + outlined chips. The
    // old bright #ff8f00 (2.3:1) failed WCAG AA — see tokens.ts.
    secondary: { main: color.amber, contrastText: color.amberContrast },
    warning: { main: color.amber, contrastText: color.amberContrast },
    error: { main: color.error },
    background: { default: color.canvas },
  },
  typography: {
    fontFamily: font.family,
    h4: { fontWeight: font.weight.bold, fontSize: font.size.h4 },
    h5: { fontWeight: font.weight.bold, fontSize: font.size.h5 },
    h6: { fontWeight: font.weight.medium, fontSize: font.size.h6 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 8, textTransform: 'none', fontWeight: font.weight.medium } },
    },
    MuiCard: {
      styleOverrides: { root: { borderRadius: 12 } },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 6 } },
      variants: [
        {
          props: { variant: 'dense' },
          style: {
            height: density.chipDense.height,
            fontSize: density.chipDense.fontSize,
            '& .MuiChip-label': { paddingLeft: 6, paddingRight: 6 },
            '& .MuiChip-icon': { fontSize: 13 },
          },
        },
      ],
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  )
}
