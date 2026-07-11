import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../src/app/api/s/[token]/transition/route'
import { prisma } from '../src/lib/prisma'
import { issueStatusLink } from '../src/lib/status-links'
import { createRequest } from '../src/lib/deployment-requests'
import {
  createHub,
  createCategory,
  createInventoryItem,
  createOperator,
  createAdminUser,
  seedInventoryStock,
} from './helpers/fixtures'

// FND-6: the public per-line action branch of /s/[token]/transition must gate on
// link actionability (state/expiry/revoked), not just token↔line ownership. The
// sharp case — the one a naive test misses — is a REVOKED (or superseded) link
// whose request is STILL in REQUESTED state: setLineFulfillment alone would allow
// it, defeating the resend-revokes-old-link guarantee.

async function firstLineId(requestId: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "deployment_request_lines"
    WHERE "requestId" = ${requestId}
    ORDER BY "createdAt" ASC
  `
  return rows[0].id
}

function transitionReq(token: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/s/${token}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ctx = (token: string) => ({ params: Promise.resolve({ token }) })

async function seededReservation() {
  const hub = await createHub()
  const cat = await createCategory()
  const operator = await createOperator()
  const admin = await createAdminUser()
  const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
  await seedInventoryStock(item.id, hub.id, 10)
  const requestId = await createRequest(
    {
      requestType: 'RESERVATION',
      status: 'REQUESTED',
      fulfillerHubId: hub.id,
      lines: [
        { lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 3, specificInventoryItemId: item.id },
      ],
    },
    operator.id,
  )
  const { rawToken, statusLink } = await issueStatusLink({
    type: 'RESERVATION',
    deploymentRequestId: requestId,
    hubId: hub.id,
    createdById: admin.id,
  })
  const lineId = await firstLineId(requestId)
  return { requestId, rawToken, statusLink, lineId }
}

describe('FND-6 public status-link line-action gate', () => {
  it('allows a per-line action on an active link (control)', async () => {
    const { rawToken, lineId } = await seededReservation()
    const res = await POST(
      transitionReq(rawToken, { lineId, action: 'confirm', actorLabel: 'Hub Tester', fulfilledQty: 3 }),
      ctx(rawToken),
    )
    expect(res.status).toBe(200)
  })

  it('denies a per-line action on a REVOKED link while the request is still REQUESTED', async () => {
    const { rawToken, statusLink, lineId } = await seededReservation()
    await prisma.statusLink.update({
      where: { id: statusLink.id },
      data: { state: 'REVOKED', revokedAt: new Date() },
    })
    const res = await POST(
      transitionReq(rawToken, { lineId, action: 'confirm', actorLabel: 'Hub Tester', fulfilledQty: 3 }),
      ctx(rawToken),
    )
    expect(res.status).toBe(409)
    // The gate must block the side effect, not just the status code: the line stays
    // PENDING (no fulfillment written). Asserting on fulfillmentStatus is robust —
    // the event action string is 'CONFIRM', so a COUNT on 'CONFIRMED' would be
    // vacuously zero and prove nothing.
    const rows = await prisma.$queryRaw<{ fulfillmentStatus: string }[]>`
      SELECT "fulfillmentStatus" FROM "deployment_request_lines" WHERE "id" = ${lineId}
    `
    expect(rows[0]?.fulfillmentStatus).toBe('PENDING')
  })

  it('denies a per-line action on an EXPIRED link', async () => {
    const { rawToken, statusLink, lineId } = await seededReservation()
    await prisma.statusLink.update({
      where: { id: statusLink.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const res = await POST(
      transitionReq(rawToken, { lineId, action: 'confirm', actorLabel: 'Hub Tester', fulfilledQty: 3 }),
      ctx(rawToken),
    )
    expect(res.status).toBe(409)
  })

  it('404s a lineId that does not belong to the token', async () => {
    const a = await seededReservation()
    const b = await seededReservation()
    const res = await POST(
      transitionReq(a.rawToken, { lineId: b.lineId, action: 'confirm', actorLabel: 'X', fulfilledQty: 1 }),
      ctx(a.rawToken),
    )
    expect(res.status).toBe(404)
  })
})
