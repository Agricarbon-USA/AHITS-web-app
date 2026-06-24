import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { createRequest, listRequests, LINE_TYPES, VEHICLE_TYPES } from '@/lib/deployment-requests'

const lineSchema = z.object({
  lineType: z.enum(LINE_TYPES),
  categoryId: z.string().optional().nullable(),
  itemType: z.string().optional().nullable(),
  vehicleType: z.enum(VEHICLE_TYPES).optional().nullable(),
  requestedQty: z.number().int().min(1).max(999).default(1),
  specificInventoryItemId: z.string().optional().nullable(),
  specificVehicleId: z.string().optional().nullable(),
}).refine(
  (l) => (l.lineType === 'VEHICLE' ? !!l.vehicleType || !!l.specificVehicleId : !!l.categoryId || !!l.itemType || !!l.specificInventoryItemId),
  { message: 'Each line needs a category/item (kit) or a vehicle type/vehicle.' },
)

const bodySchema = z.object({
  label: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  neededBy: z.string().datetime().optional().nullable(),
  projectId: z.string().optional().nullable(),
  forOperatorId: z.string().optional().nullable(),
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
      label: d.label ?? null,
      notes: d.notes ?? null,
      neededBy: d.neededBy ? new Date(d.neededBy) : null,
      projectId: d.projectId || null,
      forOperatorId: d.forOperatorId || null,
      status: d.status,
      lines: d.lines.map((l) => ({
        lineType: l.lineType,
        categoryId: l.categoryId ?? null,
        itemType: l.itemType ?? null,
        vehicleType: l.vehicleType ?? null,
        requestedQty: l.requestedQty,
        specificInventoryItemId: l.specificInventoryItemId ?? null,
        specificVehicleId: l.specificVehicleId ?? null,
      })),
    },
    session.userId,
  )
  return NextResponse.json({ id }, { status: 201 })
}
