/**
 * Field Operations Inventory Import
 * Source: "Field Operations_inventory list.xlsx" rev. 2026-06-16
 *
 * Run with: npx tsx prisma/import-field-inventory.ts
 */

import { PrismaClient, VehicleType, VehicleStatus, EquipmentCategory, EquipmentStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Field Operations Inventory Import ===\n')

  // ── 1. Vehicles ──────────────────────────────────────────────────

  const vehicles = [
    {
      name: 'Can-Am #2 w/Wintex',
      type: VehicleType.CAN_AM_UTV,
      vin: '3JB7GAX79MK000048',
      year: 2020,
      location: 'Piedmont SC',
      notes: 'Sage Green. Scheduled for service 6/17; Wintex maintenance underway.',
    },
    {
      name: 'Can-Am #1 w/Wintex',
      type: VehicleType.CAN_AM_UTV,
      vin: '3JB7GAX71MK000044',
      year: 2020,
      location: 'Piedmont SC',
      notes: 'Sage Green. Scheduled for service 6/23; Wintex maintenance underway.',
    },
    {
      name: 'Polaris 450 Sportsman #1',
      type: VehicleType.ATV,
      vin: '4XASEA508SA014290',
      year: 2025,
      location: 'Piedmont SC',
      notes: 'Sage Green. Scheduled for service 6/23.',
    },
    {
      name: 'Polaris 450 Sportsman #2',
      type: VehicleType.ATV,
      vin: '4XASEA502TA097443',
      year: 2026,
      location: 'Piedmont SC',
      notes: 'Sage Green.',
    },
    {
      name: 'Polaris Ranger 500 #1',
      type: VehicleType.POLARIS_UTV,
      vin: '3NSCCA5A6TE104854',
      year: 2026,
      location: 'Piedmont SC',
      notes: 'Stealth Gray. Scheduled for service 6/17.',
    },
    {
      name: 'Polaris Ranger 500 #2',
      type: VehicleType.POLARIS_UTV,
      vin: '3NSCCA5A0TE175273',
      year: 2026,
      location: 'Piedmont SC',
      notes: 'Stealth Gray. Scheduled for service 6/23.',
    },
    {
      name: 'Polaris Ranger 500 #3',
      type: VehicleType.POLARIS_UTV,
      vin: '3NSCCA5A2TE175291',
      year: 2026,
      location: 'Iowa (unconfirmed)',
      notes: 'Stealth Gray. Location uncertain — may be in Iowa.',
    },
    {
      name: "32' Gooseneck Trailer",
      type: VehicleType.TRAILER,
      vin: '1S9PT3224MA266490',
      year: 2021,
      location: 'Piedmont SC',
      notes: 'Black.',
    },
  ]

  let vehicleCount = 0
  for (const v of vehicles) {
    const existing = await prisma.vehicle.findFirst({ where: { name: v.name } })
    if (existing) {
      console.log(`  SKIP (exists): ${v.name}`)
      continue
    }
    await prisma.vehicle.create({ data: { ...v, status: VehicleStatus.ACTIVE } })
    console.log(`  + Vehicle: ${v.name}`)
    vehicleCount++
  }
  console.log(`\n✓ Vehicles: ${vehicleCount} created\n`)

  // ── 2. Serialized Inventory Items ─────────────────────────────────

  const serializedItems: {
    name: string
    category: EquipmentCategory
    location: string
    notes?: string
    units: { serialNumber: string; notes?: string; status?: EquipmentStatus }[]
  }[] = [
    // Manual corers (Christie drills)
    {
      name: 'Manual Corer (Christie)',
      category: EquipmentCategory.SAMPLING_EQUIPMENT,
      location: 'Piedmont SC',
      units: [
        { serialNumber: '9560', notes: 'Year 2023. Home: Piedmont SC.' },
        { serialNumber: '9562', notes: 'Year 2023. Home: Piedmont SC. Scheduled for in-house service.' },
        { serialNumber: '9563', notes: 'Year 2023. Home: Piedmont SC. Scheduled for in-house service.' },
        { serialNumber: '10637', notes: 'Year 2025. Home: Piedmont SC. Scheduled for in-house service.' },
        { serialNumber: '10995', notes: 'Year 2025. Not on site yet.' },
        { serialNumber: '10323', notes: 'Year 2025. Not on site yet.' },
        { serialNumber: '10996', notes: 'Year 2025. Not on site yet. Scheduled for in-house service.' },
        { serialNumber: '10610', notes: 'Year 2025. Not on site yet. Scheduled for in-house service.' },
        { serialNumber: '9568', notes: 'Year 2023. Not on site yet. Scheduled for in-house service.' },
        { serialNumber: '10633', notes: 'Year 2025. Not on site yet. Packed in crate (from UK).' },
        { serialNumber: '9078', notes: 'Year 2023. Not on site yet. Packed in crate (from UK).' },
        { serialNumber: '9075', notes: 'Year 2023. Not on site yet. Packed in crate (from Mexico).' },
        { serialNumber: '10325', notes: 'Year 2025. Not on site yet.' },
        { serialNumber: 'UNKNOWN-1', notes: 'Serial number unknown. Location uncertain — may be in Iowa.' },
        { serialNumber: 'UNKNOWN-2', notes: 'Serial number unknown. Location uncertain — may be in Iowa.' },
      ],
    },
    // Hand corers (Pelican 1700)
    {
      name: 'Hand Corer (Pelican 1700)',
      category: EquipmentCategory.SAMPLING_EQUIPMENT,
      location: 'Piedmont SC',
      units: [
        { serialNumber: '001' },
        { serialNumber: '002' },
      ],
    },
    // Ulefone x13 phones
    {
      name: 'Ulefone x13 (Field Phone)',
      category: EquipmentCategory.ELECTRONICS_GPS,
      location: 'Piedmont SC',
      notes: '+1 extra unit from Mexico.',
      units: Array.from({ length: 8 }, (_, i) => ({ serialNumber: String(i + 1).padStart(2, '0') })),
    },
    // Garmin Glo2
    {
      name: 'Garmin Glo2 (GPS Receiver)',
      category: EquipmentCategory.ELECTRONICS_GPS,
      location: 'Piedmont SC',
      notes: '+3 extra units as back-ups.',
      units: Array.from({ length: 8 }, (_, i) => ({ serialNumber: String(i + 1).padStart(2, '0') })),
    },
    // Garmin Montana 700
    {
      name: 'Garmin Montana 700 (GPS)',
      category: EquipmentCategory.ELECTRONICS_GPS,
      location: 'Piedmont SC',
      notes: '+1 extra unit from Mexico.',
      units: Array.from({ length: 8 }, (_, i) => ({ serialNumber: String(i + 1).padStart(2, '0') })),
    },
    // Tool sets
    {
      name: 'Field Tool Set (Drill + Digital Caliper)',
      category: EquipmentCategory.HAND_TOOLS,
      location: 'Piedmont SC',
      units: [
        { serialNumber: 'SET-01', notes: 'Dewalt drill.' },
        { serialNumber: 'SET-02', notes: 'Dewalt drill.' },
        { serialNumber: 'SET-03', notes: 'Bauer drill (Harbor Freight).' },
        { serialNumber: 'SET-04', notes: 'Bauer drill (Harbor Freight).' },
        { serialNumber: 'SET-05', notes: 'Bauer drill (Harbor Freight).' },
      ],
    },
    // Indigo iPads
    {
      name: 'Indigo iPad',
      category: EquipmentCategory.ELECTRONICS_GPS,
      location: 'Bill McClain',
      notes: 'Indigo Ag owned — not Agricarbon property. Tracked for field ops coordination only.',
      units: Array.from({ length: 5 }, (_, i) => ({
        serialNumber: String(i + 1).padStart(2, '0'),
        notes: 'Indigo Ag owned.',
      })),
    },
  ]

  let itemCount = 0
  let unitCount = 0
  const supportsInventoryUnit = await prisma.inventoryUnit.findFirst().then(() => true).catch(() => false)

  for (const itemDef of serializedItems) {
    const existing = await prisma.inventoryItem.findFirst({ where: { name: itemDef.name } })
    if (existing) {
      console.log(`  SKIP (exists): ${itemDef.name}`)
      continue
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name: itemDef.name,
        category: itemDef.category,
        itemType: 'SERIALIZED',
        quantity: itemDef.units.length,
        status: EquipmentStatus.AVAILABLE,
        location: itemDef.location,
        notes: itemDef.notes ?? null,
      },
    })
    itemCount++
    console.log(`  + Item: ${itemDef.name} (${itemDef.units.length} units)`)

    if (supportsInventoryUnit) {
      for (const u of itemDef.units) {
        await prisma.inventoryUnit.create({
          data: {
            inventoryItemId: item.id,
            serialNumber: u.serialNumber,
            status: u.status ?? EquipmentStatus.AVAILABLE,
            notes: u.notes ?? null,
          },
        })
        unitCount++
      }
    }
  }
  console.log(`\n✓ Serialized items: ${itemCount} created, ${unitCount} units\n`)

  // ── 3. Consumable Items ───────────────────────────────────────────

  const consumables: {
    name: string
    category: EquipmentCategory
    quantity: number
    notes?: string
  }[] = [
    // Wintex accessories
    { name: 'Wintex Coring Tube (Probe)', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 13, notes: '+4 additional (2 per Can-Am as spares).' },
    { name: 'Wintex Cutting Head Tip', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 11 },
    { name: 'Wintex Top Hat', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 6 },
    { name: 'Wintex Striker (Dog Bone)', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 5 },
    { name: 'Wintex Hydraulic Hammer', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 3 },
    { name: 'Wintex Hydraulic Hammer Clamp/Bracket', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 4 },
    { name: 'Wintex Bracket (for Clamp)', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 3 },
    { name: 'Wintex O-Ring (for Cutting Head Tip)', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 53 },
    { name: 'Wintex 3-Pronged Retaining Clip', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 6 },
    // Manual corer accessories
    { name: 'Manual Corer Tube (Probe)', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 17, notes: '13 Christie units in Piedmont.' },
    { name: 'Manual Corer Cutting Head Tip', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 17, notes: '13 Christie units in Piedmont.' },
    { name: 'Manual Corer Collar', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 16, notes: '13 Christie units in Piedmont.' },
    { name: 'Manual Corer Foot Jack', category: EquipmentCategory.SAMPLING_EQUIPMENT, quantity: 12, notes: '1 damaged (excluded from qty). 13 Christie units in Piedmont.' },
    // Field supplies
    { name: 'Cardboard Box (Light Duty)', category: EquipmentCategory.STORAGE, quantity: 16 },
    { name: 'Cardboard Box (Heavy Duty)', category: EquipmentCategory.STORAGE, quantity: 75, notes: '5 bundles @ 15 each.' },
    { name: 'Bakery Bag (Indigo projects)', category: EquipmentCategory.STORAGE, quantity: 1000, notes: '4 boxes @ 250 each.' },
    { name: 'GWB Sampling Bag', category: EquipmentCategory.STORAGE, quantity: 3000, notes: '3 boxes @ 1000 each.' },
    { name: 'Tape Gun', category: EquipmentCategory.OTHER, quantity: 5 },
    { name: 'Roll of Tape', category: EquipmentCategory.OTHER, quantity: 3 },
    { name: 'Vehicle Ramp', category: EquipmentCategory.OTHER, quantity: 5 },
    { name: 'Strap (Heavy Duty, Ratchet + Strap)', category: EquipmentCategory.OTHER, quantity: 16 },
    { name: 'Strap (Light Duty, Ratchet + Strap)', category: EquipmentCategory.OTHER, quantity: 12 },
  ]

  let consumableCount = 0
  for (const c of consumables) {
    const existing = await prisma.inventoryItem.findFirst({ where: { name: c.name } })
    if (existing) {
      console.log(`  SKIP (exists): ${c.name}`)
      continue
    }
    await prisma.inventoryItem.create({
      data: {
        name: c.name,
        category: c.category,
        quantity: c.quantity,
        status: EquipmentStatus.AVAILABLE,
        notes: c.notes ?? null,
      },
    })
    console.log(`  + Consumable: ${c.name} (qty: ${c.quantity})`)
    consumableCount++
  }
  console.log(`\n✓ Consumables: ${consumableCount} created\n`)

  console.log('=== Import complete ===')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
