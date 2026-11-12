# REQ-B: Five quick fixes — admin sign-in, reservation confirm, Pick Up amounts, Transfer ticks, stale transfer card

Nov 11, 2026, against `development` @ `3d87588`. Five live bugs, one PR, one commit per fix. No migration, service-worker change or new package. `~:N` is a line hint; match the quoted text.

## Read this first
- Build only after the docs clean-up PR has merged. If `packets/README.md` is missing, stop and say so.
- REQ-C ("stay signed in") is built after this merges. They share no code or test file. Both edit `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md`. Order: REQ-B first.
- Merges are squashed: a rollback takes all five fixes back.
- Fix 5 was added on Nov 11 after the P1-1b live check saw it on the live app.

## 1. Admin lock-out
**Today.** Users → Manage account: Reset PIN on an admin, or Role = Admin on an operator, leaves a 6-digit PIN. The Admin tab refuses under 8 characters; the Field Operator tab refuses admins. That person cannot sign in.

**Change.** `src/app/api/auth/login/route.ts`: `password: z.string().min(8)` → `password: z.string().min(1)`. Nothing else: the login page has no length check; a reset admin lands on Change PIN.

**Test.** `tests/uxp3-login-lockout.test.ts`, `mode: 'admin'`: an admin with a 6-digit `pinHash` and `mustChangePin: true` → 200 `{ role: 'ADMIN', mustChangePin: true }`; an operator with a PIN, then set to ADMIN → 200; five wrong 6-digit tries → the fifth has `locked: true`.

**Keep.** `src/lib/auth/pin.ts`, the per-address limit, the generic 401s, the role check on each tab.

## 2. A reservation with a serial-numbered item cannot be confirmed
**Today.** Requests → Open checklist: no unit picker, and Confirm answers "A unit must be assigned to confirm a serialized item." The form saves kit lines with no kind (`itemType: null`); the checklist reads the kind from the line, the save step from the item.

**Change.** `src/lib/deployment-requests.ts`, in `getLineChecklist` only (~:417; `getRequest` has the same text twice and stays). In `l."itemType", l."vehicleType"::text AS "vehicleType", l."requestedQty",` replace `l."itemType",` with
```sql
CASE WHEN ii."itemType" = 'SERIALIZED' THEN 'SERIALIZED' ELSE l."itemType" END AS "itemType",
```
`ii` is already joined. Not `COALESCE`: it would also turn on "Substitute item" for counted lines.

**Test.** `tests/f3-line-checklist.test.ts` (its tests set the kind by hand). Add: a line as the form sends it, `{ lineType: 'KIT_ITEM', itemType: null, requestedQty: 1, specificInventoryItemId: <serialized item> }` → `getLineChecklist` gives `itemType: 'SERIALIZED'` and the free unit in `availableUnits`; `setLineFulfillment` CONFIRMED with that unit → ok. A counted item sent the same way → `itemType` null.

**Keep.** `setLineFulfillment`. The hub link (`/s/[token]`) uses the same read and shows the picker too. Wanted.

## 3. "Pick Up Reservation" shrinks reserved amounts
**Today.** 10 on the shelf, 8 held for the operator. The form opens on 2 and takes no more; the app records 2 and releases the other 6. The form caps at un-reserved stock, and the operator's own hold counts as reserved. The server would take 8 (`claimHeldStock`). Second case: two held lines of one item (5 and 3) open on 3.

**Change.** `src/components/operator/NewDeploymentDialog.tsx` only:
```ts
// presetItems (~:115), new loop: add up lines of the same item (now: quantity: line.qty)
for (const line of preset?.lines ?? []) {
  const prev = m.get(line.itemId)?.quantity ?? 0
  m.set(line.itemId, { itemType: 'CONSUMABLE', quantity: prev + line.qty, inventoryUnitId: null, unitLabel: null })
}
// new, after the sourceHubId state (~:173): this pick-up's held stock, at the reservation's hub only
const heldFor = (itemId: string) =>
  pickupPreset && sourceHubId === pickupPreset.hubId
    ? pickupPreset.lines.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.qty, 0)
    : 0
// re-cap effect (~:185): only the outer brackets and `+ heldFor(itemId)` are new
const hubAvail = (item.hubStock?.find((s) => s.hubId === sourceHubId)?.available ?? 0) + heldFor(itemId)
// kit row (~:369): only `+ heldFor(item.id)` is new
const hubAvail = !isSerialized ? (hubRow?.available ?? (item.availableQuantity ?? 0)) + heldFor(item.id) : 0
```
The clamp and `max: hubAvail` follow.

