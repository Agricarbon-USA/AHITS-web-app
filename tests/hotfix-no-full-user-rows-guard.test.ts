// Hotfix 2026-10-22 (H-a · H-c): an API response never carries a full user row. A
// user relation is read with `select` of named fields only — for display that is
// `{ id: true, name: true }`. `include: { operator: true }` on GET /api/vehicles/[id]
// sent every recent checker's pinHash and email to any signed-in user.
//
// Pure: no database. Reads prisma/schema.prisma for every field typed `User`, `User?`
// or `User[]`, then fails on any `<field>: true` in a .ts file under src/app/api or
// src/lib. Opt out only with a same-line `// user-fields: ok <reason>`. The self-test
// at the bottom proves the detector flags the bad shape, so "found none" means
// something.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const SCAN = [path.join(ROOT, 'src', 'app', 'api'), path.join(ROOT, 'src', 'lib')]
const OPT_OUT = /\/\/\s*user-fields:\s*ok\s+\S/

export interface Hit {
  file: string
  line: number
  text: string
}

/** Every relation field whose type is User, User? or User[], across all models. */
export function userRelationFields(schema: string): string[] {
  const names = new Set<string>()
  let inModel = false
  for (const line of schema.split('\n')) {
    if (/^\s*model\s+\w+\s*\{/.test(line)) inModel = true
    else if (/^\s*\}/.test(line)) inModel = false
    else if (inModel) {
      const m = line.match(/^\s*(\w+)\s+User(\?|\[\])?(\s|$)/)
      if (m) names.add(m[1])
    }
  }
  return [...names].sort()
}

/** Every `<userRelation>: true` in one file's text, minus same-line opt-outs. */
export function findFullUserRows(file: string, text: string, fields: string[]): Hit[] {
  const re = new RegExp(`\\b(${fields.join('|')})\\s*:\\s*true\\b`)
  return text.split('\n').flatMap((line, i) =>
    re.test(line) && !OPT_OUT.test(line) ? [{ file, line: i + 1, text: line.trim() }] : [],
  )
}

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return tsFiles(p)
    return e.isFile() && p.endsWith('.ts') ? [p] : []
  })
}

const FIELDS = userRelationFields(fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8'))

describe('Hotfix guard: no full user rows from src/app/api or src/lib', () => {
  it('reads the User relations from the schema', () => {
    expect(FIELDS).toEqual(expect.arrayContaining([
      'actor', 'admin', 'createdBy', 'deletedBy', 'homeOperators', 'initiatedBy',
      'lead', 'operator', 'targetUser', 'toOperator', 'uploadedBy', 'user',
    ]))
  })

  it('finds no `<userRelation>: true` anywhere in src/app/api or src/lib', () => {
    const files = SCAN.flatMap(tsFiles)
    expect(files.length).toBeGreaterThan(50) // the scan actually covered the trees
    const hits = files.flatMap((f) => findFullUserRows(f, fs.readFileSync(f, 'utf8'), FIELDS))
    expect(hits.map((h) => `${path.relative(ROOT, h.file)}:${h.line}  ${h.text}`)).toEqual([])
  })

  describe('self-test', () => {
    it('flags include: { operator: true }', () => {
      expect(findFullUserRows('x.ts', `include: { operator: true }`, FIELDS)).toHaveLength(1)
    })

    it('does not flag operator: { select: { id: true, name: true } }', () => {
      expect(findFullUserRows('x.ts', `include: { operator: { select: { id: true, name: true } } }`, FIELDS)).toEqual([])
    })

    it('honours a same-line opt-out with a reason, and only with one', () => {
      expect(findFullUserRows('x.ts', `include: { user: true } // user-fields: ok internal job, never serialized`, FIELDS)).toEqual([])
      expect(findFullUserRows('x.ts', `include: { user: true } // user-fields: ok`, FIELDS)).toHaveLength(1)
    })
  })
})
