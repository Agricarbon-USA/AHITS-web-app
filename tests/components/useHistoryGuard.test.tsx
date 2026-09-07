import { render, act, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as React from 'react'
import { useHistoryGuard, __resetHistoryGuardForTests, HISTORY_GUARD_RELEASE_FALLBACK_MS } from '@/hooks/useHistoryGuard'

// UXP-1e: the back-button guard. UXP-6 (antagonist #1/#3): deferred arming + nest-aware
// guards. jsdom implements real history.pushState/back and fires popstate, so these
// exercise the actual arm/pop/re-arm logic (the real-browser Next-router leg — no
// remount, answers preserved — is covered by the throwaway-route Chrome run in the PR
// body; jsdom has no router to remount).
//
// Real browsers run `history.back()` ASYNCHRONOUSLY and do NOT cancel it when a
// pushState lands first — the queued traversal then pops the NEW entry. jsdom cancels a
// queued traversal on pushState, which is exactly what hid the "new overlay closes on
// arrival" bug. So these tests emulate the browser: `history.back` is intercepted and
// only COUNTED; `landBacks()` performs the real traversal later — after React's commit,
// the way a browser would — and `pressBack()` is a user Back: a real traversal that
// fires a real popstate carrying the landed entry's state.

const realBack = window.history.back
const realForward = window.history.forward
let queuedBacks = 0
let totalBacks = 0
let backSpy: { mockRestore(): void }

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
/** jsdom runs a traversal on two nested 0ms timers, then fires popstate synchronously. */
async function traverse() {
  realBack.call(window.history)
  await macrotask()
  await macrotask()
  await macrotask()
}
/** The user presses Back. */
async function pressBack() {
  await act(async () => { await traverse() })
}
/** The user presses Forward (jsdom keeps forward entries until something pushes). */
async function pressForward() {
  await act(async () => {
    realForward.call(window.history)
    await macrotask()
    await macrotask()
    await macrotask()
  })
}
/** Every programmatic back() the hook queued lands now, in order (chained releases included). */
async function landBacks() {
  await act(async () => {
    while (queuedBacks > 0) {
      queuedBacks -= 1
      await traverse()
    }
  })
}
const flag = () => (window.history.state as { __ahitsHistoryGuard?: boolean } | null)?.__ahitsHistoryGuard ?? null

beforeEach(() => {
  __resetHistoryGuardForTests()
  queuedBacks = 0
  totalBacks = 0
  // A clean current entry (pushState also cancels any traversal jsdom still has queued).
  window.history.pushState(null, '', '/base')
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => { queuedBacks += 1; totalBacks += 1 })
})
afterEach(() => {
  // Unmount BEFORE the spy is restored so a still-open guard's release is counted, not run.
  cleanup()
  backSpy.mockRestore()
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

function Modal() {
  const [open, setOpen] = React.useState(false)
  useHistoryGuard(open, () => setOpen(false))
  return (
    <div>
      <button onClick={() => setOpen(true)}>open</button>
      {open && <div>OVERLAY</div>}
      {open && <button onClick={() => setOpen(false)}>close-btn</button>}
    </div>
  )
}

/** An always-armed overlay (RequestComposer / DetailDrawer / EntityFormDialog shape). */
function Guarded({ name, onClose, children }: { name: string; onClose: () => void; children?: React.ReactNode }) {
  useHistoryGuard(true, onClose)
  return (
    <div>
      <div>{name}</div>
      <button onClick={onClose}>close-{name}</button>
      {children}
    </div>
  )
}

/** A drawer with a dialog INSIDE it — the inventory MoveStock/AddStock shape. */
function Nested() {
  const [drawer, setDrawer] = React.useState(false)
  const [dialog, setDialog] = React.useState(false)
  return (
    <div>
      <button onClick={() => setDrawer(true)}>open-drawer</button>
      {drawer && (
        <Guarded name="DRAWER" onClose={() => { setDrawer(false); setDialog(false) }}>
          <button onClick={() => setDialog(true)}>open-dialog</button>
          {dialog && <Guarded name="DIALOG" onClose={() => setDialog(false)} />}
        </Guarded>
      )}
    </div>
  )
}

/** Drawer and dialog as siblings: the drawer can close programmatically UNDER the dialog. */
function Siblings() {
  const [drawer, setDrawer] = React.useState(false)
  const [dialog, setDialog] = React.useState(false)
  return (
    <div>
      <button onClick={() => setDrawer(true)}>open-drawer</button>
      <button onClick={() => setDialog(true)}>open-dialog</button>
      {drawer && <Guarded name="DRAWER" onClose={() => setDrawer(false)} />}
      {dialog && <Guarded name="DIALOG" onClose={() => setDialog(false)} />}
    </div>
  )
}

/** An overlay that closes itself on Back. */
function SelfClosing({ name }: { name: string }) {
  const [open, setOpen] = React.useState(true)
  return open ? <Guarded name={name} onClose={() => setOpen(false)} /> : null
}

/** Two independent overlays driven by props — the "overlay open, then a route change" shapes. */
function Routes({ a, b }: { a: boolean; b: boolean }) {
  return (
    <div>
      {a && <SelfClosing name="A" />}
      {b && <SelfClosing name="B" />}
    </div>
  )
}

/** Two overlays handed off in ONE commit — "close the drawer, open the form" (vehicles/inventory). */
function Handoff() {
  const [a, setA] = React.useState(false)
  const [b, setB] = React.useState(false)
  return (
    <div>
      <button onClick={() => setA(true)}>open-a</button>
      <button onClick={() => { setA(false); setB(true) }}>a-to-b</button>
      {a && <Guarded name="A" onClose={() => setA(false)} />}
      {b && <Guarded name="B" onClose={() => setB(false)} />}
    </div>
  )
}

// ── Single guard (unchanged behaviour) ────────────────────────────────────────

describe('useHistoryGuard — modal/overlay (single-step)', () => {
  it('Back closes the overlay instead of leaving; page (component) stays', async () => {
    render(<Modal />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByText('OVERLAY')).toBeInTheDocument()

    await pressBack()
    expect(screen.queryByText('OVERLAY')).toBeNull()
    // The component itself is still mounted (didn't navigate away).
    expect(screen.getByText('open')).toBeInTheDocument()
    // The sentinel is gone and nothing was popped programmatically.
    expect(flag()).toBeNull()
    expect(queuedBacks).toBe(0)
  })

  it('pushes exactly one sentinel entry on open and balances it on Back', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    render(<Modal />)
    fireEvent.click(screen.getByText('open'))
    expect(pushSpy).toHaveBeenCalledTimes(1)
    // Sentinel carries our flag, merged onto existing state.
    expect(window.history.state?.__ahitsHistoryGuard).toBe(true)
    await pressBack()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    pushSpy.mockRestore()
  })

  it('closing via a button pops the sentinel programmatically (no leaked entry)', async () => {
    render(<Modal />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(screen.getByText('close-btn')) // programmatic close
    expect(screen.queryByText('OVERLAY')).toBeNull()
    // The effect cleanup popped our sentinel so the stack stays balanced.
    expect(queuedBacks).toBe(1)
    await landBacks()
    expect(flag()).toBeNull()
  })

  it('does not pop when something else sits on top of history (forward navigation)', async () => {
    render(<Modal />)
    fireEvent.click(screen.getByText('open'))
    // A route push while the overlay is open (Next's entry, no flag).
    window.history.pushState({ __NA: true }, '', '/elsewhere')
    fireEvent.click(screen.getByText('close-btn'))
    expect(queuedBacks).toBe(0) // never bounce a real navigation
    expect(window.location.pathname).toBe('/elsewhere')
  })
})

describe('useHistoryGuard — multi-step wizard', () => {
  // Mirrors the daily-check wizard: step 0..2, Back steps down one, answers preserved.
  function Wizard() {
    const [step, setStep] = React.useState(0)
    const [answer, setAnswer] = React.useState('')
    useHistoryGuard(step > 0, () => setStep((s) => Math.max(0, s - 1)))
    return (
      <div>
        <div>step {step}</div>
        <input aria-label="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        <button onClick={() => setStep((s) => s + 1)}>next</button>
      </div>
    )
  }

  it('steps back one at a time on Back, preserving answers, then leaves at step 0', async () => {
    render(<Wizard />)
    fireEvent.click(screen.getByText('next')) // → step 1
    fireEvent.click(screen.getByText('next')) // → step 2
    fireEvent.change(screen.getByLabelText('answer'), { target: { value: 'hello' } })
    expect(screen.getByText('step 2')).toBeInTheDocument()

    await pressBack() // step 2 → 1
    expect(screen.getByText('step 1')).toBeInTheDocument()
    expect((screen.getByLabelText('answer') as HTMLInputElement).value).toBe('hello') // intact
    expect(flag()).toBe(true) // re-armed with a fresh sentinel

    await pressBack() // step 1 → 0
    expect(screen.getByText('step 0')).toBeInTheDocument()
    expect((screen.getByLabelText('answer') as HTMLInputElement).value).toBe('hello') // still intact
    expect(flag()).toBeNull()
    expect(queuedBacks).toBe(0)
  })
})

// ── UXP-6: release-then-arm (deferred arming) ─────────────────────────────────

describe('useHistoryGuard — release then arm in one commit (R3/R4)', () => {
  it('the new guard arms only after the old one\'s back() has landed, and survives that pop', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    render(<Handoff />)
    fireEvent.click(screen.getByText('open-a'))
    expect(pushSpy).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('a-to-b')) // one commit: A closes, B opens
    expect(screen.queryByText('A')).toBeNull()
    expect(screen.getByText('B')).toBeInTheDocument()
    // A's release is in flight; B has NOT pushed yet (its push would be what the
    // queued back() pops).
    expect(queuedBacks).toBe(1)
    expect(pushSpy).toHaveBeenCalledTimes(1)

    await landBacks() // the browser lands A's back() — a release pop, not a user Back
    expect(screen.getByText('B')).toBeInTheDocument() // B survived the pop
    expect(pushSpy).toHaveBeenCalledTimes(2) // …and armed afterwards
    expect(flag()).toBe(true)

    await pressBack() // a real user Back now closes B
    expect(screen.queryByText('B')).toBeNull()
    expect(screen.queryByText('A')).toBeNull()
    expect(flag()).toBeNull()
    pushSpy.mockRestore()
  })

  it('a deferred arm is cancelled when the guard closes before the release lands (no push, no back)', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    render(<Handoff />)
    fireEvent.click(screen.getByText('open-a'))
    fireEvent.click(screen.getByText('a-to-b'))
    expect(queuedBacks).toBe(1)
    fireEvent.click(screen.getByText('close-B')) // B closes while A's release is still in flight
    expect(screen.queryByText('B')).toBeNull()
    expect(pushSpy).toHaveBeenCalledTimes(1) // B never pushed
    expect(queuedBacks).toBe(1) // …and never popped

    await landBacks()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(flag()).toBeNull()

    // The module is idle again: the next guard arms immediately.
    fireEvent.click(screen.getByText('open-a'))
    expect(pushSpy).toHaveBeenCalledTimes(2)
    expect(flag()).toBe(true)
    pushSpy.mockRestore()
  })

  it('falls back after ~400ms when the release popstate never arrives (jsdom / edge cases)', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    render(<Handoff />)
    fireEvent.click(screen.getByText('open-a'))
    fireEvent.click(screen.getByText('a-to-b'))
    expect(pushSpy).toHaveBeenCalledTimes(1)
    // Nobody lands the back(); the fallback arms B anyway.
    await waitFor(() => expect(pushSpy).toHaveBeenCalledTimes(2), { timeout: HISTORY_GUARD_RELEASE_FALLBACK_MS * 3 })
    expect(screen.getByText('B')).toBeInTheDocument()
    pushSpy.mockRestore()
  })

  it('a release that lands AFTER the fallback pops the guard armed above it (never an unguarded overlay)', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    render(<Handoff />)
    fireEvent.click(screen.getByText('open-a'))
    fireEvent.click(screen.getByText('a-to-b'))
    // Starved main thread: the fallback fires first, so B arms ABOVE A's un-popped sentinel.
    await waitFor(() => expect(pushSpy).toHaveBeenCalledTimes(2), { timeout: HISTORY_GUARD_RELEASE_FALLBACK_MS * 3 })
    expect(screen.getByText('B')).toBeInTheDocument()

    // Now A's back() lands: it removes B's sentinel and lands on A's. B has no sentinel
    // any more, so it must answer as popped — leaving it open would make the next Back
    // leave the page. A's sentinel is then swept.
    await landBacks()
    expect(screen.queryByText('B')).toBeNull()
    expect(flag()).toBeNull()
    expect(totalBacks).toBe(2) // A's release + the sweep of its sentinel
    pushSpy.mockRestore()
  })
})

