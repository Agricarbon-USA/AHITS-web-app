import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decodeFromImage } from '@/lib/qr-scan'
import { QrScannerDialog, type QrResolveResult } from '@/components/shared/QrScannerDialog'

// CC-25: jsdom has no camera / BarcodeDetector / canvas pixels, so the decode
// step is mocked. jsdom also lacks navigator.mediaDevices, so the dialog takes
// its no-camera fallback path deterministically — which is exactly the
// permission-denied/no-camera degrade this test exercises.
vi.mock('@/lib/qr-scan', () => ({
  createBarcodeDetector: () => null,
  decodeFromVideo: vi.fn(async () => null),
  decodeFromImage: vi.fn(async () => 'UNIT-123'),
}))

beforeEach(() => {
  vi.clearAllMocks()
  // onPhoto needs createImageBitmap, which jsdom doesn't implement.
  ;(globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
    vi.fn(async () => ({ width: 10, height: 10, close() {} }))
})

function renderDialog(onResolve: (c: string) => Promise<QrResolveResult>) {
  const onClose = vi.fn()
  render(<QrScannerDialog open onClose={onClose} onResolve={onResolve} />)
  return { onClose }
}

describe('QrScannerDialog (CC-25)', () => {
  it('submits a typed code (manual-entry fallback) to onResolve', async () => {
    const onResolve = vi.fn(async () => ({ status: 'ok' as const }))
    const { onClose } = renderDialog(onResolve)
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'ABC-1' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('ABC-1'))
    await waitFor(() => expect(onClose).toHaveBeenCalled()) // 'ok' → dialog closes
  })

  it('degrades to the photo + manual fallback when there is no camera — not a dead end', async () => {
    renderDialog(vi.fn(async () => ({ status: 'ok' as const })))
    expect(await screen.findByText(/Camera unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Take a photo/i })).toBeInTheDocument()
    // manual entry is still available — the operator is never stuck.
    expect(screen.getByRole('button', { name: /Look up/i })).toBeInTheDocument()
  })

  it('decodes a captured photo (mocked) and resolves it', async () => {
    const onResolve = vi.fn(async () => ({ status: 'ok' as const }))
    renderDialog(onResolve)
    await screen.findByText(/Camera unavailable/i)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'label.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(decodeFromImage).toHaveBeenCalled())
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('UNIT-123'))
  })

  it('shows the honest "not found" message (server said no)', async () => {
    renderDialog(vi.fn(async () => ({ status: 'not-found' as const })))
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'NOPE' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    expect(await screen.findByText(/Code not found/i)).toBeInTheDocument()
  })

  it('shows the honest "can’t verify right now" message when offline', async () => {
    renderDialog(vi.fn(async () => ({ status: 'offline' as const })))
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    expect(await screen.findByText(/Can’t verify right now/i)).toBeInTheDocument()
  })
})
