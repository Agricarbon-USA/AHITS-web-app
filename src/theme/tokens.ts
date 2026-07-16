// ── AHITS design tokens — the single source of truth for the brand ───────────
// Palette, type scale, spacing, and density constants. Consumed by the MUI theme
// (src/app/providers.tsx) AND by the raw-HTML / inline-style surfaces that can't
// reach the theme: the offline fallback (src/app/~offline) and the login-less
// external portal (src/app/s/[token]). Before CC-23 the brand was re-implemented
// by hand in each of those places (96 hex literals across 14 files); this file is
// where a color or type value is defined ONCE.
//
// The ESLint `no-restricted-syntax` hex rule forbids raw color-hex literals in
// src/** except this file (and a small allowlist) — add new brand values HERE.

export const color = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  brand: '#2e7d32', // Agricarbon green (MUI primary)
  brandContrast: '#ffffff',

  // ── Amber ────────────────────────────────────────────────────────────────
  // AA-passing amber (5.4:1 on white) for warning/secondary TEXT and outlined
  // chips. The historical bright amber (#ff8f00) is 2.3:1 — a WCAG AA failure —
  // and is retained ONLY as a decorative-fill accent, never for text.
  amber: '#9a5b00',
  amberBright: '#ff8f00', // decorative accent only — do not use for text
  amberContrast: '#ffffff',

  // ── Semantic ─────────────────────────────────────────────────────────────
  error: '#c62828',
  errorAlt: '#d32f2f', // the s/[token] portal's danger control uses this shade

  // ── Neutrals ─────────────────────────────────────────────────────────────
  ink: '#1a1a1a',
  inkSoft: '#555555',
  inkMuted: '#757575', // secondary/label text on the external portal
  border: '#e0e0e0',
  borderSoft: '#cccccc',
  surface: '#ffffff',
  canvas: '#f5f5f5',
} as const

export const font = {
  family: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  familyPortal: 'system-ui, sans-serif', // the login-less external portal keeps a system stack
  // Type scale in px.
  size: {
    xs: 11, // dense chip / smallest caption
    sm: 13,
    base: 15,
    md: 16, // actionable-text floor on operator surfaces (see density.actionableTextMin)
    lg: 18,
    h6: 20,
    h5: 24,
    h4: 34,
  },
  weight: { regular: 400, medium: 600, bold: 700 },
} as const

export const spacing = {
  unit: 8, // MUI base spacing unit; `theme.spacing(n)` = n * 8px
} as const

export const density = {
  touchMin: 44, // minimum touch-target size (px) on operator routes
  actionableTextMin: 16, // minimum actionable-text size (px) on operator routes
  // Dense chip: the single source for the compact status-badge size. Applied by
  // the StatusChip component, replacing the hand-rolled height:18/fontSize:10
  // sites that clipped descenders.
  chipDense: { height: 20, fontSize: 11 },
} as const

export const tokens = { color, font, spacing, density } as const
export default tokens
