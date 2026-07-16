import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // ── SAFETY ───────────────────────────────────────────────────────────────
  // The test suite wipes every table between cases (see tests/setup.ts), so it
  // must NEVER run against the production database. We require an explicit
  // DATABASE_URL_TEST and deliberately do NOT fall back to DATABASE_URL.
  // (Previously this fell back to DATABASE_URL — i.e. production — which would
  // have erased live data on `npm test`.)
  const testDbUrl = env.DATABASE_URL_TEST || process.env.DATABASE_URL_TEST
  const testDirectUrl =
    env.DIRECT_URL_TEST || process.env.DIRECT_URL_TEST || testDbUrl

  if (!testDbUrl) {
    throw new Error(
      [
        '',
        '✋ Refusing to run tests: DATABASE_URL_TEST is not set.',
        '',
        'The test suite deletes all rows between cases, so it must never point at',
        'production. Set up the isolated local test database first:',
        '',
        '    make test-prepare     # starts Docker Postgres on :5433 + applies schema',
        '    make test             # runs the suite against it safely',
        '',
        'See .env.test.example for the connection string.',
        '',
      ].join('\n'),
    )
  }

  return {
    plugins: [tsconfigPaths()],
    test: {
      globals: true,
      environment: 'node',
      // CC-23: the DB integration suite is .test.ts and runs in node. Component
      // tests are .test.tsx and run in jsdom via `npm run test:ui`
      // (vitest.config.ui.ts) — exclude them here so `npm test` doesn't try to
      // render React in the node environment ("document is not defined").
      include: ['tests/**/*.test.ts'],
      setupFiles: ['./tests/setup.ts'],
      fileParallelism: false,
      testTimeout: 30000,
      hookTimeout: 30000,
      env: {
        DATABASE_URL: testDbUrl,
        DIRECT_URL: testDirectUrl,
        PIN_SESSION_SECRET: env.PIN_SESSION_SECRET ?? 'test-secret-32-chars-minimum-pad',
        NODE_ENV: 'test',
      },
    },
  }
})
