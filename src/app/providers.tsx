'use client'

import * as React from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
// CC-33 (C2): removed @mui/x-date-pickers LocalizationProvider — no DatePicker/TimePicker exists.
import { color, font } from '@/theme/tokens'

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
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
