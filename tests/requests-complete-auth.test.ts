import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '../src/app/api/deployment-requests/[id]/route'
import { prisma } from '../src/lib/prisma'
import { createOperator, createAdminUser, operatorSession, adminSession } from './helpers/fixtures'
import { createRequest } from '../src/lib/deployment-requests'

// F5/F6 auth closure: complete action must be callable by the designated
// fulfillerOperatorId only (not the requester, not an unrelated operator,
// not on hub-forwarded requests where fulfillerOperatorId is null).

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

function patchReq(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/deployment-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function makeForwardedMaterialRequest(requestedById: string, fulfillerOperatorId: string | null) {
  const requestId = await createRequest(
    {
      requestType: 'MATERIAL',
      status: 'REQUESTED',
      lines: [{ lineType: 'NEW_PURCHASE', description: 'Test item', requestedQty: 1 }],
    },
    requestedById,
  )
  await prisma.$executeRaw`
    UPDATE "deployment_requests"
    SET "status" = 'FORWARDED',
        "fulfillerOperatorId" = ${fulfillerOperatorId},
        "updatedAt" = now()
    WHERE "id" = ${requestId}
  `
  return requestId
}

describe('complete action authorization', () => {
  it('allows the assigned fulfiller operator to complete a FORWARDED MATERIAL request', async () => {
    const requester = await createOperator()
    const fulfiller = await createOperator()
    const requestId = await makeForwardedMaterialRequest(requester.id, fulfiller.id)

    mockSession = operatorSession(fulfiller.id)
    const res = await PATCH(patchReq(requestId, { action: 'complete' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(res.status).toBe(200)
  })

  it('blocks the requester (non-fulfiller) from completing', async () => {
    const requester = await createOperator()
    const fulfiller = await createOperator()
    const requestId = await makeForwardedMaterialRequest(requester.id, fulfiller.id)

    mockSession = operatorSession(requester.id)
    const res = await PATCH(patchReq(requestId, { action: 'complete' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(res.status).toBe(403)
  })

  it('blocks an unrelated operator', async () => {
    const requester = await createOperator()
    const fulfiller = await createOperator()
    const unrelated = await createOperator()
    const requestId = await makeForwardedMaterialRequest(requester.id, fulfiller.id)

    mockSession = operatorSession(unrelated.id)
    const res = await PATCH(patchReq(requestId, { action: 'complete' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(res.status).toBe(403)
  })

  it('blocks operator on a hub-forwarded request (fulfillerOperatorId is null)', async () => {
    const requester = await createOperator()
    const requestId = await makeForwardedMaterialRequest(requester.id, null)

    // Even the requester cannot complete a hub-forwarded request
    mockSession = operatorSession(requester.id)
    const res = await PATCH(patchReq(requestId, { action: 'complete' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(res.status).toBe(403)
  })

  it('allows admin to complete any FORWARDED MATERIAL request', async () => {
    const admin = await createAdminUser()
    const requester = await createOperator()
    const requestId = await makeForwardedMaterialRequest(requester.id, null)

    mockSession = adminSession(admin.id)
    const res = await PATCH(patchReq(requestId, { action: 'complete' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(res.status).toBe(200)
  })
})
