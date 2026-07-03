import { prisma } from '@/lib/prisma'
import { withAuth, ok } from '@/lib/route-helpers'

// GET /api/operators — minimal roster of active operators, readable by ANY
// authenticated user (the operator Transfer flow needs a destination picker; the
// full /api/users endpoint is admin-only). Non-sensitive fields only.
// W0-8 exemplar: uses the shared withAuth wrapper + ok() envelope.
export const GET = withAuth(async () => {
  const data = await prisma.user.findMany({
    where: { role: 'OPERATOR', isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
  return ok(data)
})
