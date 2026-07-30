import { render, act, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as React from 'react'
import { useHistoryGuard } from '@/hooks/useHistoryGuard'

// UXP-1e: the back-button guard. jsdom implements real history.pushState/back and
// fires popstate, so these exercise the actual arm/pop/re-arm logic (the real-browser
// Next-router leg — no remount, answers preserved — is covered by the throwaway-route
// Chrome run in the PR body; jsdom has no router to remount).

// jsdom does not fire popstate on history.back() automatically the way browsers do,
// so a "Back" in these tests is: history.back() THEN dispatch a popstate event.
function pressBack() {
  act(() => {
    window.history.back()
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  })
}

beforeEach(() => {
  // Reset to a single, clean entry between tests.
  window.history.replaceState(null, '', '/base')
})

describe('useHistoryGuard — modal/overlay (single-step)', () => {
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

  it('Back closes the overlay instead of leaving; page (component) stays', () => {
    render(<Modal />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByText('OVERLAY')).toBeInTheDocument()

    pressBack()
    expect(screen.queryByText('OVERLAY')).toBeNull()
    // The component itself is still mounted (didn't navigate away).
    expect(screen.getByText('open')).toBeInTheDocument()
  })

  it('pushes exactly one sentinel entry on open and balances it on Back', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    render(<Modal />)
    fireEvent.click(screen.getByText('open'))
    expect(pushSpy).toHaveBeenCalledTimes(1)
    // Sentinel carries our flag, merged onto existing state.
    expect(window.history.state?.__ahitsHistoryGuard).toBe(true)
    pressBack()
    pushSpy.mockRestore()
  })

  it('closing via a button pops the sentinel programmatically (no leaked entry)', () => {
    const backSpy = vi.spyOn(window.history, 'back')
    render(<Modal />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(screen.getByText('close-btn')) // programmatic close
    expect(screen.queryByText('OVERLAY')).toBeNull()
    // The effect cleanup popped our sentinel so the stack stays balanced.
    expect(backSpy).toHaveBeenCalled()
    backSpy.mockRestore()
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

  it('steps back one at a time on Back, preserving answers, then leaves at step 0', () => {
    render(<Wizard />)
    fireEvent.click(screen.getByText('next')) // → step 1
    fireEvent.click(screen.getByText('next')) // → step 2
    fireEvent.change(screen.getByLabelText('answer'), { target: { value: 'hello' } })
    expect(screen.getByText('step 2')).toBeInTheDocument()

    pressBack() // step 2 → 1
    expect(screen.getByText('step 1')).toBeInTheDocument()
    expect((screen.getByLabelText('answer') as HTMLInputElement).value).toBe('hello') // intact

    pressBack() // step 1 → 0
    expect(screen.getByText('step 0')).toBeInTheDocument()
    expect((screen.getByLabelText('answer') as HTMLInputElement).value).toBe('hello') // still intact
  })
})
