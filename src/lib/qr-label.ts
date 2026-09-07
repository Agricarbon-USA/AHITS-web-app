import QRCode from 'qrcode'

// UXP-6 (6b): ONE label helper for anything that carries a `qrCodeId`.
// Generalised from inventory/page.tsx `downloadUnitQR` (T9: vehicles had no
// admin-side label path at all, so the operator Scan screen's vehicle lookup had
// nothing to read). Same `qrcode` library, same 300px PNG, same payload — the BARE
// code, which is what `/api/vehicles/by-qr/[qrCodeId]` and
// `/api/inventory/units/by-qr/[qrCodeId]` resolve (`parseScannedCode` tolerates a
// URL payload too, but the app registers/reads codes, it does not mint URLs) — and
// the same `qr-<stem>-<code8>.png` filename. Browser-only (canvas + anchor click).
// A printable bulk sheet is a deferred CARRY decision (plan §Tier 2), not this.

export const QR_LABEL_WIDTH = 300

/** `qr-<stem>-<first 8 of code>.png`, whitespace → `-`, path/OS-reserved characters dropped. */
export function qrLabelFilename(stem: string, code: string): string {
  const safeStem = stem.trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]+/g, '') || 'label'
  return `qr-${safeStem}-${code.slice(0, 8)}.png`
}

/** Render `code` as a PNG data-URL (a `<canvas>` under the hood). */
export async function renderQrLabel(code: string, width = QR_LABEL_WIDTH): Promise<string> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, code, { width })
  return canvas.toDataURL()
}

/**
 * Download the QR label for `code` as a PNG named after `stem` (an item or
 * vehicle name). Resolves once the download has been triggered; rejects if the
 * canvas render fails (callers toast — the label is not the record).
 */
export async function downloadQrLabel(code: string, stem: string): Promise<void> {
  const href = await renderQrLabel(code)
  const link = document.createElement('a')
  link.download = qrLabelFilename(stem, code)
  link.href = href
  link.click()
}
