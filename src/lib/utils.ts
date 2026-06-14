import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return dayjs(date).format('MMM D, YYYY')
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return dayjs(date).format('MMM D, YYYY h:mm A')
}

export function fromNow(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return dayjs(date).fromNow()
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function snakeToTitle(str: string): string {
  return str.split('_').map(capitalize).join(' ')
}

export function generateQrData(id: string, type: 'vehicle' | 'item'): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/scan?type=${type}&id=${id}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
