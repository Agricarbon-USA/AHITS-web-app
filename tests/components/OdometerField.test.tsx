import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OdometerField, computeOdometerWarning } from '@/components/operator/OdometerField'

// CC-14 (NS-5): the odometer sanity warning — warns, never blocks.
describe('computeOdometerWarning (CC-14 NS-5)', () => {
  it('is silent when the last-known reading is unknown', () => {
    expect(computeOdometerWarning('100', null)).toBeNull()
  })
  it('is silent for an empty or non-numeric value', () => {
    expect(computeOdometerWarning('', 5000)).toBeNull()
    expect(computeOdometerWarning('abc', 5000)).toBeNull()
  })
  it('is silent for a plausible forward reading', () => {
    expect(computeOdometerWarning('5120', 5000)).toBeNull()
  })
  it('warns when the reading is below the last known', () => {
    expect(computeOdometerWarning('4800', 5000)).toMatch(/Below the last recorded reading/)
  })
  it('warns on an implausibly large jump', () => {
    expect(computeOdometerWarning('9000', 5000)).toMatch(/more than the last reading/)
  })
})

describe('OdometerField (CC-14 NS-5)', () => {
  it('shows a warning for a below-last reading but never disables input', () => {
    const onChange = vi.fn()
    render(<OdometerField value="4800" onChange={onChange} lastKnown={5000} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Below the last recorded reading/)
    const input = screen.getByLabelText(/Odometer/i)
    expect(input).toBeEnabled() // warn, never block
    fireEvent.change(input, { target: { value: '5100' } })
    expect(onChange).toHaveBeenCalledWith('5100')
  })

  it('renders no warning for a plausible reading', () => {
    render(<OdometerField value="5100" onChange={vi.fn()} lastKnown={5000} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
