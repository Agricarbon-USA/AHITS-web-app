import QRCode from 'qrcode'

export async function downloadUnitQRLabel(
  unit: { qrCodeId: string; serialNumber?: string | null },
  itemName: string,
) {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, unit.qrCodeId, { width: 300 })
  const link = document.createElement('a')
  link.download = `qr-${itemName.replace(/\s+/g, '-').toLowerCase()}-${unit.qrCodeId.slice(0, 8)}.png`
  link.href = canvas.toDataURL()
  link.click()
}
