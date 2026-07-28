import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as transferRoute } from '../src/app/api/deployments/[id]/transfer/route'
import { POST as itemsRoute } from '../src/app/api/deployments/[id]/items/route'
import { POST as endRoute } from '../src/app/api/deployments/[id]/end/route'
import { createOperator, createRig, operatorSession } from './helpers/fixtures'

// CC-29 item 7b (review §1.6) — the server backstop: a write whose photoUrls still
// carries an unresolved `localphoto:` ref is rejected 422 (a TERMINAL_STATUS the queue
// surfaces) instead of persisting a dead ref that renders as a broken image. 422 (not
// 400) because withIdempotency doesn't cache 422 — a corrected re-send with real URLs
// isn't frozen out.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve(null),
}))
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}), resolveActiveAlert: vi.fn().mockResolvedValue({}) }))

function reqFor(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('CC-29 item 7b: routes reject unresolved localphoto: refs with 422', () => {
  let op: Awaited<ReturnType<typeof createOperator>>
  let op2: Awaited<ReturnType<typeof createOperator>>
  let rig: Awaited<ReturnType<typeof createRig>>['rig']

  beforeEach(async () => {
    op = await createOperator({ email: `op-${Date.now()}@t.com` })
    op2 = await createOperator({ email: `op2-${Date.now()}@t.com` })
    rig = (await createRig(op.id)).rig
    mockSession = operatorSession(op.id)
  })

  it('transfer POST with a localphoto ref → 422', async () => {
    const res = await transferRoute(
      reqFor(`/api/deployments/${rig.id}/transfer`, { toOperatorId: op2.id, note: 'x', photoUrls: ['localphoto:abc'] }),
      params(rig.id),
    )
    expect(res.status).toBe(422)
    expect(JSON.stringify(await res.json())).toMatch(/Photo not yet uploaded/i)
  })

  it('items POST with a localphoto ref → 422', async () => {
    const res = await itemsRoute(
      reqFor(`/api/deployments/${rig.id}/items`, {
        items: [{ itemType: 'SERIALIZED', inventoryItemId: 'x', inventoryUnitId: 'y' }],
        photoUrls: ['localphoto:abc'],
      }),
      params(rig.id),
    )
    expect(res.status).toBe(422)
  })

  it('end POST with a localphoto ref on a disposition → 422', async () => {
    const res = await endRoute(
      reqFor(`/api/deployments/${rig.id}/end`, {
        itemDispositions: [{ kitItemId: 'x', type: 'HUB', hubId: 'h', photoUrls: ['localphoto:abc'] }],
      }),
      params(rig.id),
    )
    expect(res.status).toBe(422)
  })

  it('a valid non-localphoto photoUrls array does NOT trip the 422 gate', async () => {
    // isPhotoNotUploadedError must be specific to localphoto: — a real URL is not a
    // parse-failure trigger. Assert on the flatten() payload directly (no route call)
    // so this can't be confused by a route's unrelated downstream behavior.
    const { photoUrlsField, isPhotoNotUploadedError } = await import('../src/lib/validation')
    const ok = photoUrlsField().safeParse(['https://cdn/real.jpg'])
    expect(ok.success).toBe(true)
    const bad = photoUrlsField().safeParse(['localphoto:abc'])
    expect(bad.success).toBe(false)
    if (!bad.success) expect(isPhotoNotUploadedError(bad.error)).toBe(true)
  })
})
