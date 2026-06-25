import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { createRequest, listRequests, LINE_TYPES, VEHICLE_TYPES, REQUEST_TYPES } from '@/lib/deployment-requests'

const lineSchema = z
  .object({
    lineType: z.enum(LINE_TYPES),
    categoryId: z.string().optional().nullable(),
    itemType: z.string().optional().nullable(),
    vehicleType: z.enum(VEHICLE_TYPES).optional().nullable(),
    requestedQty: z.number().int().min(1).max(999).default(1),
    specificInventoryItemId: z.string().optional().nullable(),
    specificVehicleId: z.string().optional().nullable(),
    specificInventoryUnitId: z.string().optional().nullable(),
    description: z.string().trim().max(500).optional().nullable(),
    reorderUrl: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    (l) => {
      if (l.lineType === 'VEHICLE') return !!l.vehicleType || !!l.specificVehicleId
      if (l.lineType === 'NEW_PURCHASE' || l.lineType === 'SHIPPING_LABEL') return !!l.description
      return !!l.categoryId || !!l.itemType || !!l.specificInventoryItemId
    },
    { message: 'Each line needs a category/item (kit), vehicle type/vehicle, or description (purchase/shipping).' },
  )

const bodySchema = z.object({
  requestType: z.enum(REQUEST_TYPES).default('RESERVATION'),
  label: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  neededBy: z.string().datetime().optional().nullable(),
  projectId: z.string().optional().nullable(),
  forOperatorId: z.string().optional().nullable(),
  fulfillerHubId: z.string().optional().nullable(),
  fulfillerOperatorId: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'REQUESTED']).default('REQUESTED'),
  lines: z.array(lineSchema).min(1, 'Add at least one requested item or vehicle'),
})

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Admins see every request; operators see only their own.
  const scope = session.role === 'ADMIN' ? undefined : session.userId
  return NextResponse.json({ data: await listRequests(scope) })
}

export async function POST(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data

  const id = await createRequest(
    {
      requestType: d.requestType,
      label: d.label ?? null,
      notes: d.notes ?? null,
      neededBy: d.neededBy ? new Date(d.neededBy) : null,
      projectId: d.projectId || null,
      forOperatorId: d.forOperatorId || null,
      fulfillerHubId: d.fulfillerHubId || null,
      fulfillerOperatorId: d.fulfillerOperatorId || null,
      status: d.status,
      lines: d.lines.map((l) => ({
        lineType: l.lineType,
        categoryId: l.categoryId ?? null,
        itemType: l.itemType ?? null,
        vehicleType: l.vehicleType ?? null,
        requestedQty: l.requestedQty,
        specificInventoryItemId: l.specificInventoryItemId ?? null,
        specificVehicleId: l.specificVehicleId ?? null,
        specificInventoryUnitId: l.specificInventoryUnitId ?? null,
        description: l.description ?? null,
        reorderUrl: l.reorderUrl ?? null,
      })),
    },
    session.userId,
  )
  return NextResponse.json({ id }, { status: 201 })
}
