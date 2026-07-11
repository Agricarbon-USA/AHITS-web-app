# AHITS — Wave 0, Batch 4 · Execution Log

_2026-07-03. **W0-8 API-hygiene primitives** — the contained slice (per your scoping call). The point is to tidy the shared route/data surface so the ~25 new Phase-3 routes start clean, without the large-surface refactors (the 47-route retrofit and the concurrency/partial-unique migration were deliberately deferred — see Deferred). Clean HEAD (`b66c1af`) sandbox, type-checked, linted, production-built (route-type validator included). One additive index migration._

## Verification (all green)

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `eslint` (changed files) | **0 errors** (1 pre-existing `set-state-in-effect` warning) |
| `next build --webpack` | **passes** — all 63 routes, incl. Next's route-type validator on the wrapped exports |
| Migration | `20260703010000_wave0_missing_indexes` — additive (indexes only), backward-compatible |

## What was fixed

### W0-8a · finish write-guard coverage (patch `W0-8_guards_and_maintenance.patch`)
The `writeOr404` P2025→404 sweep (#130/#132) missed three routes that still 500'd on a stale/duplicate id. Closed:
- `admin/alerts/[id]/resolve` — wrapped in `writeOr404` (→ 404 "Alert not found").
- `hubs/[id]` PATCH — the `hub.update` now maps P2025 → 404 "Hub not found" (it returns the updated row, so it uses `isRecordNotFound` directly rather than the void `writeOr404`).
- `users` POST — a duplicate email now returns **409** ("A user with this email already exists.") instead of an unhandled P2002 500. Added a shared `isUniqueViolation` helper to `api-errors.ts`.

### W0-8b · de-side-effect + paginate maintenance GET (same patch)
`GET /api/maintenance` ran a `createAlert` loop **on every read** (a GET must not write — and the cron dispatcher already raises `MAINTENANCE_OVERDUE`) and returned every task with all photos unbounded. Removed the read-side alert loop and added `parsePagination` (`take`/`skip`, clamped ≤100).

### W0-8c · harden `/api/hubs` consumers (patch `W0-8_hubs_consumer_guards.patch`)
`/api/hubs` returns an array on success but an `{error}` object on 401/500; five consumers `.map`'d it unguarded and could crash or spin. Per your "avoid regression risk" call I hardened the **consumers** (non-breaking `Array.isArray(d) ? d : (d?.data ?? [])` guards on hubs, my-rig, deployments, maintenance, users — vehicles + the two `res.ok`-checked Promise.all consumers were already safe) rather than change the response shape and risk missing a consumer at runtime. This also future-proofs them for a later `{data}` normalization.

### W0-8d · missing-index migration (patch `W0-8_missing_indexes.patch`)
`photos` had **zero** indexes (every photo include — daily-check, maintenance, inventory, vehicle drawers — was a seq scan) and `deployment_requests.requestType` was declared `@@index` in the schema but **never migrated** (drift). Added the six photo FK indexes to the schema + a migration (`CREATE INDEX IF NOT EXISTS`, idempotent) that also creates the missing `requestType` index.

### W0-8e · route primitives + exemplars (patch `W0-8_route_primitives.patch`)
New `src/lib/route-helpers.ts`: `withAuth` / `withAdmin` (run the auth check once, hand the handler a guaranteed session) and `ok(data)` / `fail(error, status)` envelope helpers — the primitives new Phase-3 routes should start from instead of copying the per-route auth preamble. Applied as **exemplars** to two routes (shape-preserving): `operators` GET (`withAuth` + `ok`, non-dynamic) and `admin/alerts/[id]/resolve` (`withAdmin`, dynamic + its new guard). **Not** a 47-route retrofit — existing routes migrate opportunistically.

## Deferred (by your scoping choice — not lost)
- **Full envelope/`withAuth` retrofit across ~47 routes** — high consistency value but a large diff with real regression surface I can't runtime-test here. The primitives now exist; retrofit incrementally.
- **Claim-first + partial-unique "one active X" invariants (FND-22/23)** — needs careful concurrency reasoning and a migration that overlaps the sign-off-gated legacy-column work (W0-10). Best done with that.
- **`/api/hubs` shape normalization to `{data}`** — the consumer guards make it safe to do later without a coordinated big-bang change.

## Apply
Batch 4 has a migration → its own branch. Independent of Batches 0–3 (the only shared file, `admin/users` + `deployments` + `maintenance` pages, is touched on different lines; if you've already applied earlier batches, apply this last and resolve the trivial hunk offsets, or apply onto clean `development`).

```bash
git checkout development && git checkout -b feature/20260703/maxwellslater-wave0-batch4
git apply outputs/wave0_batch4/wave0_batch4_ALL.patch
git commit -am "chore(api): W0-8 hygiene — write guards, maintenance GET, hub-consumer guards, indexes, route primitives"
```

(Or apply the four per-item patches for separate commits.) CI `verify` gates it; the `migrate` job applies the index migration before the new revision serves. Additive/idempotent, so backward-compatible.

## Wave 0 status after Batch 4

**Written + verified across Batches 0–4:** FND-1, 2 (+tests), 3, 7, 8, 11, 12, 14, 15/16 · W0-8 (contained) · W0-9. That is the full **implementable** core of Wave 0 — correctness, security, release-safety, offline durability, email reliability, the hub loop, and the shared API/data hygiene.

**What genuinely remains (all non-code-slice-here):**

| Item | Nature |
|---|---|
| **W0-1 · A6 device pass** | Manual, on real iOS + Android hardware. **The pilot gate.** |
| **W0-3 · merge the 3 security branches** | Already built; your push/CI (csp-nonce after a staging smoke-test). |
| **W0-8 large-surface remainder** | 47-route retrofit + concurrency invariants — deferred above, incremental. |
| **W0-10 · legacy-column retirement** | Irreversible `DROP COLUMN`; snapshot + explicit sign-off; gates invoicing attribution. |
| **W0-11 · rename + SWR + monolith split** | Larger front-end refactor; before the GPS/clock UI lands. |

With this batch, the code-implementable portion of Wave 0 is complete and delivered as verified patches (Batches 0–4). The critical path to the pilot is now **A6 on real hardware** + landing the queued PRs; the remaining Wave-0 items are either manual, credential-gated, sign-off-gated, or explicitly-deferred large refactors.
