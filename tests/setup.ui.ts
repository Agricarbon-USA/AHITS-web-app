// CC-23: jsdom component-test setup. Registers @testing-library/jest-dom
// matchers (toBeInTheDocument, toHaveStyle, …) and cleans up the DOM between
// tests. Deliberately imports NO database/prisma code — component tests never
// hit a DB (see vitest.config.ui.ts).
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as historyGuard from '@/hooks/useHistoryGuard'

afterEach(() => {
  cleanup()
  // useHistoryGuard keeps module-level state (armed stack, pending release). The
  // cleanup above unmounts any open overlay, whose guard then releases its sentinel
  // asynchronously — without a reset that pending release leaks into the next test
  // (its first guard would arm late and eat a synchronously dispatched popstate).
  // This file imports the real module before a test file's vi.mock is registered,
  // so the reset reaches the real state even in files that mock the hook; the
  // optional call inside try is defensive should a mock ever be hoisted ahead of
  // setup (a mocked namespace throws on a missing export).
  try {
    historyGuard.__resetHistoryGuardForTests?.()
  } catch {
    // mocked module without the reset export — nothing to reset
  }
})
