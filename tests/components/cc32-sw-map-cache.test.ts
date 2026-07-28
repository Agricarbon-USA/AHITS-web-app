import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// CC-32 (3.1): the operator crew map became a bottom-nav tab, so /api/map/crew joins
// the service worker's field-reads cache. The invariant that matters is NARROWNESS:
// the matcher must be an EXACT '/api/map/crew' comparison, never startsWith('/api/map'),
// because /api/map/pins and /api/map/route-history are ADMIN endpoints (AdminMapView)
// and must not be cached into an operator's device.
//
// This is a source-contract assertion, and it is honest about that: sw.ts constructs a
// Serwist instance and calls addEventListeners() at module scope, so it cannot be
// imported in jsdom to exercise the matcher as a function. Extracting the matcher purely
// to make it importable would be a source change made to suit a test. Reading the file
// guards the exact regression the packet names, at zero risk to the shipped worker.

// Assert on CODE, not prose: sw.ts's own comments explain what the matcher deliberately
// avoids, and those explanations name the very strings under test.
const SW = readFileSync(resolve(__dirname, '../../src/app/sw.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('CC-32 (3.1) service worker map caching', () => {
  it('caches the operator crew map by EXACT path match', () => {
    expect(SW).toContain("pathname === '/api/map/crew'")
  })

  it('does NOT prefix-match /api/map — that would cache the admin map endpoints', () => {
    expect(SW).not.toContain("startsWith('/api/map')")
    expect(SW).not.toContain("startsWith('/api/map/')")
  })

  it('keeps the admin-only map endpoints out of the operator cache entirely', () => {
    expect(SW).not.toContain('/api/map/pins')
    expect(SW).not.toContain('/api/map/route-history')
  })
})
