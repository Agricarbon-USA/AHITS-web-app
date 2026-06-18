# Claude Code Instructions — Sprint 1: Settings + Rigs/Kits/Deployments

## Overview

This sprint implements two features together. They must be done in strict order because
the Settings migration changes the `InventoryItem` schema, and the Rigs/Kits models build
on top of the updated schema.

Full detail for each feature lives in the referenced files. This file defines the combined
sequence and highlights cross-feature dependencies.

**Reference files (read both before starting):**
- `CLAUDE_SETTINGS_FEATURE.md` — converts EquipmentCategory and HubLocation from hardcoded
  enums to admin-editable database tables
- `CLAUDE_RIGS_KITS_FEATURE.md` — adds Rig, Kit, and Deployment tracking with full
  operator and admin workflows

---

## Build sequence — follow this order exactly

### Phase 1 — Settings schema migration (do first, before any Rigs/Kits work)

Follow Step 1 from `CLAUDE_SETTINGS_FEATURE.md` exactly:

1. Add `Category` and `Hub` models to `prisma/schema.prisma`
2. Update `InventoryItem`: replace `category EquipmentCategory` + `hubLocation HubLocation?`
   with `categoryId String` + `category Category @relation(...)` + `hubId String?` +
   `hub Hub? @relation(...)`
3. Delete the `EquipmentCategory` enum and the `HubLocation` enum from the schema
4. Run `npx prisma migrate dev --name editable-dropdowns --create-only`
5. Replace the generated migration SQL with the custom SQL from `CLAUDE_SETTINGS_FEATURE.md`
   (it seeds the category and hub records and backfills existing inventory items)
6. Run `npx prisma migrate dev` to apply it

Do not proceed to Phase 2 until the Settings migration succeeds.

---

### Phase 2 — Rigs/Kits schema migration

Follow Step 1 from `CLAUDE_RIGS_KITS_FEATURE.md`:

1. Add `Rig`, `RigVehicle`, `Kit`, `KitItem` models to `prisma/schema.prisma`
2. Add the required relations to `User`, `Vehicle`, `Project`, and `InventoryItem`
3. Run `npx prisma migrate dev --name rigs-kits-deployments`

Then run `npx prisma generate` once to update the client for both migrations.

---

### Phase 3 — Settings APIs

Follow Step 2 from `CLAUDE_SETTINGS_FEATURE.md`:

- `src/app/api/categories/route.ts`
- `src/app/api/categories/[id]/route.ts`
- `src/app/api/hubs/route.ts`
- `src/app/api/hubs/[id]/route.ts`

---

### Phase 4 — Update existing inventory API and pages for new schema

Follow Step 3 from `CLAUDE_SETTINGS_FEATURE.md`:

- Update `src/app/api/inventory/route.ts`: replace `category`/`hubLocation` enum filters
  with `categoryId`/`hubId` FK filters; add `include: { category: true, hub: true }` to
  queries; update POST createSchema
- Update `src/app/(admin)/admin/inventory/page.tsx`: fetch categories and hubs from API;
  replace hardcoded CATEGORY_LABELS/HUB_LABELS maps with dynamic values from relations
- Update `src/app/(operator)/operator/inventory/page.tsx`: same dynamic fetch changes

---

### Phase 5 — Shared component

Follow Step 2 from `CLAUDE_RIGS_KITS_FEATURE.md`:

- Create `src/components/shared/NotePhotoDialog.tsx`

This component is used throughout both the admin and operator deployment pages. Build it
before either page.

---

### Phase 6 — Rigs/Kits APIs

Follow Step 3 from `CLAUDE_RIGS_KITS_FEATURE.md`:

- `src/app/api/deployments/route.ts`
- `src/app/api/deployments/[id]/route.ts`
- `src/app/api/deployments/[id]/end/route.ts`
- `src/app/api/deployments/[id]/transfer/route.ts`
- `src/app/api/deployments/[id]/vehicles/route.ts`
- `src/app/api/deployments/[id]/items/route.ts`

---

### Phase 7 — Admin pages

Build in this order:

1. **Settings page** — follow Step 4 from `CLAUDE_SETTINGS_FEATURE.md`:
   `src/app/(admin)/admin/settings/page.tsx`

2. **Deployments page** — follow Step 4 from `CLAUDE_RIGS_KITS_FEATURE.md`:
   `src/app/(admin)/admin/deployments/page.tsx`

---

### Phase 8 — Operator page

Follow Step 5 from `CLAUDE_RIGS_KITS_FEATURE.md`:

- `src/app/(operator)/operator/my-rig/page.tsx`

---

### Phase 9 — Navigation updates

Make all nav changes in a single pass:

**`src/components/admin/AdminNav.tsx`** — two additions:
- Add `Deployments` between Inventory and Vehicles (from `CLAUDE_RIGS_KITS_FEATURE.md`)
- Add `Settings` at the end before Reports (from `CLAUDE_SETTINGS_FEATURE.md`)

Final admin nav order:
```
Dashboard → Inventory → Deployments → Vehicles → Maintenance → Projects → Users → Settings → Reports
```

**`src/components/operator/OperatorNav.tsx`** — one addition:
- Add `My Rig` between My Dashboard and Equipment (from `CLAUDE_RIGS_KITS_FEATURE.md`)

