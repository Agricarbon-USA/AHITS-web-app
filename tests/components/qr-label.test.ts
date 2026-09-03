import { describe, it, expect, vi, afterEach } from 'vitest'

// UXP-6 (6b): the shared QR label helper (generalised from inventory's downloadUnitQR).
// The payload is the BARE code (what the by-qr routes resolve) and the filename keeps
// the `qr-<stem>-<code8>.png` convention the unit labels already use.

const { toCanvas } = vi.hoisted(() => ({
  toCanvas: vi.fn(async (_canvas: HTMLCanvasElement, _text: string, _opts: unknown) => {}),
}))
vi.mock('qrcode', () => ({ default: { toCanvas } }))

import { qrLabelFilename, downloadQrLabel, QR_LABEL_WIDTH } from '@/lib/qr-label'

afterEach(() => { vi.restoreAllMocks(); toCanvas.mockClear() })

describe('qrLabelFilename', () => {
  it('keeps the unit-label convention: qr-<stem>-<first 8 of code>.png', () => {
    expect(qrLabelFilename('Truck 1', 'clx0abcdef123456')).toBe('qr-Truck-1-clx0abcd.png')
  })
  it('drops path/OS-reserved characters and never yields an empty stem', () => {
    expect(qrLabelFilename('Bob\'s F-250 / bay 3', 'abcdefgh')).toBe('qr-Bob\'s-F-250--bay-3-abcdefgh.png')
    expect(qrLabelFilename('   ', 'abcdefgh')).toBe('qr-label-abcdefgh.png')
  })
})

describe('downloadQrLabel', () => {
  it('renders the bare code at the standard width and clicks a download link', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QQ==')

    await downloadQrLabel('clx0abcdef123456', 'Truck 1')

    expect(toCanvas).toHaveBeenCalledTimes(1)
    expect(toCanvas.mock.calls[0][1]).toBe('clx0abcdef123456')
    expect(toCanvas.mock.calls[0][2]).toEqual({ width: QR_LABEL_WIDTH })
    expect(click).toHaveBeenCalledTimes(1)
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('qr-Truck-1-clx0abcd.png')
    expect(anchor.href).toBe('data:image/png;base64,QQ==')
  })
})
