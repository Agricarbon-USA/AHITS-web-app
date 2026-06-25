# AHITS — Resume QA Checklist (after kit‑builder fix)

Picks up exactly where the staging QA pass stopped. Run top‑to‑bottom once the **category‑render fix** is deployed. Marks who needs to be logged in (👷 operator / 🧑‍💼 admin) and where you'll need to **switch accounts**.

State going in: Field Op 1's deployment was **ended** during the End test, so that operator currently has **no active deployment**. The fix should make rebuilding one possible again.

---

## Phase 0 — Confirm the deploy 🧑‍💼/👷 (either)
- [ ] New commit is live on staging (note the hash); login page renders (no 500).

## Phase 1 — Regression: the crash is gone 👷 Field Op 1
*This is the whole point of the patch — verify both crash sites.*
- [ ] My Rig → **Start Deployment** → step through to **Build Kit** → **renders the item list** (no "This page couldn't load"). ✔ category chips show names (e.g. "Sampling Equipment", "Storage").
- [ ] (After rebuilding a kit in Phase 2) My Rig → **Add Items** → **opens** without crashing.
- [ ] Console shows **no** `React error #31` on either screen.

## Phase 2 — Rebuild Field Op 1's deployment + kit (now unblocked) 👷 Field Op 1
*Exercises the previously‑crashing Build Kit end‑to‑end.*
- [ ] Start Deployment → Details (optional label "QA Rebuild") → **Build Rig**: select 1–2 vehicles → **Build Kit**: add a mix:
  - [ ] 1 **serialized** item (pick a specific unit)
  - [ ] 1 **consumable** with a quantity (e.g. 5)
- [ ] **Launch** → My Rig shows the new deployment with the kit. ✔ serialized rows show "Unit: …", consumables show a quantity and the correct **CONSUMABLE** chip.
- [ ] Watch for the **"Bakery Bag → Storage" chip inconsistency** — confirm whether consumables now label as CONSUMABLE vs their category (logged item).

## Phase 3 — Kit‑change permutations that were blocked 👷 Field Op 1
- [ ] **Add Items** → add another serialized unit → appears in kit (toast success).
- [ ] **Add Items** → add a consumable quantity → appears/increments.
- [ ] **Add Items** conflict path: try to add a serialized unit that was just taken elsewhere → expect the graceful **409 "unit was just taken — reselect"** (not a crash).
- [ ] Re‑confirm the already‑passing ops still work: **Log daily usage** (consumable), **Return item** (serialized → hub), **bulk Remove Items**.

## Phase 4 — Seed a second operator 🧑‍💼 admin  *(switch to admin)*
*Required for any transfer test.*
- [ ] Admin → **Users / Team Management** → create operator **"Field Op 2"** (email + 6‑digit PIN). ✔ creation succeeds; note the PIN.
- [ ] (Optional) Give Field Op 2 a deployment, or leave them as a transfer target only.

## Phase 5 — Transfer permutations 👷 → 👷  *(account switching)*
*From Field Op 1's kit to Field Op 2.*
- [ ] 👷 **Field Op 1** → My Rig → **Transfer Equipment** → Destination Operator dropdown now **lists Field Op 2** (was empty before). ✔ empty‑state bug resolved by having a target.
- [ ] Select 1 serialized + 1 consumable → add a note → submit → expect a **pending transfer** (items leave/locked in Field Op 1's kit). Console clean.
- [ ] 🧑‍💼/👷 **Switch to Field Op 2** → accept the incoming transfer → ✔ items land in Field Op 2's kit; unit status consistent.
- [ ] Repeat once and **Decline** instead → ✔ items return to Field Op 1 (verifies the decline path restores state — this is the area with the duplicate `accept`/`decline`/`[action]` handlers flagged for Wave 2; watch closely).
- [ ] (If supported) **End Deployment → Transfer disposition** for an item → creates a transfer to Field Op 2 on the way out.

## Phase 6 — Cross‑checks 🧑‍💼 admin
- [ ] **Daily‑check idempotency:** admin → daily‑check history for Truck‑01 / 06‑17 → confirm **one** row for Field Op 1 (the earlier re‑submit updated, didn't duplicate).
- [ ] **Inventory reconciliation:** the Hand Corer (Unit 002) returned during the End test should read **Available** in admin inventory; counts match unit rows.
- [ ] **Admin dashboard:** "Active Deployments" / checked‑out tiles reflect the rebuilt deployment correctly.

---

### Carry‑over issues to keep watching (from `AHITS_QA_STAGING_ISSUES.md`)
- 🟠 No photo capture on damage (daily check + check‑in) — Wave 2.
- 🟡 "Bakery Bag → Storage" chip vs CONSUMABLE labeling — Wave 2 UI.
- 🟡 React **#418** hydration warning on End transition — low priority.
- ⚪ Transfer empty‑state messaging; kit list re‑sort; sparse Pass review; optional per‑item note.
- 🟡 Condensed 9‑item checklist vs PRD ~16; no per‑vehicle‑type custom items.

**Exit criteria for this round:** Build Kit + Add Items never crash; a deployment can be built, modified, transferred (accept *and* decline), and ended cleanly; inventory counts reconcile; idempotency confirmed.
