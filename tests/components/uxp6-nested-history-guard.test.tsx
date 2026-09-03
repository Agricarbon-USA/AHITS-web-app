import { render, act, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as React from 'react'
import { Button } from '@mui/material'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { EntityFormDialog } from '@/components/ui/EntityFormDialog'
import { __resetHistoryGuardForTests } from '@/hooks/useHistoryGuard'

// UXP-6 (antagonist #3): the inventory drawer renders its MoveStock / AddStock
// EntityFormDialogs INSIDE the open item drawer, so two history guards are armed at
// once. With the nest-aware hook the inner one answers first: Back closes the dialog
// and leaves the drawer; the next Back closes the drawer. Real DetailDrawer + real
// EntityFormDialog + the real hook — only `history.back` is intercepted so the
// browser's asynchronous traversal can be replayed in order (see useHistoryGuard.test).

const realBack = window.history.back
let queuedBacks = 0
let backSpy: { mockRestore(): void }
const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
async function traverse() {
  realBack.call(window.history)
  await macrotask()
  await macrotask()
  await macrotask()
}
const pressBack = () => act(async () => { await traverse() })
const landBacks = () => act(async () => {
  while (queuedBacks > 0) {
    queuedBacks -= 1
    await traverse()
  }
})
const flag = () => (window.history.state as { __ahitsHistoryGuard?: boolean } | null)?.__ahitsHistoryGuard ?? null

beforeEach(() => {
  __resetHistoryGuardForTests()
  queuedBacks = 0
  window.history.pushState(null, '', '/base')
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => { queuedBacks += 1 })
})
afterEach(() => {
  cleanup()
  backSpy.mockRestore()
})

/** The inventory shape: a drawer whose content opens a form dialog. */
function DrawerWithDialog() {
  const [drawer, setDrawer] = React.useState(false)
  const [dialog, setDialog] = React.useState(false)
  return (
    <div>
      <button onClick={() => setDrawer(true)}>open-drawer</button>
      <DetailDrawer open={drawer} onClose={() => { setDrawer(false); setDialog(false) }}>
        <div>DRAWER BODY</div>
        <Button onClick={() => setDialog(true)}>Move Stock</Button>
        {dialog && (
          <EntityFormDialog open title="Move stock" onClose={() => setDialog(false)} onSubmit={() => {}} submitLabel="Move">
            <div>DIALOG BODY</div>
          </EntityFormDialog>
        )}
      </DetailDrawer>
    </div>
  )
}

describe('UXP-6: EntityFormDialog nested inside an open DetailDrawer', () => {
  it('Back closes only the dialog; the drawer stays and closes on the next Back', async () => {
    render(<DrawerWithDialog />)
    fireEvent.click(screen.getByText('open-drawer'))
    expect(screen.getByText('DRAWER BODY')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Move Stock' }))
    expect(await screen.findByRole('dialog', { name: 'Move stock' })).toBeInTheDocument()

    await pressBack()
    expect(screen.queryByRole('dialog', { name: 'Move stock' })).toBeNull()
    expect(screen.getByText('DRAWER BODY')).toBeInTheDocument()
    expect(flag()).toBe(true) // the drawer's sentinel is now the current entry
    expect(queuedBacks).toBe(0)

    await pressBack()
    expect(flag()).toBeNull()
    await waitFor(() => expect(screen.queryByText('DRAWER BODY')).toBeNull()) // after the exit transition
  })

  it('Cancel in the dialog releases its sentinel and the drawer still answers the next Back', async () => {
    render(<DrawerWithDialog />)
    fireEvent.click(screen.getByText('open-drawer'))
    fireEvent.click(screen.getByRole('button', { name: 'Move Stock' }))
    const dlg = await screen.findByRole('dialog', { name: 'Move stock' })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Move stock' })).toBeNull()
    expect(queuedBacks).toBe(1)
    await landBacks() // the release pop must not close the drawer
    expect(screen.getByText('DRAWER BODY')).toBeInTheDocument()

    await pressBack()
    expect(flag()).toBeNull()
    await waitFor(() => expect(screen.queryByText('DRAWER BODY')).toBeNull())
  })
})
