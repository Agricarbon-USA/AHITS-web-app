import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getDeployment } from '../src/app/api/deployments/[id]/route'
import { prisma } from '../src/lib/prisma'
import { ensureOpenAssignment, endAllAssignmentsForRig } from '../src/lib/deployment-assignments'
import { createOperator, createRig, adminSession } from './helpers/fixtures'

// FND-1: GET /api/deployments/[id] must return a non-null `operator` even for an
// ENDED deployment. The roster only reports OPEN assignments, so once a deployment
// ends the roster returns no operator; before the fix the route emitted
// operator:null, which crashed the admin drawer/list on render. The route now
// hydrates from the retained legacy Rig.operatorId. (Reproduced live this session:
// ending a deployment threw the admin page to the error boundary.)

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

async function getRig(rigId: string) {
  const res = await getDeployment(
    new NextRequest(`http://localhost/api/deployments/${rigId}`),
    { params: Promise.resolve({ id: rigId }) },
  )
  return { status: res.status, body: await res.json() }
}

describe('FND-1 — ended deployment serializes with a non-null operator', () => {
  let op: Awaited<ReturnType<typeof createOperator>>

  beforeEach(async () => {
    op = await createOperator({ email: 'fnd1-op@test.com', name: 'Ended Op' })
  })

  it('active deployment returns the roster operator (control)', async () => {
    const { rig } = await createRig(op.id)
    await ensureOpenAssignment({ rigId: rig.id, operatorId: op.id, role: 'PRIMARY', addedById: op.id, note: 'test' })

    mockSession = adminSession(op.id)
    const { status, body } = await getRig(rig.id)
    expect(status).toBe(200)
    expect(body.operator).not.toBeNull()
    expect(body.operator.id).toBe(op.id)
  })

  it('ended deployment still returns operator hydrated from the final assignment roster', async () => {
    const { rig } = await createRig(op.id)
    await ensureOpenAssignment({ rigId: rig.id, operatorId: op.id, role: 'PRIMARY', addedById: op.id, note: 'test' })

    // End it: close the roster assignments + stamp endedAt (mirrors end-of-deployment).
    await endAllAssignmentsForRig(rig.id)
    await prisma.rig.update({ where: { id: rig.id }, data: { endedAt: new Date() } })

    mockSession = adminSession(op.id)
    const { status, body } = await getRig(rig.id)
    expect(status).toBe(200)
    // W0-10 PR-4: operator hydrates from the final (closed) assignment roster (max_ended CTE), not null.
    expect(body.operator).not.toBeNull()
    expect(body.operator.id).toBe(op.id)
    expect(body.operator.name).toBe('Ended Op')
  })
})
