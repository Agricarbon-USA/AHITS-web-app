import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EquipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { writeOr404 } from '@/lib/api-errors'
import { retireUnit, unretireUnit, restoreFirst } from '@/lib/asset-status'
import { assertNoOpenReferences, openReferences, referenceConflictBody } from '@/lib/asset-references'

const patchSchema = z.object({
  // Every status parses, so a derived one gets the plain 400 below rather than a schema error.
  status: z.nativeEnum(EquipmentStatus).optional(),
  serialNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { unitId } = await params

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const current = await prisma.inventoryUnit.findFirst({
    where: { id: unitId },
    select: { status: true, serialNumber: true, deletedAt: true, inventoryItem: { select: { name: true, deletedAt: true } } },
  })
  if (!current) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
  // PR-3c: a deleted unit (or a unit of a deleted item) is read-only until restored.
  if (current.deletedAt || current.inventoryItem.deletedAt) {
    return NextResponse.json({ error: restoreFirst(current.inventoryItem.name) }, { status: 409 })
  }

  // PR-3b (D-g · S-6): by hand, a unit is only AVAILABLE or RETIRED. Checked out,
  // Returning, In maintenance and Inoperable are set by what happens to it (a
  // deployment, a return, a reported problem, the review queue) — never from here.
  const { status, ...fields } = parsed.data
  const changing = status !== undefined && status !== current.status
  if (changing && status !== 'AVAILABLE' && status !== 'RETIRED') {
    return NextResponse.json({ error: 'Report a problem to put a unit in repair' }, { status: 400 })
  }
  if (changing && status === 'AVAILABLE' && current.status !== 'RETIRED') {
    return NextResponse.json(
      { error: 'This unit is in use or in repair — it becomes available when it comes back or its repair closes.' },
      { status: 409 },
    )
  }
  const label = `${current.inventoryItem.name}${current.serialNumber ? ` ${current.serialNumber}` : ''}`

  let unit: { id: string; qrCodeId: string; serialNumber: string | null; status: string; notes: string | null; createdAt: Date; inventoryItemId: string } | undefined
  const notFound = await writeOr404(async () => {
    unit = await prisma.$transaction(async (tx) => {
      if (changing && status === 'RETIRED') {
        // The same retire as the review queue (U-2: one retire, not three): QR label
        // released, open repairs closed, the unit's alerts resolved — refused while it is
        // out, Returning or in a pending transfer.
        assertNoOpenReferences('unit', label, await openReferences({ unitId }, tx))
        await retireUnit(tx, unitId, 'Retired by admin')
      } else if (changing && status === 'AVAILABLE') {
        await unretireUnit(tx, unitId)
      }
      return tx.inventoryUnit.update({
        where: { id: unitId },
        data: fields,
        select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true, inventoryItemId: true },
      })
    })
  }, 'Unit not found').catch((err) => {
    const conflict = referenceConflictBody(err)
    if (conflict) return NextResponse.json(conflict, { status: 409 })
    throw err
  })
  if (notFound) return notFound

  if (changing) {
    const action = 'CHECK_IN'
    await prisma.checkLog.create({
      data: {
        action,
        itemId: unit!.inventoryItemId,
        inventoryUnitId: unitId,
        operatorId: session.userId,
        notes: `Admin status change → ${status}`,
      },
    })
  }

  return NextResponse.json({ data: unit! })
}
