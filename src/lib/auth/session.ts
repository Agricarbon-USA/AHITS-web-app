import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const SESSION_COOKIE = 'ahits_session'
const SESSION_DURATION = 60 * 60 * 24 // 24h in seconds

export interface SessionPayload {
  userId: string
  role: UserRole
  name: string
  email: string
}

// The JWT additionally carries a tokenVersion; getSession re-checks it (and the
// user's isActive/role) against the DB so suspend / force-logout / demote take
// effect immediately instead of waiting up to 24h for the token to expire.
type SignedPayload = SessionPayload & { tokenVersion: number }

function getSecret() {
  const secret = process.env.PIN_SESSION_SECRET
  if (!secret) throw new Error('PIN_SESSION_SECRET not set')
  return new TextEncoder().encode(secret)
}

export async function createSession(payload: SignedPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret())
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  let claims: SignedPayload
  try {
    const { payload } = await jwtVerify(token, getSecret())
    claims = payload as unknown as SignedPayload
  } catch {
    return null
  }

  // Re-validate against the DB: a suspended/deleted user, a bumped tokenVersion
  // (force-logout / revoke-all), or a role change all invalidate the session
  // immediately. We read fresh name/email/role so demotions take effect at once.
  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { isActive: true, tokenVersion: true, role: true, name: true, email: true },
    })
    if (!user || !user.isActive) return null
    if ((claims.tokenVersion ?? 0) !== user.tokenVersion) return null
    return { userId: claims.userId, role: user.role, name: user.name, email: user.email }
  } catch {
    // If the DB is unreachable, fail closed (treat as unauthenticated).
    return null
  }
}

/**
 * The current session, or null if unauthenticated. A named alias of
 * `getSession()` for route handlers whose only gate is "must be logged in" —
 * callers return 401 on null.
 */
export async function requireAuth(): Promise<SessionPayload | null> {
  return getSession()
}

/**
 * The current session if it belongs to an ADMIN, otherwise null. The single
 * definition of "who is an admin" — callers return 403 on null. Replaces the
 * `!session || session.role !== 'ADMIN'` check that was copy-pasted across the
 * API routes.
 */
export async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession()
  return session && session.role === 'ADMIN' ? session : null
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  })
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
