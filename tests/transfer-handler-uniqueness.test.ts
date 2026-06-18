import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ── Guard for Wave 1.5 item C2 ──────────────────────────────────────────────
//
// There used to be THREE handlers for responding to a transfer:
//   • src/app/api/transfers/[id]/accept/route.ts    (canonical)
//   • src/app/api/transfers/[id]/decline/route.ts   (canonical)
//   • src/app/api/transfers/[id]/[action]/route.ts  (older, divergent — DELETED)
//
// In the Next.js App Router a STATIC segment ("accept"/"decline") takes
// precedence over a DYNAMIC segment ("[action]") at the same level, so the
// dynamic handler never actually ran for those two actions. But it was
// materially different from the canonical handlers — it did NOT update
// `vehicle.assignedOperatorId`, did NOT write CheckLogs, and did NOT restore
// units on decline — so it was a latent regression waiting to be triggered by
// a refactor or a different action string. It was removed in Wave 1.5.
//
// This is a fast, DB-free structural guard: it fails if anyone re-introduces
// the divergent dynamic handler, or accidentally removes a canonical one.
describe('transfer response handler uniqueness (C2)', () => {
  const dir = path.join(process.cwd(), 'src/app/api/transfers/[id]')

  it('keeps the canonical static accept + decline handlers', () => {
    expect(fs.existsSync(path.join(dir, 'accept/route.ts'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'decline/route.ts'))).toBe(true)
  })

  it('does not reintroduce the dead dynamic [action] handler', () => {
    expect(fs.existsSync(path.join(dir, '[action]'))).toBe(false)
    expect(fs.existsSync(path.join(dir, '[action]/route.ts'))).toBe(false)
  })
})
