import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'

// CC-33 (D22): the unified Transfer entry. TransferEntryDialog is the choice router
// (Entire rig vs Selected gear); EntireRigTransferDialog is today's handoff, retitled.
// These prove the exact entire-rig consequence sentence, the callback routing, and
// that "Entire rig" reaches the retitled "Transfer — Entire Rig" dialog.

import { TransferEntryDialog } from '@/components/operator/TransferEntryDialog'
import { EntireRigTransferDialog } from '@/components/operator/EntireRigTransferDialog'

const ENTIRE_RIG_SENTENCE =
  /Hands the whole deployment to them\. Once they accept, they become the primary operator — daily checks and gear custody move to them\./

describe('TransferEntryDialog (CC-33 D22)', () => {
  it('renders both options with the exact entire-rig consequence sentence', () => {
    render(<TransferEntryDialog open onClose={() => {}} onEntireRig={() => {}} onSelectedGear={() => {}} />)
    expect(screen.getByText('Entire rig')).toBeTruthy()
    expect(screen.getByText('Selected gear')).toBeTruthy()
    expect(screen.getByText(ENTIRE_RIG_SENTENCE)).toBeTruthy()
    expect(screen.getByText('Send specific vehicles or kit items. You keep the deployment.')).toBeTruthy()
  })

  it('fires onEntireRig when "Entire rig" is chosen', () => {
    const onEntireRig = vi.fn()
    const onSelectedGear = vi.fn()
    render(<TransferEntryDialog open onClose={() => {}} onEntireRig={onEntireRig} onSelectedGear={onSelectedGear} />)
    fireEvent.click(screen.getByText('Entire rig'))
    expect(onEntireRig).toHaveBeenCalledTimes(1)
    expect(onSelectedGear).not.toHaveBeenCalled()
  })

  it('fires onSelectedGear when "Selected gear" is chosen', () => {
    const onEntireRig = vi.fn()
    const onSelectedGear = vi.fn()
    render(<TransferEntryDialog open onClose={() => {}} onEntireRig={onEntireRig} onSelectedGear={onSelectedGear} />)
    fireEvent.click(screen.getByText('Selected gear'))
    expect(onSelectedGear).toHaveBeenCalledTimes(1)
    expect(onEntireRig).not.toHaveBeenCalled()
  })
})

describe('EntireRigTransferDialog (CC-33 D22)', () => {
  const baseProps = {
    open: true,
    onClose: () => {},
    operatorOptions: [{ value: 'op2', label: 'Sam Rivera' }],
    targetId: '',
    onTargetChange: () => {},
    note: '',
    onNoteChange: () => {},
    notePresets: ['End of shift'] as const,
    loading: false,
    onSubmit: () => {},
  }

  it('is titled "Transfer — Entire Rig", carries the consequence sentence and the Send Transfer Request button', () => {
    render(<EntireRigTransferDialog {...baseProps} />)
    expect(screen.getByText('Transfer — Entire Rig')).toBeTruthy()
    expect(screen.getByText(ENTIRE_RIG_SENTENCE)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send Transfer Request' })).toBeTruthy()
    // No operator-facing "Handoff" wording survives.
    expect(screen.queryByText(/handoff/i)).toBeNull()
  })

  it('disables Send until a recipient is chosen', () => {
    const { rerender } = render(<EntireRigTransferDialog {...baseProps} targetId="" />)
    expect((screen.getByRole('button', { name: 'Send Transfer Request' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<EntireRigTransferDialog {...baseProps} targetId="op2" />)
    expect((screen.getByRole('button', { name: 'Send Transfer Request' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

// Routing integration: mirror the my-deployment wiring — TransferEntryDialog's
// onEntireRig opens EntireRigTransferDialog; onSelectedGear routes to the selected-gear
// path (stubbed here, TransferDialog in the app). Proves "Entire rig → retitled dialog".
describe('Transfer routing (CC-33 D22)', () => {
  function Harness() {
    const [entryOpen, setEntryOpen] = React.useState(true)
    const [rigOpen, setRigOpen] = React.useState(false)
    const [gearOpen, setGearOpen] = React.useState(false)
    return (
      <>
        <TransferEntryDialog
          open={entryOpen}
          onClose={() => setEntryOpen(false)}
          onEntireRig={() => { setEntryOpen(false); setRigOpen(true) }}
          onSelectedGear={() => { setEntryOpen(false); setGearOpen(true) }}
        />
        <EntireRigTransferDialog
          open={rigOpen}
          onClose={() => setRigOpen(false)}
          operatorOptions={[{ value: 'op2', label: 'Sam Rivera' }]}
          targetId="" onTargetChange={() => {}}
          note="" onNoteChange={() => {}}
          notePresets={['End of shift'] as const}
          loading={false} onSubmit={() => {}}
        />
        {gearOpen && <div>Transfer — Selected Gear</div>}
      </>
    )
  }

  it('"Entire rig" opens the retitled Transfer — Entire Rig dialog', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Entire rig'))
    expect(screen.getByText('Transfer — Entire Rig')).toBeTruthy()
  })

  it('"Selected gear" routes to the selected-gear (TransferDialog) path', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Selected gear'))
    expect(screen.getByText('Transfer — Selected Gear')).toBeTruthy()
  })
})