Final operator nav order:
```
My Dashboard → My Rig → Equipment → Daily Check → Check Out / In → Scan QR
```

---

### Phase 10 — Type check and fix

```bash
npm run type-check
```

Fix all errors before stopping. Common things to watch for:
- The `EquipmentCategory` and `HubLocation` enum types no longer exist after Phase 1 —
  any remaining imports of them will error
- `item.category` is now a `Category` object (`{ id, name }`) not an enum string —
  any code still treating it as a string will error
- `item.hub` is now a `Hub` object or null — same issue
- `RigVehicle.addNote` is required (non-nullable) — ensure all `RigVehicle` creates
  include it

---

## All files created or modified in this sprint

| File | Feature | Action |
|------|---------|--------|
| `prisma/schema.prisma` | Both | Add Category, Hub, Rig, RigVehicle, Kit, KitItem; update InventoryItem; remove 2 enums |
| `prisma/migrations/.../migration.sql` | Settings | Custom SQL with seed data and backfill |
| `src/app/api/categories/route.ts` | Settings | Create |
| `src/app/api/categories/[id]/route.ts` | Settings | Create |
| `src/app/api/hubs/route.ts` | Settings | Create |
| `src/app/api/hubs/[id]/route.ts` | Settings | Create |
| `src/app/api/inventory/route.ts` | Settings | Update filters + schema |
| `src/app/(admin)/admin/inventory/page.tsx` | Settings | Dynamic category/hub dropdowns |
| `src/app/(operator)/operator/inventory/page.tsx` | Settings | Dynamic category/hub dropdowns |
| `src/components/shared/NotePhotoDialog.tsx` | Rigs/Kits | Create |
| `src/app/api/deployments/route.ts` | Rigs/Kits | Create |
| `src/app/api/deployments/[id]/route.ts` | Rigs/Kits | Create |
| `src/app/api/deployments/[id]/end/route.ts` | Rigs/Kits | Create |
| `src/app/api/deployments/[id]/transfer/route.ts` | Rigs/Kits | Create — initiates pending TransferRequest |
| `src/app/api/transfers/route.ts` | Rigs/Kits | Create — list transfer requests |
| `src/app/api/transfers/[id]/route.ts` | Rigs/Kits | Create — DELETE to cancel |
| `src/app/api/transfers/[id]/accept/route.ts` | Rigs/Kits | Create — accept and execute |
| `src/app/api/transfers/[id]/decline/route.ts` | Rigs/Kits | Create — decline |
| `src/app/api/deployments/[id]/vehicles/route.ts` | Rigs/Kits | Create |
| `src/app/api/deployments/[id]/items/route.ts` | Rigs/Kits | Create |
| `src/app/(admin)/admin/settings/page.tsx` | Settings | Create |
| `src/app/(admin)/admin/deployments/page.tsx` | Rigs/Kits | Create |
| `src/app/(operator)/operator/my-rig/page.tsx` | Rigs/Kits | Create |
| `src/components/admin/AdminNav.tsx` | Both | Add Deployments + Settings |
| `src/components/operator/OperatorNav.tsx` | Rigs/Kits | Add My Rig |

**Do not touch any other files.**

---

## Definition of done

**Settings:**
- [ ] `npx prisma migrate dev` succeeds (custom SQL applied, seed data present)
- [ ] `GET /api/categories` returns 7 seeded categories
- [ ] `GET /api/hubs` returns 2 seeded hubs (Piedmont SC, Waterloo IA)
- [ ] Inventory API uses `categoryId`/`hubId` filters, not enum filters
- [ ] Admin and operator inventory pages load categories and hubs from API
- [ ] Admin can add, rename, and delete categories from the Settings page
- [ ] Deleting a category in use shows an error toast, does not delete
- [ ] Admin can add, edit, and deactivate hubs from the Settings page
- [ ] Settings link in admin nav

**Rigs/Kits/Deployments:**
- [ ] Schema includes `TransferRequest`, `TransferVehicle`, `TransferItem` models and `TransferStatus` enum
- [ ] `POST /api/deployments` works for both admins (any operator) and operators (self)
- [ ] Note is required on all create/add/remove/transfer/end actions — API returns 400 if missing
- [ ] Bulk add/remove: multiple vehicles or items submitted with one shared note
- [ ] Consumable quantity entered via direct number input (not a spinner)
- [ ] `POST /api/deployments/:id/transfer` creates a pending TransferRequest — equipment does NOT move yet
- [ ] `POST /api/transfers/:id/accept` executes the move; `POST /api/transfers/:id/decline` cancels without moving
- [ ] Operator My Rig page shows incoming transfer banners with Accept / Decline; outgoing transfers show Cancel
- [ ] Operator transfer restricted to own rig; admin can transfer any
- [ ] `POST /api/deployments/:id/end` checks all items back in, clears vehicle assignments
- [ ] Admin deployments page: table, drawer with rig/kit edit controls, transfer dialog
- [ ] Operator My Rig page: empty state with "Start Deployment" when no active rig
- [ ] Operator can create, edit, transfer from, and end their own deployment
- [ ] My Rig link in operator nav; Deployments + Settings links in admin nav

**Both:**
- [ ] `npm run type-check` passes with zero errors
