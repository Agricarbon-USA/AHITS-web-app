import { NextResponse } from 'next/server'

// CC-33 (B2): the GET check-log list handler was dead (0 client callers; the UI reads
// /api/checkout was never wired). Only the POST 410 tombstone remains — it protects
// stale PWA clients that still hit the deprecated checkout endpoint.
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use POST /api/deployments/[id]/items instead.' },
    { status: 410 }
  )
}
