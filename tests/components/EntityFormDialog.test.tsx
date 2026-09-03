import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { Button, TextField, Stack } from '@mui/material'

// UXP-6 (6a): the one create/edit dialog grammar. These tests pin the CONTRACT
// the adopters (vehicle · item · deployment · checklist · users) rely on.

// Same mock shape as RequestComposer.test.tsx, but a spy so the Back-button
// contract (guard armed on `open`, its callback = a close attempt) is testable.
const historyGuard = vi.fn<(active: boolean, onBack: () => void) => void>()
vi.mock('@/hooks/useHistoryGuard', () => ({
  useHistoryGuard: (active: boolean, onBack: () => void) => historyGuard(active, onBack),
}))

import { EntityFormDialog, RequiredLegend, FieldValidationError, scrollToFirstInvalid } from '@/components/ui/EntityFormDialog'
import { useDirtyState } from '@/hooks/useDirtyState'
import { ReadOnlyProvider } from '@/components/shared/ReadOnly'

const scrollSpy = vi.fn()
beforeEach(() => {
  historyGuard.mockClear()
  scrollSpy.mockClear()
  // jsdom has no layout; the primitive guards on the method's existence.
  Element.prototype.scrollIntoView = scrollSpy
})
afterEach(() => {
  // @ts-expect-error — restore jsdom's "absent" state
  delete Element.prototype.scrollIntoView
})

/** A minimal adopter: two fields, caller-owned validation, caller-owned saving flag. */
function Harness({
  open = true,
  onClose = () => {},
  onSaved = vi.fn(),
  saving = false,
  formError,
  secondaryAction,
  submitLabel,
  initialName = '',
  throwOnInvalid = false,
}: {
  open?: boolean
  onClose?: () => void
  onSaved?: (body: { name: string; qty: string; submitter: string | null }) => void
  saving?: boolean
  formError?: string | null
  secondaryAction?: React.ReactNode
  submitLabel?: string
  initialName?: string
  throwOnInvalid?: boolean
}) {
  const [name, setName] = React.useState(initialName)
  const [qty, setQty] = React.useState('1')
  const [nameError, setNameError] = React.useState<string | null>(null)
  const dirty = useDirtyState(open, { name, qty })
  return (
    <EntityFormDialog
      open={open}
      title="Add vehicle"
      onClose={onClose}
      saving={saving}
      dirty={dirty}
      formError={formError}
      legend={<RequiredLegend />}
      secondaryAction={secondaryAction}
      submitLabel={submitLabel}
      onSubmit={(e) => {
        if (!name.trim()) {
          setNameError('Name is required')
          if (throwOnInvalid) throw new FieldValidationError('Fix the highlighted field')
          return false
        }
        setNameError(null)
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        onSaved({ name, qty, submitter: submitter?.value || null })
      }}
    >
      <Stack spacing={2}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required
          error={!!nameError} helperText={nameError ?? undefined} />
        <TextField label="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
      </Stack>
    </EntityFormDialog>
  )
}

const dialog = () => screen.getByRole('dialog', { name: 'Add vehicle' })
const backdrop = () => document.querySelector('.MuiBackdrop-root') as HTMLElement

