import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as createRequest } from '../src/app/api/deployment-requests/route'
import { prisma } from '../src/lib/prisma'
import { createAdminUser, adminSession, createOperator, createHub, createCategory } from './helpers/fixtures'

// NEW-3: an admin can create a deployment request on an operator's behalf via the
// shared composer. This pins the data path — forOperatorId is persisted — which is
// the capability the admin UI now exposes (the composer is shared with operators).

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/alerts', () => ({
  createAlert: vi.fn().mockResolvedValue({}),
  resolveActiveAlert: vi.fn().mockResolvedValue({}),
}))

function req(body: unknown) {
  return new NextRequest('http://localhost/api/deployment-requests', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('NEW-3: admin creates a request assigned to an operator', () => {
  it('persists forOperatorId (and requestedById = the admin)', async () => {
    const admin = await createAdminUser()
    const op = await createOperator()
    const hub = await createHub()
    const cat = await createCategory()
    mockSession = adminSession(admin.id)

    const res = await createRequest(req({
      requestType: 'RESERVATION',
      status: 'REQUESTED',
      fulfillerHubId: hub.id,
      forOperatorId: op.id,
      lines: [{ lineType: 'KIT_ITEM', categoryId: cat.id, requestedQty: 1 }],
    }))
    expect(res.status).toBe(201)

    const row = await prisma.deploymentRequest.findFirst({
      where: { forOperatorId: op.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(row).toBeTruthy()
    expect(row?.forOperatorId).toBe(op.id)
    expect(row?.requestedById).toBe(admin.id)
  })

  it('leaves forOperatorId null when unassigned', async () => {
    const admin = await createAdminUser()
    const hub = await createHub()
    const cat = await createCategory()
    mockSession = adminSession(admin.id)

    const res = await createRequest(req({
      requestType: 'RESERVATION',
      status: 'REQUESTED',
      fulfillerHubId: hub.id,
      forOperatorId: null,
      label: 'NEW3-unassigned',
      lines: [{ lineType: 'KIT_ITEM', categoryId: cat.id, requestedQty: 1 }],
    }))
    expect(res.status).toBe(201)

    const row = await prisma.deploymentRequest.findFirst({
      where: { label: 'NEW3-unassigned' },
      orderBy: { createdAt: 'desc' },
    })
    expect(row?.forOperatorId).toBeNull()
  })
})
