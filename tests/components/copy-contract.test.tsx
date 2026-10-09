import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ADMIN_ACTIONS, type AdminActionKey } from '@/lib/copy/admin-actions'

// PR-5 (U-15) · the copy contract. Every admin confirm-dialog text and success toast
// lives in src/lib/copy/admin-actions.ts, keyed by action. This table says, for each
// key, what the server actually does when that copy is shown — so a toast can be read
// against its effect in one place. Rules enforced here:
//  1. Every key has exactly one row, and every row a key — a new key without a row fails.
//  2. A row's route exists and exports that method (the copy describes a real write).
//  3. No moved string has crept back inline into an admin page (it could not be audited).

type Effect = { route: `${'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'} /api/${string}`; effect: string } | { route: 'none'; effect: string }

const EFFECTS: Record<AdminActionKey, Effect> = {
  'deployment.start': { route: 'POST /api/deployments', effect: 'Creates the rig, its PRIMARY assignment and kit; picks units (pickUnit) and draws/claims stock.' },
  'deployment.reassignPrimary': { route: 'POST /api/deployments/[id]/handoff', effect: 'Admin force handoff: the PRIMARY assignment moves to the chosen operator.' },
  'deployment.addOperator': { route: 'POST /api/deployments/[id]/operators', effect: 'Opens a SECONDARY assignment on the rig.' },
  'deployment.removeOperator': { route: 'DELETE /api/deployments/[id]/operators', effect: 'Ends that SECONDARY assignment.' },
  'deployment.returnItem': { route: 'DELETE /api/deployments/[id]/items/[kitItemId]', effect: 'Closes the kit item; the unit returns through returnUnit (Returning, or kept in repair — D43).' },
  'transfer.cancel': { route: 'DELETE /api/transfers/[id]', effect: 'Transfer → CANCELLED; units keep their state, kit items stay on the source rig.' },
  'transfer.accept': { route: 'POST /api/transfers/[id]/accept', effect: 'Gear moves to the recipient’s rig; the bell item is read.' },
  'transfer.decline': { route: 'POST /api/transfers/[id]/decline', effect: 'Transfer → DECLINED; gear stays put; the bell item is read.' },
  'hub.add': { route: 'POST /api/hubs', effect: 'Creates the hub.' },
  'hub.update': { route: 'PATCH /api/hubs/[id]', effect: 'Saves the hub fields.' },
  'hub.deactivate': { route: 'DELETE /api/hubs/[id]', effect: 'isActive=false (reversible); refused 409 while the hub holds stock or open work.' },
  'hubReturn.receive': { route: 'POST /api/status-links/[id]/receive', effect: 'HUB_RETURN link → COMPLETED; the unit goes AVAILABLE at the hub (receiveUnitAtHub).' },
  'hubReturn.receiveBulk': { route: 'POST /api/status-links/[id]/receive', effect: 'The same receive, once per selected link; each result is counted.' },
  'hubReturn.resolveDiscrepancy': { route: 'POST /api/status-links/[id]/receive', effect: 'Receives a link the hub had flagged, closing the discrepancy.' },
  'hubReturn.dismiss': { route: 'POST /api/status-links/[id]/revoke', effect: 'Link → REVOKED (“Dismissed”); the unit goes AVAILABLE (revokeHubReturn).' },
  'hubReturn.reissueLink': { route: 'POST /api/status-links/[id]/reissue', effect: 'Issues a fresh token for the link and returns its URL.' },
  'item.save': { route: 'POST /api/inventory', effect: 'Creates the item (edit: PATCH /api/inventory/[id] saves its fields).' },
  'item.retire': { route: 'PATCH /api/inventory/[id]', effect: 'D-a: units on hand RETIRED, QR labels released, item RETIRED; refused 409 while any unit is out or in repair.' },
  'item.delete': { route: 'DELETE /api/inventory/[id]', effect: 'D-o: soft delete of the item, its units and schedules (one stamp); QR stays bound; reversible.' },
  'item.restore': { route: 'POST /api/inventory/[id]/restore', effect: 'Clears the same-stamp deletedAt on the item, units and schedules.' },
  'item.bulkDelete': { route: 'POST /api/inventory/bulk-delete', effect: 'deleteItem per item in its own transaction; per-item results.' },
  'unit.retire': { route: 'PATCH /api/inventory/units/[unitId]', effect: 'retireUnit: RETIRED, QR released, open repair closed; refused while out or Returning.' },
  'unit.approveRetirement': { route: 'POST /api/inventory/[id]/review-inoperable', effect: 'decision RETIRE → retireUnit.' },
  'repair.complete': { route: 'POST /api/maintenance/[id]/complete', effect: 'closeDamageTask(COMPLETED) — asset restored only if no other open repair; a schedule rolls forward.' },
  'repair.setStatus': { route: 'PATCH /api/maintenance/[id]', effect: 'COMPLETED closes the repair; back from COMPLETED is Reopen (refused 409 if another repair is open).' },
  'repair.saveDetails': { route: 'PATCH /api/maintenance/[id]', effect: 'Saves the repair’s shop/cost/notes fields.' },
  'repair.markDelivered': { route: 'PATCH /api/maintenance/[id]', effect: 'Sets dateDelivered.' },
  'repair.fieldFix': { route: 'POST /api/maintenance/field-fix', effect: 'D-c: closes every open repair on the asset and returns it to service (never from OUT_OF_SERVICE).' },
  'repair.addSchedule': { route: 'POST /api/maintenance', effect: 'Creates a scheduled (non-damage) task.' },
  'repair.copyLink': { route: 'none', effect: 'Clipboard only — the work-order link already exists.' },
  'repair.openFromCheck': { route: 'POST /api/daily-check/[id]/open-task', effect: 'openDamageTask joins the vehicle’s open repair (created: false) instead of making a second.' },
  'unit.retireInoperable': { route: 'POST /api/inventory/[id]/review-inoperable', effect: 'decision RETIRE → retireUnit.' },
  'project.save': { route: 'POST /api/projects', effect: 'Creates the project (edit: PATCH /api/projects/[id]).' },
  'project.delete': { route: 'DELETE /api/projects/[id]', effect: 'Deletes the project; refused while deployments are assigned.' },
  'request.forward': { route: 'PATCH /api/deployment-requests/[id]', effect: 'action forward: request → FORWARDED to the hub (email outcome reported separately — D-j).' },
  'request.decline': { route: 'PATCH /api/deployment-requests/[id]', effect: 'action decline: request → DECLINED with the note.' },
  'request.markHandled': { route: 'PATCH /api/deployment-requests/[id]', effect: 'action fulfill/complete on MATERIAL: marked handled; the requester is notified.' },
  'request.action': { route: 'PATCH /api/deployment-requests/[id]', effect: 'The generic lifecycle actions (fulfill, cancel).' },
  'request.stage': { route: 'PATCH /api/deployment-requests/[id]', effect: 'action confirm: reservation → STAGED, holds placed.' },
  'request.create': { route: 'POST /api/deployment-requests', effect: 'Creates the request (admin on behalf of an operator).' },
  'settings.saveNotifications': { route: 'PATCH /api/admin/notification-config', effect: 'Saves the daily-check cutoff and disabled alert types.' },
  'category.add': { route: 'POST /api/categories', effect: 'Creates the category.' },
  'category.update': { route: 'PATCH /api/categories/[id]', effect: 'Renames the category.' },
  'category.delete': { route: 'DELETE /api/categories/[id]', effect: 'Deletes the category; refused while items use it.' },
  'user.update': { route: 'PATCH /api/users/[id]', effect: 'Saves the account fields (and a reset PIN when given).' },
  'user.revokeSessions': { route: 'PATCH /api/users/[id]', effect: 'forceLogout: every session for the user is revoked.' },
  'user.unlockPin': { route: 'PATCH /api/users/[id]', effect: 'unlockPin: clears the PIN lock (PIN_LOCKED alert clears on the next cron).' },
  'user.deactivate': { route: 'PATCH /api/users/[id]', effect: 'isActive=false, sessions revoked; refused 409 while PRIMARY on an active deployment (D-f).' },
  'user.reactivate': { route: 'PATCH /api/users/[id]', effect: 'isActive=true.' },
  'invite.send': { route: 'POST /api/users/invite', effect: 'Creates the invite; the email outcome is reported (D-j), the link is the fallback.' },
  'invite.revoke': { route: 'DELETE /api/users/invite/[id]', effect: 'The invite token stops working.' },
  'vehicle.save': { route: 'POST /api/vehicles', effect: 'Creates the vehicle (edit: PATCH /api/vehicles/[id]).' },
  'vehicle.delete': { route: 'DELETE /api/vehicles/[id]', effect: 'Soft delete (deletedAt), its alerts resolved; refused 409 while on a live deployment or pending transfer.' },
  'vehicle.restore': { route: 'POST /api/vehicles/[id]/restore', effect: 'Clears deletedAt (name and QR were never released).' },
  'vehicle.returnToService': { route: 'PATCH /api/vehicles/[id]', effect: 'status ACTIVE from OUT_OF_SERVICE; lands IN_MAINTENANCE while a repair is open (D-g).' },
  'vehicle.takeOutOfService': { route: 'PATCH /api/vehicles/[id]', effect: 'status OUT_OF_SERVICE — admin-owned; repairs and field fixes never undo it.' },
  'vehicle.fieldFix': { route: 'POST /api/maintenance/field-fix', effect: 'D-c: closes the vehicle’s open repairs and returns it to service unless an admin took it out.' },
  'vehicle.reportDamage': { route: 'POST /api/vehicles/[id]/report-damage', effect: 'openDamageTask(pull) — joins an open repair if there is one; vehicle IN_MAINTENANCE.' },
}

