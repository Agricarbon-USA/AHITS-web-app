'use client'

import * as React from 'react'

/**
 * UXP-1e (review finding 1.5 / A5): make the hardware/browser Back button close an
 * open overlay or step a wizard back, instead of navigating off the page and
 * destroying in-progress work (an Android operator's reflexive back-swipe on
 * daily-check step 3 used to throw away the whole check).
 *
 * How it works: while `active` is true, exactly ONE sentinel entry per guard is kept on
 * the history stack at the CURRENT url. A Back press pops that sentinel, fires
 * `popstate`, and we run `onBack` (close the overlay / step the wizard back) instead of
 * letting the browser leave. When `active` goes false any other way (a Cancel button,
 * submit, or unmount), the sentinel is popped programmatically so the stack stays
 * balanced.
 *
 * UXP-6 (antagonist #1/#3) made the hook nest-aware and release-aware, because the
 * admin pages stack a DetailDrawer under an EntityFormDialog and hand off from one
 * guarded overlay to the next in a single React commit. THE RULES (one module-level
 * stack of armed guards, bottom → top, mirroring the sentinel entries in history; one
 * module-level `popstate` listener; no per-guard listeners):
 *
 *  R1 ARM      Arming pushes a sentinel stamped with the guard's id and pushes the guard
 *              on the stack. Guards nest in arming order (a dialog opened from an open
 *              drawer sits above it).
 *  R2 BACK     A user Back pops exactly one sentinel and is answered by the TOP guard
 *              only: it leaves the stack and runs `onBack`. If `active` is still true
 *              afterwards (a wizard stepping 2 → 1) the effect re-runs and re-arms with a
 *              fresh sentinel. Sentinels sit in history in arming (seq) order, so a
 *              traversal that lands lower — a history-menu jump, or a landing on a
 *              sentinel the stack does not know (see R5) — answers every live guard
 *              armed above the landing, top-down.
 *  R3 RELEASE  A programmatic close (button / submit / unmount) of the TOP guard pops its
 *              sentinel with `history.back()`. That traversal is ASYNCHRONOUS in real
 *              browsers, so the release is "pending" until its popstate lands (or a
 *              {@link HISTORY_GUARD_RELEASE_FALLBACK_MS} fallback fires — jsdom cancels a
 *              queued traversal when anything pushes first). A pending release's popstate
 *              is consumed by the release and is never treated as a user Back.
 *  R4 DEFER    A guard that wants to arm while a release is pending waits for it, then
 *              pushes its sentinel. Without this, "close drawer + open dialog" in one
 *              commit pushed the dialog's sentinel BEFORE the drawer's queued back()
 *              landed, so the back() popped the dialog's sentinel → popstate → the dialog
 *              closed on arrival (jsdom hides this by cancelling the traversal). A guard
 *              that deactivates or unmounts before its deferred arm runs simply cancels
 *              it — no push, no back().
 *  R5 ORPHAN   A programmatic close of a guard that is NOT top (an outer drawer closed
 *              under an inner dialog), or whose sentinel is not the current entry (a
 *              forward navigation sits on top), must not back() — that would pop the
 *              inner dialog's sentinel (or the navigation). It leaves the sentinel in
 *              place and marks the stack entry ownerless. Ownerless entries stay on the
 *              stack (which keeps the listener attached) until their sentinel becomes the
 *              current entry — after the guards above it are gone, or when a Back
 *              resurfaces one buried under a forward navigation — and are then popped
 *              (R3), so the stack does not desync from history and such a sentinel costs
 *              no dead Back press. A sentinel the stack does not know at all (from before
 *              a full reload; a sentinel popped earlier and reached again by Forward; the
 *              target of a release that landed after the fallback) is swept the same way
 *              while anything is armed — otherwise nothing is listening and it costs one
 *              dead Back, as with the old hook.
 *  R6 NEVER    A sentinel is only ever popped when `history.state` carries THIS guard's
 *     BOUNCE   id, i.e. it is verifiably the current entry. Anything else on top (Next's
 *              entry for a forward navigation) is left alone — a cleanup back() would
 *              otherwise pop the destination and bounce the user back into the overlay.
 *
 * Two Next-App-Router-specific correctnesses that a non-Next test harness cannot see:
 *  - We MERGE our flag into the existing `history.state` rather than replacing it, so
 *    Next's own routing markers survive on the sentinel entry. Replacing them makes
 *    Next treat the Back as a full route navigation, which REMOUNTS the page and wipes
 *    the wizard's `useState` answers — the exact regression this feature must avoid.
 *  - R6 above: the cleanup only pops the sentinel when it is still the TOP entry.
 *
 * Known limit: guards that mount in the SAME commit nest in React's effect order
 * (children before parents), so a parent+child pair that opens together would be
 * answered parent-first. The app's overlays open in separate commits (drawer, then a
 * dialog from a button inside it), which is the order R1 needs. This is deliberately
 * still NOT a global router patch: nothing listens while nothing is armed.
 *
 * @param active arm the guard (overlay open, or wizard past step 0 and not submitted)
 * @param onBack run when Back is pressed while armed — close the overlay, or step back one
 */