// ── UXP-6: nested guards (drawer + dialog) ────────────────────────────────────

describe('useHistoryGuard — nested guards (R1/R2/R5)', () => {
  it('Back closes only the dialog; a second Back closes the drawer', async () => {
    render(<Nested />)
    fireEvent.click(screen.getByText('open-drawer'))
    fireEvent.click(screen.getByText('open-dialog'))
    expect(screen.getByText('DRAWER')).toBeInTheDocument()
    expect(screen.getByText('DIALOG')).toBeInTheDocument()

    await pressBack()
    expect(screen.queryByText('DIALOG')).toBeNull()
    expect(screen.getByText('DRAWER')).toBeInTheDocument() // untouched
    expect(flag()).toBe(true) // the drawer's sentinel is the current entry
    expect(queuedBacks).toBe(0)

    await pressBack()
    expect(screen.queryByText('DRAWER')).toBeNull()
    expect(flag()).toBeNull()
  })

  it('button-close of the inner dialog releases its sentinel; Back then closes the outer drawer', async () => {
    render(<Nested />)
    fireEvent.click(screen.getByText('open-drawer'))
    fireEvent.click(screen.getByText('open-dialog'))
    fireEvent.click(screen.getByText('close-DIALOG'))
    expect(screen.queryByText('DIALOG')).toBeNull()
    expect(queuedBacks).toBe(1)
    await landBacks()
    expect(screen.getByText('DRAWER')).toBeInTheDocument() // the release pop did not close it
    expect(flag()).toBe(true)

    await pressBack()
    expect(screen.queryByText('DRAWER')).toBeNull()
    expect(flag()).toBeNull()
  })

  it('closing the drawer (and the dialog inside it) via the drawer button releases both sentinels', async () => {
    render(<Nested />)
    fireEvent.click(screen.getByText('open-drawer'))
    fireEvent.click(screen.getByText('open-dialog'))
    fireEvent.click(screen.getByText('close-DRAWER')) // both unmount in one commit
    expect(screen.queryByText('DRAWER')).toBeNull()
    expect(screen.queryByText('DIALOG')).toBeNull()
    await landBacks() // the dialog's release, then the orphaned drawer sentinel's
    expect(flag()).toBeNull() // nothing leaked: the next Back leaves the page
  })

  it('an outer guard closed programmatically UNDER an inner one leaves its sentinel until it resurfaces, then pops it', async () => {
    render(<Siblings />)
    fireEvent.click(screen.getByText('open-drawer'))
    fireEvent.click(screen.getByText('open-dialog'))
    fireEvent.click(screen.getByText('close-DRAWER')) // not top: no back() — that would pop the dialog's sentinel
    expect(screen.queryByText('DRAWER')).toBeNull()
    expect(screen.getByText('DIALOG')).toBeInTheDocument()
    expect(queuedBacks).toBe(0)
    expect(flag()).toBe(true)

    await pressBack() // pops the dialog's sentinel, lands on the ownerless drawer sentinel
    expect(screen.queryByText('DIALOG')).toBeNull()
    expect(queuedBacks).toBe(1) // …which is swept right away
    await landBacks()
    expect(flag()).toBeNull() // no dead Back press left behind
  })
})

