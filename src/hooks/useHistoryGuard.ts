'use client'

import * as React from 'react'

/**
 * UXP-1e (review finding 1.5 / A5): make the hardware/browser Back button close an
 * open overlay or step a wizard back, instead of navigating off the page and
 * destroying in-progress work (an Android operator's reflexive back-swipe on
 * daily-check step 3 used to throw away the whole check).
 *
 * How it works: while `active` is true, exactly ONE sentinel entry is kept on the
 * history stack at the CURRENT url. A Back press pops that sentinel, fires `popstate`,
 * and we run `onBack` (close the overlay / step the wizard back) instead of letting
 * the browser leave. When `active` goes false any other way (a Cancel button, submit,
 * or unmount), the sentinel is popped programmatically so the stack stays balanced.
 *
 * Two Next-App-Router-specific correctnesses that a non-Next test harness cannot see:
 *  - We MERGE our flag into the existing `history.state` rather than replacing it, so
 *    Next's own routing markers survive on the sentinel entry. Replacing them makes
 *    Next treat the Back as a full route navigation, which REMOUNTS the page and wipes
 *    the wizard's `useState` answers — the exact regression this feature must avoid.
 *  - The cleanup only pops the sentinel when it is still the TOP entry (our flag is on
 *    `history.state`). Otherwise a forward navigation while armed (e.g. tapping the Home
 *    tab mid-wizard pushes Next's own entry on top) would have our cleanup `back()` pop
 *    the destination and bounce the user right back into the wizard.
 *
 * Scope note: designed for ONE guarded overlay armed at a time. The app's scoped
 * surfaces — the daily-check wizard, a DetailDrawer, a respond dialog, the
 * RequestComposer — are mutually exclusive in practice, so two simultaneously-armed
 * guards (which would both answer one Back) do not arise. This is deliberately NOT a
 * global router patch.
 *
 * @param active arm the guard (overlay open, or wizard past step 0 and not submitted)
 * @param onBack run when Back is pressed while armed — close the overlay, or step back one
 */
const GUARD_FLAG = '__ahitsHistoryGuard'

export function useHistoryGuard(active: boolean, onBack: () => void) {
  const onBackRef = React.useRef(onBack)
  // Keep the latest callback without re-arming the guard on every render.
  React.useEffect(() => { onBackRef.current = onBack })
  // Whether OUR sentinel entry is currently the top of the stack.
  const armedRef = React.useRef(false)
  // Bumped on each Back so the effect re-runs and re-arms when `active` is still true
  // between renders — the multi-step wizard case, where `active` (step > 0) does not
  // change as the operator steps back from 2 to 1.
  const [rearm, setRearm] = React.useState(0)

  React.useEffect(() => {
    if (typeof window === 'undefined' || !active) return

    if (!armedRef.current) {
      // Merge, don't replace: keep Next's routing markers so a same-url Back does not
      // remount the page (which would wipe wizard answers).
      window.history.pushState(
        { ...(window.history.state ?? {}), [GUARD_FLAG]: true },
        '',
        window.location.href,
      )
      armedRef.current = true
    }

    const handlePop = () => {
      // The browser already popped our sentinel.
      armedRef.current = false
      onBackRef.current()
      // Force the effect to re-run; if `active` is still true it re-arms (wizard).
      setRearm((n) => n + 1)
    }
    window.addEventListener('popstate', handlePop)

    return () => {
      window.removeEventListener('popstate', handlePop)
      // Closed by a button/submit/unmount (not by Back) while our sentinel is still the
      // top entry — pop it to keep the stack balanced. The `armedRef` gate skips the
      // Back-close path (ref is already false); the state-flag gate skips forward-nav
      // (a Next entry now sits on top), so we never bounce a real navigation.
      if (armedRef.current && (window.history.state as Record<string, unknown> | null)?.[GUARD_FLAG]) {
        armedRef.current = false
        window.history.back()
      }
    }
  }, [active, rearm])
}
