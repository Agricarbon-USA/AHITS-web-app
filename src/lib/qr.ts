/**
 * Normalise a scanned QR payload to the bare code stored as a record's
 * `qrCodeId`. Most labels encode the code directly, but some encode a full
 * URL/path — in that case take the last non-empty path segment.
 *
 * Shared by the operator Scan resolution, the inventory-unit and vehicle
 * by-qr lookup routes, and the admin QrScanField so all four parse identically.
 */
export function parseScannedCode(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.includes('/')) return trimmed
  return trimmed.split(/[/?#]/).filter(Boolean).pop() ?? trimmed
}
