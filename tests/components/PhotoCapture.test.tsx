import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// UXP-3 (3g) / D36 + critic G-5. Two things are pinned here:
//   1. the file input carries NO `capture` attribute — the OS offers camera OR library
//      (D36 #1: "texting the photo I already took" parity). Re-adding
//      `capture="environment"` must fail loudly: re-open D36 before touching this.
//   2. the max-N cap and non-image skips are SURFACED (role="status") instead of the
//      old silent break/continue — an operator who picked 7 and saw 5 learns why.
// The browser photo store / compressor / proxy are mocked: component tests never touch
// IndexedDB or canvas (vitest.config.ui.ts). jsdom reports navigator.onLine=true, so
// every accepted file takes the upload path.

const uploaded: string[] = []
vi.mock('@/lib/photoStore', () => ({
  storeLocalPhoto: vi.fn(async () => 'localphoto:x'),
  getLocalPhoto: vi.fn(async () => null),
  deleteLocalPhoto: vi.fn(async () => {}),
  uploadPhotoBlob: vi.fn(async () => {
    const ref = `/api/photos/p${uploaded.length + 1}.jpg`
    uploaded.push(ref)
    return ref
  }),
  isLocalPhotoRef: (ref: unknown) => typeof ref === 'string' && ref.startsWith('localphoto:'),
}))
vi.mock('@/lib/imageCompress', () => ({ compressImage: vi.fn(async (f: File) => f) }))
vi.mock('@/lib/photo-security', () => ({ toPhotoSrc: (ref: string) => ref }))

import { PhotoCapture } from '@/components/shared/PhotoCapture'

const img = (name: string) => new File(['x'], name, { type: 'image/jpeg' })
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

beforeEach(() => {
  uploaded.length = 0
  vi.clearAllMocks()
})

describe('PhotoCapture — D36 input contract', () => {
  it('has NO capture attribute (camera OR library), and keeps accept="image/*" + multiple', () => {
    render(<PhotoCapture value={[]} onChange={() => {}} />)
    const input = fileInput()
    expect(input).toBeTruthy()
    // D36: a `capture` attribute would force live camera on iOS/Android and drop the
    // library option — the exact "loses to texting a photo" failure the decision closes.
    expect(input.hasAttribute('capture')).toBe(false)
    expect(input.getAttribute('accept')).toBe('image/*')
    expect(input).toHaveAttribute('multiple')
  })
})

describe('PhotoCapture — the max-5 cap is surfaced, not silent (G-5)', () => {
  it('7 files at max 5 → onChange with exactly 5 refs + a status caption naming the cap', async () => {
    const onChange = vi.fn()
    render(<PhotoCapture value={[]} onChange={onChange} />)
    fireEvent.change(fileInput(), { target: { files: [1, 2, 3, 4, 5, 6, 7].map((n) => img(`${n}.jpg`)) } })

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0][0]).toHaveLength(5)
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Only 5 photos per report — the first 5 were added.')
  })

  it('at 5/5 the Add button is gone and "Maximum 5 photos" says why', () => {
    const five = ['/api/photos/a.jpg', '/api/photos/b.jpg', '/api/photos/c.jpg', '/api/photos/d.jpg', '/api/photos/e.jpg']
    render(<PhotoCapture value={five} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /Add photo/i })).not.toBeInTheDocument()
    expect(screen.getByText('Maximum 5 photos')).toBeInTheDocument()
  })

  it('counts existing photos toward the cap (3 held + 4 picked → 2 added)', async () => {
    const onChange = vi.fn()
    const held = ['/api/photos/a.jpg', '/api/photos/b.jpg', '/api/photos/c.jpg']
    render(<PhotoCapture value={held} onChange={onChange} />)
    fireEvent.change(fileInput(), { target: { files: [img('1.jpg'), img('2.jpg'), img('3.jpg'), img('4.jpg')] } })

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0][0]).toHaveLength(5)
    expect(onChange.mock.calls[0][0].slice(0, 3)).toEqual(held)
    expect(await screen.findByRole('status')).toHaveTextContent('Only 5 photos per report — the first 2 were added.')
  })

  it('a non-image file is skipped WITH a caption, and onChange is not fired for nothing', async () => {
    const onChange = vi.fn()
    render(<PhotoCapture value={[]} onChange={onChange} />)
    fireEvent.change(fileInput(), { target: { files: [new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })] } })

    expect(await screen.findByRole('status')).toHaveTextContent('Only image files can be attached.')
    // Give the async handler a tick to prove it never called onChange with an empty add.
    await new Promise((r) => setTimeout(r, 0))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a mixed pick keeps the images and reports the skipped file', async () => {
    const onChange = vi.fn()
    render(<PhotoCapture value={[]} onChange={onChange} />)
    fireEvent.change(fileInput(), {
      target: { files: [img('ok.jpg'), new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })] },
    })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0][0]).toEqual(['/api/photos/p1.jpg'])
    expect(await screen.findByRole('status')).toHaveTextContent('Only image files can be attached.')
  })

  it('a clean pick under the cap shows no notice at all', async () => {
    const onChange = vi.fn()
    render(<PhotoCapture value={[]} onChange={onChange} />)
    fireEvent.change(fileInput(), { target: { files: [img('1.jpg'), img('2.jpg')] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0][0]).toHaveLength(2)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
