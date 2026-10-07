import { prisma } from '@/lib/prisma'
import { withAuth, ok } from '@/lib/route-helpers'

// GET /api/operators — minimal roster of active operators + admins (an admin may
// hold a rig, D3), readable by ANY authenticated user (the operator Transfer/handoff
// flows need a destination picker; the full /api/users endpoint is admin-only).
// Non-sensitive fields only. W0-8 exemplar: uses the shared withAuth wrapper + ok() envelope.
export const GET = withAuth(async () => {
  const data = await prisma.user.findMany({
    where: { role: { in: ['OPERATOR', 'ADMIN'] }, isActive: true },
    // PR-1b (L-7): `homeHubId` is here because the admin deployment pickers move
    // off `/api/users` (which offers DEACTIVATED people as operators) onto this
    // route. The deployment drawer prefills the return hub from the operator's
    // home hub, and `OperatorRow.homeHubId` is OPTIONAL — so without this the
    // switch would type-check, lint and test clean while the prefill silently
    // stopped working. Non-sensitive, same class as the rest of this projection.
    select: { id: true, name: true, role: true, homeHubId: true },
    orderBy: { name: 'asc' },
  })
  return ok(data)
})
