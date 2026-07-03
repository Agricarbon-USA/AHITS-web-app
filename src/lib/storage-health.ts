const PROBE_DB = 'ahits_probe'
const PROBE_STORE = 'probe'

export async function ensurePersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number; ratio: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    if (quota === 0) return null
    return { usage, quota, ratio: usage / quota }
  } catch {
    return null
  }
}

export async function probeIdbWritable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(PROBE_DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(PROBE_STORE)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(PROBE_STORE, 'readwrite')
        const store = tx.objectStore(PROBE_STORE)
        store.put('ok', 'sentinel')
        store.delete('sentinel')
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
    })
    return true
  } catch {
    return false
  }
}
