import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/session'

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

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
      prisma.alert.count({ where: { resolved: false } }),
      prisma.dailyCheck.count({ where: { submittedAt: { gte: today } } }),
    ])

  return NextResponse.json({
    data: { activeDeployments, vehiclesActive, vehiclesInMaintenance, itemsCheckedOut, overdueMaintenanceCount, pendingAlertsCount, todayChecksSubmitted },
  })
}
