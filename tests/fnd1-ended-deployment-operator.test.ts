import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getDeployment } from '../src/app/api/deployments/[id]/route'
import { GET as listDeployments } from '../src/app/api/deployments/route'
import { prisma } from '../src/lib/prisma'
import { ensureOpenAssignment, endAllAssignmentsForRig, addProjectLink, removeAllProjectLinks } from '../src/lib/deployment-assignments'
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

// REQ-D fix 4: an ended deployment shows the project links its End closed (End closes
// assignments and links in one transaction, so both carry the same now()). A link
// removed earlier (project changed or cleared) does not show, in the drawer or the filter.
describe('REQ-D fix 4 — an ended deployment shows its project', () => {
  let op: Awaited<ReturnType<typeof createOperator>>

  beforeEach(async () => {
    op = await createOperator({ email: 'reqd-op@test.com', name: 'Project Op' })
    mockSession = adminSession(op.id)
  })

  async function startRig() {
    const { rig } = await createRig(op.id)
    await ensureOpenAssignment({ rigId: rig.id, operatorId: op.id, role: 'PRIMARY', addedById: op.id, note: 'test' })
    return rig
  }

  // As the End route does: assignments and links closed in one transaction, then endedAt.
  async function endRig(rigId: string) {
    await prisma.$transaction(async (tx) => {
      await endAllAssignmentsForRig(rigId, tx)
      await removeAllProjectLinks(rigId, tx)
    })
    await prisma.rig.update({ where: { id: rigId }, data: { endedAt: new Date() } })
  }

  // So the earlier removal and the End can never share a millisecond.
  async function pushBackRemoval(rigId: string) {
    await prisma.$executeRaw`UPDATE "deployment_projects" SET "removedAt" = "removedAt" - interval '1 minute' WHERE "rigId" = ${rigId}`
  }

  async function listedFor(projectId: string, active: boolean): Promise<string[]> {
    const res = await listDeployments(new NextRequest(`http://localhost/api/deployments?active=${active}&projectId=${projectId}`))
    expect(res.status).toBe(200)
    return ((await res.json()) as { id: string }[]).map((r) => r.id)
  }

  it('(a) linked to A and ended: the drawer shows A and the filter on A lists it', async () => {
    const a = await prisma.project.create({ data: { name: 'Project A' } })
    const rig = await startRig()
    await addProjectLink(rig.id, a.id)
    await endRig(rig.id)

    const { status, body } = await getRig(rig.id)
    expect(status).toBe(200)
    expect(body.project).toEqual({ id: a.id, name: 'Project A' })
    expect(await listedFor(a.id, false)).toContain(rig.id)
  })

  it('(b) project cleared before the End: no project, not listed', async () => {
    const a = await prisma.project.create({ data: { name: 'Project A' } })
    const rig = await startRig()
    await addProjectLink(rig.id, a.id)
    await removeAllProjectLinks(rig.id)
    await pushBackRemoval(rig.id)
    await endRig(rig.id)

    const { body } = await getRig(rig.id)
    expect(body.project).toBeNull()
    expect(await listedFor(a.id, false)).not.toContain(rig.id)
  })

  it('(c) an active deployment still shows A', async () => {
    const a = await prisma.project.create({ data: { name: 'Project A' } })
    const rig = await startRig()
    await addProjectLink(rig.id, a.id)

    const { body } = await getRig(rig.id)
    expect(body.project).toEqual({ id: a.id, name: 'Project A' })
    expect(await listedFor(a.id, true)).toContain(rig.id)
  })

  it('(d) moved from A to B, then ended: shows B; listed for B, not for A', async () => {
    const a = await prisma.project.create({ data: { name: 'Project A' } })
    const b = await prisma.project.create({ data: { name: 'Project B' } })
    const rig = await startRig()
    await addProjectLink(rig.id, a.id)
    // As the project PATCH does.
    await removeAllProjectLinks(rig.id)
    await pushBackRemoval(rig.id)
    await addProjectLink(rig.id, b.id)
    await endRig(rig.id)

    const { body } = await getRig(rig.id)
    expect(body.project).toEqual({ id: b.id, name: 'Project B' })
    expect(await listedFor(b.id, false)).toContain(rig.id)
    expect(await listedFor(a.id, false)).not.toContain(rig.id)
  })
})
