import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as createInvite } from '../src/app/api/users/invite/route'
import { sendEmail } from '../src/lib/email/resend'
import { writeAudit } from '../src/lib/audit'
import { createAdminUser } from './helpers/fixtures'

// Guards the task's "EMAIL delivery stays byte-identical" requirement: the copy-link work
// is an additive early-return, so the default (EMAIL) path must still send the email, return
// NO setup URL, and audit INVITE_SENT. sendEmail is mocked here (a spy) — this file is
// separate from copy-link-invite.test.ts precisely so that file's mock-free "0 email_logs"
// proof stays strong.
let mockSession: { userId: string; role: string; name: string; email: string } | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))
vi.mock('../src/lib/email/resend', () => ({ sendEmail: vi.fn().mockResolvedValue(null) }))
vi.mock('../src/lib/audit', () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }))

function createReq(body: unknown) {
  return new NextRequest('http://localhost/api/users/invite', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  const admin = await createAdminUser({ email: `admin-email-mode-${Date.now()}@test.example` })
  mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }
})

describe('Invite EMAIL delivery (byte-identical default)', () => {
  it('default delivery sends the email, returns no setupUrl, and audits INVITE_SENT', async () => {
    const email = `email-mode-${Date.now()}@test.example`
    const res = await createInvite(createReq({ name: 'Email Mode', email, role: 'OPERATOR' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.setupUrl).toBeUndefined() // EMAIL never returns the raw token / URL
    expect(data.message).toContain(email)
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ kind: 'INVITE', to: email })
    expect(vi.mocked(writeAudit)).toHaveBeenCalledWith(expect.any(String), 'INVITE_SENT', null, expect.objectContaining({ email }))
  })

  it('LINK delivery does NOT send an email and audits INVITE_LINK_CREATED', async () => {
    const email = `link-mode-${Date.now()}@test.example`
    const res = await createInvite(createReq({ name: 'Link Mode', email, role: 'OPERATOR', delivery: 'LINK' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.setupUrl).toMatch(/setup-account\?token=/)
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
    expect(vi.mocked(writeAudit)).toHaveBeenCalledWith(expect.any(String), 'INVITE_LINK_CREATED', null, expect.objectContaining({ email }))
  })
})
