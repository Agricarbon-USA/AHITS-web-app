import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../src/app/api/s/[token]/transition/route'
import { GET } from '../src/app/api/s/[token]/route'
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

function transitionReq(token: string, body: Record<string, unknown>, key?: string) {
  return new NextRequest(`http://localhost/s/${token}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(body),
  })
}

function getReq(token: string) {
  return new NextRequest(`http://localhost/s/${token}`, { method: 'GET' })
}

const ctx = (token: string) => ({ params: Promise.resolve({ token }) })

async function lineEventCount(lineId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*)::bigint AS cnt FROM "request_line_events" WHERE "lineId" = ${lineId}
  `
  return Number(rows[0]?.cnt ?? 0)
}

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

// §3.4 read-after leak: GET /api/s/[token] on a dead link (REVOKED / clock-expired)
// must return a MINIMAL body — no subject payload — so a dead RESERVATION link can't
// keep serving live hub inventory (availableUnits / substitutableItems). The control
// proves an ISSUED link still returns the full subject.
describe('FND-6 §3.4 minimal body on a dead status link', () => {
  it('GET on a REVOKED link returns a minimal body — subject empty, no inventory keys', async () => {
    const { rawToken, statusLink } = await seededReservation()
    await prisma.statusLink.update({
      where: { id: statusLink.id },
      data: { state: 'REVOKED', revokedAt: new Date() },
    })
    const res = await GET(getReq(rawToken), ctx(rawToken))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.actionable).toBe(false)
    expect(data.allowedActions).toEqual([])
    expect(data.subject).toEqual({})
    expect(data.label).toBe('Rig Reservation Request')
    // The dead-link payload must carry no hub-inventory or unit-serial data at all.
    const text = JSON.stringify(data)
    expect(text).not.toContain('availableUnits')
    expect(text).not.toContain('substitutableItems')
  })

  it('GET on an expiresAt-past link likewise returns a minimal body', async () => {
    const { rawToken, statusLink } = await seededReservation()
    await prisma.statusLink.update({
      where: { id: statusLink.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const res = await GET(getReq(rawToken), ctx(rawToken))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.actionable).toBe(false)
    expect(data.state).toBe('EXPIRED')
    expect(data.subject).toEqual({})
    expect(JSON.stringify(data)).not.toContain('availableUnits')
  })

  it('GET on an ISSUED link still returns the full reservation subject (control)', async () => {
    const { rawToken, lineId } = await seededReservation()
    const res = await GET(getReq(rawToken), ctx(rawToken))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.actionable).toBe(true)
    expect(data.subject.kind).toBe('reservation')
    expect(Array.isArray(data.subject.lines)).toBe(true)
    expect(data.subject.lines.some((l: { id: string }) => l.id === lineId)).toBe(true)
    // The live payload DOES carry the inventory keys — proving the REVOKED/EXPIRED
    // cases above strip something that is otherwise present.
    expect(JSON.stringify(data)).toContain('availableUnits')
  })

  it('two identical line-action POSTs with the same Idempotency-Key apply once (replay, not a second write)', async () => {
    const { rawToken, lineId } = await seededReservation()
    const key = `${rawToken}:line:${lineId}:confirm:fixed-nonce`
    const body = { lineId, action: 'confirm', actorLabel: 'Hub Tester', fulfilledQty: 3 }

    const first = await POST(transitionReq(rawToken, body, key), ctx(rawToken))
    expect(first.status).toBe(200)
    const second = await POST(transitionReq(rawToken, body, key), ctx(rawToken))
    expect(second.status).toBe(200)

    // The second POST was served from the idempotency cache — setLineFulfillment ran
    // once, so exactly one request_line_event exists for the line (a re-execution would
    // write a second). This is what the stable per-line key buys: a double-tap dedups.
    expect(await lineEventCount(lineId)).toBe(1)
  })

  it('a cached 400 then a corrected body needs a FRESH key — reusing the key 422s (why the page re-mints on a settled 4xx)', async () => {
    const { rawToken, lineId } = await seededReservation()
    const keyBad = `${rawToken}:line:${lineId}:confirm:nonce-1`

    // fulfilledQty 0 fails the schema's .positive() → 400, cached bound to its body hash.
    const bad = await POST(
      transitionReq(rawToken, { lineId, action: 'confirm', actorLabel: 'Hub', fulfilledQty: 0 }, keyBad),
      ctx(rawToken),
    )
    expect(bad.status).toBe(400)

    // Reusing the SAME key with a corrected body → 422 body-mismatch. Holding the nonce
    // across a settled 400 (the old "clear on success only" bug) would wedge here forever.
    const reuse = await POST(
      transitionReq(rawToken, { lineId, action: 'confirm', actorLabel: 'Hub', fulfilledQty: 3 }, keyBad),
      ctx(rawToken),
    )
    expect(reuse.status).toBe(422)

    // A FRESH key — what re-minting on the settled 400 produces — lets the correction through.
    const keyGood = `${rawToken}:line:${lineId}:confirm:nonce-2`
    const good = await POST(
      transitionReq(rawToken, { lineId, action: 'confirm', actorLabel: 'Hub', fulfilledQty: 3 }, keyGood),
      ctx(rawToken),
    )
    expect(good.status).toBe(200)
  })
})
