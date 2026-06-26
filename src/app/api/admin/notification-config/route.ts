import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/session'
import { getNotificationConfig, updateNotificationConfig } from '@/lib/notification-config'

// Alert types an admin can toggle notifications for. PIN_LOCKED is intentionally
// omitted — it's a security signal that should always notify.
const CONFIGURABLE_ALERT_TYPES = [
  'MAINTENANCE_OVERDUE',
  'EQUIPMENT_NOT_RETURNED',
  'DAMAGE_REPORTED',
  'DAILY_CHECK_FAILED',
  'LOW_INVENTORY',
  'INSURANCE_EXPIRING',
  'REGISTRATION_EXPIRING',
] as const

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const config = await getNotificationConfig()
  return NextResponse.json({ data: { ...config, configurableTypes: CONFIGURABLE_ALERT_TYPES } })
}

const schema = z.object({
  // HH:MM 24-hour
  dailyCheckCutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)'),
  disabledAlertTypes: z.array(z.enum(CONFIGURABLE_ALERT_TYPES)).default([]),
})

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  await updateNotificationConfig(parsed.data)
  return NextResponse.json({ data: await getNotificationConfig() })
}
