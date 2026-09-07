import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// UXP-3 (3g) / D36 #2: a denied/missing camera NEVER blocks a report. The unit path used
// to hard-require ≥1 photo (client + server); now the photo is a nudge and a photo-less
// unit report is sent knowingly — the button itself says "Report without photo". One tap,
// no confirm dialog (gloves). Vehicles were already photo-optional and keep the plain
// "Report" label.

type MutateArg = { endpoint: string; method: string; body: { notes: string; photoUrls: string[]; stillUsable: boolean }; label?: string }
const { mutate, showToast } = vi.hoisted(() => ({
  mutate: vi.fn(async (_opts: MutateArg) => ({ ok: true, queued: false, data: {} })),
  showToast: vi.fn(),
}))
vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate, isOffline: false, pending: 0 }),
}))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => showToast }))
// PhotoCapture touches the browser photo store; stub it with a one-tap "attach" so the
// test can flip the photo count without a file input.
vi.mock('@/components/shared/PhotoCapture', () => ({
  PhotoCapture: ({ onChange }: { onChange: (refs: string[]) => void }) => (
    <button type="button" onClick={() => onChange(['/api/photos/p1.jpg'])}>stub-attach-photo</button>
  ),
}))

import { ReportProblemDialog, type ReportProblemSubject } from '@/components/shared/ReportProblemDialog'

const UNIT: ReportProblemSubject = { kind: 'unit', id: 'u1', name: 'Christie Drill' }
const VEHICLE: ReportProblemSubject = { kind: 'vehicle', id: 'v1', name: 'Truck 1' }

function renderDialog(subject: ReportProblemSubject) {
  const onClose = vi.fn()
  const onReported = vi.fn()
  render(<ReportProblemDialog open subject={subject} onClose={onClose} onReported={onReported} />)
  return { onClose, onReported }
}

const typeNotes = (text: string) =>
  fireEvent.change(screen.getByLabelText(/What happened/i), { target: { value: text } })

beforeEach(() => {
  mutate.mockClear()
  showToast.mockClear()
})

describe('ReportProblemDialog — photos never block (UXP-3 3g / D36)', () => {
  it('unit + notes + 0 photos → submit is ENABLED and labelled "Report without photo"', () => {
    renderDialog(UNIT)
    typeNotes('cracked housing')
    const btn = screen.getByRole('button', { name: 'Report without photo' })
    expect(btn).toBeEnabled()
  })

  it('unit + notes + 0 photos → one tap sends the report with photoUrls: [] (no confirm step)', async () => {
    const { onClose, onReported } = renderDialog(UNIT)
    typeNotes('cracked housing')
    fireEvent.click(screen.getByRole('button', { name: 'Report without photo' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const call = mutate.mock.calls[0][0]
    expect(call.endpoint).toBe('/api/inventory/units/u1/report-problem')
    expect(call.method).toBe('POST')
    expect(call.body).toEqual({ notes: 'cracked housing', photoUrls: [], stillUsable: true })
    await waitFor(() => expect(onReported).toHaveBeenCalledWith({ queued: false }))
    expect(onClose).toHaveBeenCalled()
  })

  it('unit + a photo → the label is the plain "Report" and the photo rides the body', async () => {
    renderDialog(UNIT)
    typeNotes('cracked housing')
    fireEvent.click(screen.getByText('stub-attach-photo'))
    const btn = screen.getByRole('button', { name: 'Report' })
    expect(btn).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Report without photo' })).not.toBeInTheDocument()
    fireEvent.click(btn)
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0].body.photoUrls).toEqual(['/api/photos/p1.jpg'])
  })

  it('empty notes → submit stays DISABLED (the words are still required; the photo is not)', () => {
    renderDialog(UNIT)
    expect(screen.getByRole('button', { name: 'Report without photo' })).toBeDisabled()
    typeNotes('   ')
    expect(screen.getByRole('button', { name: 'Report without photo' })).toBeDisabled()
  })

  it('the unit caption is a nudge, never a red requirement', () => {
    renderDialog(UNIT)
    expect(screen.getByText('Add at least one photo if you can — it helps the admin triage.')).toBeInTheDocument()
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument()
  })

  it('a vehicle report keeps the plain "Report" label with 0 photos (was never photo-gated)', () => {
    renderDialog(VEHICLE)
    typeNotes('oil leak')
    expect(screen.getByRole('button', { name: 'Report' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Report without photo' })).not.toBeInTheDocument()
    expect(screen.getByText('Add a photo if you can.')).toBeInTheDocument()
  })
})
