# REQ-D: Quick fixes, second set — Today re-reads, Hubs "Copy link", four photo boxes, project on ended deployments

Nov 12, 2026, against `development` @ `e940260`. Four fixes, one PR, one commit per fix. No migration, service-worker change or new package. `~:N` is a line hint; match the quoted text.

## Read this first
- The second set of quick fixes is two requests: this one, then REQ-D2 (Reports dates and category, the Makefile PATH line). They share no code or test file. Both edit `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md`. Order: REQ-D first. Do not merge REQ-D while REQ-A2 (#284) is merged and its live check 1 has not passed.
- Merges are squashed: a rollback takes all four back.
- If the audit rejects fix 2, drop its commit and merge the other three; fix 2 then becomes its own request.
- New for admins (fix 2): "Copy link" gives the same Inbound row a new address; a link copied earlier for that unit stops opening (it now says "This link was not found.").

## 1. Today is not re-read when the app is reopened
**Today.** An app left open overnight shows yesterday's checks as "Done" and "You're set." until the refresh arrow is tapped. Nothing re-reads Today when the app comes back (`useFreshList.ts`: `revalidateOnFocus: false`).

**Change.** `src/app/(operator)/operator/dashboard/page.tsx` only: `useFreshList<{ data: TodayData }>('/api/operator/today')` gets a second argument, `{ revalidateOnFocus: true }`. SWR then re-reads when the page becomes visible or gets focus (at most once in 5 seconds, and not in the first 5 seconds after the screen opens).

**Test.** `tests/components/pr5c-today-crew.test.tsx`, new test, placed first inside `describe('PR-5c · Today for a crew member (SECONDARY)'`. It stubs `fetch` itself with an answer held in a variable. Render inside `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, focusThrottleInterval: 0 }}>` (SWR ignores focus for 5 seconds after the screen opens; 0 turns that off for the test). First answer `checkedVehicleIds: ['v1', 'v2']` → `await screen.findByText("You're set.")`. Change the answer to `checkedVehicleIds: [], vehicleChecks: []`, then `act(() => { window.dispatchEvent(new Event('focus')) })` → `await screen.findByRole('button', { name: /Start daily check/i })`, and `fetch` was called twice.

**Keep.** `useFreshList.ts` (Requests, Scan, Crew Map).

## 2. Hubs → Inbound "Copy link" cancels the link and can clear a Discrepancy
**Today.** The button cancels the unit's link and makes a new one, with no history, so a "Discrepancy" row falls back to "Awaiting receipt"; the old link shows under "Dismissed & Received" as "Dismissed". On a row already closed (a stale screen) it makes a live link for gear already back.

**Change.** `src/app/api/status-links/[id]/reissue/route.ts`. Keep the lookup and its 404. Import `generateStatusToken, hashToken, statusLinkUrl` (not `issueStatusLink`) from `@/lib/status-links`. Replace from the comment `// Revoke the old link so only one live link exists per unit at a time.` through `return NextResponse.json({ ok: true, url })`; the function's closing `}` stays. New text:
```ts
  // The same link gets a new address. Its row, state, discrepancy flag and history stay.
  const rawToken = generateStatusToken()
  const turned = await prisma.statusLink.updateMany({
    where: { id, state: { in: ['ISSUED', 'VIEWED', 'ACTED'] } },
    data: { tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) }, // 14 days, as a new link
  })
  if (turned.count === 0) {
    return NextResponse.json({ error: 'This return is already received or dismissed.' }, { status: 409 })
  }
  return NextResponse.json({ ok: true, url: statusLinkUrl(rawToken) })
```
Rewrite the comment above `POST` to match. `src/lib/copy/admin-actions.ts`: `success: 'New link copied to clipboard.',` → `success: 'New link copied. A link copied earlier for this unit no longer opens.',`

**Test.** New `tests/reqd-reissue-link.test.ts`; session mock and fixtures as in `tests/cc31-expired-hub-return.test.ts`. (a) A HUB_RETURN link, `ACTED`, expired, with one `DISCREPANCY` event → 200 with a `url`; the row is still `ACTED`, its `tokenHash` is `hashToken` of the token in the url, `expiresAt` is in the future; the unit still has one link and one event. (b) A `REVOKED` link → 409, `tokenHash` unchanged, still one link.

**Keep.** The hubs page. `src/lib/status-links.ts`, the receive and revoke routes, `/s/[token]`. The no-login links are frozen: nothing else changes.

## 3. Photo boxes that lead nowhere
**Today.** Add vehicles, Remove vehicles, Add items and Transfer ask for "Photos (optional)". The photos are dropped, never sent, or saved where no screen shows them. `NotePhotoDialog` has six uses, all of them these four actions.

**Change.** `src/components/shared/NotePhotoDialog.tsx` only:
- delete the `PhotoCapture` import, the `photos` state and both `setPhotos([])`;
- `r = await onConfirm(note, photos)` → `r = await onConfirm(note, [])`;
- delete the `Photos (optional)` `<Typography>` block and the `<PhotoCapture … />` line; fix the `onConfirm` comment ("keep the note").

The name and the `onConfirm(note, photoUrls)` shape stay: no caller changes (each now gets `[]`).

**Test.** One test asserts the box: `tests/components/p1-1b-screens.test.tsx`, "a 400 shows the server words and the note and photos are still there". Delete its `Photos: 0` click and `Photos: 1` expectation, rename them to `describe('3.2 · a failed transfer keeps the note'` and `it('a 400 shows the server words and the note is still there'`, add `expect(screen.queryByText('Photos (optional)')).toBeNull()`. Keep the file's `PhotoCapture` mock: `DispositionDialog` uses it.

**Keep.** Photos on Report a problem and on damaged returns (`ReportProblemDialog`, `DispositionDialog`). Every server route.

## 4. An ended deployment shows no project
**Today.** Admin → Deployments → Show ended: Project is "—" on every row, and the project filter finds nothing. End, and the auto-end after a full transfer, close the project links (`removeAllProjectLinks`); the list, the drawer and the filter read open links only.

**Rule.** An ended deployment shows the links its End closed. End closes assignments and links in one transaction, so both carry the same `now()` (the June backfill gave both `rigs.endedAt`). A link removed earlier (project changed or cleared) does not match. So a deployment moved from A to B and then ended shows B only, and the filter on A does not list it.

**Change.** `src/lib/deployment-assignments.ts`, new export above `getDeploymentRosters`:
```ts
/** Project links a deployment shows: open ones; for an ended deployment, the ones its End closed. */
export const SHOWN_PROJECT_LINK = Prisma.sql`(
  dp."removedAt" IS NULL
  OR ( NOT EXISTS (SELECT 1 FROM "deployment_assignments" o WHERE o."rigId" = dp."rigId" AND o."endedAt" IS NULL)
       AND dp."removedAt" = (SELECT MAX(a."endedAt") FROM "deployment_assignments" a WHERE a."rigId" = dp."rigId") )
)`
```
In `getDeploymentRostersForDisplay` only (~:161; `getDeploymentRosters` ~:82 has the same line and stays), in `WHERE dp."rigId" IN (${Prisma.join(rigIds)}) AND dp."removedAt" IS NULL` replace `dp."removedAt" IS NULL` with `${SHOWN_PROJECT_LINK}`. The comment above it ("Projects unchanged…") is wrong: rewrite it.

`src/app/api/deployments/route.ts`, the `projectId` filter in `GET`: import `SHOWN_PROJECT_LINK`, and replace the whole query inside `if (projectId)` with:
```sql
SELECT dp."rigId" FROM "deployment_projects" dp
WHERE dp."projectId" = ${projectId} AND ${SHOWN_PROJECT_LINK}
```

**Test.** `tests/fnd1-ended-deployment-operator.test.ts`. End a rig as the route does: `prisma.$transaction(async (tx) => { await endAllAssignmentsForRig(rig.id, tx); await removeAllProjectLinks(rig.id, tx) })`, then set `endedAt`. Project A needs a row: `prisma.project.create({ data: { name: 'Project A' } })` (there is no fixture). (a) Linked to project A (`addProjectLink`), ended → `GET /api/deployments/[id]` gives `project: { id, name }`, and `GET /api/deployments?active=false&projectId=A` lists it. (b) Linked to A, `removeAllProjectLinks(rig.id)` on its own, then ``await prisma.$executeRaw`UPDATE "deployment_projects" SET "removedAt" = "removedAt" - interval '1 minute' WHERE "rigId" = ${rig.id}` `` (so the two stamps can never share a millisecond), then ended → `project: null`, not listed. (c) An active rig still shows A. (d) Linked to A; moved to B as the PATCH does (`removeAllProjectLinks`, the same one-minute push-back, `addProjectLink(rig.id, B)`); ended → `project` is B; listed for `projectId=B`, not for `projectId=A`.

**Keep.** How End works: both End paths, `removeAllProjectLinks`, `rigs.projectId`, the project PATCH.

## Must not change
- Everything under "Keep". `prisma/`, `src/app/sw.ts`, `next.config.ts`, `package.json`, `.github/`, `scripts/`, `Makefile`.
- Left for a later request. Today: with no signal a saved copy from an earlier day still shows, and "Data as of" shows the time of the try, not the age of the data; an expired sign-in shows "Couldn't load your day … check your connection". Copy link: keeping the earlier address alive (only its hash is stored: a schema change). Photos: the name `NotePhotoDialog`, the unused `photoUrls` arguments. Project: dropping `rigs.projectId` (schema change); showing every past project of an ended deployment (DECISIONS says "their projects"); the project PATCH on an ended deployment (no screen calls it) would show both.

## How to tell it worked
After a green deploy run, in the tab the owner signed in.

Setup. **Claude Code:** add "ZZ-D probe" (serial-numbered, one unit, Piedmont). Start a deployment for the owner's operator account, label "ZZ-D", with ZZ-D probe, no vehicle. If that account already holds a deployment, stop and ask. Do not end it. Leave the older "ZZ" deployment alone: it is kept for other owed checks.
1. **Owner** (phone, with signal). Open `/operator/dashboard`, note the "Data as of" time. Use another app for over a minute, come back: the time has moved on without a tap. *(fix 1)*
2. **Claude Code.** Admin → Deployments → ZZ-D → Transfer: pick a person, Next, tick ZZ-D probe, Continue to Note: no "Photos (optional)". Cancel. *(fix 3)*
3. **Claude Code.** End ZZ-D, returning ZZ-D probe to Piedmont. Hubs → Inbound: ZZ-D probe is "Awaiting receipt". Copy link: the row stays; "Dismissed & Received" has no ZZ-D probe row. To read the address, open Add Hub, paste into "Hub Name", read it, Cancel. Open it in a new tab: the hub's page for ZZ-D probe shows (the Inbound row now reads "Viewed by hub": expected). If the address cannot be read, say so on the PR; do not call the API. On Inbound, press Received (both admins get a bell). *(fix 2; Discrepancy: server test)*
4. **Claude Code.** Deployments → Show ended: deployments that had a project show its name; pick it in the filter: they stay. If none had one, say so. *(fix 4)*

Clean-up. **Claude Code:** delete ZZ-D probe (if refused, say so on the PR).

## Audit, merge, docs
- **Audit: yes.** Fix 2 changes a no-login link: the planning Claude audits the PR before merge, and reads fix 4's SQL (hand-written, not type-checked). Fixes 1, 3 and 4 move no gear or stock.
- **Merge:** no migration, no service-worker change → any time, on the owner's go.
- **Doc lines, same PR** (if a line has been edited since, it is the one on that subject):
  - `STATUS.md` Next: the line that starts `Quick fixes, second set:` (its number may differ; keep the number you find) becomes `Quick fixes, second set, the rest: REQ-D2 (Reports dates and category; the Makefile's forced PATH line); the daily check uses the phone's own day; Reports repair cost; a failed check stays open; the two missing redirects after an admin Reset PIN.`
  - `DECISIONS.md`: on `- No photos are asked for on Add vehicles, Remove vehicles, Add items or Transfer; problem reports keep them. (Nov 11) — not built yet` delete ` — not built yet`.
  - `DECISIONS.md`: the line starting `- A deployment has one project at a time and can move between projects.` ends `(Nov 11) — not built yet` → `(Nov 11) — partly built (ended deployments show their project; the old column is still there)`.
- **CHANGELOG line:** `- <date the PR is opened, YYYY-MM-DD> · #<PR> · Quick fixes: Today re-reads when the app is reopened; Hubs "Copy link" keeps the row and its Discrepancy flag; no photo box on Add vehicles, Remove vehicles, Add items or Transfer; ended deployments show their project`

## Prompt for Claude Code
```
Read CLAUDE.md, AGENTS.md, STATUS.md and packets/REQ-D_quick-fixes-2.md (if it is missing, stop and say so). This Next.js is modified (AGENTS.md): read the relevant node_modules/next/dist/docs before writing code.

Run `git fetch`, then branch from the latest origin/development. Build exactly REQ-D: one commit per fix, each with its tests. Nothing else. If a quoted line does not match the code, leave that fix out, build the rest and report it.

Gate: npm run lint, npm run type-check, npm run test:ui, npm run build (placeholder env values from .github/workflows/verify.yml). Server tests (npm test) run in CI.

Open ONE PR into development with the code, the tests, the doc lines and the CHANGELOG line REQ-D names (the PR number goes in once it exists), and the request file itself. It is untracked: `git add packets/REQ-D_quick-fixes-2.md`, by name. Write "needs audit" on the PR. Wait for CI.

Report the PR number, the CI result and anything that did not match the code. Then stop: the PR needs an audit and the owner's go before merge.

After the merge and a green deploy run, do the live checks marked "Claude Code", in order. The owner signs in himself. Post the results as one PR comment. If a check fails, stop and tell the owner. Do not revert.

Safety: named files only. Never `git add -A` or `git add .`. Never `git stash`, `git reset`, `git checkout <ref> -- .`. Never read .env files. Type no PIN or password. Do not merge without the owner's go.
```
