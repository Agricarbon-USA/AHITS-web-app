// FND-7: one authoritative "business date" for daily-check bucketing, the
// missed-check cutoff, and dashboard "today" counts. The business day is defined
// in APP_TIMEZONE (Central per the project decision), NOT UTC — otherwise an
// evening check (e.g. 11pm Central = next-day UTC) is filed under tomorrow, which
// both mis-keys the (vehicleId, date, operatorId) unique row and trips a false
// DAILY_CHECK_MISSED alert. The client, the cron, and the feeds MUST all agree,
// so they all call through here. Uses Intl (no date-fns/luxon dep); works on both
// server and client (on the client process.env.APP_TIMEZONE is undefined, so the
// default keeps it aligned with the server as long as APP_TIMEZONE stays Central).

export function appTimezone(): string {
  return process.env.APP_TIMEZONE || 'America/Chicago'
}

/** Business date as `YYYY-MM-DD` in APP_TIMEZONE for a given instant (default now). */
export function businessDate(d: Date = new Date(), tz: string = appTimezone()): string {
  // 'en-CA' formats as ISO-style YYYY-MM-DD with zero-padding.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Business date plus wall-clock hour/minute in APP_TIMEZONE — for the cutoff scan. */
export function businessDateTime(
  d: Date = new Date(),
  tz: string = appTimezone(),
): { date: string; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  // Intl can emit "24" for midnight in some engines; normalise to 0.
  const hour = Number(parts.hour) % 24
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, minute: Number(parts.minute) }
}