**Test.** New file `tests/components/reqb-pickup-amount.test.tsx` (the `useOfflineQueue` mock in `pr5b-pickup-deployed.test.tsx` returns nothing, so `launch` throws on `result.ok`). Render `NewDeploymentDialog` itself, with a hoisted `mutate` resolving `{ ok: true, queued: false }` as in `cc32-new-deployment-steps.test.tsx`; mock `useToast`, stub `fetch`. Props: `hubs` holds `h1`; one item, `itemType: 'CONSUMABLE'`, `availableQuantity: 2`, `hubStock: [{ hubId: 'h1', hubName: 'Hub', quantity: 10, reservedQty: 8, available: 2 }]`; preset 8 at `h1`. After Next the box shows 8; Pick Up → `mutate.mock.calls[0][0].body` has `quantity: 8` and `fromRequestId`; typing 12 gives 10; preset lines 5 and 3 → 8.

**Keep.** The server. The helper text ("2 available · 8 reserved"). A pick-up may add free stock on top of the reserved amount; the server already allows it.

## 4. "Transfer — Selected Gear" opens with everything ticked
**Today.** The entry screen says "You keep the deployment." The list opens fully ticked. Tap through, the other person accepts, and the sender's deployment ends (`transfers/[id]/accept/route.ts` ends an emptied deployment). Admins get the same dialog, without the entry screen.

**Change.** `src/components/shared/TransferDialog.tsx`:
- `selVehicles` and `selKitItems` (~:91-96) each start as `React.useState<Set<string>>(new Set())`.
- `disabled={step === 0 && !toOperatorId}` → `disabled={(step === 0 && !toOperatorId) || (step === 1 && selVehicles.size + selKitItems.size === 0)}`.
- Step 1, last child of `<Stack spacing={2}>`: `<Typography variant="caption" color="text.secondary">{rigVehicles.length + kitItems.length === 0 ? 'Nothing to send. Gear already waiting on a transfer is not listed.' : 'Tick what to send. If everything is sent and accepted, this deployment ends.'}</Typography>`

`src/components/operator/TransferEntryDialog.tsx`: "Send specific vehicles or kit items. You keep the deployment." → "Send specific vehicles or kit items. If everything is sent and accepted, the deployment ends."

**Test.** Must change: `tests/components/TransferEntryDialog.test.tsx` (asserts the old sentence) and `tests/components/p1-1b-screens.test.tsx`: before each "Continue to Note" click (~:78, ~:96) add `fireEvent.click(within(lineOf('GPS rover')).getByRole('checkbox'))`, the second with `'Corer'`. Add there: opens with nothing ticked and the button disabled; one tick enables it; the POST carries only that item; the caption shows.

**Keep.** "Entire rig" and its sentence. A ticked counted item starts at its full amount. Waiting gear stays hidden.

## 5. A cancelled transfer stays on the admin "Pending Transfers" card
**Today.** Admin → Deployments: Reassign Primary cancels that deployment's waiting transfers. The drawer's own card clears, but the "Pending Transfers" card at the top of the page keeps the cancelled transfer, with live Accept and Decline buttons, until the page is reloaded. Seen on the live app on Nov 11.

**Change.** `src/app/(admin)/admin/deployments/page.tsx`, in `handleReassignPrimary` only. The page-level list re-reads on the `transfers` signal (`useInvalidation(['transfers'], …)`), and this handler uses a plain `fetch` that sends none.
- Add the import `import { dispatchInvalidate } from '@/lib/invalidation'` (as `src/components/shared/TransferDialog.tsx` does).
- After `showToast(copy('deployment.reassignPrimary').success)` and before `await refresh()`, add `dispatchInvalidate(['transfers', 'deployments'])`.

**Test.** `tests/components/p1-1b-screens.test.tsx` or `tests/components/uxp6-admin-deployment.test.tsx`, whichever already renders the admin Deployments page with a pending transfer: after a successful Reassign Primary, `/api/transfers?status=PENDING` is fetched again by the page and the "Pending Transfers" card is gone when that read returns `[]`.

**Keep.** The handoff route. The drawer's own `refresh()`. No live check: the screen test covers it, and the next real Reassign shows it.

## Must not change
- Everything under "Keep". How long a sign-in lasts (REQ-C). Lockout and every sign-in error message.
- Every file under `src/app/api/` except the one line in `login/route.ts`. The checklist for counted lines and vehicles.
- `prisma/`, `src/app/sw.ts`, `next.config.ts`, `package.json`, `.github/`.
- Known, left for later. Sign-in: an admin made Field Operator needs a Reset PIN in the same save; a reset admin keeps a 6-digit PIN; a role change needs sign out and in (REQ-C). Checklist: with no free unit Confirm is shown, then refused; the unit asked for is not pre-picked; units at every hub are listed; the server does not check the unit belongs to the item. Pick Up: with none free at any hub the held line is hidden but sent in full; with two reservations of one item the oldest hold goes first; Add Items has the same clamp (`addHubAvail`, `my-deployment/page.tsx` ~:1069, ~:1093, ~:1097). Transfer: no "select all".

## How to tell it worked
After a green deploy run, in one browser window. Checks 1–5 are done signed in as ZZ Test. Type no other PIN or password.

