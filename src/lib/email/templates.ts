// Security: every value interpolated into these HTML emails must be passed
// through esc(). Operator-supplied strings (notes, issues, names, item/vehicle
// names) would otherwise allow HTML/script/link injection into an admin's mail
// client (stored HTML injection / phishing-link insertion into a trusted email).
function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const base = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${esc(title)}</title></head>
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
     <p><strong>${esc(taskName)}</strong> is overdue for <strong>${esc(vehicleOrItem)}</strong>.</p>
     <p>Please schedule this maintenance as soon as possible to prevent equipment damage.</p>`
  )
}

export function equipmentNotReturnedEmail(itemName: string, operator: string, expectedDate: string) {
  return base(
    'Equipment Not Returned',
    `<h3 style="color:#e65100;">📦 Equipment Not Returned</h3>
     <p><strong>${esc(itemName)}</strong> checked out by <strong>${esc(operator)}</strong> was due back on <strong>${esc(expectedDate)}</strong>.</p>
     <p>Please follow up to ensure the equipment is returned and accounted for.</p>`
  )
}

export function damageReportedEmail(item: string, operator: string, notes: string) {
  return base(
    'Damage Reported',
    `<h3 style="color:#d32f2f;">🔧 Damage Reported</h3>
     <p><strong>${esc(operator)}</strong> reported damage to <strong>${esc(item)}</strong>.</p>
     <p><strong>Notes:</strong> ${esc(notes)}</p>`
  )
}

export function dailyCheckFailedEmail(vehicleName: string, operator: string, issues: string) {
  return base(
    'Daily Check Failed',
    `<h3 style="color:#e65100;">🚗 Daily Vehicle Check — Issues Found</h3>
     <p><strong>${esc(operator)}</strong> submitted a daily check for <strong>${esc(vehicleName)}</strong> with issues.</p>
     <p><strong>Issues:</strong> ${esc(issues)}</p>`
  )
}

export function pinLockedEmail(userName: string) {
  return base(
    'Operator PIN Locked',
    `<h3 style="color:#1565c0;">🔒 Operator PIN Locked</h3>
     <p><strong>${esc(userName)}</strong>'s PIN has been locked after too many failed attempts.</p>
     <p>Please reset their PIN in the Admin → Users panel.</p>`
  )
}

export function lowInventoryEmail(itemName: string, quantity: number, threshold: number) {
  return base(
    'Low Inventory Alert',
    `<h3 style="color:#e65100;">📉 Low Inventory</h3>
     <p><strong>${esc(itemName)}</strong> is low: <strong>${esc(quantity)}</strong> remaining (threshold: ${esc(threshold)}).</p>
     <p>Consider reordering to avoid supply gaps in the field.</p>`
  )
}

export function insuranceExpiringEmail(vehicleName: string, expiryDate: string) {
  return base(
    'Insurance Expiring',
    `<h3 style="color:#e65100;">📋 Insurance Expiring Soon</h3>
     <p><strong>${esc(vehicleName)}</strong>'s insurance expires on <strong>${esc(expiryDate)}</strong>.</p>
     <p>Please renew to maintain coverage and compliance.</p>`
  )
}

export function registrationExpiringEmail(vehicleName: string, expiryDate: string) {
  return base(
    'Registration Expiring',
    `<h3 style="color:#e65100;">📋 Registration Expiring Soon</h3>
     <p><strong>${esc(vehicleName)}</strong>'s registration expires on <strong>${esc(expiryDate)}</strong>.</p>
     <p>Please renew before the expiry date.</p>`
  )
}

// Generic alert email used by the notification dispatcher for any alert type.
// `linkUrl` is server-constructed (app URL + path), never user input, so it is
// safe in the href; all other values are escaped.
export function genericAlertEmail(title: string, message: string, linkUrl?: string, linkLabel = 'Open in AHITS') {
  return base(
    title,
    `<h3 style="color:#d32f2f;">🔔 ${esc(title)}</h3>
     <p>${esc(message)}</p>
     ${linkUrl ? `<p style="text-align:center;margin:24px 0;">
       <a href="${linkUrl}" style="background:#2e7d32;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
         ${esc(linkLabel)}
       </a>
     </p>` : ''}`
  )
}

// Wave F — work order sent to an external maintenance shop. `linkUrl` is
// server-constructed (app URL + CSPRNG token); all other values are escaped.
export function workOrderEmail(opts: {
  shopName?: string | null
  taskName: string
  assetName: string
  problem?: string | null
  shipToHub?: string | null
  linkUrl: string
}) {
  const greeting = opts.shopName ? `Hi ${esc(opts.shopName)},` : 'Hello,'
  return base(
    'Work Order from Agricarbon',
    `<h3 style="color:#2e7d32;">🔧 Repair Work Order</h3>
     <p>${greeting}</p>
     <p>Agricarbon has a repair request for you:</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">
       <tr><td style="padding:6px 0;color:#555;">Asset</td><td style="padding:6px 0;"><strong>${esc(opts.assetName)}</strong></td></tr>
       <tr><td style="padding:6px 0;color:#555;">Work</td><td style="padding:6px 0;">${esc(opts.taskName)}</td></tr>
       ${opts.problem ? `<tr><td style="padding:6px 0;color:#555;">Problem</td><td style="padding:6px 0;">${esc(opts.problem)}</td></tr>` : ''}
       ${opts.shipToHub ? `<tr><td style="padding:6px 0;color:#555;">Return to</td><td style="padding:6px 0;">${esc(opts.shipToHub)}</td></tr>` : ''}
     </table>
     <p>Open the work order to view photos and update its status (received, in progress, completed, invoiced) — no account needed:</p>
     <p style="text-align:center;margin:24px 0;">
       <a href="${opts.linkUrl}" style="background:#2e7d32;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
         Open Work Order
       </a>
     </p>
     <p style="color:#757575;font-size:13px;">This is a private link unique to this work order. Please don't forward it.</p>`
  )
}

export function inviteEmail(name: string, role: string, setupUrl: string) {
  const roleLabel = role === 'ADMIN' ? 'Admin' : 'Field Operator'
  // setupUrl is server-constructed (env app URL + CSPRNG token, already
  // URL-encoded) — not user input — so it is safe to use directly in the href.
  return base(
    'Welcome to AHITS',
    `<h3 style="color:#2e7d32;">👋 Welcome to AHITS, ${esc(name)}!</h3>
     <p>You've been invited to join Agricarbon's Hardware Inventory & Tracking System as a <strong>${roleLabel}</strong>.</p>
     <p>Click the button below to set your ${role === 'OPERATOR' ? '6-digit PIN' : 'password'} and activate your account:</p>
     <p style="text-align:center;margin:24px 0;">
       <a href="${setupUrl}" style="background:#2e7d32;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
         Set Up My Account
       </a>
     </p>
     <p style="color:#757575;font-size:13px;">This link expires in 48 hours. If you weren't expecting this invitation, you can safely ignore this email.</p>`
  )
}
