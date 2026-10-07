# Session handoff · 2026-10-06 · fix-program **PR-1a — Lists tell the truth**

> STATUS: PR-1a **built, pushed, PR #242 OPEN, CI GREEN — NOT merged, nothing on staging from it** · WROTE: 2026-10-06
> READ-WITH: `AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md` (the build spec — PR-1a's section is what this session executed; **§0's owner decisions D-a…D-n are final, apply them, don't re-ask them**), `AHITS_SCREENING_REPORT_2026-10-05_ROOT-CAUSES.md` (the evidence: every finding ID below has its file:line there), `DECISIONS.md` (**D39** new this session; the dated **D10** note; D16, D21, D31, D38)
> BRANCH: `feature/20261006/Agricarbon-USA-pr1a-lists-tell-truth`, branched from `development` @ `e83fc7e`

---

## 1 · What shipped on the branch

**The rule (now `D39`, = the program's D-h):** a view shows everything that matches or says exactly how much it is not showing.

| Piece | File |
|---|---|
| `parsePagination()` reports `clamped`; new `listResponse()` → `{ data, total, page, pageSize, truncated }` | `src/lib/validation.ts` |
| The envelope, on the ten routes that already returned `{ data }` | `api/inventory`, `api/maintenance`, `api/notifications`, `api/admin/alerts`, `api/status-links`, `api/daily-check`, `api/users`, `api/hubs`, `api/projects`, `api/deployment-requests` |
| `useListQuery` — page/pageSize (25/50/100, default 100), page in the URL, page reset on filter change, `reload({ bypassCache })` | `src/hooks/useListQuery.ts` (new) |
| `PagedTable` — "Showing a–b of N", first/last buttons, pager inside the `Paper`, a plain-words note when a list is capped | `src/components/ui/PagedTable.tsx` (new) |
| Maintenance: server-side `?tab=`, facet counts, paged rows, deep-link by id | `admin/maintenance/page.tsx`, `api/maintenance/route.ts` |
| `GET /api/maintenance/[id]` — did not exist | `api/maintenance/[id]/route.ts` |
| Inventory: paged, **Just added** pin, **Show retired** switch, RETIRED excluded by default, Retire action hidden | `admin/inventory/page.tsx`, `api/inventory/route.ts` |
| Honest drawer cap label (L-12) | `admin/vehicles/page.tsx` |

**Closes:** B2 · L-1/C-1/U-4/P-11 · L-3 · L-4 · L-11 · L-12 · L-13 · L-14. **L-5** and **L-6/C-3** have their honest server numbers here (the real `count()` behind each capped read) and are **rewired at the bell and the dashboard banner in PR-1b**.

### Four decisions inside PR-1a a later session should not undo

1. **A hard-capped read passes a real `count()`.** `/api/notifications` (30), `/api/admin/alerts` (50) and `/api/status-links` (100) are capped with no page 2. Passing `total = data.length` would have made `truncated` compute `false` on a list that is demonstrably cut off — i.e. PR-1a would have manufactured the exact false confidence L-5/L-6 is about. Each now runs its own `count()` and reports `truncated: true`. The caps are named constants so the number and the label cannot drift.
2. **`/api/maintenance` defaults to NO tab filter.** `my-deployment/page.tsx:244` calls `/api/maintenance?rigId=…` with no `tab`; a `damage` default would have silently dropped that surface's scheduled tasks, and **D21** forbids editing my-deployment to compensate. The admin page sends `tab=damage` explicitly.
3. **`useListQuery` does not call `useSearchParams`.** That hook forces the client tree up to the nearest `Suspense` boundary to be client-rendered; `admin/inventory` has one, **`admin/maintenance` does not**. `page` is therefore React state, seeded once from `window.location.search` and mirrored with `router.replace` (no boundary requirement). This is also what makes the page index testable under the jsdom harness, which mocks `next/navigation` statically.
4. **The automatic page reset on a filter change is state-only, and the URL's `page` key is cleared by the caller in the same `setFilters` patch.** A filter change is usually itself a `router.replace`; a second concurrent replace reading `window.location` would race it and one would commit a stale query. Inventory therefore passes `page: ''` alongside each filter in one history-replace (`useUrlFilters` is built for multi-key patches), and Maintenance, which has no URL filters, calls `setPage(0)` from its own tab handler.
   **This one was got wrong first, and is the thing to know about this PR.** The first cut wrote the rule in a comment and then left `setPage(0)` next to all six `setFilters` calls anyway. `setFilters` builds its replace from Next's `searchParams` + the patch; `setPage(0)` builds its own from `window.location.search`, which Next has not committed yet because a replace goes through a transition. The second replace lands last carrying the **old** filters, `useUrlFilters` reads the URL back as its source of truth, and **picking a Category silently did nothing — the list came back unfiltered.** On one of the two pages PR-1a exists to fix. Two things close it: the six call sites now call `setFilters` alone, and `syncPageToUrl` no-ops when the query string it computed already equals the current one (which also stops a replace firing on every search keystroke). The jsdom harness could not see it by default — `useSearchParams` is mocked statically so no test exercised a URL-filter change, and with no `?page=` in the test URL the no-op guard hides the second replace anyway. The regression test therefore **starts at `?page=3`**, which is what makes the second replace differ from the current URL and actually fire. Confirmed both ways: 2 replaces with `setPage(0)` put back, 1 with it removed.

### Deliberately NOT done (and why)

- **`/api/deployments` and `/api/transfers` keep their bare-array shape.** Operator surfaces read them as arrays and `src/app/sw.ts` caches `/api/deployments` NetworkFirst for 7 days — an envelope would blank Today / My Deployment offline. Any **new** reader uses `Array.isArray(json) ? json : json.data`. (`useListQuery` already tolerates both.)
- **Retiring an item is HIDDEN, not fixed.** `ITEM_RETIRE_ENABLED = false` in `admin/inventory/page.tsx` gates both the row action and the drawer button. Today the action writes a flag nothing reads (B1/S-3) under copy that describes something that never happens ("All available units will be marked retired", U-1). The semantics are **PR-3b**'s, with `asset-status.ts`; **PR-3b flips that constant to `true` in the same commit that makes it true**, and replaces the confirm copy. The list half of **D-a** (hide retired behind a switch) is done here.
- **`admin/inventory` and `admin/deployments` were not split.** PR-1a materially touches the first and PR-1b the second — D10's demand signal — and D10 is deliberately not triggered. Recorded as a dated owner note under **D10** per the program's **D-k** and CLAUDE.md's never-act-against-an-ACTIVE-decision rule. **Repeat this in every handoff of the program.**
- **`my-deployment/page.tsx`, `src/app/sw.ts`, `tests/offline/**` untouched** (D21 + house rule).

---

## 2 · Tests and what was actually verified

**New: 52 tests** — 27 jsdom (`npm run test:ui`) + 25 node (`npm test`, CI).

| File | Env | Covers |
|---|---|---|
| `tests/components/pr1a-list-query.test.tsx` | jsdom | `useListQuery`: default page 1 @ 100, page change → URL + refetch, **page reset on filter change** (every read under the new filter is `page=1`), **pageSize change refetches with `page=1`**, **`cache: 'reload'` only on `reload({ bypassCache: true })`**, `truncated`/`facets` passthrough. `PagedTable`: caption on the first and last page, 25/50/100, first/last buttons, the capped note only when there is no further page, and the empty message |
| `tests/components/pr1a-inventory-just-added.test.tsx` | jsdom | one page of 100 captioned against the server total; `includeRetired=1` only with the switch on; the **Just added** pin + New chip + re-read from `GET /api/inventory/<id>`; never shown twice; cleared on the next search; **exactly ONE history replace per URL-backed filter change, starting from `?page=3`** (the double-replace guard — item 4 above); **no row-level Retire, Edit still there** |
| `tests/components/pr1a-maintenance-tabs.test.tsx` | jsdom | `tab=damage` on mount at pageSize 100; tab change refetches at page 1; **badges from `facets`** (12/3/1/24); caption from the server total; **`?task=` opens a task that is NOT in the loaded rows**; the closed-or-gone toast |
| `tests/pr1a-list-envelope.test.ts` | **node (CI)** | `parsePagination` (`clamped` at/over/under the cap, NaN/0/negative); `listResponse` (`truncated` mid-list vs last page, clamped-but-complete, the hard-capped 30-of-94 shape, empty); `/api/maintenance` **facet == row count for every tab**, default = all 40, unknown tab = all, soft-deleted in neither rows nor counts, `truncated` across pages, and a **30-row same-status/same-`nextDue` paging run that proves the `{ id: 'asc' }` tiebreaker** (30 ids, 30 unique); `GET /api/maintenance/[id]` — found, scalar rig/reporter refs resolved, 404 for missing **and for soft-deleted**, costs stripped for an operator, 401 unauthenticated |

**Verified locally:** `tsc --noEmit` clean · `eslint .` **0 errors** (48 warnings, all the pre-existing `set-state-in-effect` advisory) · `next build` compiles · the pure `parsePagination`/`listResponse` cases run green under `tsx` · `npm run test:ui` **returns to its exact baseline** (see below) with the 27 new jsdom tests passing.

**CI on PR #242 is GREEN — all four checks** (`verify / Lint, type-check & build` · `verify / Tests` · `migration-safety` · the W0-10 DROP guard). That run is what actually proved the two things this laptop could not:

1. **The node DB suite ran for the first time in CI and passed** — `tests/pr1a-list-envelope.test.ts`, **25 tests**, against the Postgres 16 service container. There is no local Postgres/Docker here (`npm test` is CI-only in this environment), so until that run its DB assertions were unexercised. 55 test files / all passing in both jobs.
2. **The 82 local `test:ui` failures are confirmed local-only** — the same 55 files pass in CI. On this laptop they fail before and after this diff: `window.localStorage` is `undefined` under the locally installed jsdom (e.g. `tests/components/useAuth-logout.test.tsx:59`). The count is **identical at `e83fc7e` with the branch stashed**, and CI was green on those files at that commit, so it is a local environment fault, not a regression. **Do not change app code for it.** The one real regression this session caused was found and fixed: `PagedTable` used `React.Children.count`, which counts a `false` child as one, so a page whose rows are `{cond && […]}` never looked empty — `toArray` instead (`uxp6-item-form.test.tsx` caught it; that file is 15/15 again, unmodified).

---

## 3 · Resume points — where the next session starts

**PR-1b · pickers** is next, from the program's PR-1b section. The modules it needs now exist; what it adds:

- `GET /api/inventory?mode=options[&q=][&hubId=]` returning the **complete** pickable set (ceiling 1000, `truncated` past it), and `SearchableSelect.loadOptions(q)` used automatically when the set is truncated. **`PICKABLE_STATUSES` is `['AVAILABLE']` only until PR-3a (D-n)** — the picker may never offer a unit the server would refuse, so `mode=options` must exclude `IN_TRANSIT` for now.
- Every inventory picker onto it: `admin/deployments/page.tsx`, both `NewDeploymentDialog`s, `my-deployment/page.tsx` (**replace the picker call, do not add lines — D21**), both requests pages, `RequestComposer`, `admin/maintenance/page.tsx`. Operator pickers refetch on dialog open (L-10); a failed load shows a retry, not an empty list for the session (L-16).
- Operator pickers move to `/api/operators` (active only), never `/api/users` (L-7, picker half; the server guard is PR-3b).
- **The two rewires PR-1a left for you:** the dashboard alert banner reads `stats.pendingAlertsCount` and `/api/dashboard/feeds` returns server `count()`s rather than `.length` of a `take: 15` (L-6/C-3/C-4); the bell reads the envelope and shows "N unread · showing 30" with **Load more** (L-5). **The honest `total` and `truncated` they need are already on the wire** — `/api/admin/alerts` and `/api/notifications` carry a real `count()` as of this PR.
- Useful here: the existing `pageSize=200` picker fetches are clamped to 100 by `parsePagination` and now also come back `truncated: true` — a cheap way to confirm which callers are still on the capped path.

**Then, in order and not reordered:** 2 (counts) → 3a (status modules + writers) → 3b (guards + admin UI, incl. flipping `ITEM_RETIRE_ENABLED`) → 4 (signals) → 5 (screens).

### Owed by Max on PR-1a

1. **Review and merge** — merge is the deploy (D16), in the evening (D31). Nothing reaches staging until then.
2. **The smoke, four things:** Inventory says "Showing 1–100 of N" and an item you add appears straight away at the top under *Just added*; the Maintenance **Damage** tab lists every open repair and its count matches the dashboard card; clicking **View** on a damage alert opens that repair (and a closed one says so instead of doing nothing); and **on Inventory, pick a Category — the rows narrow and the URL keeps `?categoryId=`.** That last one is the bug found mid-session (§1 item 4); jsdom can only prove "one history replace", so it wants a real browser.
3. **Worth running before PR-1b** (read-only, Supabase SQL editor — both queries are in the screening report §7): tasks-by-status tells you whether the Maintenance page is lying on staging *today*; unresolved-alerts-by-type tells you whether the dispatcher is already at risk of the PR-4 starvation bug (P-2).

---

## 4 · Docs changed this session

- **`DECISIONS.md`** — new **D39** (= D-h, the list rule, with the two exempt bare-array routes written down); dated owner note under **D10** (= D-k).
- **`STATUS.md`** — new dated RESUME-BOX bullet, a §3 row for PR-1a (open, not merged) incl. the local-jsdom caveat, a §4 row putting the seven-PR queue at the top of the build order.
- **`AHITS_PILOT_FLOOR_TODO.md`** — Part 4 item 4: the fix program as seven tickable plain-English rows, 1a ticked as built with Max's part spelled out.
- **`00_START_HERE.md`** — two routing rows (build spec / evidence) and both docs added to the Reference tier, with the superseded bugfix packet named.
- **`AHITS_JULY_TRIAL_CLEANUP_2026-09-07.md`** — the three corrections the program asked for: **A5** `status::text` on both UNION arms; **C2** sets `"activeKey" = NULL` (leaving it set means the next cron pass sees a live dedup key and never re-raises a condition that is still true — and PR-4 makes `resolved = false ⇔ activeKey IS NOT NULL` a DB CHECK an uncorrected run would violate) with the undo rebuilding `type:sourceTable:sourceId`; **C4** says **Decline** (the admin Requests button; "Deny" is the per-line verb inside the hub fulfilment checklist — a different control).
- The three 2026-10-05 docs (screening report, fix program, bugfix packet) were **untracked at session start** and are committed as this branch's first commit, per CLAUDE.md.

`Claude outputs/` (two `.sql` files from an earlier session) is still untracked and was left alone — it is not `*.md`, and sweeping an unreviewed directory into the repo is not this PR's business.
