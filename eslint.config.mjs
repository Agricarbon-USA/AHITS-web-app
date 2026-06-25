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
]

export default eslintConfig