Setup. **Owner** signs in. **Claude Code:** Users → Invite Member: "ZZ Test", Field Operator, an unused address, link to copy. Open the link, set a 6-digit PIN. Manage ZZ Test → Role = Admin → Save. Add "ZZ probe" (serial-numbered, one unit) and "ZZ bags" (counted, 10 at Piedmont). Sign out.
1. **Claude Code.** Admin tab, ZZ Test's email and PIN: the admin dashboard opens. *(fix 1, role)*
2. **Claude Code.** New Request → Reservation naming ZZ probe → Open checklist: a unit picker shows; pick the unit; Confirm works. Decline the request. *(fix 2)*
3. **Claude Code.** Reserve 8 ZZ bags at Piedmont; Confirm, Stage reservation, Fulfill. On `/operator/dashboard`, Pick Up (no vehicle): the form shows 8 and the deployment gets 8. *(fix 3)*
4. **Claude Code.** On that deployment, Transfer → Selected gear: the new sentence shows; pick a person, Next: nothing is ticked, "Continue to Note" is grey until a tick. Cancel. End the deployment, returning ZZ bags to Piedmont. *(fix 4)*
5. **Claude Code.** Manage ZZ Test → Reset PIN → Save. The session ends. Admin tab, new PIN: Change PIN opens. Set a PIN; the operator dashboard opens (expected). Sign out. *(fix 1, reset)*

Clean-up. **Owner** signs in again. **Claude Code:** Manage ZZ Test → Role = Field Operator → Save, then Deactivate account. Delete both ZZ items (if refused, say so on the PR). Until check 5 passes, never press Reset PIN on a real admin.

## Audit, merge, docs
- **Audit: yes.** Sign-in and stock: the planning Claude audits the PR before merge.
- **Merge:** no migration, no service-worker change → any time, on the owner's go.
- **Doc lines, same PR** (if a line has been edited since, it is the one on that subject):
  - `STATUS.md` In flight: delete `3. REQ-B, quick fixes: admin lock-out, reservation confirm, pickup amounts, pre-ticked transfer.` and renumber what follows.
  - `STATUS.md` Known hazards: `- On the admin Users page, do not press Reset PIN on an admin and do not change anyone's role to Admin. Either locks that person out. Add admins by invite. Fix: REQ-B.` → `- When you make an admin a Field Operator, set a Reset PIN in the same save, or that person cannot sign in.`
  - `CLAUDE.md` Known traps: `6. On the admin Users page, never "Reset PIN" an admin and never change a role to Admin. Either locks that person out. Add admins by invite.` → `6. On the admin Users page, when you change an admin to Field Operator, set a Reset PIN in the same save. The PIN tab does not take the old password.`
  - `DECISIONS.md`: `- Operators sign in with a 6-digit PIN, admins with a password of 8 or more characters. (Oct 30)` → `- Operators sign in with a 6-digit PIN. Admins sign in on the Admin tab with a password of 8 or more characters, or with a 6-digit PIN after a Reset PIN or a change of role. (Nov 11)` No "not built yet" line covers these fixes.
- **CHANGELOG line:** `- <date the PR is opened> · #<PR> · Quick fixes: an admin with a reset PIN, or an operator made Admin, can sign in; reservations with serial-numbered items can be confirmed; Pick Up keeps the reserved amount; Transfer — Selected Gear opens with nothing ticked; a cancelled transfer leaves the admin Pending Transfers card at once`

## Prompt for Claude Code
```
Read CLAUDE.md, AGENTS.md, STATUS.md and packets/REQ-B_quick-fixes-1.md (if it is missing, stop and say so). This Next.js is modified (AGENTS.md): read the relevant node_modules/next/dist/docs before writing code.

Branch from the latest origin/development. Build exactly REQ-B: one commit per fix, each with its tests. Nothing else. If a quoted line does not match the code, leave that fix out, build the rest and report it.

Gate: npm run lint, npm run type-check, npm run test:ui, npm run build (placeholder env values from .github/workflows/verify.yml). Server tests (npm test) run in CI.

Open ONE PR into development with the code, the tests, the doc lines and the CHANGELOG line REQ-B names (the PR number goes in once it exists), and the request file itself. It is untracked: `git add packets/REQ-B_quick-fixes-1.md`, by name. Write "needs audit" on the PR. Wait for CI.

Report the PR number, the CI result and anything that did not match the code. Then stop: the PR needs an audit and the owner's go before merge.

After the merge and a green deploy run, do the live checks marked "Claude Code", in order. The owner signs in himself. Post the results as one PR comment. If a check fails, stop and tell the owner. Do not revert.

Safety: named files only. Never `git add -A` or `git add .`. Never `git stash`, `git reset`, `git checkout <ref> -- .`. Never read .env files. Type no PIN or password except ZZ Test's. Do not merge without the owner's go.
```
