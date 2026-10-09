// PR-5 (U-15 copy audit): every admin page's confirm-dialog text and success-toast
// string, keyed by the action it describes. They live here — not inline — so
// tests/components/copy-contract.test.tsx can list every key against the server
// effect it claims, and a new key without a row there fails the test. A string
// left inline cannot be audited; moving it is the point.
//
// Rules: strings moved verbatim (D-m: locked strings are not reworded here — only
// copy this PR fixes changes, and it says so beside it); interpolated strings are
// functions; failures are NOT here — they go through apiErrorMessage with the
// server's own words (useMutation, PR-5). Pure: no React, no fetch.

import { appTimezone } from '@/lib/business-date'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** PR-3c: "Deleted 9 Oct · Max" — dated on the business day, so it reads the same for
 *  everyone. Vehicles carry no `deletedBy` (no column), so theirs reads "Deleted 9 Oct". */
export function deletedLabel(row: { deletedAt?: string | null; deletedBy?: { name: string } | null }): string {
  if (!row.deletedAt) return 'Deleted'
  const day = new Date(row.deletedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: appTimezone() })
  return `Deleted ${day}${row.deletedBy?.name ? ` · ${row.deletedBy.name}` : ''}`
}

export const ADMIN_ACTIONS = {
  // ── Deployments ────────────────────────────────────────────────
  'deployment.start': { success: (operatorName: string) => `Deployment started for ${operatorName}` },
  'deployment.reassignPrimary': { success: 'Primary operator reassigned.' },
  'deployment.addOperator': { success: 'Operator added.' },
  'deployment.removeOperator': { success: 'Operator removed.' },
  'deployment.returnItem': { success: 'Item returned.' },
  'transfer.cancel': { success: 'Transfer cancelled.' },
  'transfer.accept': { success: 'Transfer accepted' },
  'transfer.decline': { success: 'Transfer declined' },

  // ── Hubs ───────────────────────────────────────────────────────
  'hub.add': { success: 'Hub added' },
  'hub.update': { success: 'Hub updated' },
  'hub.deactivate': {
    title: (name: string) => `Deactivate "${name}"?`,
    message: 'This hub will be hidden from the hub list. Items assigned to it will retain their assignment.',
    // PR-5 (U-15): was "Delete" — the action deactivates (the hub can be reactivated).
    confirm: 'Deactivate',
    success: 'Hub deactivated',
  },
  'hubReturn.receive': { success: 'Marked received.' },
  'hubReturn.receiveBulk': {
    success: (n: number) => `${n} item${n !== 1 ? 's' : ''} marked received.`,
    // PR-5 (U-6): bulk Receive now reads each result instead of assuming success.
    partial: (ok: number, failed: number) => `${ok} marked received · ${failed} could not be received.`,
  },
  'hubReturn.resolveDiscrepancy': { success: 'Marked received — discrepancy closed.' },
  'hubReturn.dismiss': {
    success: (n: number) => (n === 1 ? 'Dismissed.' : `${n} items dismissed.`),
    partial: 'Some items could not be dismissed.',
  },
  'hubReturn.reissueLink': {
    success: 'New link copied to clipboard.',
    successNoClipboard: (url: string) => `New link: ${url}`,
  },

  // ── Inventory ──────────────────────────────────────────────────
  'item.save': { success: (name: string, isEdit: boolean) => `${name} ${isEdit ? 'updated' : 'added'}` },
  'item.retire': {
    title: 'Retire item?',
    message: (name: string) => `Retire "${name}"? Units on hand will be retired and their QR labels released. Units that are out or in repair block this. History is preserved.`,
    confirm: 'Retire',
    success: (name: string) => `${name} retired`,
  },
  // PR-3c (D-s): the rule a user needs, then what goes with it.
  'item.delete': {
    title: 'Delete item?',
    message: (name: string) => `Delete "${name}"? Use this for mistakes, duplicates and test entries. To retire real gear use Retire instead — it stays in history and reports.`,
    confirm: 'Delete',
    success: (name: string) => `${name} deleted`,
    undo: 'Undo',
    unitsGo: (total: number, parts: string) => `${plural(total, 'unit')} (${parts}) go with it; their QR labels stay bound.`,
    stockGoes: (onHand: number, hubs: number) => `${onHand} on hand at ${plural(hubs, 'hub')} go with it.`,
    historyKept: (kept: string[]) => `History kept, hidden: ${kept.join(' · ')}.`,
    restorable: 'Restorable under Show deleted.',
  },
  'item.restore': { success: (name: string) => `${name} restored` },
  'item.bulkDelete': {
    title: 'Delete selected?',
    message: (count: number, names: string[]) =>
      `Delete ${plural(count, 'item')}? ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` … and ${names.length - 5} more` : ''}. Use this for mistakes, duplicates and test entries. Anything still in use is refused and stays.`,
    confirm: 'Delete',
    action: 'Delete selected',
    success: (deleted: number, refused: number) => (refused > 0 ? `${deleted} deleted · ${refused} refused` : `${deleted} deleted`),
    details: 'Details',
    refusalsTitle: 'Not deleted',
  },
  'unit.retire': {
    title: 'Retire this unit?',
    message: "Its QR label is released and any open repair on it is closed. Units that are out or Returning can't be retired. History is preserved.",
    confirm: 'Retire Unit',
  },
  'unit.approveRetirement': {
    title: 'Retire this unit?',
    message: 'This will permanently retire this unit. History is preserved.',
    confirm: 'Retire Unit',
    success: 'Unit retired.',
  },

  // ── Maintenance ────────────────────────────────────────────────
  'repair.complete': {
    success: (kind: 'vehicle' | 'unit' | 'scheduled') =>
      kind === 'scheduled'
        ? 'Completed — next service scheduled.'
        : kind === 'vehicle' ? 'Repair completed — vehicle returned to service.' : 'Repair completed — unit returned to service.',
  },
  'repair.setStatus': {
    success: (status: string) => (status === 'COMPLETED' ? 'Marked complete.' : status === 'IN_PROGRESS' ? 'Repair started.' : 'Status updated.'),
  },
  'repair.saveDetails': { success: 'Repair details saved.' },
  'repair.markDelivered': { success: 'Marked delivered to shop.' },
  'repair.fieldFix': { success: 'Field fix logged.' },
  'repair.addSchedule': { success: 'Scheduled task added.' },
  'repair.copyLink': { success: 'Link copied to clipboard.' },
  // PR-5 (U-15): the server joins an open repair instead of making a second one — say so.
  'repair.openFromCheck': { joined: 'This vehicle already had an open repair — the check was added to it.' },
  'unit.retireInoperable': { success: (label: string) => `${label} retired` },

  // ── Projects ───────────────────────────────────────────────────
  'project.save': { success: (isEdit: boolean) => (isEdit ? 'Project updated' : 'Project added') },
  'project.delete': { success: (name: string) => `${name} deleted` },

  // ── Requests ───────────────────────────────────────────────────
  'request.forward': { success: 'Forwarded to hub.' },
  'request.decline': { success: 'Request declined.' },
  'request.markHandled': { success: (requesterName: string | null) => `Marked handled — ${requesterName ?? 'requester'} notified` },
  'request.action': { success: 'Done.' },
  'request.stage': { success: 'Reservation staged.' },
  'request.create': { success: 'Request created.' },

  // ── Settings ───────────────────────────────────────────────────
  'settings.saveNotifications': { success: 'Notification settings saved' },
  'category.add': { success: 'Category added' },
  'category.update': { success: 'Category updated' },
  'category.delete': {
    title: (name: string) => `Delete "${name}"?`,
    message: 'This will permanently delete this category. Any items using it must be reassigned first.',
    confirm: 'Delete',
    success: 'Category deleted',
  },

  // ── Users ──────────────────────────────────────────────────────
  'user.update': { success: (name: string) => `${name} updated` },
  'user.revokeSessions': { success: (name: string) => `${name}'s sessions revoked` },
  'user.unlockPin': {
    title: 'Unlock PIN',
    message: (name: string) => `Unlock ${name}'s PIN so they can log in again?`,
    confirm: 'Unlock',
    success: (name: string) => `${name}'s PIN unlocked`,
  },
  'user.deactivate': {
    title: 'Deactivate Account',
    message: (name: string) => `${name} will be logged out immediately and unable to log in. Their history is preserved; you can reactivate them any time.`,
    confirm: 'Deactivate',
    success: (name: string) => `${name} deactivated`,
  },
  'user.reactivate': {
    title: 'Reactivate Account',
    message: (name: string) => `Reactivate ${name}'s account so they can log in again?`,
    confirm: 'Reactivate',
    success: (name: string) => `${name} reactivated`,
  },
  'invite.send': {
    success: (email: string) => `Invite sent to ${email}`,
    notEmailed: 'Invite not emailed — copy the link.',
  },
  'invite.revoke': {
    title: 'Revoke invite',
    message: (email: string) => `Revoke the invite for ${email}? Their setup link will stop working immediately.`,
    confirm: 'Revoke',
    success: 'Invite revoked',
  },

  // ── Vehicles ───────────────────────────────────────────────────
  'vehicle.save': { success: (name: string, isEdit: boolean) => `${name} ${isEdit ? 'updated' : 'added'}` },
  // PR-5: the twin of item Delete. Was "This can't be undone…" — false now that
  // Show deleted → Restore exists.
  'vehicle.delete': {
    title: 'Delete vehicle?',
    // There is no vehicle Retire button — retiring is Edit → Status → Retired (PR-3b), so say that.
    message: (name: string) => `Delete "${name}"? Use this for mistakes, duplicates and test entries. To retire a real vehicle, edit it and set Status to Retired — it stays in history and reports. Restorable under Show deleted.`,
    confirm: 'Delete',
    success: (name: string) => `${name} deleted`,
    undo: 'Undo',
  },
  'vehicle.restore': { success: (name: string) => `${name} restored` },
  'vehicle.returnToService': {
    title: 'Return to service?',
    message: (name: string, openRepair: boolean) =>
      openRepair ? "A repair is still open — it will show as In Maintenance until that's closed" : `${name} goes back to Active and can be put on a deployment.`,
    confirm: 'Return to service',
    success: (name: string, landedInMaintenance: boolean) =>
      landedInMaintenance ? `${name} is back in service — In Maintenance until its repair is closed` : `${name} is back in service`,
  },
  'vehicle.takeOutOfService': {
    title: 'Take out of service?',
    message: (name: string) => `${name} is taken out of service until an admin returns it. Repairs and field fixes won't put it back on their own.`,
    confirm: 'Take out of service',
    success: (name: string) => `${name} is out of service`,
  },
  'vehicle.fieldFix': { success: 'Field fix logged.' },
  'vehicle.reportDamage': { success: 'Damage reported — vehicle is now IN MAINTENANCE.' },
} as const

export type AdminActionKey = keyof typeof ADMIN_ACTIONS

/** The copy for one action. `copy('hub.deactivate').confirm` → "Deactivate". */
export function copy<K extends AdminActionKey>(key: K): (typeof ADMIN_ACTIONS)[K] {
  return ADMIN_ACTIONS[key]
}
