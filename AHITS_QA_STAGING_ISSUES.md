# AHITS — Staging QA Pass (Operator Flows)

**Build:** staging `b6851d0` · **Tester:** Claude (driving the browser as **Field Op 1**) · **Date:** 2026‑06‑17
**Scope:** Daily checks, kit changes, transfer, end — permutation testing with defects mapped to the PRD/Wave queue.

Legend: 🔴 blocker · 🟠 high · 🟡 medium · ⚪ minor/polish · ✅ works

---

## 1. Daily Checks — ✅ core flows pass

| # | Permutation | Result |
|---|-------------|--------|
| A1 | Pass (all YES) + odometer + site, Polaris 450 | ✅ "Daily check submitted — Pass ✓" |
| A2 | Fail (Brakes = No) + issue summary, Truck‑01 | ✅ "Fail ✗ — admin notified" (Resend email fired) |
| A5 | Fail with **empty** summary | ✅ Blocked: "Describe the issue(s) that caused a fail" |
| A4 | Re‑submit same vehicle+date (idempotency) | ⏳ To confirm via admin daily‑check history (code uses `upsert` on a unique key) |

**Notes / smaller items:**
- ⚪ The per‑item "Describe the issue…" note is **optional** — an operator can mark an item "No" with no item‑level note as long as the overall summary is filled. Consider requiring the note on the failing item (PRD §7.4 implies a reason per failed item).
- ⚪ The **Pass** review screen is sparse (doesn't echo vehicle / odometer / site); the **Fail** review correctly lists failed items. Minor consistency polish.
- 🟡 **Checklist is condensed** — 9 items vs the PRD's ~16 (§7.4), and there are **no per‑vehicle‑type custom items**. → PRD: Per‑project/▾vehicle‑type checklists (Phase 2/3).
- 🟠 **No photo capture on damage** — failing items take a text note only; PRD §7.10 requires an in‑app photo on damage. → Wave 2 (photos end‑to‑end).

---

## 2. Kit Changes

| # | Permutation | Result |
|---|-------------|--------|
| B1 | **Add Items** (My Rig) | 🔴 **Crashes the page** |
| B3 | Return serialized item (condition = Good) | ✅ "Item returned." (unit back to hub) |
| B4 | Log daily usage (consumable, qty 3 of Bakery Bag) | ✅ "Usage logged." (17 → 14) |
| B5 | Bulk Remove Items (checkbox select) | ✅ "Remove Selected (N)" appears on selection |

**🔴 B1 — The inventory item‑picker crashes everywhere it's used (BLOCKER, broader than first thought).**
- **Repro 1:** My Rig → **Add Items** → white error page "This page couldn't load."
- **Repro 2:** My Rig → **Start Deployment** → **Build Kit** step → same crash.
- Both reproduce on `b6851d0` and emit the **same** `Minified React error #31` — *"Objects are not valid as a React child (found: object with keys {id, name})."*
- **Root cause (located):** in `src/app/(operator)/operator/my-rig/page.tsx`, `InventoryOption.category` is typed `string` (line 85) but the `/api/inventory` payload returns it as a `{id, name}` object, and it's rendered raw as `<Chip label={item.category} />` at **line 497 (Build Kit)** and **line 1298 (Add Items)**. The kit‑item chip at line 1024 already does it right: `ki.item.categoryRef?.name ?? ki.item.itemType`.
- **Fix:** render `item.categoryRef?.name ?? (typeof item.category === 'string' ? item.category : item.category?.name)` (or fix the `InventoryOption` type + map the API response to a string). Two lines.
- **Impact (high):** operators **cannot build a kit by any normal path** — neither add‑to‑existing‑kit nor build‑kit‑on‑new‑deployment. The only working way to put a serialized item in a kit is **Scan → Add to Kit**, one unit at a time, needing a physical QR; **consumables can't be added through any working UI**. This also means an operator who ends a deployment **cannot start a new one with a kit**.
- **Suggested placement:** **Wave 2 — Correctness, top of queue / hotfix.** It gates kit‑building, deployment creation, *and* transfer testing.

**Smaller items:**
- ⚪ The kit list **re‑sorts** after each action (returned/logged item jumps position) — mildly disorienting; consider stable ordering.
- 🟡 **"Bakery Bag" shows a category chip "Storage"** while peer consumables show "CONSUMABLE" — inconsistent item‑type vs category labeling in the same column. → Wave 2 (UI unification / status‑&‑type vocabulary).

---

## 3. Transfer — ⚠️ blocked by test data

- The **Transfer Equipment** wizard (Destination → Select Items → Note) opens correctly, but the **Destination Operator dropdown is empty** (the listbox has zero options) — Field Op 1 appears to be the only operator in the roster, so there is **no valid transfer target**.
- **Consequence:** the transfer *create* path can't be exercised end‑to‑end on staging as currently seeded.
- ⚪ **UX gap:** an operator with no available targets sees a blank dropdown with **no empty‑state message** ("No other operators available"). The **Next** button is correctly disabled. → Wave 2 (UI polish).
- **Action to unblock:** (1) **fix the item‑picker crash above** — until then a transferable kit can't even be assembled; (2) seed a second operator account (e.g., Field Op 2) so transfer accept/decline can be tested. (Also the prime opportunity to validate the **duplicate transfer‑handler consolidation** queued for Wave 2.)
- **Note on test state:** Field Op 1's deployment was ended during this pass and **cannot be rebuilt via the UI** because Build Kit crashes — so further operator‑kit testing is blocked until the picker is fixed.

---

## 4. End Deployment — ✅ works

- ✅ The End flow opens a rich dialog: an **overall note** (required) plus a per‑item **Disposition** (default "Return to Hub", with an optional return‑hub picker) for every kit item. Submitting returned all items to the hub and transitioned My Rig to the "No active deployment → Start Deployment" empty state. Field Op 1's deployment is now ended.
- 🟡 **Console logged `Minified React error #418`** (hydration mismatch — "HTML") during the end/transition. Non‑fatal (the page rendered correctly), but a server/client render mismatch — likely a date/relative‑time field. Worth a low‑priority look. → Wave 2/3 polish.
- Not separately tested: per‑item disposition variety (Transfer / Inoperable) on end — Transfer disposition would also need a second operator.

---

## Priority summary for the PRD queue

| Severity | Issue | Where it goes |
|----------|-------|---------------|
| 🔴 Critical | Add Items crashes (React #31, category object render) | **Wave 2 — Correctness (expedite)** |
| 🟠 High | No photo capture on damage (daily check + check‑in) | Wave 2 — Photos end‑to‑end |
| 🟡 Medium | "Bakery Bag → Storage" chip vs CONSUMABLE inconsistency | Wave 2 — UI unification |
| 🟡 Medium | Condensed checklist (9 vs ~16); no per‑type custom items | Phase 2/3 — Per‑project checklists |
| ⚪ Minor | Transfer empty‑state messaging; kit re‑sort; sparse Pass review; optional per‑item note | Wave 2 — UI polish |
| 🧪 Test gap | No 2nd operator → transfer + idempotency unverified | Seed test data |

**Net:** daily checks and kit removal/usage are solid; the **Add Items crash is the one true blocker** and should jump the Wave 2 queue. Transfer and idempotency need a second operator account to verify.
