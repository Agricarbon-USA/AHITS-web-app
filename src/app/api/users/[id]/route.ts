import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/session'
import { hashPin } from '@/lib/auth/pin'
import { writeAudit, type AuditAction } from '@/lib/audit'
import { pinSchema, money } from '@/lib/validation'

// Account-management actions for a single user (Wave 2A.5 §B). A strict,
// whitelisted schema — no mass-assignment.
const patchSchema = z
  .object({
    name: z.string().min(1),
    role: z.enum(['ADMIN', 'OPERATOR']),
    isActive: z.boolean(),
    homeHubId: z.string().nullable(),
    hourlyRate: money().nullable(),
    pin: pinSchema, // reset PIN
    unlockPin: z.boolean(), // clear lockout
    forceLogout: z.boolean(), // revoke all active sessions
  })
  .partial()
  .strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true, name: true },
  })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { pin, unlockPin, forceLogout, role, isActive, homeHubId, hourlyRate, name } = parsed.data

  // Guardrail: an admin cannot suspend, demote, or force-logout their OWN
  // account (CR-7). Self-suspend/self-demote bumps tokenVersion and instantly
  // locks the actor out mid-session; route these through another admin instead.
  const isSelf = id === session.userId
  const selfDemote = isSelf && role === 'OPERATOR'
  const selfDeactivate = isSelf && isActive === false
  const selfForceLogout = isSelf && forceLogout === true
  if (selfDemote || selfDeactivate || selfForceLogout) {
    return NextResponse.json(
      { error: 'You cannot suspend, demote, or force-logout your own account.' },
      { status: 400 },
    )
  }

  // Guardrail: never demote, deactivate, or otherwise remove the LAST active
  // admin — that would lock the whole org out.
  const demotingAdmin = target.role === 'ADMIN' && role === 'OPERATOR'
  const deactivatingAdmin = target.role === 'ADMIN' && isActive === false
  if (demotingAdmin || deactivatingAdmin) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: id } },
    })
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: 'Cannot demote or deactivate the last active admin.' },
        { status: 400 },
      )
    }
  }

  const data: Record<string, unknown> = {}
  const actions: { action: AuditAction; meta?: Record<string, unknown> }[] = []

  if (name !== undefined) data.name = name
  if (homeHubId !== undefined) data.homeHubId = homeHubId
  if (hourlyRate !== undefined) data.hourlyRate = hourlyRate
  if (homeHubId !== undefined || hourlyRate !== undefined) actions.push({ action: 'SET_DEFAULTS', meta: { homeHubId, hourlyRate } })

  if (role !== undefined && role !== target.role) {
    data.role = role
    actions.push({ action: 'ROLE_CHANGE', meta: { from: target.role, to: role } })
  }

  if (isActive !== undefined && isActive !== target.isActive) {
    data.isActive = isActive
    actions.push({ action: isActive ? 'REACTIVATE' : 'SUSPEND' })
  }

  if (pin) {
    data.pinHash = await hashPin(pin)
    data.mustChangePin = true // force the operator to set their own on next login
    actions.push({ action: 'RESET_PIN' })
  }

  if (unlockPin) {
    data.pinLockedAt = null
    data.failedPinAttempts = 0
    actions.push({ action: 'UNLOCK_PIN' })
  }

  if (forceLogout) actions.push({ action: 'FORCE_LOGOUT' })

  // Bump tokenVersion to invalidate existing sessions whenever we suspend,
  // reset the PIN, or explicitly force a logout. (Suspend is also enforced by
  // the isActive re-check in getSession, but bumping covers reactivation too.)
  if (forceLogout || pin || isActive === false) {
    data.tokenVersion = { increment: 1 }
  }

  try {
    const user = await prisma.user.update({ where: { id }, data })
    for (const a of actions) await writeAudit(session.userId, a.action, id, a.meta)
    const { pinHash: _omit, ...safeUser } = user
    return NextResponse.json({ data: safeUser })
  } catch {
    return NextResponse.json({ error: 'Update failed' }, { status: 400 })
  }
}
