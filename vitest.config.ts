import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [tsconfigPaths()],
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['./tests/setup.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      env: {
        DATABASE_URL: env.DATABASE_URL_TEST ?? env.DATABASE_URL,
        DIRECT_URL: env.DIRECT_URL_TEST ?? env.DIRECT_URL,
        PIN_SESSION_SECRET: env.PIN_SESSION_SECRET ?? 'test-secret-32-chars-minimum-pad',
        NODE_ENV: 'test',
      },
    },
  }
})
