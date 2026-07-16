// CC-23: jsdom component-test setup. Registers @testing-library/jest-dom
// matchers (toBeInTheDocument, toHaveStyle, …) and cleans up the DOM between
// tests. Deliberately imports NO database/prisma code — component tests never
// hit a DB (see vitest.config.ui.ts).
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
