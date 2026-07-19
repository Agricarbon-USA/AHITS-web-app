'use client'

import * as React from 'react'
import useSWR, { type SWRConfiguration } from 'swr'

// CC-12 PR2: the query-cache wrapper for list reads. Uses SWR (already a dep) with
// revalidateOnReconnect so a reconnecting field device refreshes its cached lists,
// and tracks `updatedAt` (the moment of the last successful fetch) to power the
// shared "Data as of HH:MM" FreshnessIndicator. Deliberately NOT applied to the
// monoliths this workstream is about to split — the split PRs adopt it per child
// as they carve read boundaries (avoids converting a file we're about to rewrite).

export const jsonFetcher = async (url: string): Promise<unknown> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

export function useFreshList<T = unknown>(key: string | null, config?: SWRConfiguration<T>) {
  const [updatedAt, setUpdatedAt] = React.useState<number | null>(null)
  const swr = useSWR<T>(key, jsonFetcher as (url: string) => Promise<T>, {
    revalidateOnReconnect: true,
    revalidateOnFocus: false,
    ...config,
    onSuccess: (data, k, cfg) => {
      setUpdatedAt(Date.now())
      config?.onSuccess?.(data, k, cfg)
    },
  })
  return { ...swr, updatedAt }
}