const GUARD_FLAG = '__ahitsHistoryGuard'
const GUARD_ID = '__ahitsHistoryGuardId'

/**
 * How long a programmatic release (R3) may take to land before we stop waiting for it.
 * Real browsers always deliver the popstate, usually within a frame; this only bounds
 * the wait on a starved main thread (and lets jsdom-based tests that never land a
 * back() move on).
 */
export const HISTORY_GUARD_RELEASE_FALLBACK_MS = 1000

interface GuardEntry {
  /** Stamped onto the sentinel's `history.state`: `<session>-<seq>`, unique for the life of the page. */
  id: string
  /** Answers a user Back (R2). `null` once the owner closed while not top (R5: ownerless). */
  onPop: (() => void) | null
}

// Ids stay unique across a full reload (a leaked sentinel from before it would
// otherwise be able to collide with a fresh guard's id).
const SESSION = Math.random().toString(36).slice(2, 8)
let seq = 0

/**
 * Where a sentinel sits relative to ours: sentinels are pushed in seq order, so a
 * higher seq is higher in history. One from another session (before a full reload)
 * can only be below everything we armed.
 */
function seqOf(id: string): number {
  return id.startsWith(`${SESSION}-`) ? Number(id.slice(SESSION.length + 1)) : -Infinity
}

// ── Module state: the stack, the one listener, the one pending release ──────────
const stack: GuardEntry[] = []
/** Arms deferred by R4, in the order they asked. */
const waitingArms: Array<() => void> = []
let releasePending = false
let releaseTimer: number | undefined
let listening = false

function sentinelIdOf(state: unknown): string | null {
  const s = state as Record<string, unknown> | null | undefined
  if (!s || s[GUARD_FLAG] !== true) return null
  return typeof s[GUARD_ID] === 'string' ? s[GUARD_ID] : null
}

/** R6: is this guard's sentinel verifiably the current history entry? */
function isCurrent(entry: GuardEntry): boolean {
  return sentinelIdOf(window.history.state) === entry.id
}

function ensureListening() {
  if (listening) return
  window.addEventListener('popstate', onPopState)
  listening = true
}

/** Nothing armed, nothing pending, nothing waiting → stop listening (not a router patch). */
function settleListener() {
  if (!listening || stack.length > 0 || releasePending || waitingArms.length > 0) return
  window.removeEventListener('popstate', onPopState)
  listening = false
}

/** R3: pop the current entry (one of our sentinels) and wait for the pop to land. */
function beginRelease() {
  releasePending = true
  ensureListening()
  releaseTimer = window.setTimeout(finishRelease, HISTORY_GUARD_RELEASE_FALLBACK_MS)
  window.history.back()
}

/** The release landed (its popstate, or the fallback): sweep, then run the deferred arms. */
function finishRelease() {
  if (!releasePending) return
  releasePending = false
  window.clearTimeout(releaseTimer)
  releaseTimer = undefined
  sweepOrphans()
  if (!releasePending) {
    // R4: arm in the order the guards asked. Each arm pushes above a settled stack.
    const arms = waitingArms.splice(0)
    for (const arm of arms) arm()
  }
  settleListener()
}

/** R5: an ownerless sentinel that has become the current entry is popped right away. */
function sweepOrphans() {
  if (releasePending) return
  const top = stack[stack.length - 1]
  if (top && top.onPop === null && isCurrent(top)) {
    stack.pop()
    beginRelease()
  }
}

/** Programmatic close (button / submit / unmount): R3 when top and current, else R5. */
function closeGuard(entry: GuardEntry) {
  const i = stack.indexOf(entry)
  if (i === -1) return
  if (i === stack.length - 1 && isCurrent(entry)) {
    stack.pop()
    beginRelease()
    return
  }
  // An inner guard still sits above us, or a forward navigation sits on top of history:
  // leave the sentinel where it is; it is swept once it resurfaces as the current entry.
  entry.onPop = null
  sweepOrphans()
}

/** R2: the top guard's sentinel was popped by the user — take it off and let it answer. */
function popTop() {
  const entry = stack.pop()
  entry?.onPop?.()
}

