import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
// CC-29 item 5: the mint/renew helpers, cookie shape, and durations live in one
// edge-safe module (no prisma/next-headers) shared with proxy.ts so there's no drift.
import { SESSION_COOKIE, mintSessionToken, sessionCookieOptions } from '@/lib/auth/session-edge'

export interface SessionPayload {
  userId: string
  role: UserRole
  name: string
  email: string
  // Read fresh from the DB on every request (like role/name): true when an admin
  // reset this operator's PIN and they must set a new one before continuing.
  mustChangePin: boolean
}

// The JWT carries identity + a tokenVersion (getSession re-checks the version,
// isActive, role, and mustChangePin against the DB so suspend / force-logout /
// demote / forced-PIN-reset all take effect immediately). mustChangePin is NOT
// signed into the token — it's authoritative from the DB only.
type SignedClaims = {
  userId: string
  role: UserRole
  name: string
  email: string
  tokenVersion: number
  // UR-004: signed so the edge middleware (proxy.ts, no DB access) can block a
  // forced-PIN-reset operator from mutating API routes server-side. Kept FRESH
  // because an admin PIN reset bumps tokenVersion (forcing re-login → a new token
  // carrying mustChangePin=true), and the change-pin route re-mints with false.
  mustChangePin?: boolean
}

function getSecret() {
  const secret = process.env.PIN_SESSION_SECRET
  if (!secret) throw new Error('PIN_SESSION_SECRET not set')
  return new TextEncoder().encode(secret)
}

export async function createSession(payload: SignedClaims): Promise<string> {
  // CC-29 item 5: stamp authAt = "now" (epoch seconds) — the anchor for the 14-day
  // sliding-session cap. This runs at login and change-pin (a fresh credential entry),
  // so the cap resets only on a real re-auth; silent proxy renewal carries authAt
  // through unchanged. Delegated to the shared edge helper so the claim set is identical
  // to what the renewal path re-mints.
  return mintSessionToken({
    ...payload,
    mustChangePin: payload.mustChangePin === true,
    authAt: Math.floor(Date.now() / 1000),
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  let claims: SignedClaims
  try {
    const { payload } = await jwtVerify(token, getSecret())
    claims = payload as unknown as SignedClaims
  } catch {
    return null
  }

  // Re-validate against the DB: a suspended/deleted user, a bumped tokenVersion
  // (force-logout / revoke-all), or a role change all invalidate the session
  // immediately. We read fresh name/email/role so demotions take effect at once.
  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { isActive: true, tokenVersion: true, role: true, name: true, email: true, mustChangePin: true },
    })
    if (!user || !user.isActive) return null
    if ((claims.tokenVersion ?? 0) !== user.tokenVersion) return null
    return { userId: claims.userId, role: user.role, name: user.name, email: user.email, mustChangePin: user.mustChangePin }
  } catch {
    // If the DB is unreachable, fail closed (treat as unauthenticated).
    return null
  }
}

/**
 * Verify the session JWT LOCALLY (no DB) and return its signed claims, or null
 * if there is no valid/unexpired token.
 *
 * UR-007/026 (Option A): used ONLY by the server layout shell gate so a valid,
 * unexpired token renders the app **offline** (the DB is unreachable, but the
 * token is cryptographically verifiable on its own). It is deliberately NOT the
 * authority for revocation/suspension/role/PIN — `getSession()` (DB-backed)
 * stays the gate on every API route, so a revoked or demoted user is rejected on
 * the next online action. `mustChangePin` is DB-only, reported false here; the
 * PinChangeGate re-checks via /api/auth/me when online.
 */
export async function getSessionClaims(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const c = payload as unknown as SignedClaims
    return { userId: c.userId, role: c.role, name: c.name, email: c.email, mustChangePin: c.mustChangePin === true }
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
  // CC-29 item 5: the exact same flags the proxy renewal uses (shared definition).
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions())
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
