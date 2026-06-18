'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { useRouter, usePathname } from 'next/navigation'
import type { SessionUser } from '@/types'

class AuthError extends Error {
  constructor(public readonly status: number) {
    super(`Auth request failed (${status})`)
  }
}

// UX-5: previously this did `fetch(url).then(r => r.json())`, so a 401 from an
// expired/revoked session became a truthy `{ error: 'Unauthorized' }` object and
// the UI thought the user was still logged in. Throw on non-OK so SWR surfaces
// the error and `user` stays undefined.
const fetcher = async (url: string): Promise<SessionUser> => {
  const r = await fetch(url)
  if (!r.ok) throw new AuthError(r.status)
  return r.json()
}

export function useAuth() {
  const router = useRouter()
  const pathname = usePathname()
  const { data, error, isLoading } = useSWR<SessionUser>('/api/auth/me', fetcher, {
    // A 401 is terminal — don't hammer /api/auth/me retrying it.
    shouldRetryOnError: false,
  })

  const isUnauthorized = error instanceof AuthError && error.status === 401

  // Session expired mid-use: send the operator to login instead of leaving them
  // on a half-broken screen whose actions silently 401. Guard against a redirect
  // loop when already on the login page.
  useEffect(() => {
    if (isUnauthorized && pathname !== '/login') {
      router.replace('/login')
    }
  }, [isUnauthorized, pathname, router])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return {
    user: error ? undefined : data,
    isLoading,
    isError: !!error,
    isAdmin: data?.role === 'ADMIN',
    logout,
  }
}
