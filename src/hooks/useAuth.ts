'use client'

import useSWR, { useSWRConfig } from 'swr'
import { useRouter } from 'next/navigation'
import type { SessionUser } from '@/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useAuth() {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data, error, isLoading } = useSWR<SessionUser>('/api/auth/me', fetcher)

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    // UR-003: drop the cached identity so the next user on a shared device never
    // sees the previous user's name/role before SWR revalidates. Cleared without
    // an immediate refetch (we're navigating to /login, which is unauthenticated).
    await mutate('/api/auth/me', undefined, { revalidate: false })
    router.push('/login')
  }

  return {
    user: data,
    isLoading,
    isError: !!error,
    isAdmin: data?.role === 'ADMIN',
    logout,
  }
}
