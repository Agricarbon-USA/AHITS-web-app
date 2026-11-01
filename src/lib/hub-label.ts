/** A hub as pickers and return dialogs list it. */
export interface HubOption {
  id: string
  name: string
  city: string
  state: string
}

/** One hub label everywhere: `name · city, state` (plan §2, D38). */
export function hubLabel(h: { name: string; city?: string | null; state?: string | null }): string {
  if (!h.city) return h.name
  return `${h.name} · ${h.city}${h.state ? `, ${h.state}` : ''}`
}
