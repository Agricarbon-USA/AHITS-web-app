// Flat ESLint config (ESLint 9). eslint-config-next 16 ships a native flat
// config array, so we spread it directly — FlatCompat is not needed and in
// this version trips a circular-structure bug.
import next from 'eslint-config-next'

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts', 'prisma/migrations/**'] },
  ...next,
  {
    rules: {
      // Advisory perf rule from react-hooks 7. The existing codebase widely
      // uses the common "fetch-in-effect → setState" pattern; surfaced as
      // warnings so lint stays green while we address them as a follow-up.
      'react-hooks/set-state-in-effect': 'warn',
      // Cosmetic JSX text escaping; downgraded so pre-existing copy doesn't
      // fail the build. Tracked for cleanup.
      'react/no-unescaped-entities': 'warn',
    },
  },
  // CC-23: forbid raw color-hex literals in src — the brand palette lives in
  // src/theme/tokens.ts (consumed by the MUI theme and the raw-HTML surfaces).
  // Selectors catch exact hex literals ('#2e7d32'), 6-digit hexes embedded in a
  // larger string ('1px solid #e0e0e0'), and hexes inside template literals.
  // 6-digit is required for the embedded cases so issue/error refs like `#106`
  // or `#418` in strings aren't mistaken for colors. Comments are never Literals,
  // so ref comments are unaffected. Allowlisted files are ignored below.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      // The single source of truth — hexes are DEFINED here.
      'src/theme/tokens.ts',
      // HTML emails need literal/interpolated hex (no runtime theme). 30 hexes.
      'src/lib/email/templates.ts',
      // CC-27 owns the rebuild of these two; palette/type already single-sourced
      // from tokens.ts where it matters, remaining hexes are chrome CC-27 replaces.
      'src/app/s/**',
      'src/components/shared/FulfillmentChecklist.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'Raw color hex is not allowed — import the value from @/theme/tokens instead.',
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{6}/]',
          message: 'Raw color hex is not allowed — import the value from @/theme/tokens instead.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{6}/]',
          message: 'Raw color hex is not allowed — import the value from @/theme/tokens instead.',
        },
      ],
    },
  },
]

export default eslintConfig
