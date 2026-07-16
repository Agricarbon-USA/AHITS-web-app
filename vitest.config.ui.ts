import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// CC-23: component-test config, separate from the DB integration suite
// (vitest.config.ts). These tests render React/MUI in jsdom and must NOT touch
// a database — so this config deliberately does not require DATABASE_URL_TEST,
// does not load tests/setup.ts (which wipes tables), and uses the jsdom
// environment. Run with `npm run test:ui`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ui.ts'],
    include: ['tests/components/**/*.test.{ts,tsx}'],
  },
})
