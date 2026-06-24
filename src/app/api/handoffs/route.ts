import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/session'
import { listHandoffs } from '@/lib/deployment-handoffs'

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const direction = searchParams.get('direction') // 'incoming' | 'outgoing' | null
  const status = searchParams.get('status')

  const handoffs = await listHandoffs({ userId: session.userId, role: session.role, direction, status })
  return NextResponse.json(handoffs)
}
