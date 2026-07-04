# AHITS Codebase Sweep — 2026-07-03

Full-codebase smoke test + four parallel antagonistic/architecture agents, run on branch
`feature/20260703/maxwellslater-ur010-hold-claim-hardening` (HEAD `19d1da6`, i.e.
`development` + UR-010 hardening + U3). Read-only review; no code changed by this sweep.

## Overall verdict

**Healthy core, ship-blocking bugs concentrated in the offline/frontend layer.**
- **Static gate:** clean — `tsc --noEmit` passes; `eslint src` = **0 errors** (pre-existing warnings only).
- **Security:** **Strong** — no Critical/High. Parameterized SQL throughout, fail-closed sessions, atomic PIN lockout, magic-byte uploads, auth-gated photo proxy, constant-time CRON secret.
- **Data/inventory:** **Amber** — one High concurrency hole (bulk return) + dual-write drift risk.
- **Frontend/offline:** **one Critical + several High** — the online double-submit is not actually idempotent.
- **Architecture:** sound micro-engineering; the debt is *expand-without-contract* (legacy fields + a raw-SQL shadow ORM never retired).

Fix the Critical + the four Highs before the next real field test; the rest is prioritized below.

---

## Priority fix list (do in this order)

1. **Q1 (Critical) — online double-submit isn't idempotent.** `useOfflineQueue.ts:257,271` mints a *new* Idempotency-Key on every online `mutate()` call, so two rapid taps / a retry-after-slow-request each get a distinct key → the server runs the write twice (duplicate deployment, item-add, or return). Idempotency only protected offline *replay*, not the online double-submit it advertises. Fix the key lifecycle (stable per-action key reused across a submit's retries) **and** add the missing in-flight guards in Q4/Q6.
2. **A-1 (High) — bulk consumable-return double-restore.** `deployments/[id]/items/route.ts:342-379` DELETE reads kit items outside the tx then does an *unconditional* `removedAt` update + `restoreToHub` + increment. Two concurrent bulk returns of the same item both restore → stock inflation. Fix = copy the guarded `updateMany({where:{removedAt:null}})` claim from the single-item sibling route.
3. **Q2 (High) — offline flush marches past terminal failures.** `useOfflineQueue.ts:198-209` continues to the next queued item on a 4xx terminal status; a failed placeholder-create's dependent writes then replay against a never-remapped `pending-…` endpoint (404s) and ordering breaks. Cascade terminal failures to dependents.
4. **Q3 (High) — daily-check silently wipes operator input.** `daily-check/page.tsx:114` effect depends on the `vehicles` array ref; when the `/api/deployments` fetch resolves it re-runs and resets the checklist to defaults, discarding Yes/No/notes the operator entered. Depend on `[vehicleId]`/a `vehicleType` string, not the array ref.
5. **Q4 (High) — swallowed admin mutation failures.** admin `requests` `onStage`, `deployments` `handleRemoveItem`, `inventory` status/retire: no `res.ok` check, no toast → failures look like success. Check `res.ok`, toast on error, disable button while in-flight.
6. **Inventory drift detection (arch #1, cheap insurance).** `InventoryItem.quantity` vs `Σ inventory_stock.quantity` is kept in sync by convention with *two* disciplines (resync on checkout, blind increment on return) and **no** reconciliation. Add a nightly assertion in `cron/dispatch` that flags `quantity != SUM(stock)`, and standardize returns onto `resyncItemTotal` (this also resolves A-3). This is the "disappearing inventory" bug class the team has already burned sessions on.
7. **Docs/process: fix stale CLAUDE.md.** The "⚠️ KNOWN BUG (fix before first prod promote)" prod-secret warning is **already fixed** in `deploy.yml`/`Makefile` (`$(SECRET_NS)_MIGRATE_URL`). A wrong warning trains people to ignore warnings — update it, and add a crude migration-safety lint (grep new migrations for `DROP` / `ALTER … NOT NULL`) to `verify.yml`.

---

## Findings by severity

### Critical
| ID | Area | file:line | Issue |
|----|------|-----------|-------|
| Q1 | Offline/FE | `src/hooks/useOfflineQueue.ts:257,271` | New idempotency key per online `mutate()` → online double-submit runs the write twice. |

### High
| ID | Area | file:line | Issue |
|----|------|-----------|-------|
| A-1 | Data | `src/app/api/deployments/[id]/items/route.ts:342-379` | Bulk consumable return lacks guarded claim → concurrent double-restore / stock inflation. |
| Q2 | Offline/FE | `src/hooks/useOfflineQueue.ts:198-209` | Flush continues past terminal failure → dependent-write ordering / exactly-once breaks. |
| Q3 | FE | `src/app/(operator)/…/daily-check/page.tsx:114` | Checklist reset-to-defaults on deployments fetch resolving → silent loss of operator input. |
| Q4 | Admin FE | `requests/page.tsx:322`, `deployments/page.tsx:638`, `inventory/page.tsx:531,579` | Swallowed mutation failures presented as success; also missing in-flight guards (compound Q1). |

### Medium
| ID | Area | file:line | Issue |
|----|------|-----------|-------|
| A-2 | Data | `items/route.ts:376-379` | Bulk-return total increment runs even with null hub → total rises with no backing stock row. |
| A-3 | Data | returns vs checkout | Returns blind-increment the total; checkout resyncs. The two never reconcile → silent drift. |
| Q5 | Offline | `scan/page.tsx:169-184` | Offline add-to-kit has no `placeholderId` → unremappable dependent writes. |
| Q6 | Offline | `operator/requests/page.tsx:117-144` | Queued cancel/fulfill not optimistically flipped → duplicate enqueue on re-tap. |
| Q7 | FE | `DispositionDialog.tsx:89-101` | Reset effect deps `[open]` only → stale `kitItemId`s if items change while open. |
| Q8 | FE | `operator/dashboard/page.tsx:36-44` | Request count fetched once, no focus/interval revalidation → stale. |
| Q9 | Admin FE | `deployments/page.tsx:1235-1275` | "N active" count computed over ended-only result when "Show ended" on. |
| Q10 | Admin FE | `requests/page.tsx:244-254` | Expanded per-card lines never refresh after a line action. |
| Q11 | FE | `FulfillmentChecklist.tsx:390-409` | Optimistic line update from request payload, not server truth → silent divergence on coercion. |
| Q12 | Admin FE | `hubs/page.tsx:121-147` | markReceived/dismiss/reissue lack per-row in-flight guard → double-fire. |

### Low / Info
| ID | Area | Note |
|----|------|------|
| Sec-A1 | Security | `POST /api/deployment-requests` trusts client `forOperatorId`/`fulfillerOperatorId` (no data leak; transitions still admin-gated). Validate refs; ignore `fulfillerOperatorId` unless admin. |
| Sec-A2 | Security | CSP keeps `style-src 'unsafe-inline'` (script-src correctly nonce'd). Plan removal. |
| Sec-A3 | Security | Rate limiter fails **soft** to per-instance memory on DB outage; per-account PIN lockout still bounds credential attacks. Consider fail-closed on `/api/auth/login`. |
| A-4 | Data | Legacy-consumable self-heal seed exists on deploy-create but not on mid-deploy add. |
| A-5 | Data | Two migrations share timestamp prefix `20260625060000` (deterministic today; rename to de-risk). |
| A-6 | Data | `releaseAtHub` floors at 0, silently absorbing an over-release (masks reserve-accounting drift). |
| Q13-15 | FE | Odometer accepts negative/NaN; `.json()` without `r.ok` guard; `possibleDataLoss` heuristic brittle. |

**Verified clean (not bugs):** guarded UPDATEs prevent oversell/negative stock; SERIALIZED AVAILABLE→CHECKED_OUT is status-race-safe with count reconciliation; transfer accept/decline uses atomic PENDING claim; all raw SQL is parameterized; migrations are additive/idempotent; sessions re-check `isActive`/`tokenVersion`/role every request and fail closed; the `withIdempotency` wrapper (body-hash bind, TOCTOU claim, cache-only-on-2xx/400) is sound; the UR-010 hold/claim math (just hardened) held up under this sweep.

---

## Architecture themes (Fable pass)

The micro-engineering is strong; the macro-shape is ~20 "additive, deploy-safe" EXPAND slices with almost no CONTRACT slice executed. Transitional states became permanent.

1. **Dual-write inventory total is an accident of migration treated as design.** Two sync disciplines, no DB constraint, no drift job; some reads use the total, some the rows. → Derive the total (SQL view / compute-on-read) or single-discipline + nightly invariant cron. Also retire `InventoryItem.hubId` re-anchoring on return — it fights the multi-hub model. *(Highest incident likelihood; ties to A-1/A-3.)*
2. **The raw-SQL shadow ORM's rationale expired.** ~136 raw call sites; whole subsystems (deployment-requests/holds, handoffs, status links) are raw-SQL-only with hand-maintained row types and pre-migration fallback branches. The "no client regen" rule made sense when migrations lagged deploys — but migrate-on-deploy shipped, so it's now inertia + a velocity/type-safety tax on the most invariant-critical code. → Declare the rule dead in CLAUDE.md; migrate `deployment-requests.ts` to the generated client first; keep raw SQL only for guarded multi-column UPDATEs / `FOR UPDATE` / upserts.
3. **Reserve→hold→claim carries three copies of one fact** (`reservedQty`, `heldQty`, `claimedQty`) with a named `HOLD_INVARIANT_BREACH` tripwire. Correct today, but: **cross-hub abandonment** (claim matches on hub, so checking out the same item at a different hub freezes the origin hold ≤72h) and **serialized reservations are fictional** (a "staged" serialized unit stays `AVAILABLE` and can be grabbed by anyone). → Make `reservedQty` derived; add a `RESERVED` unit status; nudge "you have a hold at Hub X" at checkout.
4. **Offline model is coherent; read-side + failure-ordering are the soft spots** (Q1/Q2 above, plus no staleness marking on cached availability reads). → Cascade terminal failures; age-badge cached GETs.
5. **Go-live discipline is tribal + the manual lies.** CLAUDE.md's scariest warning is already fixed in-tree; backward-compatible-migration discipline is enforced only by convention (no CI check); prod's first migrate replays full history (fine only if prod DB is truly empty). → Fix the doc, add migration-safety lint, gate the promote on the PIPE2 prod-DB checklist.

**Explicitly fine — don't touch:** the idempotency wrapper design, guarded-UPDATE concurrency style, request state-machine shape, JWT+tokenVersion fail-closed sessions, test-DB isolation, verify→migrate→deploy ordering, and the decision *not* to build offline conflict-resolution/CRDTs.

---

## Documentation consolidation (this pass)

Root markdown went from **~52 → 18** files. 36 historical/superseded docs moved to `docs/archive/` (nothing deleted — all tracked). New `docs/INDEX.md` maps canonical vs current-cycle vs archived. Root now holds only: project meta (README/CLAUDE/AGENTS), the PRD (+addendum), the living tracker, current Phase-3 workplans + north star, the prod cutover runbook, the active A6 checklists, and the recent Wave-0 session records/logs.

---

_Agents: 3× antagonistic (data/inventory, API/security, frontend/offline — offline-nav files intentionally skipped per active A6 work) + 1× Fable architecture. This report is the synthesis; per-agent detail available on request._
