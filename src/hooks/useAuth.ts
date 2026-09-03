'use client'

import { useEffect, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useRouter } from 'next/navigation'
import type { SessionUser } from '@/types'
import { draftUserId, purgeDraftsForUser } from '@/lib/daily-check-draft'

const IDENTITY_KEY = 'ahits_identity'

function readCachedIdentity(): SessionUser | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const v = window.localStorage.getItem(IDENTITY_KEY)
    return v ? (JSON.parse(v) as SessionUser) : undefined
  } catch {
    return undefined
  }
}

function writeCachedIdentity(u: SessionUser | null) {
  if (typeof window === 'undefined') return
  try {
    if (u) window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(u))
    else window.localStorage.removeItem(IDENTITY_KEY)
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

// UR-007/026: distinguish "definitively logged out" (HTTP 401) from "can't reach
// the server" (offline / network error). A 401 clears the cached identity and
// returns null; a network failure RE-THROWS so SWR keeps the previous identity
// (keepPreviousData) instead of treating an offline operator as logged out.
const fetcher = async (url: string): Promise<SessionUser | null> => {
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    throw e // offline — keep last-known identity
  }
  if (res.status === 401) {
    writeCachedIdentity(null)
    return null
  }
  const user = (await res.json()) as SessionUser
  writeCachedIdentity(user)
  return user
}

export function useAuth() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data, error, isLoading } = useSWR<SessionUser | null>('/api/auth/me', fetcher, {
    keepPreviousData: true,
    fallbackData: readCachedIdentity(),
    shouldRetryOnError: false,
  })

  // Hydration safety (React #418): `fallbackData` is read from localStorage, so it
  // is `undefined` during SSR but the cached user on the client's FIRST render.
  // Any consumer that renders identity text/structure (e.g. the nav's operator
  // name + role-gated items, which host the Sign Out button) would therefore
  // mismatch server vs. client and abort hydration — leaving onClick handlers
  // unattached (dead Sign Out / Start Deployment). Gate the EXPOSED identity
  // behind `mounted` so the first client render matches the server shell; the
  // cached identity resolves one tick later (still instant/offline — no network),
  // fixing the whole class of bug centrally rather than per consumer.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    // UXP-3 (3h) privacy: the operator's daily-check drafts leave with them — the next
    // user of a shared phone must not inherit a half-done check. The draft keys carry
    // the user id from the identity cache, so read it BEFORE that cache is cleared
    // below — via draftUserId(), the same reader the keys were written with (drafts
    // written with no cache sit under its 'anon' id and go too). Explicit sign-out
    // only: a 401 bounce keeps the draft on purpose (G-3 — the same operator signs
    // back in and picks the check up). Best-effort: storage that throws never blocks
    // a sign-out.
    try {
      purgeDraftsForUser(draftUserId())
    } catch {
      /* storage unavailable — non-fatal */
    }
    writeCachedIdentity(null)
    // UR-003: drop the cached identity so the next user on a shared device never
    // sees the previous user's name/role before SWR revalidates. Cleared without
    // an immediate refetch (we're navigating to /login, which is unauthenticated).
    await mutate('/api/auth/me', null, { revalidate: false })
    router.push('/login')
  }

  const isOffline = !!error && typeof navigator !== 'undefined' && !navigator.onLine

  // Security counterpart to Option A: the shell renders offline on a valid token,
  // but a definitive 401 WHILE ONLINE (revoked/suspended/expired — fetcher
  // returned null, not a network throw) means the session is dead, so actively
  // bounce to /login. This restores the revocation UX the DB layout-check used to
  // provide, without logging the operator out merely for being offline.
  // Keyed on `data` (not the mounted-gated identity) so revocation still fires.
  useEffect(() => {
    if (data === null && typeof navigator !== 'undefined' && navigator.onLine) {
      writeCachedIdentity(null)
      router.replace('/login')
    }
  }, [data, router])

  return {
    // Mounted-gated for hydration safety (see note above). Server and first client
    // render both yield `undefined`; the resolved identity appears post-mount.
    user: mounted ? (data ?? undefined) : undefined,
    isLoading,
    // Only a real, online failure is an error; an offline blip is not (we keep
    // showing the cached identity, so the operator stays "logged in").
    isError: !!error && !isOffline,
    isOffline,
    isAdmin: mounted ? data?.role === 'ADMIN' : false,
    logout,
  }
}
