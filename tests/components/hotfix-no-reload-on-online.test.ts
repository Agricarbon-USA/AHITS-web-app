import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Hotfix 2026-10-25 (H2-a): @serwist/next defaults reloadOnOnline to true, which
// reloads every page when signal returns and wipes unsaved work. next.config.ts must
// turn it off. And the offline page's precache entry needs a revision — with null, a
// phone keeps the copy from its first install forever, so ~offline/page.tsx's reload
// script (H2-c) would never reach it.
//
// Source-contract assertions, as in cc32-sw-map-cache: neither file can be imported
// in jsdom. Comments are stripped first so a comment can't satisfy the check.
const code = (rel: string) =>
  readFileSync(resolve(__dirname, '../..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('Hotfix 2026-10-25 · signal returning does not reload the app', () => {
  it('next.config.ts sets reloadOnOnline: false in withSerwistInit', () => {
    const init = code('next.config.ts').match(/withSerwistInit\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(
      /reloadOnOnline:\s*false/.test(init),
      'next.config.ts must set reloadOnOnline: false (see AHITS_HOTFIX_2026-10-25).',
    ).toBe(true)
  })

  it('sw.ts precaches /~offline with a revision, not null', () => {
    const sw = code('src/app/sw.ts')
    expect(sw).not.toContain('STATIC_PRECACHE.map((url) => ({ url, revision: null }))')
    expect(sw).toContain('revision: OFFLINE_PAGE_REVISION')
  })
})
