import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { issueStatusLink } from '@/lib/status-links'
import { sendEmail } from '@/lib/email/resend'
import { workOrderEmail } from '@/lib/email/templates'

const schema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  expiresInDays: z.number().int().min(1).max(180).optional(),
})

// Issue a WORK_ORDER status link for a maintenance task and email it to the shop.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { recipientEmail, recipientName, expiresInDays } = parsed.data

  const task = await prisma.maintenanceTask.findFirst({
    where: { id, deletedAt: null },
    include: {
      vehicle: { select: { name: true } },
      item: { select: { name: true } },
      repairHub: { select: { id: true, name: true, city: true, state: true } },
    },
  })
  if (!task) return NextResponse.json({ error: 'Maintenance task not found' }, { status: 404 })

  // Resend: supersede any still-active work order for this task so only the
  // newest link works (the old token immediately stops resolving).
  await prisma.statusLink.updateMany({
    where: { maintenanceTaskId: task.id, type: 'WORK_ORDER', state: { notIn: ['COMPLETED', 'REVOKED', 'EXPIRED'] } },
    data: { state: 'REVOKED', revokedAt: new Date() },
  })

  const { statusLink, url } = await issueStatusLink({
    type: 'WORK_ORDER',
    createdById: session.userId,
    maintenanceTaskId: task.id,
    hubId: task.repairHubId ?? task.hubId ?? undefined,
    recipientEmail,
    recipientName,
    expiresInDays,
  })

  const assetName = task.vehicle?.name ?? task.item?.name ?? 'Equipment'
  const shipToHub = task.repairHub ? `${task.repairHub.name} — ${task.repairHub.city}, ${task.repairHub.state}` : null

  let emailed = false
  try {
    await sendEmail({ kind: 'WORK_ORDER',
      to: recipientEmail,
      subject: `Work Order: ${assetName} — ${task.taskName}`,
      html: workOrderEmail({
        shopName: recipientName ?? task.shopName,
        taskName: task.taskName,
        assetName,
        problem: task.notes,
        shipToHub,
        linkUrl: url,
      }),
    })
    emailed = true
  } catch {
    // Mailer not configured / transient — the link still exists and can be
    // copied from the admin UI; we report emailed:false rather than failing.
  }

  return NextResponse.json({ ok: true, emailed, statusLinkId: statusLink.id, url }, { status: 201 })
}
