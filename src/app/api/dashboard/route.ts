import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'
import { businessDate } from '@/lib/business-date'
import { OPEN_ALERT } from '@/lib/populations'

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // PR-2 (C-5/P-12): "today" is the APP_TIMEZONE business date, compared on the
  // check's `date` — the same key the Missed-checks feed and the cron use. The
  // old server-midnight `submittedAt` compare reset at 7 pm Central (UTC midnight)
  // and disagreed with the feed beside it every evening.
  const businessToday = new Date(businessDate())

  const [activeDeployments, vehiclesActive, vehiclesInMaintenance, itemsCheckedOut, overdueMaintenanceCount, pendingAlertsCount, todayChecksSubmitted] =
    await Promise.all([
      // Active deployments = rigs that have started and not yet ended.
      prisma.rig.count({ where: { endedAt: null } }),
      prisma.vehicle.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.vehicle.count({ where: { status: 'IN_MAINTENANCE', deletedAt: null } }),
      // Count checked-out UNITS — InventoryUnit.status is the source of truth.
      // (InventoryItem.status is never updated by check-out/in, so counting it
      // here always returned ~0.)
      prisma.inventoryUnit.count({ where: { status: 'CHECKED_OUT', deletedAt: null } }),
      prisma.maintenanceTask.count({ where: { status: 'OVERDUE', deletedAt: null } }),
      prisma.alert.count({ where: OPEN_ALERT }),
      prisma.dailyCheck.count({ where: { date: businessToday } }),
    ])

  return NextResponse.json({
    data: { activeDeployments, vehiclesActive, vehiclesInMaintenance, itemsCheckedOut, overdueMaintenanceCount, pendingAlertsCount, todayChecksSubmitted },
  })
}
