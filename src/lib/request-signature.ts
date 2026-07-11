// Q1 double-submit: a deterministic request signature so two byte-identical
// submissions produce the SAME string. Used by the offline queue to (a) coalesce a
// concurrent double-tap onto one in-flight promise and (b) drop an accidental
// offline double-tap. Pure + framework-free so it's unit-testable.

// Key-sorted, recursive stringify. Arrays keep order (order is significant);
// undefined-valued keys are dropped deterministically so `{a:1}` and
// `{a:1,b:undefined}` match; numbers and strings stay distinct (via JSON.stringify).
export function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

export function requestSignature(method: string, endpoint: string, body: unknown): string {
  return `${method} ${endpoint} ${stableStringify(body)}`
}