/**
 * R2 for a traversal that landed below some of our sentinels: every LIVE guard armed
 * above the landing (a stack suffix, since seqs are monotonic) was popped by it — take
 * each off and let it answer, top-down. Ownerless entries stay: their sentinel may be
 * buried under a forward navigation rather than gone, and R5 sweeps it when it
 * resurfaces (a leftover whose sentinel really is gone is inert on the stack).
 */
function answerLiveAbove(landedSeq: number) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const entry = stack[i]
    if (!entry || seqOf(entry.id) <= landedSeq) break
    if (entry.onPop) {
      stack.splice(i, 1)
      entry.onPop()
    }
  }
}

function onPopState() {
  if (releasePending) {
    // R3: the first popstate after our back() is that pop landing, never a user Back.
    finishRelease()
    return
  }
  const landed = sentinelIdOf(window.history.state)
  if (landed === null) {
    // Not one of our sentinels: the page's base entry, or a Next entry that buries some
    // of ours. Every live guard was above it (a history-menu jump lands here too).
    answerLiveAbove(-Infinity)
  } else {
    const idx = stack.findIndex((e) => e.id === landed)
    if (idx === -1) {
      // A sentinel the stack does not know: from before a full reload (seq -Infinity —
      // everything we armed sits above it), one popped earlier and reached again by
      // Forward (a higher seq — nothing of ours above it), or the target of a release
      // that landed after the fallback (a lower seq — the guard armed above it lost its
      // sentinel). Answer the live guards it popped, then pop it (R5) so the next Back
      // does real work instead of leaving an unguarded overlay behind.
      answerLiveAbove(seqOf(landed))
      beginRelease()
      return
    }
    const top = stack.length - 1
    let popped = top - idx
    // Landing ON the live top sentinel cannot happen in a browser (a popstate always
    // lands somewhere else); it is how jsdom-based tests emulate a Back without moving
    // the index — treat it as the one pop it stands for.
    if (popped === 0 && stack[top]?.onPop) popped = 1
    for (let n = 0; n < popped; n += 1) popTop()
    sweepOrphans()
  }
  settleListener()
}

/**
 * Test-only: forget every armed guard, pending release and deferred arm, and detach the
 * listener. Component tests share this module across cases; call it between them.
 */
export function __resetHistoryGuardForTests() {
  stack.splice(0)
  waitingArms.splice(0)
  releasePending = false
  if (releaseTimer !== undefined) window.clearTimeout(releaseTimer)
  releaseTimer = undefined
  if (listening) window.removeEventListener('popstate', onPopState)
  listening = false
}

export function useHistoryGuard(active: boolean, onBack: () => void) {
  const onBackRef = React.useRef(onBack)
  // Keep the latest callback without re-arming the guard on every render.
  React.useEffect(() => { onBackRef.current = onBack })
  // Bumped on each Back so the effect re-runs and re-arms when `active` is still true
  // between renders — the multi-step wizard case, where `active` (step > 0) does not
  // change as the operator steps back from 2 to 1.
  const [rearm, setRearm] = React.useState(0)

  React.useEffect(() => {
    if (typeof window === 'undefined' || !active) return

    // Whether OUR sentinel is on the stack (this effect run owns it).
    let armed = false
    let cancelled = false
    const entry: GuardEntry = {
      id: `${SESSION}-${++seq}`,
      onPop: () => {
        // R2: the browser already popped our sentinel and the dispatcher took us off the
        // stack. Answer, then force the effect to re-run; if `active` is still true it
        // re-arms (wizard).
        armed = false
        onBackRef.current()
        setRearm((n) => n + 1)
      },
    }
    const arm = () => {
      if (cancelled) return // R4: closed before the deferred arm ran — nothing to do.
      ensureListening()
      // Merge, don't replace: keep Next's routing markers so a same-url Back does not
      // remount the page (which would wipe wizard answers).
      window.history.pushState(
        { ...(window.history.state ?? {}), [GUARD_FLAG]: true, [GUARD_ID]: entry.id },
        '',
        window.location.href,
      )
      stack.push(entry)
      armed = true
    }
    if (releasePending) waitingArms.push(arm) // R4
    else arm() // R1

    return () => {
      cancelled = true
      const w = waitingArms.indexOf(arm)
      if (w !== -1) waitingArms.splice(w, 1)
      if (armed) {
        // Closed by a button/submit/unmount (not by Back) — R3 or R5. The Back-close
        // path already cleared `armed` in onPop, so it never double-pops.
        armed = false
        closeGuard(entry)
      }
      settleListener()
    }
  }, [active, rearm])
}
