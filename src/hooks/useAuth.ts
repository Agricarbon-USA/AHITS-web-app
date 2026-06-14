'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import type { SessionUser } from '@/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useAuth() {
  const router = useRouter()
  const { data, error, isLoading } = useSWR<SessionUser>('/api/auth/me', fetcher)

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
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
