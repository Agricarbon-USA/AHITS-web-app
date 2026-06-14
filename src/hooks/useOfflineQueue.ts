'use client'

import * as React from 'react'
import type { OfflineQueueItem } from '@/types'

const DB_NAME = 'ahits_offline'
const STORE = 'queue'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function useOfflineQueue() {
  const [queueSize, setQueueSize] = React.useState(0)
  const [syncing, setSyncing] = React.useState(false)

  const enqueue = React.useCallback(async (item: Omit<OfflineQueueItem, 'id' | 'retries' | 'createdAt'>) => {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add({ ...item, retries: 0, createdAt: Date.now() })
    setQueueSize((n) => n + 1)
  }, [])

  const flush = React.useCallback(async () => {
    if (syncing || !navigator.onLine) return
    setSyncing(true)
    try {
      const db = await openDB()
      const items: OfflineQueueItem[] = await new Promise((res, rej) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })

      for (const item of items) {
        try {
          const res = await fetch(item.endpoint, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.body),
          })
          if (res.ok) {
            const tx = db.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).delete(item.id!)
            setQueueSize((n) => Math.max(0, n - 1))
          }
        } catch { /* will retry next flush */ }
      }
    } finally {
      setSyncing(false)
    }
  }, [syncing])

  React.useEffect(() => {
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  return { enqueue, flush, queueSize, syncing, isOffline: typeof navigator !== 'undefined' && !navigator.onLine }
}
