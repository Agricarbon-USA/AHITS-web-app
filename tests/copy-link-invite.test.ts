import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as createInvite } from '../src/app/api/users/invite/route'
import { POST as resendInvite, DELETE as revokeInvite } from '../src/app/api/users/invite/[id]/route'
import { GET as validateInvite } from '../src/app/api/users/invite/validate/route'
import { prisma } from '../src/lib/prisma'
import { createAdminUser } from './helpers/fixtures'

// Copy-link invites (email-independent onboarding). requireAdmin is mocked to an admin;
// audit is a no-op. sendEmail is DELIBERATELY NOT mocked — LINK mode must skip it, which we
// prove by asserting zero email_logs rows (a mock would make that assertion vacuous).
let mockSession: { userId: string; role: string; name: string; email: string } | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/audit', () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }))

function createReq(body: unknown) {
  return new NextRequest('http://localhost/api/users/invite', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}
function resendReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/users/invite/${id}`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}
function validateReq(token: string) {
  return new NextRequest(`http://localhost/api/users/invite/validate?token=${encodeURIComponent(token)}`)
}
const tokenFromUrl = (setupUrl: string) => new URL(setupUrl).searchParams.get('token') ?? ''

let n = 0
async function linkInvite(): Promise<{ inviteId: string; email: string; token: string; setupUrl: string; expiresAt: string }> {
  n++
  const email = `link-invitee-${Date.now()}-${n}@test.example`
  const res = await createInvite(createReq({ name: `Invitee ${n}`, email, role: 'OPERATOR', delivery: 'LINK' }))
  expect(res.status).toBe(201)
  const data = await res.json()
  const invite = await prisma.inviteToken.findFirst({ where: { email }, select: { id: true } })
  return { inviteId: invite!.id, email, token: tokenFromUrl(data.setupUrl), setupUrl: data.setupUrl, expiresAt: data.expiresAt }
}

beforeEach(async () => {
  const admin = await createAdminUser({ email: `admin-link-${Date.now()}@test.example` })
  mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
})

describe('Copy-link invites', () => {
  it('LINK mode returns the setup URL and writes NO email_logs row', async () => {
    const email = `link-only-${Date.now()}@test.example`
    const res = await createInvite(createReq({ name: 'Link Only', email, role: 'OPERATOR', delivery: 'LINK' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.setupUrl).toMatch(/\/setup-account\?token=/)
    expect(data.expiresAt).toBeTruthy()
    // The whole point of LINK: no email was sent, so no delivery record exists.
    expect(await prisma.emailLog.count({ where: { to: email } })).toBe(0)
    // The token is stored hashed, and the link validates.
    const v = await validateInvite(validateReq(tokenFromUrl(data.setupUrl)))
    expect(v.status).toBe(200)
  })

  it('regenerating the link kills the old token and mints a working new one', async () => {
    const first = await linkInvite()
    // Regenerate via the resend route in LINK mode → a fresh URL/token.
    const res = await resendInvite(resendReq(first.inviteId, { delivery: 'LINK' }), { params: Promise.resolve({ id: first.inviteId }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    const newToken = tokenFromUrl(data.setupUrl)
    expect(newToken).not.toBe(first.token)

    // Old link is dead (unknown token → 404); new link validates (200).
    const oldV = await validateInvite(validateReq(first.token))
    expect(oldV.status).toBe(404)
    const newV = await validateInvite(validateReq(newToken))
    expect(newV.status).toBe(200)
  })

  it("a revoked invite's link is dead", async () => {
    const inv = await linkInvite()
    const del = await revokeInvite(new NextRequest(`http://localhost/api/users/invite/${inv.inviteId}`, { method: 'DELETE' }), { params: Promise.resolve({ id: inv.inviteId }) })
    expect(del.status).toBe(200)
    const v = await validateInvite(validateReq(inv.token))
    expect(v.status).toBe(410) // revoked → gone
  })
})
