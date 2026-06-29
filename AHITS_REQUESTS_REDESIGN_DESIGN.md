# AHITS — Requests → "Material Request + Rig Reservation" Redesign (Design Spec)

_Prepared 2026-06-25 (Session 11 discussion). The build spec for workplan §2.3 / §5 — the convergence of the deferred #31 reserve-and-stage half and the external hub portal. Grounded in the current code: `DeploymentRequest`/`DeploymentRequestLine` (raw-SQL data layer `lib/deployment-requests.ts`), the `StatusLink` capability primitive (`lib/status-links.ts`), and the cron notification dispatcher (`lib/notifications.ts`). This document is the spec; the build is sequenced into five slices (§8), each its own PR with its own CC handoff (§9)._

---

## 1. Intent (what we're building and why)

One operator-facing surface captures two real-world situations that today have no clean home:

- **Rig Reservation** — an operator reserves a rig / kit / vehicles from **a specific Hub before arriving**, so the gear is staged and waiting. Routed to the **Hub** to confirm, prepare, or decline.
- **Material Request** — an in-field operator needs consumables, replacement gear, a newly-purchased item, or a shipping label. Routed to the **Admin**, who fulfills it directly, forwards it to a Hub, or forwards it to another operator.

The mechanism is the same in both cases — a request with line items, a routing target, and a lifecycle — so it is **one model and one page** with a **mode toggle**, not two parallel features. This keeps the logic consistent (the user's north star) and reuses the tokenized StatusLink primitive that already backs work-orders and hub returns.

## 2. Current state (from source, 2026-06-25)

- **Model:** one `DeploymentRequest` (status `DRAFT/REQUESTED/STAGED/FULFILLED/CANCELLED`, `label/notes/neededBy/projectId/forOperatorId/requestedById`) + `DeploymentRequestLine` (`lineType KIT_ITEM|VEHICLE`, `categoryId/itemType/vehicleType/requestedQty`, **already-present-but-unused** `specificInventoryItemId/specificVehicleId/resolvedUnitId/resolvedVehicleId/stagedCondition`).
- **API:** `GET /api/deployment-requests` (admin sees all, operator sees own), `POST` (create, `requireAuth` — **operators can already create**), `PATCH /[id]` (`submit`/`cancel`).
- **UI:** admin-only at `/admin/requests`. Funnels to admin only; **never to a Hub**.
- **Gaps vs intent:** no `requestType` discriminator; no Hub/operator routing target; no forwarded/denied states; line items are category-only (no specific-unit field; specific-item/vehicle columns unused by the UI); no operator-facing create page; no hub portal for reservations.

## 3. Data model changes (additive; raw-SQL access, no client coupling)

All additive — existing rows keep working; backfill sets sensible defaults. Same discipline as `deployment_assignments`/`inventory_stock`: scalar columns, raw SQL, no rewire of a live reader in the expand slice.

### 3.1 New enum

```prisma
enum DeploymentRequestType {
  RESERVATION   // routes to a Hub
  MATERIAL      // routes to Admin (who may forward)
}
```

### 3.2 `DeploymentRequest` — add columns

```prisma
requestType         DeploymentRequestType @default(RESERVATION)
fulfillerHubId      String?   // RESERVATION target hub; or a MATERIAL forwarded to a hub
fulfillerOperatorId String?   // a MATERIAL forwarded to another operator
decisionNote        String?   // hub/admin note on stage/forward/deny/fulfill
decidedAt           DateTime?
fulfilledAt         DateTime?
```

### 3.3 `DeploymentRequestStatus` — add two states

Existing `DRAFT, REQUESTED, STAGED, FULFILLED, CANCELLED` plus:

```prisma
FORWARDED   // MATERIAL only: admin forwarded to a hub or operator
DENIED      // terminal: hub/admin declined
```

`STAGED` is reservation-only; `FORWARDED` is material-only. The `requestType` discriminator gates which transitions are legal (§4).

### 3.4 `RequestLineType` — add two line kinds + line columns

Existing `KIT_ITEM, VEHICLE` plus:

```prisma
NEW_PURCHASE    // an item to buy that isn't in inventory (free-text)
SHIPPING_LABEL  // a request for a shipping label / shipment
```

`DeploymentRequestLine` add:

```prisma
specificInventoryUnitId String?   // pin a specific serialized unit (the missing field)
description             String?   // free text for NEW_PURCHASE / SHIPPING_LABEL
reorderUrl              String?   // optional purchase link for NEW_PURCHASE
```

### 3.5 `StatusLink` — make it serve a request (reuse the hub-portal primitive)

```prisma
deploymentRequestId String?   // + @relation; the request a RESERVATION link fulfills
```
Add to `enum StatusLinkType`: `RESERVATION`.
Add to `ALLOWED_ACTIONS` (`lib/status-links.ts`): `RESERVATION: ['CONFIRMED', 'PREPARED', 'DECLINED']` (hub can confirm it can fulfill, mark prepared/staged, or decline). `DEFAULT_EXPIRY_DAYS.RESERVATION` ≈ 14.

### 3.6 New alert type

Add to `enum AlertType`: `MATERIAL_REQUEST`. Add a `presentAlert` case ("A material request needs your attention") and reuse `genericAlertEmail(title, message, linkUrl)` for the email body.

### 3.7 Migration + backfill

`prisma/migrations/<ts>_requests_redesign/migration.sql`:
- `ALTER TYPE` add enum values (`DeploymentRequestType` create; `DeploymentRequestStatus` add `FORWARDED`,`DENIED`; `RequestLineType` add `NEW_PURCHASE`,`SHIPPING_LABEL`; `StatusLinkType` add `RESERVATION`; `AlertType` add `MATERIAL_REQUEST`).
- `ALTER TABLE` add the columns above (all nullable / defaulted).
- **Backfill:** `UPDATE "deployment_requests" SET "requestType" = 'RESERVATION' WHERE "requestType" IS NULL` — every existing request was built as a deployment reservation, so this is correct.

> **Postgres note:** `ALTER TYPE ... ADD VALUE` cannot run inside the same transaction that then *uses* the new value. Author the enum-add statements first (each `ALTER TYPE` auto-commits), then the `ALTER TABLE`/backfill — or split into two migration files if Prisma wraps them. CC must verify the enum adds land before the backfill that references them.

## 4. Lifecycle state machine (precise; the discriminator gates legality)

Every transition is a guarded `UPDATE ... WHERE status IN (...)` (the pattern already in `transitionRequest`) so a stale client can't double-apply.

### RESERVATION (routes to Hub)
| Action | From → To | Actor | Side effects |
|---|---|---|---|
| `submit` | DRAFT → REQUESTED | operator | If `fulfillerHubId` set: issue a `RESERVATION` StatusLink + email the hub (reuse `issueStatusLink` + hub-email delivery). |
| `confirm`/`prepare` | REQUESTED → STAGED | hub (portal) or admin | Optionally set `resolvedUnitId`/`resolvedVehicleId`/`stagedCondition` per line; `decidedAt`. Notify requester (bell). |
| `decline` | REQUESTED → DENIED | hub (portal) or admin | `decisionNote`, `decidedAt`. Notify requester. |
| `fulfill` | STAGED → FULFILLED | admin/operator at pickup | `fulfilledAt`. Conversion to a real deployment = **slice R5** (couples to #29). |
| `cancel` | {DRAFT,REQUESTED,STAGED} → CANCELLED | requester or admin | Revoke any open StatusLink. |

### MATERIAL (routes to Admin)
| Action | From → To | Actor | Side effects |
|---|---|---|---|
| `submit` | DRAFT → REQUESTED | operator | `createAlert(MATERIAL_REQUEST)` → dispatcher emails admins + in-app bell. |
| `fulfill` | REQUESTED → FULFILLED | admin | `fulfilledAt`, `decisionNote`. Notify requester. |
| `forward` | REQUESTED → FORWARDED | admin | Sets `fulfillerHubId` **or** `fulfillerOperatorId`. Hub → issue `RESERVATION` StatusLink + email; operator → in-app `Notification`. |
| `decline` | REQUESTED → DENIED | admin | `decisionNote`. Notify requester. |
| `complete` | FORWARDED → FULFILLED | hub (portal) / forwarded operator / admin | `fulfilledAt`. Notify requester. |
| `cancel` | {DRAFT,REQUESTED,FORWARDED} → CANCELLED | requester or admin | Revoke any open StatusLink. |

Illegal transitions (e.g. a `prepare` on a MATERIAL request, or `forward` on a RESERVATION) are rejected by the from-status guard **and** an explicit `requestType` check in the transition function → 409.

## 5. Page IA — one surface, two modes

**Operator surface:** a new operator route (e.g. `/operator/requests`) listing the operator's own requests with status chips, plus a **"New Request"** action. The "New Request" form opens with a **segmented toggle at the top**:

- **"Reserve a rig" (Reservation)** — adapts the form to: a **required target Hub** (dropdown of active hubs), `neededBy`, optional project, optional "for operator" (defaults to self), and line items of kind **KIT_ITEM** (specific item *or* category fallback, qty, optional specific serialized unit) and **VEHICLE** (specific vehicle *or* type).
- **"Request materials" (Material)** — adapts to: no hub required (admin routes it), `notes`, `neededBy`, and line items of kind **KIT_ITEM/CONSUMABLE** (specific existing item + qty), **NEW_PURCHASE** (free-text description + optional reorder URL + qty), and **SHIPPING_LABEL** (free-text destination/details).

> **Label note (Addendum §4 open item):** the Addendum's working title was "Material Request" with a Reservation mode inside it. Recommend titling the page neutrally — **"Requests"** with the two clearly-labeled modes above — since "Material Request" as the parent of a Reservation reads oddly. Final label is a one-line call; flagged for Max.

**Admin surface (`/admin/requests`, rebuilt):** all requests, filterable by `requestType` / status / hub / requester. For a **MATERIAL** request in REQUESTED: **Fulfill**, **Forward → Hub** (hub dropdown), **Forward → Operator** (operator dropdown), **Decline**. For a **RESERVATION**: read the hub's portal progress, with an admin **override** to stage/decline and **copy/resend** the hub link. Specific-item/unit/vehicle pickers replace the category-only dropdown (the unused columns finally get a UI).

**Hub portal (`/s/[token]`, extended):** the existing tokenized page gains a `RESERVATION` render — the requested lines, `neededBy`, requester/project — with **Confirm**, **Prepare (staged)**, **Decline** actions (login-less, `actorLabel` captured), writing back the request status via `applyTransition`.

## 6. Per-party behaviour (every actor considered)

- **Operator:** creates/cancels own requests; sees status + the hub/admin decision note; gets a bell notification on stage/forward/deny/fulfill. Cannot see others' requests. Reservation availability is shown against the chosen hub's `InventoryStock` (slice R4).
- **Admin:** sees all; routes/forwards/fulfills/declines material; overrides reservations; never has to retype a hub link (copy/resend).
- **Hub:** acts only through the per-request tokenized link — no account. Confirm/prepare/decline; the link is request-scoped and least-privilege (`ALLOWED_ACTIONS.RESERVATION`).
- **Forwarded operator:** gets an in-app `Notification` with the forwarded request; marks it complete.

## 7. Cross-cutting (consistency, devices, security)

- **One vocabulary:** request status renders through `lib/status` + `StatusChip` (add a `request` kind), never bespoke.
- **Auth:** reads `requireAuth` (operator scoped to own; admin all); all admin-only writes (forward/fulfill/decline/override) `requireAdmin`; hub writes only via the token. The operator `submit`/`cancel` stay `requireAuth` + ownership (as today).
- **Offline:** request create/submit should route through the operator offline queue (`useOfflineQueue.mutate`) like other operator writes, so a field operator can file a request offline and have it sync — consistent with the rest of the operator loop. Read views show "data as of HH:MM."
- **Devices:** the operator surface inherits the operator PWA shell (bottom-nav, ≥44px targets, safe-area). The hub portal is login-less and renders on any phone browser (no install).
- **Security:** the hub portal is the only unauthenticated write path here; it reuses the StatusLink token (sha256-at-rest), least-privilege actions, and the shared-store rate limiter already protecting `/s/`.

## 8. Build sequence (expand → migrate → contract; tidy, each independently shippable)

| Slice | What | Sandbox-buildable? | Depends on |
|---|---|---|---|
| **R1 — model + API expand** | §3 schema + migration + backfill; extend `lib/deployment-requests.ts` + the two API routes to read/write the new fields and enforce the §4 guards. No behaviour change to existing flows. | **Yes** (additive, raw-SQL, `tsc`/`lint` verifiable) | — |
| **R2 — operator surface** | `/operator/requests` list + "New Request" form with the mode toggle and specific item/unit/vehicle pickers; route create/submit through the offline queue. | **Yes** (UI) | R1 |
| **R3 — routing + hub portal** | Material→admin alert (dispatcher, new `MATERIAL_REQUEST`); reservation/forward→hub `RESERVATION` StatusLink + `/s/[token]` portal render + write-back; rebuilt `/admin/requests` with fulfill/forward/decline/override. | **Mostly** (portal page additive; the dispatcher cron is verified in CI) | R1, R2 |
| **R4 — hub-stock binding** | Per-hub availability check at submit; **hard-reserve** (decrement a reserved counter on `InventoryStock`) on stage; release on cancel/deny. | Yes | **Multi-hub MIGRATE slice** |
| **R5 — checkout conversion** | STAGED reservation → real deployment (Kit/Rig rows), the deferred #31 conversion. | Partly | **#29** (deployment model) |

R1–R3 deliver the **whole request → route → hub/admin loop end to end.** R4 and R5 are the deeper integrations, correctly gated on the multi-hub MIGRATE slice and #29 respectively — they do not block the loop from being usable.

## 9. Decisions to lock before R1 (one-liners)

1. **Page label** — "Requests" (recommended) vs "Material Request" with Reservation mode (Addendum working title).
2. **Forwarded-to-hub mechanism** — reuse the `RESERVATION` StatusLink for forwarded material too (recommended, one primitive) vs a lighter admin-internal assignment. (This spec assumes reuse.)
3. **Hard-reserve semantics (R4)** — does staging a reservation *decrement* hub stock (a true hold) or only *flag* it? (Recommend a separate `reservedQty` on `InventoryStock` so on-hand isn't oversold but the count isn't lost — decide when R4 is scheduled, after multi-hub MIGRATE.)
4. **`forOperatorId` on material** — can an admin file/forward a material request *on behalf of* an operator? (Recommend yes; the column already exists.)

---

## 10. CC build prompts — R2 and R3 (hand over after the prior slice merges)

Verified against source 2026-06-25: operator pages use `useOfflineQueue().mutate({endpoint, method, body, label})` → `{ok, queued, data, error, status}`; the portal lives at `src/app/s/[token]/page.tsx` (a `Context.type` union + an `ACTION_LABELS` map) with context built in `src/app/api/s/[token]/route.ts` and write-back via `applyTransition` in `lib/status-links.ts`; shared status colors live in `lib/status.ts` + `StatusChip`.

### R2 — operator surface (paste after R1 merges)

```
Build slice R2 of the Requests redesign on AHITS. Spec: AHITS_REQUESTS_REDESIGN_DESIGN.md §5–§6. Operator-facing UI only; no schema/migration. Must be tsc/lint clean.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-requests-operator-ui"

1. New route src/app/(operator)/operator/requests/page.tsx ('use client'), inside the operator shell:
   - List the operator's own requests from GET /api/deployment-requests (operators are already scoped to their own). Show label, requestType, status, neededBy, lineCount. Use a local status->color map for now; R3 swaps in the shared StatusChip 'request' kind.
   - "New Request" opens a full-screen Dialog with a ToggleButtonGroup at top: "Reserve a rig" (RESERVATION) | "Request materials" (MATERIAL). The form adapts per §5:
       RESERVATION: required Hub select (GET /api/hubs), neededBy (date), optional project (GET /api/projects). Lines: KIT_ITEM (item picker from GET /api/inventory — specific item + qty + optional specific serialized unit from the item's units; or category fallback from GET /api/categories) and VEHICLE (specific vehicle from GET /api/vehicles, or vehicleType).
       MATERIAL: notes, neededBy. Lines: KIT_ITEM (specific existing item + qty), NEW_PURCHASE (description + optional reorderUrl + qty), SHIPPING_LABEL (description). No hub (admin routes it).
   - Reuse the item/unit picker patterns from my-rig's NewDeploymentDialog for consistency.
   - Submit and Cancel go through useOfflineQueue().mutate (POST /api/deployment-requests with requestType + lines; PATCH /api/deployment-requests/[id] {action:'cancel'}) so a field operator can file offline and have it sync. Show queued/offline state like other operator writes.
2. Add a "Requests" entry to NAV_ITEMS in src/components/operator/OperatorNav.tsx (PlaylistAddCheck icon), href /operator/requests.
3. Keep all reads requireAuth; do not touch admin routes in this slice.

Verify: npx tsc --noEmit (0); npx eslint . (0 errors). No migration. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.
```

### R3 — routing + hub portal + admin rebuild (paste after R2 merges)

```
Build slice R3 of the Requests redesign on AHITS. Spec: AHITS_REQUESTS_REDESIGN_DESIGN.md §4–§6. This wires the routing both ways and the hub portal. tsc/lint clean; no new migration (R1 added the columns/enums).

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-requests-routing-portal"

1. Material -> admin: in the MATERIAL 'submit' path (lib/deployment-requests.ts or the PATCH route), call createAlert('MATERIAL_REQUEST', 'deployment_requests', requestId, {meta}). The cron dispatcher already emails admins + drops an in-app bell for pending alerts; R1 added the AlertType + presentAlert case.
2. Reservation/forward -> hub: on a RESERVATION submit with fulfillerHubId, and on a MATERIAL forward->hub, issueStatusLink({type:'RESERVATION', deploymentRequestId, hubId, recipientEmail: hub.email, createdById}) and email the hub (reuse the hub-email delivery pattern in lib/status-links issueHubReturnLinks, or genericAlertEmail). Forward->operator creates an in-app Notification for that operator.
3. Portal write-back: extend applyTransition in lib/status-links.ts to handle RESERVATION actions — CONFIRMED/PREPARED -> request REQUESTED->STAGED (call the R1 decide helper), DECLINED -> REQUESTED->DENIED; set decisionNote/decidedAt; notify the requester (Notification). Revoke the link on terminal.
4. Portal context + render:
   - src/app/api/s/[token]/route.ts: add a RESERVATION branch building subject {kind:'reservation', label, neededBy, requester, project, lines:[{name, qty, kind}]} via getRequest(link.deploymentRequestId). Least-privilege — no costs/emails.
   - src/app/s/[token]/page.tsx: add 'RESERVATION' to the Context.type union; add ACTION_LABELS for CONFIRMED ('Confirm we can fulfill'), PREPARED ('Mark prepared/staged'), DECLINED ('Decline'); render the reservation line list.
5. Admin rebuild src/app/(admin)/admin/requests/page.tsx: filter by requestType/status/hub/requester. MATERIAL+REQUESTED -> Fulfill / Forward->Hub (hub select) / Forward->Operator (operator select) / Decline. RESERVATION -> show portal progress + admin override (stage/decline) + copy/resend hub link. Replace the category-only dropdown with specific item/unit/vehicle pickers. All admin actions PATCH the new transition actions; server routes already gate forward/fulfill/decline on requireAdmin.
6. Shared vocabulary: add REQUEST_STATUS to lib/status.ts (DRAFT/REQUESTED/STAGED/FORWARDED/FULFILLED/DENIED/CANCELLED + colors) and a 'request' kind to StatusChip; switch both the operator (R2) and admin pages to it.

Verify: npx tsc --noEmit (0); npx eslint . (0 errors). The dispatcher cron + portal transitions are exercised in CI/staging. Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number.
```

