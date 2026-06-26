import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as createProject } from '../src/app/api/projects/route'
import { PATCH as updateProject } from '../src/app/api/projects/[id]/route'
import { prisma } from '../src/lib/prisma'
import { createAdminUser, adminSession } from './helpers/fixtures'

// NEW-2: project metadata fields (Customer, Code, Size in ha, # Samples) persist
// through create + update, and the numeric fields can be cleared back to null.

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// Shape of the new columns. Cast query/response results to this so the assertions
// don't depend on the locally-generated Prisma client (the new fields land in the
// client when `make db-generate` runs in CI). Runtime values are still real.
type ProjMeta = {
  id: string
  customer: string | null
  code: string | null
  sizeHa: number | null
  sampleCount: number | null
}

describe('NEW-2: project metadata fields', () => {
  it('persists customer/code/sizeHa/sampleCount on create and update', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)

    const createRes = await createProject(jsonReq('http://localhost/api/projects', 'POST', {
      name: 'NEW2 Smith Ranch', type: 'CROPLAND', status: 'ACTIVE',
      customer: 'Smith Farms', code: 'SR-001', sizeHa: 12.5, sampleCount: 40,
    }))
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()).data as ProjMeta
    expect(created.customer).toBe('Smith Farms')
    expect(created.code).toBe('SR-001')
    expect(created.sizeHa).toBe(12.5)
    expect(created.sampleCount).toBe(40)

    const updateRes = await updateProject(
      jsonReq(`http://localhost/api/projects/${created.id}`, 'PATCH', {
        name: 'NEW2 Smith Ranch', type: 'CROPLAND', status: 'ACTIVE',
        customer: 'Smith Farms LLC', code: 'SR-002', sizeHa: 20, sampleCount: 55,
      }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect(updateRes.status).toBe(200)
    const after = (await prisma.project.findUnique({ where: { id: created.id } })) as ProjMeta | null
    expect(after?.customer).toBe('Smith Farms LLC')
    expect(after?.code).toBe('SR-002')
    expect(after?.sizeHa).toBe(20)
    expect(after?.sampleCount).toBe(55)
  })

  it('clears the numeric fields to null on update', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)

    const createRes = await createProject(jsonReq('http://localhost/api/projects', 'POST', {
      name: 'NEW2 clearable', sizeHa: 5, sampleCount: 3,
    }))
    const created = (await createRes.json()).data as ProjMeta

    const updateRes = await updateProject(
      jsonReq(`http://localhost/api/projects/${created.id}`, 'PATCH', {
        name: 'NEW2 clearable', type: 'CROPLAND', status: 'PLANNED',
        customer: null, code: null, sizeHa: null, sampleCount: null,
      }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect(updateRes.status).toBe(200)
    const after = (await prisma.project.findUnique({ where: { id: created.id } })) as ProjMeta | null
    expect(after?.sizeHa).toBeNull()
    expect(after?.sampleCount).toBeNull()
  })

  it('rejects a negative size (validation)', async () => {
    const admin = await createAdminUser()
    mockSession = adminSession(admin.id)
    const res = await createProject(jsonReq('http://localhost/api/projects', 'POST', {
      name: 'NEW2 bad', sizeHa: -1,
    }))
    expect(res.status).toBe(400)
  })
})
