import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { UserRole } from '@prisma/client'

const SESSION_COOKIE = 'ahits_session'
const SESSION_DURATION = 60 * 60 * 24 // 24h in seconds

export interface SessionPayload {
  userId: string
  role: UserRole
  name: string
  email: string
}

function getSecret() {
  const secret = process.env.PIN_SESSION_SECRET
  if (!secret) throw new Error('PIN_SESSION_SECRET not set')
  return new TextEncoder().encode(secret)
}

export async function createSession(payload: SessionPayload): Promise<string> {
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
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionPayload
  } catch {
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
