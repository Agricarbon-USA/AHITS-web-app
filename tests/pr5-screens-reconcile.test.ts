import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getMine } from '../src/app/api/deployments/mine/route'
import { GET as listTransfers } from '../src/app/api/transfers/route'
import { prisma } from '../src/lib/prisma'
import { ensureOpenAssignment, getActiveRigForOperator } from '../src/lib/deployment-assignments'
import { createOperator, createAdminUser, createRig, operatorSession, adminSession } from './helpers/fixtures'

// PR-5 (L-8, L-9): "my active rig" is answered once, and an admin holding a rig sees
// their own outgoing transfers.
//  - getActiveRigForOperator: PRIMARY first, then newest. The default (write guards,
//    Today) stays PRIMARY-only; `includeSecondary` is the reader behind /mine.
//  - GET /api/deployments/mine returns the caller's own rig, in the list element's
//    shape — for an admin too (GET /api/deployments[0] was everyone's newest rig).
//  - GET /api/transfers?direction=outgoing works for an ADMIN who is PRIMARY on a rig.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

async function rigStartedAt(operatorId: string, startedAt: Date) {
  const { rig } = await createRig(operatorId)
  await prisma.rig.update({ where: { id: rig.id }, data: { startedAt } })
  return rig
}

async function mine() {
  const res = await getMine()
  return { status: res.status, body: await res.json() }
}

describe('getActiveRigForOperator — the one rule (L-8)', () => {
  let me: Awaited<ReturnType<typeof createOperator>>
  let crewmate: Awaited<ReturnType<typeof createOperator>>

  beforeEach(async () => {
    me = await createOperator({ email: 'pr5-me@test.com', name: 'PR5 Me' })
    crewmate = await createOperator({ email: 'pr5-crew@test.com', name: 'PR5 Crew' })
  })

  it('PRIMARY on an older rig beats SECONDARY on a newer one', async () => {
    const older = await rigStartedAt(me.id, new Date('2026-09-01T12:00:00Z'))
    const newer = await rigStartedAt(crewmate.id, new Date('2026-10-01T12:00:00Z'))
    await ensureOpenAssignment({ rigId: newer.id, operatorId: me.id, role: 'SECONDARY', addedById: crewmate.id })

    expect(await getActiveRigForOperator(me.id, prisma, { includeSecondary: true })).toBe(older.id)
    expect(await getActiveRigForOperator(me.id)).toBe(older.id)
  })

  it('a SECONDARY-only operator: the reader finds the newest crew rig; the guard reading finds none', async () => {
    const third = await createOperator({ email: 'pr5-third@test.com', name: 'PR5 Third' })
    const old = await rigStartedAt(crewmate.id, new Date('2026-09-01T12:00:00Z'))
    const recent = await rigStartedAt(third.id, new Date('2026-10-01T12:00:00Z'))
    await ensureOpenAssignment({ rigId: old.id, operatorId: me.id, role: 'SECONDARY', addedById: crewmate.id })
    await ensureOpenAssignment({ rigId: recent.id, operatorId: me.id, role: 'SECONDARY', addedById: third.id })

    expect(await getActiveRigForOperator(me.id, prisma, { includeSecondary: true })).toBe(recent.id)
    expect(await getActiveRigForOperator(me.id)).toBeNull()
  })

  it('ended rigs never count', async () => {
    const rig = await rigStartedAt(me.id, new Date('2026-10-01T12:00:00Z'))
    await prisma.rig.update({ where: { id: rig.id }, data: { endedAt: new Date() } })
    expect(await getActiveRigForOperator(me.id, prisma, { includeSecondary: true })).toBeNull()
  })
})

describe('GET /api/deployments/mine', () => {
  it('401 without a session', async () => {
    mockSession = null
    expect((await mine()).status).toBe(401)
  })

  it('returns the caller\'s rig in the list shape, or data: null', async () => {
    const op = await createOperator({ email: 'pr5-mine@test.com', name: 'PR5 Mine' })
    mockSession = operatorSession(op.id)
    expect((await mine()).body).toEqual({ data: null })

    const rig = await rigStartedAt(op.id, new Date('2026-10-01T12:00:00Z'))
    const { status, body } = await mine()
    expect(status).toBe(200)
    expect(body.data.id).toBe(rig.id)
    expect(body.data.operator).toEqual({ id: op.id, name: 'PR5 Mine' })
    expect(Array.isArray(body.data.kits)).toBe(true)
    expect(Array.isArray(body.data.vehicles)).toBe(true)
    expect(body.data.secondaryOperators).toEqual([])
  })

  it('an admin gets their own rig, not everyone\'s newest', async () => {
    const admin = await createAdminUser({ email: 'pr5-admin@test.com', name: 'PR5 Admin' })
    const other = await createOperator({ email: 'pr5-other@test.com', name: 'PR5 Other' })
    const adminRig = await rigStartedAt(admin.id, new Date('2026-09-01T12:00:00Z'))
    await rigStartedAt(other.id, new Date('2026-10-01T12:00:00Z')) // newer, someone else's
    mockSession = adminSession(admin.id)
    expect((await mine()).body.data.id).toBe(adminRig.id)
  })
})

describe('GET /api/transfers?direction=outgoing — admin-as-operator (L-9)', () => {
  it('an ADMIN who is PRIMARY on a rig sees the transfers leaving it', async () => {
    const admin = await createAdminUser({ email: 'pr5-admin-tx@test.com', name: 'PR5 Admin Tx' })
    const recipient = await createOperator({ email: 'pr5-recipient@test.com', name: 'PR5 Recipient' })
    const otherSender = await createOperator({ email: 'pr5-sender@test.com', name: 'PR5 Sender' })
    const { rig } = await createRig(admin.id)
    const { rig: otherRig } = await createRig(otherSender.id)
    const mineTx = await prisma.transferRequest.create({
      data: { fromRigId: rig.id, toOperatorId: recipient.id, initiatedById: admin.id, note: 'from the admin', status: 'PENDING' },
    })
    await prisma.transferRequest.create({
      data: { fromRigId: otherRig.id, toOperatorId: recipient.id, initiatedById: otherSender.id, note: 'not mine', status: 'PENDING' },
    })

    mockSession = adminSession(admin.id)
    const out = await listTransfers(new NextRequest('http://localhost/api/transfers?status=PENDING&direction=outgoing'))
    const outBody = await out.json()
    expect(outBody.map((t: { id: string }) => t.id)).toEqual([mineTx.id])

    // No direction: an admin still sees every transfer (unchanged).
    const all = await listTransfers(new NextRequest('http://localhost/api/transfers?status=PENDING'))
    expect((await all.json()).length).toBe(2)
  })
})
