import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../src/app/api/inventory/route'
import { GET as getDeployments } from '../src/app/api/deployments/route'
import { createAdmin, createOperator, createCategory } from './helpers/fixtures'

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
}))

describe('Auth', () => {
  it('unauthenticated requests return 401', async () => {
    mockSession = null
    const req = new NextRequest('http://localhost/api/deployments')
    const res = await getDeployments(req)
    expect(res.status).toBe(401)
  })

  it('operators cannot access admin-only POST /api/inventory', async () => {
    const operator = await createOperator()
    mockSession = { userId: operator.id, role: 'OPERATOR', name: operator.name, email: operator.email }

    const cat = await createCategory()
    const req = new NextRequest('http://localhost/api/inventory', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', categoryId: cat.id }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('admins can access GET /api/deployments', async () => {
    const admin = await createAdmin()
    mockSession = { userId: admin.id, role: 'ADMIN', name: admin.name, email: admin.email }

    const req = new NextRequest('http://localhost/api/deployments')
    const res = await getDeployments(req)
    expect(res.status).toBe(200)
  })

  it('operators can access GET /api/deployments', async () => {
    const operator = await createOperator()
    mockSession = { userId: operator.id, role: 'OPERATOR', name: operator.name, email: operator.email }

    const req = new NextRequest('http://localhost/api/deployments')
    const res = await getDeployments(req)
    expect(res.status).toBe(200)
  })
})
