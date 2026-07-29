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

// CC-33 (A5): removed 8 caller-less templates (maintenanceOverdue, equipmentNotReturned,
// damageReported, dailyCheckFailed, pinLocked, lowInventory, insuranceExpiring,
// registrationExpiring). Alert emails now flow through genericAlertEmail via the dispatcher.

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

// M6: HUB_RETURN delivery. One email per hub, listing each inbound unit with its
// own private confirm-receipt link (each link is scoped to a single unit).
export function hubReturnEmail(opts: {
  hubName?: string | null
  units: { name: string; serial?: string | null; url: string }[]
}) {
  const greeting = opts.hubName ? `Hi ${esc(opts.hubName)},` : 'Hello,'
  const many = opts.units.length > 1
  const rows = opts.units.map((u) => `
       <tr>
         <td style="padding:8px 0;border-top:1px solid #eee;">${esc(u.name)}${u.serial ? ` <span style="color:#757575;">(#${esc(u.serial)})</span>` : ''}</td>
         <td style="padding:8px 0;border-top:1px solid #eee;text-align:right;"><a href="${u.url}" style="color:#2e7d32;font-weight:600;text-decoration:none;">Confirm receipt →</a></td>
       </tr>`).join('')
  return base(
    'Equipment inbound to your hub',
    `<h3 style="color:#2e7d32;">📦 Equipment returning to your hub</h3>
     <p>${greeting}</p>
     <p>The following ${many ? 'items are' : 'item is'} on the way back to your hub. When ${many ? 'they arrive' : 'it arrives'}, open the matching link to confirm receipt — or flag a discrepancy. No account needed:</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">
       ${rows}
     </table>
     <p style="color:#757575;font-size:13px;">Each link is private to one item. Please don't forward them.</p>`
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
