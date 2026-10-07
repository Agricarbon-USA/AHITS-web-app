// PR-3a (RC-1 · D-g): `src/lib/asset-status.ts` is the ONLY writer of
// `vehicle.status` and `inventoryUnit.status` outside migrations. This test fails
// the build if any other file in `src/` writes either — same spirit as the CC-23
// no-hex rule.
//
// Pure: no database. It type-checks `src/` with the TypeScript compiler and looks at
// every `.update` / `.updateMany` / `.upsert` on a `vehicle` or `inventoryUnit`
// delegate: the write is a violation when the TYPE of its `data` has a `status`
// property — so `data: { status }`, `data: { ...body }` and `data: parsedBody` are
// all caught, not just a literal key. Nested writes through a relation
// (`units: { updateMany: … }`) and raw SQL (`UPDATE "vehicles" SET "status" = …`) are
// checked too. The self-test at the bottom proves the detector actually flags each
// shape, so "found none" means something.
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import ts from 'typescript'

const ROOT = path.resolve(__dirname, '..')
const OWNER = path.join(ROOT, 'src', 'lib', 'asset-status.ts')

const DELEGATES = new Set(['vehicle', 'inventoryUnit'])
const WRITES = new Set(['update', 'updateMany', 'upsert'])
// Relation fields through which a parent write can reach a unit or vehicle row.
const NESTED_RELATIONS = new Set(['units', 'inventoryUnit', 'vehicle', 'vehicles'])
const RAW_STATUS_WRITE = /UPDATE\s+"?(inventory_units|vehicles)"?\s+SET\b([\s\S]*?)(\bWHERE\b|`|$)/gi

export interface Violation {
  file: string
  line: number
  what: string
}

function hasStatus(checker: ts.TypeChecker, node: ts.Expression): boolean {
  const type = checker.getTypeAtLocation(node)
  const types = type.isUnion() ? type.types : [type]
  return types.some((t) => !!t.getProperty('status'))
}

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
    return p.name.text
  }
  return null
}

function prop(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | null {
  for (const p of obj.properties) {
    if (propName(p) !== name) continue
    if (ts.isPropertyAssignment(p)) return p.initializer
    if (ts.isShorthandPropertyAssignment(p)) return p.name
  }
  return null
}

/** Every status write to a vehicle or unit in one source file. */
export function findStatusWrites(sf: ts.SourceFile, checker: ts.TypeChecker): Violation[] {
  const out: Violation[] = []
  const at = (n: ts.Node, what: string) =>
    out.push({ file: sf.fileName, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, what })

  const visit = (node: ts.Node) => {
    // tx.vehicle.update({ data }) / prisma.inventoryUnit.updateMany({ data }) / .upsert({ create, update })
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const target = node.expression.expression
      if (WRITES.has(method) && ts.isPropertyAccessExpression(target) && DELEGATES.has(target.name.text)) {
        const arg = node.arguments[0]
        if (!arg) {
          // nothing to check
        } else if (!ts.isObjectLiteralExpression(arg)) {
          if (hasStatus(checker, arg)) at(node, `${target.name.text}.${method}(<args with status>)`)
        } else {
          for (const key of method === 'upsert' ? ['create', 'update'] : ['data']) {
            const data = prop(arg, key)
            if (data && hasStatus(checker, data)) at(node, `${target.name.text}.${method} ${key}.status`)
          }
        }
      }
    }
    // A parent write reaching units/vehicles: { units: { update…: … } }
    if (ts.isPropertyAssignment(node) && NESTED_RELATIONS.has(propName(node) ?? '') && ts.isObjectLiteralExpression(node.initializer)) {
      for (const p of node.initializer.properties) {
        const name = propName(p)
        if (name && (WRITES.has(name) || name === 'set') && ts.isPropertyAssignment(p)) {
          const inner = p.initializer
          const datas = ts.isObjectLiteralExpression(inner)
            ? [prop(inner, 'data') ?? inner]
            : ts.isArrayLiteralExpression(inner)
              ? inner.elements.map((e) => (ts.isObjectLiteralExpression(e) ? prop(e, 'data') ?? e : e))
              : [inner]
          if (datas.some((d) => hasStatus(checker, d))) at(p, `nested ${propName(node)}.${name} with status`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  // Raw SQL: UPDATE "inventory_units" / "vehicles" … SET … status …
  const text = sf.getFullText()
  for (const m of text.matchAll(RAW_STATUS_WRITE)) {
    if (/"?status"?\s*=/i.test(m[2])) {
      out.push({ file: sf.fileName, line: text.slice(0, m.index).split('\n').length, what: `raw UPDATE ${m[1]} SET status` })
    }
  }
  return out
}

function srcProgram(): ts.Program {
  const configPath = path.join(ROOT, 'tsconfig.json')
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')) },
  })
  if (!parsed) throw new Error('could not read tsconfig.json')
  const srcFiles = parsed.fileNames.filter((f) => f.startsWith(path.join(ROOT, 'src') + path.sep))
  return ts.createProgram(srcFiles, { ...parsed.options, noEmit: true })
}

function programFor(code: string): { sf: ts.SourceFile; checker: ts.TypeChecker } {
  const fileName = path.join(ROOT, '__guard_selftest__.ts')
  const options: ts.CompilerOptions = { strict: true, target: ts.ScriptTarget.ES2022, noEmit: true, types: [], lib: ['lib.es2022.d.ts'] }
  const host = ts.createCompilerHost(options)
  const read = host.getSourceFile
  host.getSourceFile = (name, lang, ...rest) =>
    name === fileName ? ts.createSourceFile(name, code, lang, true) : read.call(host, name, lang, ...rest)
  const program = ts.createProgram([fileName], options, host)
  return { sf: program.getSourceFile(fileName)!, checker: program.getTypeChecker() }
}

describe('PR-3a guard: asset-status.ts is the only writer of vehicle/unit status', () => {
  it('finds no status write to a vehicle or unit anywhere else in src/', () => {
    const program = srcProgram()
    const checker = program.getTypeChecker()
    const files = program.getSourceFiles().filter((sf) => sf.fileName.startsWith(path.join(ROOT, 'src')) && path.resolve(sf.fileName) !== OWNER)
    expect(files.length).toBeGreaterThan(100) // the scan actually covered src/
    const violations = files.flatMap((sf) => findStatusWrites(sf, checker))
    const report = violations.map((v) => `${path.relative(ROOT, v.file)}:${v.line}  ${v.what}`)
    expect(report).toEqual([])
  }, 180_000)

  it('the owner module itself is seen by the detector (so the exclusion is what lets it pass)', () => {
    const program = srcProgram()
    const owner = program.getSourceFile(OWNER)
    expect(owner).toBeDefined()
    expect(findStatusWrites(owner!, program.getTypeChecker()).length).toBeGreaterThan(5)
  }, 180_000)

  describe('self-test: each violating shape is flagged', () => {
    const prelude = `
      type Data = { status?: string; notes?: string; odometer?: number }
      declare const tx: {
        vehicle: { update(a: { where: object; data: Data }): void; updateMany(a: { where: object; data: Data }): void }
        inventoryUnit: { update(a: { where: object; data: Data }): void; updateMany(a: { where: object; data: Data }): void; upsert(a: { where: object; create: Data; update: Data }): void }
        inventoryItem: { update(a: { where: object; data: object }): void }
        $executeRaw(s: TemplateStringsArray, ...v: unknown[]): void
      }
    `
    const cases: Array<[string, string]> = [
      ['literal key', `tx.vehicle.update({ where: {}, data: { status: 'IN_MAINTENANCE' } })`],
      ['shorthand key', `const status = 'AVAILABLE'; tx.inventoryUnit.updateMany({ where: {}, data: { status } })`],
      ['spread', `const body = { status: 'RETIRED', notes: 'x' }; tx.inventoryUnit.update({ where: {}, data: { ...body } })`],
      ['data is a variable', `const d = { status: 'ACTIVE' }; tx.vehicle.updateMany({ where: {}, data: d })`],
      ['upsert', `tx.inventoryUnit.upsert({ where: {}, create: {}, update: { status: 'AVAILABLE' } })`],
      ['nested relation write', `tx.inventoryItem.update({ where: {}, data: { units: { updateMany: { where: {}, data: { status: 'RETIRED' } } } } })`],
      ['raw SQL', 'tx.$executeRaw`UPDATE "inventory_units" SET "status" = \'AVAILABLE\' WHERE "id" = ${1}`'],
    ]
    for (const [name, code] of cases) {
      it(`flags: ${name}`, () => {
        const { sf, checker } = programFor(prelude + code)
        expect(findStatusWrites(sf, checker).length).toBeGreaterThan(0)
      })
    }

    it('does not flag writes without status', () => {
      const { sf, checker } = programFor(prelude + `
        const { status, ...rest } = { status: 'X', notes: 'y' }; void status
        tx.vehicle.update({ where: {}, data: { odometer: 5 } })
        tx.inventoryUnit.update({ where: {}, data: rest })
        tx.$executeRaw\`UPDATE "vehicles" SET "hubId" = \${1} WHERE "id" = \${2}\`
      `)
      expect(findStatusWrites(sf, checker)).toEqual([])
    })
  })
})
