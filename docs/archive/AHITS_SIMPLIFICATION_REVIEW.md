# AHITS — Simplification Review

Prepared 2026‑06‑17 · scope: **behavior‑preserving simplification only.**

> This review deliberately excludes feature work and roadmap/correctness items (Wave 2+). Every item below keeps the app's behavior identical — it removes duplication, dead code, or needless indirection. Each is independently shippable. Items that *would* change behavior or touch product scope are listed at the end as explicitly out of scope, so you know I saw them and left them alone.

Findings are ordered by leverage (lines removed × risk reduced ÷ effort).

---

## 1. Delete the backslash‑named junk directory tree — *highest leverage, zero risk*

There is a complete parallel tree of empty, escaped‑name directories shadowing the real routes:

```
src/app/(admin)            (admin)/dashboard  (admin)/inventory  (admin)/users
(admin)/vehicles  (admin)/maintenance  (admin)/projects  (admin)/reports
src/app/(auth)  (auth)/login
src/app/(operator)  (operator)/dashboard  (operator)/daily-check  (operator)/scan  (operator)/checkout
```

The real routes live under `src/app/(admin)/admin/…`, `src/app/(auth)/login`, `src/app/(operator)/operator/…`. The shadow tree is leftover scaffolding — all leaf dirs are empty. It's confusing to navigate, pollutes search results, and invites someone to edit the wrong file.

**Change:** verify each is empty, then delete the tree. Behavior‑preserving (nothing imports from it).
**Guard:** `find "src/app" -type d -name '*\(*' -empty -print` first; only remove empties.

---

## 2. One status vocabulary instead of three copies — *removes a whole class of drift*

The status → label and status → MUI color maps are duplicated, byte‑for‑byte, in at least three places:

- `src/app/(operator)/operator/scan/page.tsx` (`STATUS_LABELS`, `STATUS_COLORS`)
- `src/app/(admin)/admin/inventory/page.tsx` (same two maps)
- `src/app/api/deployments/[id]/vehicles/route.ts` (its own copy)

I also added a *vehicle* status map to the scan page in the last change — same pattern, now four total.

**Change:** create `src/lib/status.ts` exporting `EQUIPMENT_STATUS` and `VEHICLE_STATUS` (each `{ label, color }`), and optionally a tiny `<StatusChip status … kind />` in `src/components/shared/`. Replace the inline maps with imports. When a status's color changes, it changes in exactly one place.
**Risk:** very low — identical values, mechanical replacement.

---

## 3. One `ConfirmDialog` instead of three definitions

`function ConfirmDialog(…)` is defined independently in three admin pages:

- `src/app/(admin)/admin/settings/page.tsx:35`
- `src/app/(admin)/admin/inventory/page.tsx:117`
- `src/app/(admin)/admin/users/page.tsx:198`

They drift (the settings copy, for example, hard‑codes a red "Delete" button even when used to "Deactivate").

**Change:** lift one `ConfirmDialog` into `src/components/shared/ConfirmDialog.tsx` with props for title/body/confirm‑label/confirm‑color/loading, and import it in all three. (Good news: the **toast** layer is *already* consolidated — `useToast` in `src/components/shared/useToast.tsx` is the single Snackbar, used in 7 places. This is the model to copy.)
**Risk:** low — keep the most complete of the three as the base; verify each call site's labels.

---

## 4. A `requireAdmin()` / `requireAuth()` helper instead of 52 inline checks

The pattern below is copy‑pasted **52 times across 28 route files**:

```ts
const session = await getSession()
if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

No shared helper exists (only `getSession`). One typo (`=== 'ADMIN'` vs `!==`, or a forgotten check) is a security hole, and it's 52 chances to make it.

**Change:** add to `src/lib/auth/session.ts`:

```ts
export async function requireAuth() {
  const s = await getSession()
  return s ?? null            // callers 401 on null
}
export async function requireAdmin() {
  const s = await getSession()
  return s && s.role === 'ADMIN' ? s : null   // callers 403 on null
}
```

Then collapse each route's preamble to one line. Net: ~50 fewer branch copies, one definition of "who is an admin."
**Risk:** low, but it touches many files — do it mechanically and lean on `tsc`. (This is a refactor, not the role‑permission *changes* in the roadmap — behavior is identical.)

---

## 5. Extract `parseScannedCode()` — dedupe the QR payload parse (2 of the 3 copies are mine)

The "tolerate a URL payload, take the last path segment" logic is now in three files:

- `src/app/api/inventory/units/by-qr/[qrCodeId]/route.ts`
- `src/app/api/vehicles/by-qr/[qrCodeId]/route.ts` *(added last change)*
- `src/components/shared/QrScanField.tsx` *(added last change)*

```ts
const key = raw.includes('/') ? (raw.split(/[/?#]/).filter(Boolean).pop() ?? raw) : raw
```

**Change:** one `parseScannedCode(raw: string): string` in `src/lib/qr.ts`; import it in all three. Owning this is on me — I introduced the duplication.
**Risk:** trivial.

---

## 6. Drop the `queueSize` alias once call sites use `pending` — *minor, mine*

`useOfflineQueue` returns both `pending` and a back‑compat `queueSize` alias (same value). It exists only so I didn't have to touch `AppShell`/`OfflineBanner`/`daily-check` in one pass — and I've since updated `AppShell` and `OfflineBanner` to `pending` anyway.

**Change:** switch the remaining reader (`daily-check/page.tsx`) to `pending` and delete the alias. One name for one thing.
**Risk:** trivial.

---

## 7. One `releaseConsumableUnits()` helper for the repeated CHECKED_OUT‑flip block

The "find N `CHECKED_OUT` units for this item and flip them to `AVAILABLE`" block is hand‑written in ~5 routes (`deployments/[id]/end`, `…/items`, `…/items/[kitItemId]`, `deployments`, `transfers/[id]/decline`). They've already drifted (some exclude units in other rigs via `getUnitsInOtherRigs`, some don't).

**Change (simplification only):** extract the common shape into one helper alongside the existing `getUnitsInOtherRigs` in `src/lib/check-log-helpers.ts`, and call it from each site. This is purely de‑duplication — it does **not** attempt the consumable‑accounting *correctness* fix (that's a separate, behavior‑changing Wave 2 item and is out of scope here). Centralizing first actually makes that later fix a one‑file change.
**Risk:** low if you keep each call site's current arguments; medium if you try to unify their differences (don't — that crosses into behavior change).

---

## 8. Dead/unreachable handler: `transfers/[id]/[action]/route.ts`

There are static `accept/route.ts` and `decline/route.ts` plus a dynamic `[action]/route.ts`. The front‑end calls `/transfers/{id}/{action}` with `action ∈ {accept, decline}`, and App‑Router precedence resolves those to the **static** handlers — leaving the dynamic `[action]` handler unreachable for the values actually sent.

**Observation only:** as a pure simplification, the `[action]` route looks like dead code and is a deletion candidate. **Caveat:** confirming reachability and collapsing the trio safely is the Wave 2 correctness task (it depends on framework precedence and deserves an integration test), so I'm flagging it here but *not* recommending a blind delete in a behavior‑preserving pass. Treat this as "investigate," not "delete now."

---

## Out of scope (flagged, intentionally left alone)

These would change behavior or product scope, so they're **not** part of this simplification pass:

- **Legacy in‑app QR generation** — `downloadUnitQR` + the `qrcode` dependency + the download button in `admin/inventory/page.tsx` (lines 373, 656). The PRD's Post‑Wave‑0 update explicitly descopes generating/printing QR codes, so this is arguably contradictory code — but removing a working admin feature is a *product* decision, not a refactor. Yours to call.
- **`category` (string) vs `categoryRef` (relation)** on inventory — the by‑qr route selects both. If the string field is legacy, dropping it would simplify the model, but that's a schema/feature change with a migration, not a behavior‑preserving cleanup.

---

## Suggested order

1, 5, 6 are trivial and safe — do them first. 2 and 3 are mechanical and high‑value. 4 is the biggest win but touches the most files (do it in its own commit with `tsc` as the gate). 7 is a de‑dup that also sets up the Wave 2 fix. 8 is investigate‑only.

All eight are independently committable, each verifiable with `tsc --noEmit` + `eslint`. None require a migration or change any user‑visible behavior.
