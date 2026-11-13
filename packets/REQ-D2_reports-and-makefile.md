# REQ-D2: Reports count the "To" day and show the real category; the Makefile stops forcing Homebrew's Node on a laptop

Nov 12, 2026, against `development` @ `e940260`. Three fixes, one PR, one commit per fix. No migration, service-worker change or new package. `~:N` is a line hint; match the quoted text.

## Read this first
- Build after REQ-D has merged. The two share no code or test file. Both edit `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md`.
- Do not merge while REQ-A2 (#284) is merged but its live check has not passed.
- Fixes 1 and 2 edit the same route file, in separate commits.
- Fix 3 changes nothing on GitHub: there the line still applies. It only stops applying on a laptop.
- Merges are squashed: a rollback takes all three back.

## 1. Reports never count the "To" day
**Today.** Admin → Reports sends plain dates. The route reads each as midnight UTC, so the range stops at the start of the "To" day: 6 pm Central the evening before (7 pm in summer). From = To answers "Invalid date range". The page's default "To" is the UTC date, which is tomorrow's date after 6 pm Central.

**Rule.** A date-only From or To is a business day, in the app's time zone (`appTimezone()`, US Central). The range runs from the start of From to the end of To, never past now. A To date in the future reads as now (today a future To stretches the range and lowers every Util %).

**Change.** `src/lib/business-date.ts`, new export at the end:
```ts
/** The instant a business date (`YYYY-MM-DD`) starts in APP_TIMEZONE, moved on by `addDays`.
 *  Invalid Date when `day` is not a date. Exact for US time zones, clock-change days included. */
export function businessDayStart(day: string, addDays = 0, tz: string = appTimezone()): Date {
  const utcMidnight = new Date(Date.parse(`${day}T00:00:00Z`) + addDays * 86_400_000)
  if (Number.isNaN(utcMidnight.getTime())) return utcMidnight
  const wall = businessDateTime(utcMidnight, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  const wallAsUtc = Date.parse(`${wall.date}T${pad(wall.hour)}:${pad(wall.minute)}:00Z`)
  return new Date(2 * utcMidnight.getTime() - wallAsUtc)
}
```
`src/app/api/reports/equipment/route.ts`: `import { businessDate, businessDayStart } from '@/lib/business-date'`. In `GET`, replace `const to = toParam ? new Date(toParam) : now` and `const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 180 * MS_PER_DAY)` with the block below. The `// Default window: trailing 180 days …` comment goes directly above `const from`.
```ts
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/
// A date-only To means the whole of that business day, never past now.
const to = !toParam ? now
  : DAY_ONLY.test(toParam) ? new Date(Math.min(businessDayStart(toParam, 1).getTime(), now.getTime()))
  : new Date(toParam)
const from = !fromParam ? new Date(to.getTime() - 180 * MS_PER_DAY)
  : DAY_ONLY.test(fromParam) ? businessDayStart(fromParam)
  : new Date(fromParam)
```
The `from >= to` check below stays as it is. Directly after it, add:
```ts
// Rental start and end are date-only columns (read back as midnight UTC), so for rental cost
// a date-only From and To are whole UTC days too: the From day to the To day inclusive.
const rentFrom = fromParam && DAY_ONLY.test(fromParam) ? new Date(`${fromParam}T00:00:00Z`) : from
const rentTo = toParam && DAY_ONLY.test(toParam) ? new Date(Date.parse(`${toParam}T00:00:00Z`) + MS_PER_DAY) : to
```
`const rentalCost = rentalCostInWindow(v, from, to, daysDeployed)` → `const rentalCost = rentalCostInWindow(v, rentFrom, rentTo, daysDeployed)`. Nothing inside `rentalCostInWindow` changes.

CSV file name, same file: `const stamp = to.toISOString().slice(0, 10)` → `const stamp = businessDate(new Date(to.getTime() - 1))`.

`src/app/(admin)/admin/reports/page.tsx`: import `businessDate` from `@/lib/business-date`; `const fmtDate = (d: Date) => d.toISOString().slice(0, 10)` → `const fmtDate = (d: Date) => businessDate(d)`.

**Test.** `tests/fnd7-business-date.test.ts`: `businessDayStart('2026-11-12', 0, TZ)` is `2026-11-12T06:00:00.000Z`; `('2026-07-01', 0, TZ)` is `2026-07-01T05:00:00.000Z`; `('2026-03-08', 1, TZ)` is `2026-03-09T05:00:00.000Z` (a 23-hour day); `('2026-11-01', 0, TZ)` is `2026-11-01T05:00:00.000Z` and `('2026-11-01', 1, TZ)` is `2026-11-02T06:00:00.000Z` (a 25-hour day); `('2027-03-14', 1, TZ)` is `2027-03-15T05:00:00.000Z`; `('nope')` is an Invalid Date. `tests/pr2-populations.test.ts`: a vehicle with a damage repair, `status: 'COMPLETED'`, `completedAt: new Date()`, `actualCost: 75`; with `d = businessDate()`, `?from=${d}&to=${d}` → 200 and `totalMaintenanceSpend` 75; From = `d` with To = the day before → 400. Rental: a vehicle updated to `isRental: true, rentalCostAmount: 100, rentalCostPeriod: 'DAY', rentalStartDate: new Date('2026-06-01'), rentalEndDate: new Date('2026-06-11')`; `?from=2026-06-01&to=2026-06-30` → its row's `rentalCost` is 1000; `?from=2026-06-01&to=2026-06-05` → 500. The test file needs `import { businessDate } from '../src/lib/business-date'`.

**Keep.** A full date-and-time From or To, and the no-date default (180 days to now), read as before. `maintInWindow`, `overlapDays`, the totals. No per-phone time zone here.

## 2. Reports show "OTHER" as the kind of app-made gear
**Today.** The Kind column and the CSV print the old category field. Items made in the app never set it, so every such unit says `OTHER`; old seeded gear shows a raw code such as `SAMPLING_EQUIPMENT`. The real category is the item's `categoryRef`.

**Change.** `src/app/api/reports/equipment/route.ts`: import `categoryDisplay` from `@/lib/inventory`. `inventoryItem: { select: { name: true, category: true } },` → `inventoryItem: { select: { name: true, category: true, categoryRef: { select: { id: true, name: true } } } },`. `kind: u.inventoryItem.category,` → `kind: categoryDisplay(u.inventoryItem).name,`.

**Test.** `tests/pr2-populations.test.ts`: in "a retired unit is not a row…", the live unit's row has `kind` equal to `cat.name`. New: a serial-numbered item made with `prisma.inventoryItem.create` (the fixture always sets a category), `category: 'SAMPLING_EQUIPMENT'` and no `categoryId` → its unit's `kind` is `Sampling Equipment`.

**Keep.** Vehicles: `kind` stays the vehicle type. Rows, totals, the CSV columns.

## 3. The Makefile forces Homebrew's Node on a laptop
**Today.** `Makefile` line 6, `export PATH := /opt/homebrew/bin:/usr/local/bin:$(PATH)`, puts two folders first for every `make` command. On the owner's Mac that runs a broken Homebrew Node 26 instead of the project's Node 24. Nothing else in the Makefile, the Dockerfile or the workflows names either folder. On GitHub the same line puts `/usr/local/bin` ahead of the Node 24 that `setup-node` installs, so `make cloud-run-migrate` runs Prisma on the runner's own Node. This request leaves that alone.

**Change.** Replace line 6 with these six lines. The blank line after it stays. Nothing else.
```make
# GitHub Actions only: keeps the Deploy run finding its tools as it has since Jun 2026
# (/usr/local/bin first, so cloud-run-migrate runs Prisma on the runner's own Node).
# On a laptop the line is skipped and make uses your shell's PATH (Node 24, .nvmrc).
ifeq ($(GITHUB_ACTIONS),true)
export PATH := /opt/homebrew/bin:/usr/local/bin:$(PATH)
endif
```

**Test.** None in CI. Locally `make help` lists the targets, and `make -pn help | grep -c '^PATH := /opt/homebrew'` prints 0. Run no other target.

**Keep.** Every target, guard and setting in the Makefile. `.github/`, `Dockerfile`, `.nvmrc`.

## Must not change
- Everything under "Keep". `prisma/`, `src/app/sw.ts`, `next.config.ts`, `package.json`, `.github/`, `scripts/`.
- Left for a later request. Reports repair cost: a repair that crosses a month end is counted in both months. The daily check on the phone's own day. The PATH line on GitHub Actions: removing it moves the live migration step to Node 24, so it is its own PR, merged alone, with the last Deploy run green and no migration waiting.

## How to tell it worked
1. **Claude Code.** After the merge the Deploy run ends green. If it does not, stop and tell the owner. *(fix 3)*
2. **Claude Code.** In the tab the owner signed in, Admin → Reports: set From to the date already shown in To. A report shows, with no "Invalid date range". *(fix 1)*
3. **Claude Code.** Same page, Units: the Kind column shows category names; no row shows `OTHER` in capitals or a code such as `SAMPLING_EQUIPMENT`. `Other` is right for an item with no category. *(fix 2)*
4. **Owner** (Mac). After `git pull`, a `make` command that failed before (for example `make lint`) runs on Node 24. *(fix 3)*

## Audit, merge, docs
- **Audit: no.** Reports only read; the Makefile change does not apply on GitHub.
- **Merge:** no migration, no service-worker change → any time, on the owner's go.
- **Doc lines, same PR** (if a line has been edited since, it is the one on that subject):
  - `STATUS.md` Next: the line that starts `Quick fixes, second set, the rest:` (its number may differ) keeps its number and becomes `Quick fixes, second set, the rest: the daily check uses the phone's own day; Reports repair cost; a failed check stays open; the two missing redirects after an admin Reset PIN; the Makefile's PATH line on GitHub Actions.`
  - `DECISIONS.md`, under "Decided for the paused packets": delete `- Report date ranges include the "To" day. (kept Nov 11)`. Under "What people see", after the line that starts `- Totals leave out retired and deleted gear`, add `- A report's date range includes its "To" day; a report day is the app's day (US Central today). (Nov 11)`.
- **CHANGELOG line:** `- <date the PR is opened, YYYY-MM-DD> · #<PR> · Reports count the "To" day, and From = To works; serial-numbered gear shows its real category. The Makefile no longer forces Homebrew's Node on a laptop`

## Prompt for Claude Code
```
Read CLAUDE.md, AGENTS.md, STATUS.md and packets/REQ-D2_reports-and-makefile.md (if it is missing, stop and say so). REQ-D must be merged first: if STATUS.md has no Next line that starts "Quick fixes, second set, the rest:", stop and tell the owner. This Next.js is modified (AGENTS.md): read the relevant node_modules/next/dist/docs before writing code.

Run `git fetch`, then branch from the latest origin/development. Build exactly REQ-D2: one commit per fix, each with its tests. Nothing else. If a quoted line does not match the code, leave that fix out, build the rest and report it.

Gate: npm run lint, npm run type-check, npm run test:ui, npm run build (placeholder env values from .github/workflows/verify.yml). Server tests (npm test) run in CI.

Open ONE PR into development with the code, the tests, the doc lines and the CHANGELOG line REQ-D2 names (the PR number goes in once it exists), and the request file itself. It is untracked: `git add packets/REQ-D2_reports-and-makefile.md`, by name. Wait for CI.

Report the PR number, the CI result and anything that did not match the code. Then stop: the PR needs the owner's go before merge. No audit.

After the merge, open the Deploy run and watch it end. Then do the live checks marked "Claude Code", in order. The owner signs in himself. Post the results as one PR comment. If a check fails, stop and tell the owner. Do not revert.

Safety: named files only. Never `git add -A` or `git add .`. Never `git stash`, `git reset`, `git checkout <ref> -- .`. Never read .env files. Type no PIN or password. Run no `make` target except `make help` (and the `make -pn help` line in the request). Do not merge without the owner's go.
```
