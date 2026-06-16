import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [vehiclesActive, vehiclesInMaintenance, itemsCheckedOut, overdueMaintenanceCount, pendingAlertsCount, todayChecksSubmitted] =
    await Promise.all([
      prisma.vehicle.count({ where: { status: 'ACTIVE' } }),
      prisma.vehicle.count({ where: { status: 'IN_MAINTENANCE' } }),
      prisma.inventoryUnit.count({ where: { status: 'CHECKED_OUT' } }),
      prisma.maintenanceTask.count({ where: { status: 'OVERDUE' } }),
      prisma.alert.count({ where: { resolved: false } }),
      prisma.dailyCheck.count({ where: { submittedAt: { gte: today } } }),
    ])

  return NextResponse.json({
    data: { vehiclesActive, vehiclesInMaintenance, itemsCheckedOut, overdueMaintenanceCount, pendingAlertsCount, todayChecksSubmitted },
  })
}
