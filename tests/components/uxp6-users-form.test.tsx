import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// UXP-6 (6c / C7): the two users-page forms — Invite and Manage account — move onto
// EntityFormDialog. What changes: the dialog Paper IS the form (Cancel/Save pinned,
// Enter submits), a dirty form asks "Discard changes?", and the routes' zod field
// errors land on their fields. The requests themselves are unchanged.

import AdminUsersPage from '@/app/(admin)/admin/users/page'

const USER = {
  id: 'u1', name: 'Sam K.', email: 'sam@example.com', role: 'OPERATOR', isActive: true,
  lastLoginAt: null, failedPinAttempts: 0, pinLockedAt: null, hourlyRate: null, homeHubId: null, homeHub: null, activeProjects: [],
}
const HUBS = [{ id: 'h1', name: 'Toledo Hub' }]

type Call = { method: string; url: string; body: Record<string, unknown> }
const writes: Call[] = []
let inviteResponse: { ok: boolean; status: number; body: unknown } = { ok: true, status: 200, body: { ok: true } }

const jsonRes = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  Promise.resolve({ ok, status, json: async () => body } as Response)

beforeEach(() => {
  writes.length = 0
  inviteResponse = { ok: true, status: 200, body: { ok: true } }
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : {} })
      if (url === '/api/users/invite') return jsonRes(inviteResponse.body, inviteResponse.ok, inviteResponse.status)
      return jsonRes({ data: {} })
    }
    if (url === '/api/users') return jsonRes({ data: [USER] })
    if (url === '/api/users/invite') return jsonRes({ data: [] })
    if (url === '/api/hubs') return jsonRes(HUBS)
    if (url === '/api/projects') return jsonRes({ data: [] })
    return jsonRes({ data: [] })
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

async function renderPage() {
  render(<ToastProvider><AdminUsersPage /></ToastProvider>)
  await screen.findByText('Sam K.')
}

const backdrop = () => document.querySelector('.MuiBackdrop-root') as HTMLElement
const actionButtons = (dlg: HTMLElement) =>
  within(dlg).getAllByRole('button').filter((b) => b.closest('.MuiDialogActions-root')).map((b) => b.textContent)

describe('UXP-6 (6c): Invite team member on EntityFormDialog', () => {
  async function openInvite() {
    // findBy: after a close, the page is inert until the previous dialog's exit transition ends.
    fireEvent.click(await screen.findByRole('button', { name: 'Invite Member' }))
    return await screen.findByRole('dialog', { name: 'Invite team member' })
  }

  it('the dialog Paper is the form with Cancel / Send invite pinned, and Enter submits the same body as before', async () => {
    await renderPage()
    const dlg = await openInvite()
    expect(dlg.tagName).toBe('FORM')
    expect(actionButtons(dlg)).toEqual(['Cancel', 'Send invite'])
    expect(within(dlg).getByRole('button', { name: 'Send invite' })).toHaveAttribute('type', 'submit')
    expect(within(dlg).getByText('required', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Full Name/)).toBeRequired()

    fireEvent.change(screen.getByLabelText(/^Full Name/), { target: { value: 'Dana R.' } })
    fireEvent.change(screen.getByLabelText(/^Email Address/), { target: { value: 'dana@example.com' } })
    // requestSubmit() is what the browser runs for Enter in a single-line field.
    ;(dlg as HTMLFormElement).requestSubmit()

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ method: 'POST', url: '/api/users/invite', body: { name: 'Dana R.', email: 'dana@example.com', role: 'OPERATOR', delivery: 'EMAIL' } })
    expect(await screen.findByText('Invite sent to dana@example.com')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite team member' })).toBeNull())
  })

  it('link delivery keeps its own labels (Create link)', async () => {
    await renderPage()
    const dlg = await openInvite()
    fireEvent.mouseDown(screen.getByLabelText(/^How to send/))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Create a link to copy (no email)'))
    expect(actionButtons(dlg)).toEqual(['Cancel', 'Create link'])
  })

  it('a blank required field is an inline error, no request', async () => {
    await renderPage()
    const dlg = await openInvite()
    fireEvent.change(screen.getByLabelText(/^Full Name/), { target: { value: 'Dana R.' } })
    ;(dlg as HTMLFormElement).requestSubmit()
    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Email Address/)).toHaveAttribute('aria-invalid', 'true')
    expect(writes).toHaveLength(0)
  })

  it('the invite route\'s field errors land on their fields', async () => {
    inviteResponse = { ok: false, status: 400, body: { error: { email: ['Invalid email'] } } }
    await renderPage()
    const dlg = await openInvite()
    fireEvent.change(screen.getByLabelText(/^Full Name/), { target: { value: 'Dana R.' } })
    fireEvent.change(screen.getByLabelText(/^Email Address/), { target: { value: 'not-an-email' } })
    ;(dlg as HTMLFormElement).requestSubmit()
    expect(await screen.findByText('Invalid email')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Email Address/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog', { name: 'Invite team member' })).toBeInTheDocument()
  })

  it('a dirty invite asks "Discard changes?" on backdrop tap; Discard closes and resets', async () => {
    await renderPage()
    await openInvite()
    fireEvent.change(screen.getByLabelText(/^Full Name/), { target: { value: 'Dana R.' } })
    fireEvent.click(backdrop())
    const confirm = await screen.findByRole('dialog', { name: 'Discard changes?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite team member' })).toBeNull())
    // Reopened clean.
    await openInvite()
    expect(screen.getByLabelText(/^Full Name/)).toHaveValue('')
  })
})