describe('EntityFormDialog — pinned form Paper (C7 for everyone)', () => {
  it('the dialog Paper IS the form: title, fields and DialogActions buttons all live inside one <form>', () => {
    render(<Harness />)
    const paper = dialog()
    expect(paper.tagName).toBe('FORM')
    expect(paper).toHaveAttribute('novalidate')
    const save = screen.getByRole('button', { name: 'Save' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(save.closest('form')).toBe(paper)
    expect(cancel.closest('form')).toBe(paper)
    expect(screen.getByLabelText(/^Name/).closest('form')).toBe(paper)
    expect(save).toHaveAttribute('type', 'submit')
    expect(cancel).toHaveAttribute('type', 'button')
  })

  it('Enter in a field submits the form (implicit submission) and the caller receives the values', async () => {
    const onSaved = vi.fn()
    render(<Harness onSaved={onSaved} initialName="Truck 7" />)
    // jsdom does not synthesise implicit submission from a keypress; requestSubmit()
    // is exactly what the browser runs when Enter is pressed in a single-line field.
    ;(dialog() as HTMLFormElement).requestSubmit()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0]![0]).toMatchObject({ name: 'Truck 7', qty: '1' })
  })

  it('clicking Save submits too', async () => {
    const onSaved = vi.fn()
    render(<Harness onSaved={onSaved} initialName="Truck 7" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })

  it('renders the required legend and the caller-supplied submit label', () => {
    render(<Harness submitLabel="Add" />)
    expect(within(dialog()).getByText('required', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('formError renders exactly one Alert above the fields', () => {
    render(<Harness formError="Vehicle name already in use" />)
    const alerts = within(dialog()).getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent('Vehicle name already in use')
  })
})

describe('EntityFormDialog — validation failure scrolls to the first invalid field', () => {
  it('onSubmit returning false → first [aria-invalid] is scrolled into view and focused', async () => {
    const onSaved = vi.fn()
    render(<Harness onSaved={onSaved} />) // empty name
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1))
    const nameInput = screen.getByLabelText(/^Name/)
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(document.activeElement).toBe(nameInput)
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('throwing FieldValidationError does the same and shows its message in the Alert', async () => {
    render(<Harness throwOnInvalid />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1))
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Fix the highlighted field')
    expect(document.activeElement).toBe(screen.getByLabelText(/^Name/))
  })

  it('scrollToFirstInvalid helper returns null when nothing is invalid', () => {
    const root = document.createElement('div')
    root.innerHTML = '<input aria-invalid="false" />'
    expect(scrollToFirstInvalid(root)).toBeNull()
    expect(scrollToFirstInvalid(null)).toBeNull()
  })
})

describe('EntityFormDialog — dirty guard', () => {
  it('clean form: backdrop click closes straight away', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(backdrop())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Discard changes?')).toBeNull()
  })

  it('dirty form: backdrop click asks "Discard changes?" — Keep editing keeps it open, Discard closes', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Truck 9' } })

    fireEvent.click(backdrop())
    expect(onClose).not.toHaveBeenCalled()
    const confirm = await screen.findByRole('dialog', { name: 'Discard changes?' })
    expect(within(confirm).getByRole('button', { name: 'Keep editing' })).toBeInTheDocument()

    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Truck 9')

    // Esc goes the same route.
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    const confirm2 = await screen.findByRole('dialog', { name: 'Discard changes?' })
    fireEvent.click(within(confirm2).getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('dirty form: Cancel asks too', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('arms useHistoryGuard on `open` and hardware Back is a close attempt (dirty → confirm)', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    expect(historyGuard).toHaveBeenCalled()
    expect(historyGuard.mock.calls.at(-1)![0]).toBe(true)

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Truck 9' } })
    // Simulate the popstate: the guard runs the latest callback it was given.
    const onBack = historyGuard.mock.calls.at(-1)![1]
    onBack()
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('is disarmed when closed', () => {
    render(<Harness open={false} />)
    expect(historyGuard.mock.calls.at(-1)![0]).toBe(false)
  })
})

describe('EntityFormDialog — busy state', () => {
  it('saving: spinner-in-button, Cancel disabled, backdrop and Esc blocked, Back blocked', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} saving />)
    const save = screen.getByRole('button', { name: /Saving…/ })
    expect(save).toBeDisabled()
    expect(within(save).getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    fireEvent.click(backdrop())
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    historyGuard.mock.calls.at(-1)![1]()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('Discard changes?')).toBeNull()
  })

  it('saving: a second submit is ignored', async () => {
    const onSaved = vi.fn()
    render(<Harness onSaved={onSaved} saving initialName="Truck 7" />)
    ;(dialog() as HTMLFormElement).requestSubmit()
    await new Promise((r) => setTimeout(r, 0))
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('EntityFormDialog — read-only viewers', () => {
  it('under org-wide read-only the submit stays visible but disabled (MutationButton keepVisible)', () => {
    render(
      <ReadOnlyProvider canEdit={false}>
        <Harness initialName="Truck 7" />
      </ReadOnlyProvider>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})

describe('EntityFormDialog — secondary action', () => {
  it('renders the slot between Cancel and Save, and a submit-typed secondary goes through onSubmit with its submitter', async () => {
    const onSaved = vi.fn()
    render(
      <Harness
        onSaved={onSaved}
        initialName="Sample bags"
        secondaryAction={<Button type="submit" name="intent" value="add-another">Save & add another</Button>}
      />,
    )
    const buttons = within(dialog()).getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Cancel', 'Save & add another', 'Save'])

    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0]![0]).toMatchObject({ name: 'Sample bags', submitter: 'add-another' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
    expect(onSaved.mock.calls[1]![0]).toMatchObject({ submitter: null })
  })
})
