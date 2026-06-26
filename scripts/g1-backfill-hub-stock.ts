/**
 * G1 one-off backfill — resurface "disappeared" inventory.
 *
 * Before the G1 fix, a consumable returned with no resolvable hub had its
 * cross-hub TOTAL (`inventory_items.quantity`) incremented while its per-hub
 * `inventory_stock` row was skipped — so the quantity existed in the total but
 * in no hub, vanishing from every hub-filtered view ("disappeared"/"HQ").
 *
 * This script finds every consumable item whose total exceeds the sum of its
 * per-hub stock and credits the difference to a destination hub:
 *   destination = item.hubId  ??  DEFAULT_HUB_ID (env)
 * It also sets a null item.hubId to DEFAULT_HUB_ID so the item reappears in
 * hub-filtered views.
 *
 * SAFETY:
 *   - Dry-run by default. Prints the plan and changes NOTHING.
 *   - Set APPLY=1 to execute.
 *   - Provide DEFAULT_HUB_ID for items that have no home hub (else they are
 *     reported as "unresolved" and left untouched — never silently moved).
 *   - Run against the TARGET database via the app's DB env (e.g. through
 *     `make` with the right SECRET_NS), per the repo's DB rules. Do NOT run
 *     against a shared DB without a backup/snapshot first.
 *
 * Usage:
 *   # dry run
 *   npx tsx scripts/g1-backfill-hub-stock.ts
 *   # apply, with a fallback hub for home-less items
 *   APPLY=1 DEFAULT_HUB_ID=<hubId> npx tsx scripts/g1-backfill-hub-stock.ts
 */
import { prisma } from '../src/lib/prisma'

async function main() {
  const apply = process.env.APPLY === '1'
  const defaultHubId = process.env.DEFAULT_HUB_ID || null

  const items = await prisma.inventoryItem.findMany({
    where: { itemType: 'CONSUMABLE', deletedAt: null },
    select: { id: true, name: true, quantity: true, hubId: true },
  })

  let credited = 0
  let unresolved = 0
  let homeFixed = 0

  for (const item of items) {
    const rows = await prisma.inventoryStock.findMany({
      where: { itemId: item.id },
      select: { hubId: true, quantity: true },
    })
    const perHubSum = rows.reduce((s, r) => s + r.quantity, 0)
    const missing = (item.quantity ?? 0) - perHubSum

    if (item.hubId == null && defaultHubId) {
      console.log(`HOME  ${item.name} (${item.id}) — set home hub → ${defaultHubId}`)
      homeFixed++
      if (apply) await prisma.inventoryItem.update({ where: { id: item.id }, data: { hubId: defaultHubId } })
    }

    if (missing <= 0) continue

    const dest = item.hubId ?? defaultHubId
    if (!dest) {
      console.log(`SKIP  ${item.name} (${item.id}) — missing ${missing} but no home hub and no DEFAULT_HUB_ID`)
      unresolved++
      continue
    }
    console.log(`FIX   ${item.name} (${item.id}) — credit ${missing} to hub ${dest} (total ${item.quantity}, per-hub ${perHubSum})`)
    credited++
    if (apply) {
      await prisma.inventoryStock.upsert({
        where: { itemId_hubId: { itemId: item.id, hubId: dest } },
        update: { quantity: { increment: missing } },
        create: { itemId: item.id, hubId: dest, quantity: missing },
      })
    }
  }

  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN'} — ${credited} item(s) credited, ${homeFixed} home-hub set, ${unresolved} unresolved (need DEFAULT_HUB_ID).`)
  if (!apply) console.log('Re-run with APPLY=1 to execute.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