describe('UXP-6 (6c): Manage account on EntityFormDialog', () => {
  async function openManage() {
    fireEvent.click(await screen.findByRole('button', { name: 'Manage account' }))
    return await screen.findByRole('dialog', { name: 'Manage Sam K.' })
  }

  it('the dialog Paper is the form with Cancel / Save changes pinned, and Enter sends the same PATCH as before', async () => {
    await renderPage()
    const dlg = await openManage()
    expect(dlg.tagName).toBe('FORM')
    expect(actionButtons(dlg)).toEqual(['Cancel', 'Save changes'])
    expect(screen.getByLabelText(/^Full Name/)).toHaveValue('Sam K.')
    expect(screen.getByLabelText(/^Email/)).toBeDisabled()
    // The in-form action button must not be a submit.
    expect(within(dlg).getByRole('button', { name: 'Log out of all devices' })).toHaveAttribute('type', 'button')

    fireEvent.change(screen.getByLabelText(/^Hourly Rate/), { target: { value: '32.5' } })
    ;(dlg as HTMLFormElement).requestSubmit()

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ method: 'PATCH', url: '/api/users/u1', body: { name: 'Sam K.', role: 'OPERATOR', homeHubId: null, hourlyRate: 32.5 } })
    expect(writes[0]!.body).not.toHaveProperty('pin')
    expect(await screen.findByText('Sam K. updated')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Manage Sam K.' })).toBeNull())
  })

  it('a bad reset PIN is an inline error on the PIN field, no request', async () => {
    await renderPage()
    const dlg = await openManage()
    fireEvent.change(screen.getByLabelText(/^Reset PIN/), { target: { value: '123' } })
    ;(dlg as HTMLFormElement).requestSubmit()
    expect(await screen.findByText('A reset PIN must be exactly 6 digits.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Reset PIN/)).toHaveAttribute('aria-invalid', 'true')
    expect(writes).toHaveLength(0)
  })

  it('opens clean (no false dirty read from the reset effect) and asks "Discard changes?" once edited', async () => {
    await renderPage()
    const dlg = await openManage()
    // Untouched: Cancel closes straight away.
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Manage Sam K.' })).toBeNull())
    expect(screen.queryByText('Discard changes?')).toBeNull()

    const again = await openManage()
    fireEvent.change(screen.getByLabelText(/^Full Name/), { target: { value: 'Sam Kim' } })
    fireEvent.click(within(again).getByRole('button', { name: 'Cancel' }))
    const confirm = await screen.findByRole('dialog', { name: 'Discard changes?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }))
    expect(await screen.findByRole('dialog', { name: 'Manage Sam K.' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Full Name/)).toHaveValue('Sam Kim')
    expect(writes).toHaveLength(0)
  })
})