const ROOT = process.cwd()

function routeFile(path: string): string {
  return join(ROOT, 'src/app', path.replace(/^\//, ''), 'route.ts')
}

function exportsMethod(source: string, method: string): boolean {
  return new RegExp(`export\\s+(async\\s+function|function|const)\\s+${method}\\b`).test(source)
    || new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`).test(source)
}

describe('copy contract — src/lib/copy/admin-actions.ts', () => {
  it('every key has a row and every row a key', () => {
    expect(Object.keys(EFFECTS).sort()).toEqual(Object.keys(ADMIN_ACTIONS).sort())
  })

  it.each(Object.entries(EFFECTS))('%s — its route exists and exports the method', (_key, row) => {
    expect(row.effect.length).toBeGreaterThan(10)
    if (row.route === 'none') return
    const [method, path] = row.route.split(' ')
    const file = routeFile(path!)
    expect(existsSync(file), `${file} is missing`).toBe(true)
    expect(exportsMethod(readFileSync(file, 'utf8'), method!), `${row.route} not exported`).toBe(true)
  })

  it('every entry is non-empty copy (strings, or functions that build it)', () => {
    for (const [key, entry] of Object.entries(ADMIN_ACTIONS)) {
      for (const [field, value] of Object.entries(entry)) {
        if (typeof value === 'string') expect(value.trim(), `${key}.${field}`).not.toBe('')
        else expect(typeof value, `${key}.${field}`).toBe('function')
      }
    }
  })

  it('no moved string is still written inline in an admin page', () => {
    const adminDir = join(ROOT, 'src/app/(admin)/admin')
    const pages = readdirSync(adminDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(adminDir, d.name, 'page.tsx')))
      .map((d) => [d.name, readFileSync(join(adminDir, d.name, 'page.tsx'), 'utf8')] as const)
    // Long static strings only: short words ("Delete", "Undo") are also button and tooltip labels.
    const moved = Object.values(ADMIN_ACTIONS)
      .flatMap((entry) => Object.values(entry))
      .filter((v): v is string => typeof v === 'string' && v.length > 15)
    const offenders: string[] = []
    for (const [name, src] of pages) {
      for (const s of moved) {
        if (src.includes(`'${s}'`) || src.includes(`"${s}"`) || src.includes(`\`${s}\``)) offenders.push(`${name}: ${s}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('hub Deactivate confirms "Deactivate" (U-15), and vehicle Delete no longer says it cannot be undone', () => {
    expect(ADMIN_ACTIONS['hub.deactivate'].confirm).toBe('Deactivate')
    expect(ADMIN_ACTIONS['vehicle.delete'].message('Truck-01')).toContain('Restorable under Show deleted.')
    expect(ADMIN_ACTIONS['vehicle.delete'].message('Truck-01')).not.toMatch(/can.t be undone/i)
    // No vehicle Retire button exists — the copy names the real path (Edit → Status).
    expect(ADMIN_ACTIONS['vehicle.delete'].message('Truck-01')).toContain('edit it and set Status to Retired')
  })
})
