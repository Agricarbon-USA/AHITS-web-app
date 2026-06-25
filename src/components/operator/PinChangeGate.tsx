'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'

const CHANGE_PIN_PATH = '/operator/change-pin'

/**
 * Enforces a forced PIN reset (N-PIN): when the operator's `mustChangePin` is
 * set (an admin reset their PIN), redirect them to the change-PIN screen from
 * any other operator page. The change-PIN screen itself is exempt so there's no
 * loop; once the new PIN is set the flag clears and this no longer fires.
 */
export function PinChangeGate() {
  const router = useRouter()
  const pathname = usePathname()

  React.useEffect(() => {
    if (pathname === CHANGE_PIN_PATH) return
    let active = true
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => { if (active && me?.mustChangePin) router.replace(CHANGE_PIN_PATH) })
      .catch(() => { /* offline / transient — don't block */ })
    return () => { active = false }
  }, [pathname, router])

  return null
}
