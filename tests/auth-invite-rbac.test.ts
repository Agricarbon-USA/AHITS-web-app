import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { POST as completeInvite } from '../src/app/api/users/invite/complete/route'
import { PATCH as patchUser } from '../src/app/api/users/[id]/route'
import { prisma } from '../src/lib/prisma'
import { hashInviteToken } from '../src/lib/invite-token'
import { createOperator, createAdminUser } from './helpers/fixtures'

// requireAdmin is mocked for the user-management route (RBAC + last-admin guard).
// The invite-completion route is public and does not import this module, so its
// tests exercise the real claim logic regardless of this mock.
let mockSession: { userId: string; role: string; name: string; email: string } | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/audit', () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../src/lib/alerts', () => ({ createAlert: vi.fn().mockResolvedValue({}), resolveActiveAlert: vi.fn().mockResolvedValue({}) }))

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/users/invite/complete', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}
function patchReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

let inviteN = 0
async function createInvite(overrides?: {
  role?: 'OPERATOR' | 'ADMIN'
  email?: string
  expiresAt?: Date
}) {
  inviteN++
  const rawToken = `tok-${Date.now()}-${inviteN}`
  const record = await prisma.inviteToken.create({
    data: {
      email: overrides?.email ?? `invitee-${Date.now()}-${inviteN}@test.example`,
      role: (overrides?.role ?? 'OPERATOR') as never,
      name: `Invitee ${inviteN}`,
      token: hashInviteToken(rawToken), // stored as hash; route looks up by hash
      expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdBy: 'admin-fixture',
    },
  })
  return { ...record, token: rawToken } // expose plaintext for request bodies
}

beforeEach(() => {
  mockSession = null
})

describe('Invite completion — single-use account minting', () => {
  it('creates the account with the role FROM THE INVITE and marks the invite used', async () => {
    const invite = await createInvite({ role: 'OPERATOR' })
    const res = await completeInvite(postReq({ token: invite.token, credential: '284910' }))
    expect(res.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { email: invite.email } })
    expect(user?.role).toBe('OPERATOR')
    expect(user?.pinHash).toBeTruthy()
    const used = await prisma.inviteToken.findUnique({ where: { id: invite.id } })
    expect(used?.usedAt).not.toBeNull()
  })

  it('rejects a second use of the same invite (single-use claim)', async () => {
    const invite = await createInvite({ role: 'OPERATOR' })
    const first = await completeInvite(postReq({ token: invite.token, credential: '284910' }))
    expect(first.status).toBe(200)
    const second = await completeInvite(postReq({ token: invite.token, credential: '175294' }))
    expect(second.status).toBe(410)
    expect(await prisma.user.count({ where: { email: invite.email } })).toBe(1)
  })

  it('rejects an expired invite', async () => {
    const invite = await createInvite({ role: 'OPERATOR', expiresAt: new Date(Date.now() - 1000) })
    const res = await completeInvite(postReq({ token: invite.token, credential: '284910' }))
    expect(res.status).toBe(410)
  })

  it('rejects an unknown token', async () => {
    const res = await completeInvite(postReq({ token: 'does-not-exist', credential: '284910' }))
    expect(res.status).toBe(410)
  })

  it('rejects a trivial PIN (sequential, repeated, or denylisted)', async () => {
    for (const trivial of ['123456', '654321', '111111', '121212']) {
      const invite = await createInvite({ role: 'OPERATOR' })
      const res = await completeInvite(postReq({ token: invite.token, credential: trivial }))
      expect(res.status, `expected 400 for trivial PIN ${trivial}`).toBe(400)
    }
  })

  it('enforces the operator PIN format (exactly 6 digits)', async () => {
    const invite = await createInvite({ role: 'OPERATOR' })
    const res = await completeInvite(postReq({ token: invite.token, credential: 'abcdef' }))
    expect(res.status).toBe(400)
  })

  it('admin invite: rejects a <8-char password, accepts a valid one, stores a hash', async () => {
    const tooShortInvite = await createInvite({ role: 'ADMIN', email: 'admin-short@test.example' })
    const short = await completeInvite(postReq({ token: tooShortInvite.token, credential: 'abc123' }))
    expect(short.status).toBe(400)

    const okInvite = await createInvite({ role: 'ADMIN', email: 'admin-ok@test.example' })
    const ok = await completeInvite(postReq({ token: okInvite.token, credential: 'StrongPass1' }))
    expect(ok.status).toBe(200)
    const admin = await prisma.user.findUnique({ where: { email: 'admin-ok@test.example' } })
    expect(admin?.role).toBe('ADMIN')
    expect(await bcrypt.compare('StrongPass1', admin!.pinHash!)).toBe(true)
  })
})

describe('User management — last-admin guardrail + RBAC', () => {
  it('blocks demoting the last active admin', async () => {
    const admin = await createAdminUser({ email: 'only-admin@test.example' })
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
    const res = await patchUser(patchReq(admin.id, { role: 'OPERATOR' }), {
      params: Promise.resolve({ id: admin.id }),
    })
    expect(res.status).toBe(400)
    const still = await prisma.user.findUnique({ where: { id: admin.id } })
    expect(still?.role).toBe('ADMIN')
  })

  it('blocks deactivating the last active admin', async () => {
    const admin = await createAdminUser({ email: 'only-admin2@test.example' })
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
    const res = await patchUser(patchReq(admin.id, { isActive: false }), {
      params: Promise.resolve({ id: admin.id }),
    })
    expect(res.status).toBe(400)
    const still = await prisma.user.findUnique({ where: { id: admin.id } })
    expect(still?.isActive).toBe(true)
  })

  it('allows demoting an admin when another active admin exists', async () => {
    const a = await createAdminUser({ email: 'admin-a@test.example' })
    const b = await createAdminUser({ email: 'admin-b@test.example' })
    mockSession = { userId: a.id, role: 'ADMIN', name: a.name, email: a.email }
    const res = await patchUser(patchReq(b.id, { role: 'OPERATOR' }), {
      params: Promise.resolve({ id: b.id }),
    })
    expect(res.status).toBe(200)
    const demoted = await prisma.user.findUnique({ where: { id: b.id } })
    expect(demoted?.role).toBe('OPERATOR')
  })

  it('rejects a non-admin caller (RBAC: requireAdmin → 403)', async () => {
    const op = await createOperator()
    const admin = await createAdminUser({ email: 'target-admin@test.example' })
    mockSession = { userId: op.id, role: 'OPERATOR', name: op.name, email: op.email }
    const res = await patchUser(patchReq(admin.id, { name: 'hacked' }), {
      params: Promise.resolve({ id: admin.id }),
    })
    expect(res.status).toBe(403)
  })

  it('suspending a user bumps tokenVersion (revokes their sessions)', async () => {
    const admin = await createAdminUser({ email: 'keep-admin@test.example' })
    const op = await createOperator()
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
    const before = await prisma.user.findUnique({ where: { id: op.id } })
    const res = await patchUser(patchReq(op.id, { isActive: false }), {
      params: Promise.resolve({ id: op.id }),
    })
    expect(res.status).toBe(200)
    const after = await prisma.user.findUnique({ where: { id: op.id } })
    expect(after?.tokenVersion).toBe((before?.tokenVersion ?? 0) + 1)
    expect(after?.isActive).toBe(false)
  })
})
