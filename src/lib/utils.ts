import dayjs from 'dayjs'
// CC-33 (A6): dropped the relativeTime plugin — its only caller was the deleted fromNow helper.

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return dayjs(date).format('MMM D, YYYY')
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return dayjs(date).format('MMM D, YYYY h:mm A')
}

/**
 * P1-1b (3.1): the leading `YYYY-MM-DD` of a date-only value (`@db.Date`, or an
 * `<input type=date>` value), or ''. Sliced, never parsed, so a US time zone can't show
 * the day before. Not for instants.
 */
export function toDay(v: string | Date | null | undefined): string {
  if (!v) return ''
  const s = typeof v === 'string' ? v : Number.isNaN(v.getTime()) ? '' : v.toISOString()
  return /^\d{4}-\d{2}-\d{2}/.exec(s)?.[0] ?? ''
}

/** A date-only value as `MMM D, YYYY`, or '—'. Not for instants (use formatDate). */
export function formatDay(v: string | Date | null | undefined): string {
  const d = toDay(v)
  return d ? dayjs(d).format('MMM D, YYYY') : '—'
}

// CC-33 (A6): removed dead fromNow / capitalize / snakeToTitle / generateQrData (0 importers).

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function groupBy<T>(
  items: T[],
  keyGetter: (item: T) => string,
  groupOrder?: string[],
): { group: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyGetter(item)
    const arr = map.get(key)
    if (arr) arr.push(item)
    else map.set(key, [item])
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1
      if (b === 'Uncategorized') return -1
      if (groupOrder) {
        const ia = groupOrder.indexOf(a)
        const ib = groupOrder.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
      }
      return a.localeCompare(b)
    })
    .map(([group, list]) => ({ group, items: list }))
}
