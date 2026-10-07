# Session handoff · 2026-10-06 · fix-program **PR-1b — Lists tell the truth · pickers**

> STATUS: PR-1b **built, pushed, PR #244 OPEN, CI GREEN on all four checks — NOT merged, nothing on staging from it** · WROTE: 2026-10-06
> READ-WITH: `AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md` (PR-1b is what this session executed; **§0's owner decisions D-a…D-n are final — apply them, don't re-ask them**), `AHITS_SCREENING_REPORT_2026-10-05_ROOT-CAUSES.md` (RC-2; every finding ID below has its file:line there), `AHITS_SESSION_HANDOFF_2026-10-06_PR1A-LISTS.md` (PR-1a, merged — `b34918c`), `DECISIONS.md` (**D39**, D10's 2026-10-06 note, D16, D21)
> BRANCH: `feature/20261006/Agricarbon-USA-pr1b-pickers`, branched from `development` @ `425e278` (i.e. after #242 and #243)

---

## 1 · What shipped on the branch

**The finding with the most direct user impact in the whole program.** Every inventory picker fetched `/api/inventory?pageSize=100` or `?pageSize=200` — and `parsePagination` clamps to **100**. So:

- item 101 onward (by name) could not be **packed, reserved, scheduled or field-fixed**;
- typing its name said **"No options"**, because the filtering ran client-side over a list that never contained it;
- on `admin/deployments` it was worse than invisible: the 409-recovery diff compared the builder's picks against that same capped list, so an item past #100 was reported back as **"taken"**.

| Piece | File |
|---|---|
| `GET /api/inventory?mode=options` — the complete set, ceiling 1000, `truncated` past it | `api/inventory/route.ts` |
| `PICKABLE_STATUSES` (stub for PR-2's full file) | `src/lib/populations.ts` *(new)* |
| The one wire→picker adapter + `fetchPickerOptions` | `src/lib/inventory-options.ts` *(new)* |
| `loadOptions(q)` debounced server search, "Showing the first N — keep typing", retry on failure | `components/shared/SearchableSelect.tsx` |
| Pickers switched (7 call sites) | `admin/deployments`, `my-deployment`, `admin/requests`, `operator/requests`, `RequestComposer`, `admin/maintenance` ×2 — the two `NewDeploymentDialog`s are fed by the pages |
| `/api/operators` replaces `/api/users`, **and gains `homeHubId`** | `admin/deployments`, `api/operators/route.ts` |
| Alert banner reads `stats.pendingAlertsCount`; feed chips become real `count()`s | `admin/dashboard/page.tsx`, `api/dashboard/feeds/route.ts` |
| Bell paged: "N unread · showing X of Y" + **Load more** | `api/notifications/route.ts`, `NotificationBell.tsx` |

**Closes:** L-2 · L-5 · L-6/C-3/C-4 (counts half) · L-7 (picker half) · L-10 · L-16.

### Six decisions a later session should not undo

1. **`mode=options` takes its own path BEFORE `parsePagination` runs.** A picker is a set, not a page. If a later edit reinstates `take: pageSize` on that branch it rebuilds the exact cap this PR exists to remove; there is a node test (`pageSize=10&page=3` still returns 101) that will catch it.
2. **`PICKABLE_STATUSES` lives in `src/lib/populations.ts`, which is otherwise a stub.** D-n names that file, and the point of D-n is that one edit widens pickability everywhere at once. **PR-2 fills the file in** (`ACTIVE_UNIT`, `PICKABLE_UNIT`, `LIVE_KIT_ITEM`, `OPEN_TASK`, …); **PR-3a widens this one constant to `['AVAILABLE','IN_TRANSIT']` in the same commit that teaches the server to accept an IN_TRANSIT pick** — never in a commit of its own, or every picker starts offering units the server refuses.
3. **An adapter, not a picker rewrite.** Seven call sites fetch the list and four components (`NewDeploymentDialog` ×2, `KitItemSelectRow`, `RequestComposer`) render `availableUnits` / `hubStock` / `unitCounts.available`. Renaming all of that inside a correctness PR would multiply the review surface for no behaviour gain, so the server returns the program's projection and `toPickerOptions` maps it once. The client-side `toInventoryOptions` was **deleted**, not left unused — it recounted AVAILABLE units out of a capped page and renumbered positions, both of which are now the server's job (over ALL units, the UXP-6 6d/T8 rule).
4. **`/api/operators` gained `homeHubId`, and that is not cosmetic.** `OperatorRow.homeHubId` is **optional**, so switching the picker without it would have type-checked, linted and passed every test while the deployment drawer's home-hub prefill silently stopped working. There is a node test asserting the field is on the wire.
5. **Everything new in `SearchableSelect` is gated on async mode.** Every pre-existing picker (category, hub, operator, project, unit) renders byte-identically. The first cut controlled `inputValue` and overrode `slotProps.input` unconditionally — that swallowed the change event (the typed text never reached the server query) and perturbed unrelated form tests. The input is now **uncontrolled**; `input` state only mirrors it to drive the debounce.
6. **D21 held exactly.** `my-deployment/page.tsx` is **1476 lines before and after**. The picker call replaced its line; the import that came with it was paid for by compacting a two-line comment in the same effect block.

### Two deliberate deviations from the spec's literal wording (flagged, not silent)

1. **The projection carries `availableQuantity` and `pickableUnits[].qrCodeId`** beyond the program's `{ id, name, itemType, categoryName, pickableUnits, availableByHub }`. A consumable with **no `inventory_stock` rows** (legacy, never backfilled) has an empty `availableByHub`, so a client-side sum would read **0** and the picker would show real stock as unpickable — a regression against today's fallback. `availableQuantity` is therefore computed server-side with that fallback intact (node test covers it). `qrCodeId` is in the operator kit picker's option type.
2. **`mode=options` is NOT filtered to items that currently have something available.** The spec's "…and either pickable units or available consumable stock" reads as a filter; applying it would break three surfaces: the maintenance **field fix** (most often logged against gear that is OUT), **Add scheduled task** (any item may get a schedule), and a **reservation request** for an item that is out of stock (the whole point of requesting it). So the route returns the live, non-retired catalog with its pickable units and stock attached, and the per-surface pickability filter stays where it already was (`isPickableItem` in the admin builder). A node test pins "an item whose units are all out is still offered".

---

## 2 · Tests, and the two housekeeping items

**New: 30 tests** — 15 jsdom (10 picker + 5 bell) + 15 node (CI).

| File | Env | Covers |
|---|---|---|
| `tests/components/pr1b-picker-search.test.tsx` | jsdom | `SearchableSelect`: stays a plain client picker when complete; **searches the server when `truncated` and finds an item that is NOT in `options`** (the old dead end); the "keep typing" footer; debounce (a 4-keystroke burst is one call, for the final query); **a failed load offers a retry, not an empty list**. `toPickerOptions`: server position preserved (T8), `unitCounts.available` derived from the pickable set, consumable quantity + per-hub stock carried, a non-envelope body reported as **failed** rather than as an empty catalog |
| `tests/components/pr1b-bell-load-more.test.tsx` | jsdom | badge + "N unread · showing X of Y"; Load more names how many are left; **appends** rather than replaces; stops offering itself once complete; asks for the page size it renders |
| `tests/pr1b-picker-options.test.ts` | **node (CI)** | **101 items → 101 options** (the literal acceptance the clamp failed); `q` narrows server-side; RETIRED and soft-deleted excluded; **AVAILABLE units only**, with a test that pins `PICKABLE_STATUSES` itself so D-n cannot be half-applied; **IN_TRANSIT excluded until PR-3a**; position computed over ALL units (T8); an all-out item still offered; the legacy consumable fallback; `pageSize`/`page` cannot shrink the set; 401 unauthenticated. `/api/operators`: deactivated omitted, **`homeHubId` present**. `/api/dashboard/feeds`: 18 due-soon tasks → 15 rows but a chip of **18**; 17 long-running rigs → 15 rows, chip of **17** |

`uxp6-admin-deployment.test.tsx` fixtures moved to the new wire shape. The **prop** shape is now derived from the wire fixture through the real `toPickerOptions`, so the adapter is exercised there and the two fixtures cannot drift apart.

**Verified:** `tsc --noEmit` clean · `eslint .` **0 errors** (49 warnings, all the pre-existing `set-state-in-effect` advisory) · `next build` compiles · UI suite **432/432** (57 files).

### Housekeeping 1 — `Claude outputs/` is gitignored

It held two `.sql` files from an earlier session and sat in `git status` as an untracked directory. The SESSION CLOSE contract ends with "`git status` clean", which that made meaningless. Ignored rather than committed: the tracked record of a session is its `AHITS_SESSION_HANDOFF_*.md`.

### Housekeeping 2 — the local `test:ui` failures were **Node**, not jsdom

The ask was "run `npm ci`, and if `test:ui` still fails, pin the jsdom version so local matches CI." It still failed — **but pinning jsdom would have fixed nothing, because jsdom is already identical to CI**: `29.1.1`, from the same lockfile, in both places. The divergence is Node.

| | |
|---|---|
| This machine | **Node 26.3.0** |
| `package.json` `engines` | **`">=22 <25"`** — 26 was already out of spec before this session |
| CI (`verify.yml`, `deploy.yml`) | **`node-version: 24`** |
| `test:ui` under Node 26 | 82 failures across 8 files (`window.localStorage` is `undefined`, e.g. `useAuth-logout.test.tsx:59`) |
| `test:ui` under Node 24 | **417/417 green** (now 432/432 with this PR) |

So the machine was out of spec, not the repo. **`.nvmrc` = `24`** records the version. **Caveat: the workflows hardcode `node-version: 24`, so `.nvmrc` fixes LOCAL only — it changes nothing in CI.**

**A separate problem found while proving that, and NOT fixed here — it wants an owner call.** The UI suite is **flaky under vitest's default file parallelism**, with and without this PR's diff. Measured on the same machine: baseline (PR-1b stashed) **2** then **6** failures; with PR-1b, runs of **0, 10, 20 and 21**, the variance tracking machine load rather than the diff. Single-threaded it is deterministic:

```
npx vitest run --config vitest.config.ui.ts --no-file-parallelism   # 432/432, every time
```

`vitest.config.ts` (the node suite) already sets `fileParallelism: false`; `vitest.config.ui.ts` never has. Adding it there would make the suite trustworthy at the cost of CI wall-clock. **Left alone deliberately** — it is outside PR-1b's scope and CI has been green on this config for many PRs — but a green CI run is currently a *probabilistic* signal on this suite, and that is worth knowing before it bites.

---

## 3 · Resume points — where the next session starts

**PR-2 · One vocabulary for numbers** is next, from the program's PR-2 section. What it inherits from here:

- **`src/lib/populations.ts` already exists as a stub.** PR-2 fills it in; do not create a second home for these fragments. `PICKABLE_STATUSES` is already there and already consumed by `mode=options`.
- **`mode=options` is the fifth inventory payload** that PR-2's `itemCounts()` must be carried on ("list, detail, units, options, report"). Its `availableQuantity` + `availableByHub` are the shapes `itemCounts` supersedes — PR-2 should replace them there and update `toPickerOptions` in the same commit, not leave two vocabularies.
- **C-4 is split between the two PRs on purpose.** PR-1b did the *counts* half (chips are server `count()`s). The *populations* half — those feed reads still lack `deletedAt: null`, so a soft-deleted task is listed and now also counted — is PR-2's `OPEN_TASK` fragment, applied to rows **and** count together so the two can never diverge. The `dueTasksWhere` / `longRigsWhere` constants are already extracted for exactly that edit.
- **PR-3a inherits `PICKABLE_STATUSES`** (decision 2 above) and the `pickUnit` work that widens it.

### Owed by Max on PR-1b

1. **Review and merge** — merge is the deploy (D16), in the evening (D31).
2. **The smoke, four things:** in **Start Deployment**, type the name of an item far down the alphabet and confirm it appears (this is the fix); confirm nobody you have **deactivated** is offered as an operator; confirm the red **banner** and the **Open Alerts** card show the same number; open the **bell** and confirm the badge and the list agree, with **Load more** reaching the rest.
3. **One owner call:** the UI-suite parallelism flakiness above — make `vitest.config.ui.ts` single-threaded like the node config, or leave it and accept that a green UI run is probabilistic.

### Still owed from PR-1a

The **phone-width pass** on Inventory and Maintenance. The build session's browser would not produce a narrow CSS viewport (`innerWidth` stayed 1643 through every resize), so nobody has looked at those two pages narrow. Same gap applies to anything PR-1b touched.

---

## 4 · Docs changed this session

- **`STATUS.md`** — RESUME-BOX bullet for PR-1b; §3 rows for PR-1b (open, not merged), the housekeeping, and the resolved Node-vs-jsdom question with the parallelism caveat.
- **`AHITS_PILOT_FLOOR_TODO.md`** — 1b ticked as built, with Max's four smoke checks in plain English.
- **`.gitignore`** — `Claude outputs/`. **`.nvmrc`** — `24` (new).
- No `DECISIONS.md` entry: PR-1b implements **D39** (recorded with PR-1a) and **D-n**, which the program assigns to PR-3a's session. The D10 note from PR-1a is repeated above, per D-k.