// ── jsdom-style emulation (other component tests dispatch popstate without moving) ──

describe('useHistoryGuard — popstate dispatched without a traversal (legacy test emulation)', () => {
  it('still treats a popstate that lands on the live top sentinel as one Back', () => {
    render(<Modal />)
    fireEvent.click(screen.getByText('open'))
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
    })
    expect(screen.queryByText('OVERLAY')).toBeNull()
  })
})

// ── Sentinels the stack does not (fully) know: reloads, route changes, Forward ────────

describe('useHistoryGuard — resurfacing sentinels (R2/R5)', () => {
  it('after a tab reload, Back onto a stale sentinel from the previous load answers the guard above it, then sweeps it', async () => {
    // What history looks like after: overlay open → nav link (sentinel buried) → reload
    // (module state gone) → Back onto the stale sentinel: it is the current entry, and
    // its id is from another session.
    window.history.pushState({ __ahitsHistoryGuard: true, __ahitsHistoryGuardId: 'oldsess-7' }, '', '/base')
    render(<Modal />)
    fireEvent.click(screen.getByText('open')) // arms above the stale sentinel
    expect(screen.getByText('OVERLAY')).toBeInTheDocument()

    await pressBack() // pops our sentinel, lands on the stale one
    expect(screen.queryByText('OVERLAY')).toBeNull() // answered — its sentinel is gone
    expect(queuedBacks).toBe(1) // …and the stale sentinel is being swept
    await landBacks()
    expect(flag()).toBeNull() // the next Back leaves the page with nothing open
    expect(totalBacks).toBe(1)
  })

  it('a sentinel buried under a forward navigation is swept when Back resurfaces it (no dead Back)', async () => {
    const { rerender } = render(<Routes a b={false} />)
    expect(flag()).toBe(true)
    // A route push while A is open (Next's entry on top), then A unmounts with the route.
    window.history.pushState({ __NA: true }, '', '/other')
    rerender(<Routes a={false} b={false} />)
    expect(queuedBacks).toBe(0) // R6: never pop the navigation

    await pressBack() // Back from the new route lands on A's buried sentinel
    expect(queuedBacks).toBe(1) // swept immediately (R5)
    await landBacks()
    expect(flag()).toBeNull()
    expect(window.location.pathname).toBe('/base')
  })

  it('landing on a non-sentinel entry answers the live guards above it but keeps ownerless entries for their sweep', async () => {
    const { rerender } = render(<Routes a b={false} />)
    window.history.pushState({ __NA: true }, '', '/other')
    rerender(<Routes a={false} b={false} />) // A is ownerless, its sentinel buried under the route entry
    rerender(<Routes a={false} b />) // B arms on the new route, above the route entry
    expect(screen.getByText('B')).toBeInTheDocument()

    await pressBack() // pops B's sentinel, lands on the route entry (not a sentinel)
    expect(screen.queryByText('B')).toBeNull()
    expect(queuedBacks).toBe(0)

    await pressBack() // leaves the route, lands on A's buried sentinel
    expect(queuedBacks).toBe(1) // still tracked → swept, not a dead Back
    await landBacks()
    expect(flag()).toBeNull()
  })

  it('Forward onto a sentinel popped earlier leaves the live guard below it alone and pops it again', async () => {
    render(<Nested />)
    fireEvent.click(screen.getByText('open-drawer'))
    fireEvent.click(screen.getByText('open-dialog'))
    await pressBack() // closes the dialog; its sentinel is now a forward entry
    expect(screen.queryByText('DIALOG')).toBeNull()

    await pressForward() // lands on the dialog's old sentinel — nobody owns it
    expect(screen.getByText('DRAWER')).toBeInTheDocument() // untouched: it sits below
    expect(queuedBacks).toBe(1) // the stray sentinel is popped again
    await landBacks()
    expect(flag()).toBe(true) // back on the drawer's sentinel

    await pressBack()
    expect(screen.queryByText('DRAWER')).toBeNull()
    expect(flag()).toBeNull()
  })
})
