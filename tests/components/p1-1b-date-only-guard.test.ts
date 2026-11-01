import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// P1-1b (3.6) · date-only values (`@db.Date`, `<input type=date>`) go through formatDay,
// never formatDate: formatDate parses the value as an instant, so in a US time zone a
// UTC-midnight date shows the day before. This guard scans every src/**/*.tsx for
// `formatDate(` / `fmt(` / `fmtDate(` on a known date-only field. A deliberate use opts
// out with `// date-only: ok <reason>` on the same or the previous line.

const ROOT = resolve(__dirname, '../..')
const CALL = /\b(formatDate|fmt|fmtDate)\(([^()]*)\)/g
const DATE_ONLY = /(\.date\b|rentalStartDate|rentalEndDate|startDate|endDate|neededBy|insuranceExpires|registrationExpires)/
const OPT_OUT = /date-only: ok \S/

/** `file:line` for each date-only field formatted as an instant. */
function offenders(source: string, file = 'x.tsx'): string[] {
  const lines = source.split('\n')
  const out: string[] = []
  lines.forEach((line, i) => {
    if (OPT_OUT.test(line) || (i > 0 && OPT_OUT.test(lines[i - 1]!))) return
    for (const m of line.matchAll(CALL)) {
      if (DATE_ONLY.test(m[2]!)) out.push(`${file}:${i + 1}: ${m[0]}`)
    }
  })
  return out
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name)
    if (d.isDirectory()) return tsxFiles(p)
    return d.name.endsWith('.tsx') ? [p] : []
  })
}

describe('P1-1b (3.6) · date-only guard', () => {
  it('self-test: catches a date-only field formatted as an instant', () => {
    expect(offenders('{formatDate(c.date)}')).toHaveLength(1)
    expect(offenders('`${fmt(p.startDate)} – ${fmt(p.endDate)}`')).toHaveLength(2)
    expect(offenders('value={fmtDate(s.neededBy)}')).toHaveLength(1)
    expect(offenders('formatDate(detail.rentalStartDate) → formatDate(detail.rentalEndDate)')).toHaveLength(2)
    expect(offenders('formatDate(v.insuranceExpires) formatDate(v.registrationExpires)')).toHaveLength(2)
  })

  it('self-test: leaves instants, formatDay and opt-outs alone', () => {
    expect(offenders('formatDate(r.startedAt)')).toEqual([])
    expect(offenders('formatDate(t.dateDelivered)')).toEqual([])
    expect(offenders('formatDay(c.date)')).toEqual([])
    expect(offenders('formatDate(c.date) // date-only: ok it is an instant here')).toEqual([])
    expect(offenders('// date-only: ok legacy column\nformatDate(c.date)')).toEqual([])
    expect(offenders('formatDate(c.date) // date-only: ok')).toHaveLength(1) // a reason is required
  })

  it('no src/**/*.tsx formats a date-only field with formatDate / fmt / fmtDate', () => {
    const found = tsxFiles(join(ROOT, 'src')).flatMap((f) => offenders(readFileSync(f, 'utf8'), relative(ROOT, f)))
    expect(found).toEqual([])
  })
})
