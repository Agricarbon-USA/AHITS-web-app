import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FulfillmentChecklist, type ChecklistLine } from '@/components/shared/FulfillmentChecklist'

// CC-27: the re-skin is behavior-parity — these lock the actions/states/outcomes so
// "Calibration verifies old vs new" has an executable anchor. Assert the exact
// onLineAction args per action, the serialized needs-unit gate, deny-requires-reason,
// and stage-disabled-until-all-checked.

const consumable = (over: Partial<ChecklistLine> = {}): ChecklistLine => ({
  id: 'l1', name: 'Gloves', requestedQty: 2, itemType: 'CONSUMABLE',
  fulfillmentStatus: 'PENDING', fulfilledQty: null, substitutedItemId: null,
  substitutedName: null, resolvedUnitId: null, denyReason: null,
  availableUnits: [], substitutableItems: [], ...over,
})

const serialized = (over: Partial<ChecklistLine> = {}): ChecklistLine => ({
  ...consumable(), id: 'l2', name: 'Drill', itemType: 'SERIALIZED',
  availableUnits: [{ id: 'u1', serialNumber: 'SN-1' }], ...over,
})

const ok = () => Promise.resolve({ ok: true as const })
const progress = { checked: 0, total: 1 }

describe('FulfillmentChecklist (CC-27 re-skin — behavior parity)', () => {
  const onLineAction = vi.fn(ok)
  const onStage = vi.fn(ok)
  beforeEach(() => { onLineAction.mockClear().mockImplementation(ok); onStage.mockClear().mockImplementation(ok) })

  it('confirm on a non-serialized line calls onLineAction with resolvedUnitId undefined', async () => {
    render(<FulfillmentChecklist lines={[consumable()]} progress={progress} onLineAction={onLineAction} onStage={onStage} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onLineAction).toHaveBeenCalledWith('l1', 'confirm', { resolvedUnitId: undefined }))
  })

  it('gates Confirm on a serialized line until a unit is picked, then sends the unit', async () => {
    render(<FulfillmentChecklist lines={[serialized()]} progress={progress} onLineAction={onLineAction} onStage={onStage} />)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled() // needs-unit gate
    fireEvent.mouseDown(screen.getByRole('combobox')) // open the inline unit picker
    fireEvent.click(within(screen.getByRole('listbox')).getByText('#SN-1'))
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(onLineAction).toHaveBeenCalledWith('l2', 'confirm', { resolvedUnitId: 'u1' }))
  })

  it('edit sends fulfilledQty + resolvedUnitId + substitutedItemId (empty → undefined)', async () => {
    render(<FulfillmentChecklist lines={[consumable()]} progress={progress} onLineAction={onLineAction} onStage={onStage} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onLineAction).toHaveBeenCalledWith('l1', 'edit', { fulfilledQty: 5, resolvedUnitId: undefined, substitutedItemId: undefined }))
  })

  it('deny requires a reason, then sends the trimmed reason', async () => {
    render(<FulfillmentChecklist lines={[consumable()]} progress={progress} onLineAction={onLineAction} onStage={onStage} />)
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))       // open deny form
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))       // submit empty
    expect(screen.getByText('Please enter a reason.')).toBeInTheDocument()
    expect(onLineAction).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Reason for denial'), { target: { value: '  out of stock  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    await waitFor(() => expect(onLineAction).toHaveBeenCalledWith('l1', 'deny', { denyReason: 'out of stock' }))
  })

  it('the stage button is disabled until every line is checked, then stages', async () => {
    render(<FulfillmentChecklist lines={[consumable()]} progress={progress} onLineAction={onLineAction} onStage={onStage} />)
    const stage = screen.getByRole('button', { name: 'Stage reservation' })
    expect(stage).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))     // check the only line
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stage reservation' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Stage reservation' }))
    await waitFor(() => expect(onStage).toHaveBeenCalledTimes(1))
  })

  it('renders read-only (no action buttons) when isActionable is false', () => {
    render(<FulfillmentChecklist lines={[consumable()]} progress={progress} onLineAction={onLineAction} onStage={onStage} isActionable={false} />)
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stage reservation' })).toBeNull()
  })
})
