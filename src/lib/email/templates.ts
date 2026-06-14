const base = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <div style="background:#2e7d32;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;">🌱 AHITS Alert — Agricarbon</h2>
  </div>
  <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
    ${body}
  </div>
  <p style="color:#757575;font-size:12px;margin-top:16px;">
    This is an automated message from the Agricarbon Hardware Inventory & Tracking System.
  </p>
</body>
</html>`

export function maintenanceOverdueEmail(taskName: string, vehicleOrItem: string) {
  return base(
    'Maintenance Overdue',
    `<h3 style="color:#d32f2f;">⚠️ Maintenance Overdue</h3>
     <p><strong>${taskName}</strong> is overdue for <strong>${vehicleOrItem}</strong>.</p>
     <p>Please schedule this maintenance as soon as possible to prevent equipment damage.</p>`
  )
}

export function equipmentNotReturnedEmail(itemName: string, operator: string, expectedDate: string) {
  return base(
    'Equipment Not Returned',
    `<h3 style="color:#e65100;">📦 Equipment Not Returned</h3>
     <p><strong>${itemName}</strong> checked out by <strong>${operator}</strong> was due back on <strong>${expectedDate}</strong>.</p>
     <p>Please follow up to ensure the equipment is returned and accounted for.</p>`
  )
}

export function damageReportedEmail(item: string, operator: string, notes: string) {
  return base(
    'Damage Reported',
    `<h3 style="color:#d32f2f;">🔧 Damage Reported</h3>
     <p><strong>${operator}</strong> reported damage to <strong>${item}</strong>.</p>
     <p><strong>Notes:</strong> ${notes}</p>`
  )
}

export function dailyCheckFailedEmail(vehicleName: string, operator: string, issues: string) {
  return base(
    'Daily Check Failed',
    `<h3 style="color:#e65100;">🚗 Daily Vehicle Check — Issues Found</h3>
     <p><strong>${operator}</strong> submitted a daily check for <strong>${vehicleName}</strong> with issues.</p>
     <p><strong>Issues:</strong> ${issues}</p>`
  )
}

export function pinLockedEmail(userName: string) {
  return base(
    'Operator PIN Locked',
    `<h3 style="color:#1565c0;">🔒 Operator PIN Locked</h3>
     <p><strong>${userName}</strong>'s PIN has been locked after too many failed attempts.</p>
     <p>Please reset their PIN in the Admin → Users panel.</p>`
  )
}

export function lowInventoryEmail(itemName: string, quantity: number, threshold: number) {
  return base(
    'Low Inventory Alert',
    `<h3 style="color:#e65100;">📉 Low Inventory</h3>
     <p><strong>${itemName}</strong> is low: <strong>${quantity}</strong> remaining (threshold: ${threshold}).</p>
     <p>Consider reordering to avoid supply gaps in the field.</p>`
  )
}

export function insuranceExpiringEmail(vehicleName: string, expiryDate: string) {
  return base(
    'Insurance Expiring',
    `<h3 style="color:#e65100;">📋 Insurance Expiring Soon</h3>
     <p><strong>${vehicleName}</strong>'s insurance expires on <strong>${expiryDate}</strong>.</p>
     <p>Please renew to maintain coverage and compliance.</p>`
  )
}

export function registrationExpiringEmail(vehicleName: string, expiryDate: string) {
  return base(
    'Registration Expiring',
    `<h3 style="color:#e65100;">📋 Registration Expiring Soon</h3>
     <p><strong>${vehicleName}</strong>'s registration expires on <strong>${expiryDate}</strong>.</p>
     <p>Please renew before the expiry date.</p>`
  )
}
