# Packet P1-2 O · Offline you can trust: saved work applies once, waits for its owner, and says where it is · rev 3.1 · 2026-10-28

> **OPEN for the owner:** none. Round 6 answered rev 1's question (§0-g). Round 7 (2026-10-27) answered rev 2's: actions saved before O3 on a phone where nobody is signed in go to the next person who signs in there, as today; and a phone shared by an admin and an operator may show the last person's page frame offline (no data; the server checks every save). Both are built as written.
> **Rev 3.1 (2026-10-28):** the open item above is closed, and the "After O3" `sw.ts` check compares with the PR's own base (merge-base), not `origin/development`.

> **REV 3 (2026-10-28), after the practice build** (`p12/stack/STACK_O.md`: O1–O6 on the Eastern-time PR and Security S1–S4; 0 High, 5 Medium, 4 Low, 10 Info). Every gate ended green. Four PRs hit an existing test this packet didn't list, and one new test showed a gap in O3. What changed:
> - **Tests that change, now listed (Medium):** O1 `cc34-report-and-promote` (OX-1); O3 four of Security's login tests (OX-3); O4 `hotfix-reconnect-reread` (OX-5). Security's S3 read guard now mocks `checkSession` from the start (Security rev 4.1), so O2 leaves it alone (OX-2). Every "must pass unchanged" list is what the practice build saw.
> - **Someone else's old actions (Medium, OX-4):** O3's "anything to send?" check also counts a waiting action older than 7 days, whoever saved it, so it still turns "too old" (3.3, the builder's code).
> - **Decision numbers (OX-9):** each docs commit first checks that the Eastern-time and Security decisions are in `DECISIONS.md`, and stops if not. Then it takes the number after the highest there (§7).
> - **Smaller fixes:** O2 test (h) proves its fix (OX-6); the Scan caption adds no lint warning (OX-7); the sign-out test's exact words (OX-8); line anchors after S, three stale comments, a dialog title, a test mock, a Blob check, an import (OX-10…OX-15, OX-18); two known flakes in §5 (OX-16). §4 has the lines after S4. §9.4 lists every finding.

> **REV 2 (2026-10-26), after two reviews (`rev-O/BREAK_O.md`, `rev-O/COMPLETE_O.md`), the Security packet rev 2 and the owner's round 6.** Each review ID and its outcome: `rev-O/REV2_CHANGES.md`. Where this packet differs from a reviewer's fix: §9.2. What changed:
> - **O1:** with no session, the "apply once" wrapper answers by itself (401, or 503 when the database is down). It never runs a write without its key memory, so a database blip can't apply a replay twice (BO-1).
> - **O2:** gains the email-sending limit (B3-17, 20 an hour) from the Security packet, with its test, so it can never ship without the slower retries (2.9). It states how the saved actions already on phones are read, with an upgrade test (2.10). A PIN reset no longer shows "Session expired" (BO-4). Only the health check clears "Can't reach the server" (BO-5). A 429 gets the slow retries (CO-4). Smaller fixes: BO-9, BO-10, BO-13, BO-14.
> - **O3:** sign-out and a person switch clear only the data caches, never the page shells or the start-page redirect (BO-3). Actions saved before O3 go to the person signed in when O3 first runs (CO-3). An expired sign-in still signs out (BO-8). A saved action never goes out with no owner (BO-11, BO-15). The next person's Outbox reads "2 saved actions belong to someone else" (round 6). No second logout on the sign-in page: Security S1's 2-minute sign-out marker covers it (BO-16 and CO-5 not taken, §9.2).
> - **O4:** Today's day turns over at midnight Eastern even when the app stays open (BO-6). End no longer hides a line whose return is saved (BO-12). More named tests (CO-22).
> - **O6:** a new version deletes only the old version's HTML pages, keeps everything else, and re-fetches the operator tabs (BO-2). The rental-vehicle add keeps no time limit; the transfer buttons say "it may have gone through" (BO-7).
> - **Order and close:** all of S1–S4 merge before O1 (CO-1). Every "today" uses the Eastern-time helpers. Decisions are placeholders. §4 lists the files shared with Security, Eastern time and Data. §6 has "send your saved work before tonight" and a phone test with pass and fail for each step. §7–§8 define the session's own smoke; the session never types a PIN or password, never reverts without your go, and waits for phone-test step 1 before O6. A Parked list (§7).

> STATUS: runnable packet, rev 3. Six PRs in order (O1 → O6), one Claude Code session each. Packet 2 of 3 in P1-2 (Security → Offline → Data). **Practice-built as a whole** on 2026-10-28 (`p12/stack/STACK_O.md`): O1–O6 on the Eastern-time PR and S1–S4 (base + #273 + #272), tree `p12/stack/tree`, tags `stack-O1` … `stack-O6`. Every gate ended green; rev 3 folds in its findings (§9.4). Before that, the reviewer built O1–O4's queue and server parts in a scratch clone (§9.3). **If a named test, anchor or count differs from the packet, stop and report before improvising.** · WROTE: rev 1, 2026-10-26, from `MAP_offline.md` (OFF-1…OFF-9), `MAP_accounts.md` §6 and §7, `MAP_integrity.md` PR I1 and B5 §3, and `MAP_exposure.md` E4's B3-11. REVISED: rev 2, from both reviews, Security rev 2 (§9.3, §9.4) and round 6; rev 3, 2026-10-28, from the practice build. · READ-WITH: `CLAUDE.md`, `AGENTS.md`, `STATUS.md`, `DECISIONS.md` (D16, D21, D26, D27, D31, D47, D48 with its 2026-10-26 amendment, D51, D52, the Eastern-time PR's decision and Security's), `AHITS_HOTFIX_2026-10-25_KEEP-WORK-ON-RECONNECT.md`, `AHITS_PACKET_EASTERN-TIME_2026-10-26.md` (merges before P1-2), `AHITS_PACKET_P1-2S_SECURITY_2026-10-26.md` (rev 4.1, merges first), `AHITS_PACKET_P1-2D_DATA_2026-10-26.md` (merges after; §4 lists what it rebases on here).
> WHY: the phone's saved work can't yet be trusted:
> - After 2 days offline a saved action can apply twice. A database blip turns the "apply once" check off without a word.
> - A server hiccup turns every saved action red within 1–2 minutes. A database blip, or an admin's Reset PIN, signs people out or fails their saved work.
> - On a shared phone, one person's saved work is sent as the next person, who also sees the previous person's cached screens.
> - An offline End or Return gives no sign it was saved, can be done twice, and a saved End returns gear it never listed.
> - On an offline morning, Today shows yesterday's checks as today's.
> - A photo is deleted before its action is safe, so an error can lose it.
> - Saved copies say "Data as of <now>". After a deploy, old cached pages outlive their build.
>
> SLOT: after P1-1a–e, the Eastern-time PR, #273 and #272 (Next 16.4.3; live `ac1410a`), and **every Security PR, S1–S4**. Before packet D. The email-sending limit moved from S4 into O2 (Security rev 2, BS-5), so nothing in S waits for O: S1–S4 all merge first, then O1.
> - Migrations: **none** in any PR.
> - D21: `src/app/(operator)/operator/my-deployment/page.tsx` is **1454 lines at `3dbaea8`**. Run `wc -l` on your base: that number is the cap. Only O6 touches the page, with 0 net lines. State `wc -l` in every PR body.
> - Test baselines: re-count both suites on each PR's base (§5) and state them next to the new counts. Practice build (files / tests): DB 96 / 786 at S4 → O1 98 / 807 → O2 101 / 815 → O3 102 / 816 → O4 104 / 824 → O5 104 / 828 → O6 106 / 837; UI 86 / 664 → 86 / 664 → 88 / 689 → 90 / 714 → 93 / 740 → 94 / 744 → 98 / 761.
> - Decisions: **D-O1…D-O4 are placeholders.** Each gets its number when its PR's docs commit first writes it into `DECISIONS.md`. The order is the Eastern-time docs commit (D-E1), then Security (S1 writes D-S1…D-S3), then O, then Data. The commit first checks that D-E1 and D-S1…D-S3 are there and stops if not, then takes the number after the highest one in `DECISIONS.md` (§7.5, OX-9). It writes the number into CHANGELOG and STATUS and states the mapping. Never commit a placeholder in `src` or `tests`.
> - Anchors are at `3dbaea8`. The Eastern-time and Security PRs move lines in shared files; §4 gives the lines the practice build found after S4. **Re-grep every anchor at build.**
> - Next is a modified 16.x: read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` before editing `src/proxy.ts` (O2, O3) and `route.md` before adding `HEAD` to a route (O2). Next answers `HEAD` from `GET` by itself (`next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js`); O2's explicit `HEAD` only makes it visible.
> - **Eastern time:** every "today" here (the offline-morning Today, the 7-day late-check window, the crew-map pin ages) comes from `businessDate()` / `appTimezone()` in `src/lib/business-date.ts`. Never write a zone name in `src`: the Eastern-time guard test refuses `America/…`, `CDT`, `EST` and the like anywhere outside that file, even in comments.

**This packet overrides SESSION CLOSE steps 4–5 in `CLAUDE.md` and in `STATUS.md` for O1–O6.** There is no handoff file unless the session ends mid-work; write one `CHANGELOG.md` line plus the STATUS lines in §7 instead. Stage named files only, never `git add -A`. This packet file sits untracked in the repo root: commit it on the O1 branch, never on `development` (if it is already tracked, skip that).

**Order, and why:** O1 (server: keys live long enough, refusals say why) → O2 (one queue store, fair retries, outages keep you on screen, the email limit) → O3 (owners on saved work; it builds on O2's store) → O4 (screens say "saved on this phone"; reads O2/O3's store) → O5 (photos; edits O2's flush) → O6 (the new service worker; merges alone).

---

## 0 · Owner decisions (final: apply them, don't re-ask)

| # | Decision | PR | Becomes |
|---|---|---|---|
| a | **A saved action applies once.** The server remembers each saved action for 10 days, longer than the phone keeps it. | O1 | D-O1 |
| b | **Late daily checks** are filed under their real date up to **7 days** back (D26 said 3). Older ones are refused with a clear message, never moved to today. Days are Eastern business days. | O1 | D-O1 (amends D26) |
| c | **A saved action older than 7 days isn't sent.** A warning shows at 6 days. After 7 the Outbox shows it as too old, with Discard only. This counts from when it was saved, so on the night O2 goes live, anything already waiting more than 7 days shows as too old (§6). | O2 | D-O2 |
| d | **Server trouble** (errors, not "no signal"): the phone keeps trying for **about an hour** — 8 tries, waiting 30 s, then 1, 2, 4, 8, 16 and 30 min. Then it shows Failed in the Outbox, where Retry still works. "Too many reports" (n) waits the same way. | O2 | D-O2 |
| e | **A database outage keeps people on their screen** with a "Can't reach the server" banner. Nobody is signed out; saves stay on the phone. | O2 | D-O2 |
| f | **After an admin's Reset PIN,** saved actions wait instead of failing, and send once the new PIN is set. | O2 | D-O2 |
| g | **Shared phone:** each person's saved actions wait for that person and send when they sign in there again. The next person never sees or sends them; their Outbox says only "2 saved actions belong to someone else". If that person never comes back, the actions stay hidden on that phone and are never sent as anyone else (round 6). Actions saved before O3 belong to whoever is signed in when O3 first opens on that phone. | O3 | D-O3 |
| h | **Sign-out with unsent work:** warn with the count, then sign out. **Sign-out with no signal is refused:** "Signing out needs a connection. You're still signed in." | O3 | D-O3 |
| i | **A saved End that finds equipment it never listed is refused by name.** The deployment stays open. The Outbox says "Equipment was added after this End was saved: … Open End deployment again." | O4 | D-O4 |
| j | **Offline morning:** Today shows **Start daily check** with "Last synced … — today's checks aren't known yet." Checks saved on this phone today count as done. A second check of a truck a crewmate already checked is refused by name when it syncs. "Today" turns over at midnight Eastern. | O4 | D-O4 |
| k | **Offline page wording:** "Your saved screens still work. Daily checks, returns, adds, problem reports and requests are saved on this phone and send when you're back online. Transfers and PIN changes need a connection." | O6 | — |
| l | **Phone test after the service-worker PR:** the Android phone, with Chrome on a laptop (`chrome://inspect`). | O6 | §6 |
| m | **Merge pace:** D48 as amended on 2026-10-26 (your docs PR #275): up to two merges per evening window, only when they touch different areas; each deploys and passes its smoke before the next merges. The service-worker PR (O6) merges alone. No packet records it again. | all | — |
| n | **At most 20 writes that email a hub or raise an admin alert, per operator per clock hour** (moved here from the Security packet, §0-r there). The 21st gets "Too many reports in the last hour — try again later." A saved one waits and tries again (d). Admins aren't limited. | O2 | D-O2 |

The daily-check cutoff is 19:00 Eastern (round 6, with the Eastern-time PR). Nothing in this packet reads it.

---

## O1 · A saved action applies once (server)

**Goal.** A replay never finds its key gone. A request that died never blocks its key. A database blip never turns "apply once" off. A committed deployment write always leaves its answer. A saved answer only goes back to the person who made the request. Late checks follow amended D26. A write to an ended deployment says so.
Closes B5-5 (server side), B4-10 a/b/c, DM-6, B4-1, B4-11, B3-11, B5-19, B5 §3, and the End-after-End 403 (new, §9 row 1).

**One design for `src/lib/idempotency.ts`.** Five pieces, checked against each other:

| Piece | What it does | Why it doesn't fight the others |
|---|---|---|
| Keep 10 days | The cron reaps keys older than `IDEMPOTENCY_KEEP_DAYS` (10). | The phone never sends an action older than 7 days (O2), so 3 days of margin. |
| Take over a dead claim | A NULL claim older than 10 min is re-claimed by the replay. | Every deployment write the phone queues records its answer inside its own transaction (below), so a committed one never leaves a NULL row to take over. Transactions time out at 15 s (`src/lib/prisma.ts:13`); Cloud Run requests at the default 300 s (the Makefile sets no `--timeout`). |
| Fail closed | Any error reading or claiming the key → **503** `SERVER_UNAVAILABLE`, and the handler never runs. | The 503 comes before any claim, so the same key replays cleanly later. O2's queue waits on it. |
| Record in the write's transaction (B4-1) | The write's last statement stores status + a small body on its key row. | `releaseKey` deletes only NULL rows, so a recorded row survives a later throw; `commitKey` then overwrites it with the full reply. |
| Bind to the person (B3-11) | The stored hash is `<body sha256>.<owner sha256 prefix>`. The owner is the signed-in user; on the hub portal, the link's path. | The owner comes first. No session on a signed-in route → **the wrapper answers 401 itself** (503 when the database can't be reached) and the handler never runs (BO-1): nothing is claimed or replayed, so a lapsed session never reads as "a different request", and a database error in the session lookup can never let the handler's own later lookup apply a replay twice. Rows written before O1 compare the body half only. |

1.1 **New `src/lib/offline-limits.ts`** (pure; the phone imports it too):
```ts
// P1-2: the offline time limits in one place, so the phone and the server can't drift apart.
/** A saved action older than this is not sent (useOfflineQueue, O2), and a late daily check
 *  older than this is refused (D26 as amended, daily-check route). */
export const QUEUE_MAX_AGE_DAYS = 7
/** How long the server remembers an Idempotency-Key: the queue's limit plus margin, so a
 *  replay whose first answer was lost can never apply twice. */
export const IDEMPOTENCY_KEEP_DAYS = 10
/** An in-flight claim older than this belongs to a request that died (transactions time out
 *  at 15 s; Cloud Run requests at its default 300 s). A replay may take it over. */
export const ABANDONED_CLAIM_MINUTES = 10
```

1.2 **`src/lib/shared-errors.ts`**, append:
```ts
// P1-2 (O1, DM-6 / B5-8): the server can't reach its database. A keyed write is refused, never
// applied without its key memory. The queue waits and retries (O2); screens say so.
export const SERVER_UNAVAILABLE_ERROR = "Can't reach the server right now. Try again in a minute."
export const SERVER_UNAVAILABLE_CODE = 'SERVER_UNAVAILABLE'
```
**`src/lib/api-errors.ts`**, append (import the two constants):
```ts
/** P1-2: the one 503 body for "the database can't be reached" (idempotency, auth/me, login). */
export function serverUnavailableResponse(): NextResponse {
  return NextResponse.json({ error: SERVER_UNAVAILABLE_ERROR, code: SERVER_UNAVAILABLE_CODE }, { status: 503, headers: { 'Retry-After': '30' } })
}
```

1.3 **`src/lib/idempotency.ts`.** Imports: add `import type { Prisma } from '@prisma/client'`, `import { requireAuth } from '@/lib/auth/session'`, `import { serverUnavailableResponse } from '@/lib/api-errors'`, `import { ABANDONED_CLAIM_MINUTES } from '@/lib/offline-limits'`.
- Header comment (`:24-27`): replace "Graceful degradation…" with: "Fail closed (P1-2, DM-6): if the key table can't be read or written, the write is refused with 503 and the queue retries. It never runs without its key memory."
- `getCached` (`:44-55`): delete the `try/catch`, so an error throws.
- `claimKey` (`:57-69`):
```ts
/** Claim the key with a NULL-status placeholder, binding the body+owner hash. P1-2 (B4-10b): a
 *  NULL claim older than ABANDONED_CLAIM_MINUTES belongs to a request that died before it
 *  committed, so a replay takes it over instead of getting the in-flight 409 until the reap.
 *  Throws on any database error (DM-6). */
async function claimKey(key: string, scope: string, bodyHash: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ key: string }[]>`
    INSERT INTO idempotency_key (key, scope, status_code, body_hash, created_at)
    VALUES (${key}, ${scope}, NULL, ${bodyHash}, NOW())
    ON CONFLICT (key) DO UPDATE SET scope = EXCLUDED.scope, body_hash = EXCLUDED.body_hash, created_at = NOW()
      WHERE idempotency_key.status_code IS NULL
        AND idempotency_key.created_at < NOW() - make_interval(mins => ${ABANDONED_CLAIM_MINUTES}::int)
    RETURNING key`
  return rows.length > 0
}
```
- `commitKey` and `releaseKey` stay best-effort, but log: `catch (e) { console.error('[idempotency] commit failed', e) }` (and `'release failed'`).
- After `getIdempotencyKey` (`:30-32`), add `recordCommitted` (B4-1) and the owner helpers:
```ts
/**
 * P1-2 (B4-1): record the outcome INSIDE the write's own transaction, as its last statement.
 * If anything after COMMIT throws, or the reply is lost, a same-key replay gets this answer
 * instead of re-running a write that already happened. The wrapper overwrites it with the
 * full reply when the handler returns; releaseKey deletes only rows with no status, so it never
 * frees this one. No key → no-op. Not swallowed (B4-12).
 */
export async function recordCommitted(tx: Prisma.TransactionClient, req: Request, status: number, body: Record<string, unknown>): Promise<void> {
  const key = getIdempotencyKey(req)
  if (!key) return
  await tx.idempotencyKey.updateMany({ where: { key, statusCode: null }, data: { statusCode: status, responseBody: body as Prisma.InputJsonValue } })
}

/** P1-2 (B3-11, DM-6 / BO-1): who a saved answer belongs to. On the hub portal (/s/…, /api/s/…)
 *  the link's path, which carries its token. Anywhere else the signed-in user. With no session
 *  the wrapper answers itself — 401, or 503 when the database can't be reached — and the handler
 *  never runs unkeyed: getSession reads a database error as "no session", and a handler whose
 *  own lookup a moment later succeeds would apply a replay twice. */
async function requestOwner(req: Request): Promise<string | NextResponse> {
  const path = new URL(req.url).pathname
  if (path.startsWith('/s/') || path.startsWith('/api/s/')) return `public:${path}`
  const session = await requireAuth().catch(() => null)
  if (session) return `user:${session.userId}`
  const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false)
  return dbUp ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) : serverUnavailableResponse()
}

// B3-11: rows written before P1-2 hold the body hash alone (no ".owner" part): compare that half.
function sameRequest(stored: string | null, now: string): boolean {
  if (!stored) return true // pre-CR-2 rows; none survive the reaper
  return stored.includes('.') ? stored === now : stored === now.split('.')[0]
}
```
- `withIdempotency` (`:107-153`), the part before the handler runs:
```ts
  const key = getIdempotencyKey(req)
  if (!key) return handler()
  const owner = await requestOwner(req)
  if (typeof owner !== 'string') return owner // BO-1: refused before any claim; the handler doesn't run
  let bodyText = ''
  try { bodyText = await req.clone().text() } catch { bodyText = '' }
  const bodyHash = `${hashBody(bodyText)}.${hashBody(owner).slice(0, 16)}`
  const replay = (row: CachedRow) => sameRequest(row.bodyHash, bodyHash)
    ? NextResponse.json(row.body as Record<string, unknown>, { status: row.status })
    : mismatchResponse()

  try {
    const cached = await getCached(key, scope)
    if (cached) return replay(cached)
    if (!(await claimKey(key, scope, bodyHash))) {
      for (const delay of [50, 100, 200, 400, 800]) {
        await new Promise<void>((r) => setTimeout(r, delay))
        const retry = await getCached(key, scope)
        if (retry) return replay(retry)
      }
      return NextResponse.json({ error: `${IDEMPOTENCY_IN_FLIGHT_ERROR} — retry after the original completes.` }, { status: 409 })
    }
  } catch (e) {
    // DM-6: never run a keyed write without its key memory. The queue waits and retries the 503.
    console.error('[idempotency] key store unreachable; write refused', e)
    return serverUnavailableResponse()
  }
```
  Everything from `let res: NextResponse` (`:155`) down is unchanged, so a 429 (O2's email limit) or any other non-2xx, non-400 answer still releases its key. Add a comment line above `await releaseKey(key)` (`:159`): `// A key the handler recorded (recordCommitted) has a status, so releaseKey leaves it.`
  - Every wrapped route except the hub portal's authenticates itself (all 20 checked). After S4 the portal has one wrapped route, `/api/s/[token]/transition` (S4 deleted `src/app/s/[token]/transition/route.ts`). Keep both prefixes in `requestOwner`: `/s/…` serves old links, and `fnd6-public-link-gate` posts to a `/s/…` URL (OX-18). So the wrapper's 401 carries the same status and words as the handler's own; only a blip changes. The queue parks a 401 without burning a try (`useOfflineQueue.ts:459-468`); from O2 it first asks the health check whether the server is down.

1.4 **Reap at 10 days** (`src/app/api/cron/dispatch/route.ts:99-109`). Replace the comment and the SQL; keep the try/catch and the counter:
```ts
  // 2) Reap idempotency keys older than IDEMPOTENCY_KEEP_DAYS (P1-2, was 48 h). A phone can
  // hold a write for QUEUE_MAX_AGE_DAYS and replay it with the same key, so the key must outlive it.
  …
      await prisma.$executeRaw`DELETE FROM idempotency_key WHERE created_at < NOW() - make_interval(days => ${IDEMPOTENCY_KEEP_DAYS}::int)`,
```
S1 adds its sign-in-records purge right below this block (its step 2b) and `signInsPurged` to the return at `:462` (`:471` after S); leave both. The reap is still `:99-110` after S. Data D1 later edits `:84-97` and that return too.

1.5 **Record the outcome in the write's transaction (B4-1).** One line inside each transaction, and a fallback reply where the post-commit read can throw. The fallback body equals the recorded body. Clients are fine with `{ id }`: the queue's remap reads `id` (`src/lib/offline-remap.ts:32-39`), admin NewDeploymentDialog treats the rig as nullable (`src/components/admin/NewDeploymentDialog.tsx:274`), and the admin page re-reads after a 2xx (`admin/deployments/page.tsx:532-537`).
- `src/app/api/deployments/route.ts`: after `collectReservations` (`:307`), `await recordCommitted(tx, req, 201, { id: newRig.id })` (it writes only `idempotency_key`, so P1-1d's "collect is the last business statement" holds). Replace `:372`:
  ```ts
  // P1-2 (B4-1): the deployment exists — a failed read for the reply must not read as a failure.
  const reply = await hydrateRigOperator(rig).catch((err) => { console.error('[POST /api/deployments] reply read after commit failed', err); return { id: rig.id } })
  return NextResponse.json(reply, { status: 201 })
  ```
- `src/app/api/deployments/[id]/items/route.ts`: POST, after `collectReservations` (`:261`): `await recordCommitted(tx, req, 200, { id })`. DELETE, before `}) // end transaction` (`:640`): the same line. Replace both replies (`:304-305`, `:665-666`):
  ```ts
  const reply = await prisma.rig.findUniqueOrThrow({ where: { id }, include: RIG_INCLUDE }).then((r) => hydrateRigOperator(r))
    .catch((err) => { console.error('[/api/deployments/[id]/items] reply read after commit failed', err); return { id } })
  return NextResponse.json(reply)
  ```
- `src/app/api/deployments/[id]/vehicles/route.ts` DELETE: before the transaction's closing `})` (`:256`), `await recordCommitted(tx, req, 200, { id })`; replace `:269-270` the same way. POST isn't wrapped (a re-run is harmless, P1-1a 2.4); leave it.
- `src/app/api/deployments/[id]/transfer/route.ts`: before `return created` (`:162`), `await recordCommitted(tx, req, 201, { id: created.id })`. Replace `:175`:
  ```ts
  const reply = await hydrateTransfersFromRig([transferRequest]).then((r) => r[0])
    .catch((err) => { console.error('[POST /api/deployments/[id]/transfer] reply read after commit failed', err); return { id: transferRequest.id } })
  return NextResponse.json(reply, { status: 201 })
  ```
- `src/app/api/deployments/[id]/end/route.ts`: after `cancelPendingHandoffs(id, tx)` (`:420`), `await recordCommitted(tx, req, 200, { ok: true })`. (Not in I1: End's post-commit work is already caught, but a recorded row is what makes the dead-claim takeover safe for End.)
- `src/app/api/deployments/[id]/items/[kitItemId]/route.ts` (Scan return, Log usage, ⊖): before the transaction's closing `})` (`:219`), `await recordCommitted(tx, req, 200, { ok: true })`. Its early returns (`:123` serialized, `:162` and `:170` consumable: a line a racing return already closed) write nothing, so they need no record (OX-10). (Not in I1, for the same reason; a re-run of a partial Log usage would decrement twice.)
- `src/app/api/daily-check/[id]/open-task/route.ts`: move `resolveActiveAlert('DAILY_CHECK_FAILED', 'vehicles', check.vehicleId)` (`:77`) into the transaction, after the photo `updateMany` (`:72`), with `tx` as its 4th argument (`alerts.ts:99-105`). Nothing after the transaction can throw then. This changes `cc34-report-and-promote` (Tests, OX-1).
- The other wrapped routes don't record. A takeover there re-runs a write only when its first run committed, its `commitKey` failed **and** its reply was lost (in practice: an instance killed at deploy time between the two). What a re-run does: daily check → same-day upsert, or for a late check the past-date 409 "already exists" though it was filed · handoff/transfer accept and decline, maintenance complete → "no longer pending" 409 · report-problem, report-damage, field-fix → notes appended to the open task · deployment-requests POST → a second request. Never a double stock move. Listed under Interpretations (§9, BO-22).

1.6 **B4-11** (`src/lib/asset-status.ts` `releaseUnlinkedReturns`, `:187-193`): add `statusLinks: { none: { type: 'HUB_RETURN', state: { in: [...ACTIVE_HUB_RETURN_STATES] } } }` to the `where` (`ACTIVE_HUB_RETURN_STATES` is at `:33`). Doc line: "Only units with no active HUB_RETURN link — when issuing fails part-way, the units that did get one stay Returning (B4-11)." The three callers (`end/route.ts:448-453`, `items/route.ts:658-663`, `items/[kitItemId]/route.ts:232-237`) are unchanged. No status literal is added, so the D42 guard passes unchanged.

1.7 **B4-10c.** End's "no home hub" (`end/route.ts:427`): `{ status: 409 }`. Comment: `// B4-10c: depends on stored data (the line's hubs), so 409 — never cached; Retry works once an admin sets a home hub.` The comment above it (`:426`) says "the existing 400": make it `// Step 4: an auto-filled line with no home hub; nothing was written.` (OX-11).

1.8 **D26 amended** (`src/app/api/daily-check/route.ts`):
- `:13-18` → `import { QUEUE_MAX_AGE_DAYS } from '@/lib/offline-limits'` and `const PAST_WINDOW_DAYS = QUEUE_MAX_AGE_DAYS // D26 (amended 2026-10-26): 7 days, the phone's limit`. The comment says "older is refused, never re-dated; a future date is still clamped to today (FND-7)". The POST's own comment (`:104-109`) says "clamp anything older or ANY future date to today": make it "refuse anything older (409), clamp ANY future date to today" (OX-11).
- `today` and `earliest` (`:110-111`) already come from `businessDate()`, so the window counts Eastern business days once the Eastern-time PR is in. No zone is written here. The phone's limit (7 × 24 h from saving) is never looser than this window, DST days included (BO-23).
- `:114-119` becomes:
```ts
  if (clientDate >= earliest && clientDate <= today) {
    date = clientDate
  } else if (clientDate > today) {
    date = today // FND-7: a future date is still clamped to today
    console.warn('[daily-check] future client date clamped', { clientDate, today })
  } else {
    // D26 (amended): older than the window is refused, never re-dated to today (B5-19).
    return NextResponse.json({ error: `This check was done on ${clientDate}, more than ${PAST_WINDOW_DAYS} days ago — too old to file. Discard it.` }, { status: 409 })
  }
```
- **Checked (§0-j):** a second same-day check of a vehicle by another crew member is refused by name under the advisory lock (`daily-check/route.ts:132-133`, `rig-daily-checks.ts:79-93`): `Already checked today by <name> at <time>` (or `on <date>` for a late one). It applies while the vehicle is on an active rig and the submitter is on its open crew. A 409 isn't cached, so the queue marks it failed with those words. No change needed.

1.9 **B5 §3: say why a deployment write can't happen** (`src/lib/deployment-auth.ts:18-23`; I4b's shape, same name, so P1-1a's `active` hook mock keeps working):
```ts
import { Prisma, type Rig } from '@prisma/client'
…
export const NOT_ON_DEPLOYMENT = "You're not on this deployment any more."
/** Fetch + authorize an ACTIVE rig, and say why not (B5 §3): gone 404, ended 409, not on its
 *  crew 403. Ended is checked first — End closes the crew's assignments, so the crew would
 *  read as 403. */
export async function getAuthorizedActiveRig(id: string, session: Session): Promise<
  { rig: Rig; status?: undefined; error?: undefined } | { rig?: undefined; status: 403 | 404 | 409; error: string }> {
  const rig = await prisma.rig.findUnique({ where: { id } })
  if (!rig) return { status: 404, error: 'Not found' }
  if (rig.endedAt) return { status: 409, error: new DeploymentEnded().message }
  if (!(await isAuthorizedForRig(rig, session))) return { status: 403, error: NOT_ON_DEPLOYMENT }
  return { rig }
}
```
- The four callers: items POST (`items/route.ts:116-117`) and vehicles POST (`vehicles/route.ts:65-66`) use `rig` afterwards (`rig.projectId`, `rig.operatorId`): `const auth = await getAuthorizedActiveRig(id, session); if (!auth.rig) return NextResponse.json({ error: auth.error }, { status: auth.status }); const rig = auth.rig`. Items DELETE (`:316-317`) and vehicles DELETE (`:180-181`) don't: drop the `const rig`.
- **End does the same order** (new, §9 row 1). `end/route.ts:92-96` checks the crew before "ended", so a crewmate's saved End after the deployment ended gets 403 "Forbidden". Move `if (rig.endedAt) …409` (`:96`) above the `isAuthorizedForRig` block (`:93-95`), and make that block's body `{ error: NOT_ON_DEPLOYMENT }` with 403. Admins still pass the crew check, so `p1-1a-end-claim`'s admin cases are unchanged.
- All three statuses are terminal in the queue (`useOfflineQueue.ts:45`); only the words change.

**Operator sees.**
- A saved add or return that reaches the server after the deployment ended fails in the Outbox as "This deployment has already ended." (before: "Not found or forbidden"). A saved End after a crewmate's End: the same words (before: "Forbidden"). An operator no longer on the crew: "You're not on this deployment any more."
- A check saved 8 days ago fails as "This check was done on 2026-10-17, more than 7 days ago — too old to file. Discard it." (before: filed silently as today's, which also cleared today's missed-check alert).
- During a database blip, a saved action waits instead of applying without its "once" check. Nothing else is visible.

**Tests** (node/DB; harness as `tests/pr5b-dead-ends.test.ts`).
- New `tests/p1-2-saved-action-once.test.ts`:
  - (a) `IDEMPOTENCY_KEEP_DAYS >= QUEUE_MAX_AGE_DAYS + 2`.
  - (b) Insert two raw `idempotency_key` rows created 9 and 11 days ago. Run the cron as `tests/pr4-signals-cron.test.ts:18-22` does → the 9-day row stays, the 11-day row is gone.
  - (c) With a signed-in session mocked, a NULL row for key K created 11 min ago → `withIdempotency(req(K), 'test', handler)` runs the handler once and returns its 200; a second call returns the cached 200. A NULL row created 1 min ago → 409 starting with `IDEMPOTENCY_IN_FLIGHT_ERROR`; the handler never runs.
  - (d) `vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection reset'))` → 503 with `code: 'SERVER_UNAVAILABLE'`, the handler never runs, no row exists.
  - (e) B4-1: a handler that runs `recordCommitted` in a transaction and then throws → a same-key replay returns that body, the handler ran once. A handler that throws **before** commit → the key is released and the replay runs again (regression guard).
  - (f) B3-11: user A, key K, body X → 201; A again → the same body; user B with K and X → 422; a null session on `/api/deployments` → **401 from the wrapper, the handler never runs**, no row; the portal path with no session binds to its path, and another link's path with the same key and body → 422 (`tests/fnd6-public-link-gate.test.ts:189` stays green); a legacy row (`body_hash` = plain sha256 of X, raw SQL) replays for anyone with X.
  - (f2) BO-1, real `getSession` (mock `next/headers` cookies as `tests/zz-probe-o1-blip.test.ts` on the review clone does): A commits K. On the replay, `vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('connection reset'))` → 401, the handler ran once, one row. The next replay → the stored 200.
  - (f3) BO-1: the same, with `vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(…)` as well → 503 `SERVER_UNAVAILABLE` with `Retry-After: 30`; the handler ran once.
  - (g) B5 §3: an operator ends the deployment, then POSTs `/items` → 409 "This deployment has already ended." and `DELETE /vehicles` → the same 409; an operator not on the crew → 403 "You're not on this deployment any more."; an unknown id → 404. A crewmate's End after the deployment ended → 409 (was 403).
  - (h) D26: (covered in `cc29-late-sync-date`, below).
- New `tests/p1-2-writes-once.test.ts` (I1's cases). A hook mock: `vi.mock('@/lib/deployment-assignments', …)` spreads the original and lets `hydrateRigOperator` / `hydrateTransfersFromRig` throw once when `hook.failReply` is set; reset in `afterEach`.
  - Add items, consumable 3, key + `failReply` → 200 `{ id }`; same-key replay → 200; stock drawn once, one line.
  - Partial bulk return, 4 of 10, `failReply` + replay → stock +4 once, line at 6.
  - Start, `failReply` → 201 `{ id }`; replay → the same id, one rig, no OPERATOR_HAS_ACTIVE_RIG.
  - Transfer, `failReply` + replay → one TransferRequest, 201 both times.
  - Remove vehicles, `failReply` + replay → one removal, 200 both times.
  - End, and a single Log usage of 2 of 10: make the wrapper's own `commitKey` fail (`vi.spyOn(prisma, '$executeRaw')` rejecting only SQL that contains `SET status_code`, passing everything else through), then replay the same key → the row already holds the 200 recorded inside the transaction, so the replay returns it: End ran once (no 409), the line went 10 → 8 once.
  - Race: `Promise.all` of two same-key Add items while the first's reply fails → one line; the other gets 200 or the in-flight 409, never a second draw.
  - open-task → DAILY_CHECK_FAILED resolved and its bell row read in the same commit.
  - B4-11: units A (ISSUED HUB_RETURN link) and B (none), both IN_TRANSIT → `releaseUnlinkedReturns([A, B])` → A IN_TRANSIT, B AVAILABLE.
- `tests/cc29-late-sync-date.test.ts`: replace "an out-of-window (5-day-old) date is clamped to today" (`:99-108`) with three cases: 6 days ago is stored at its day; 7 days ago is stored; 8 days ago → 409 matching `/too old to file/`, no row written.
- **Existing tests that change:** the `cc29` case above · `tests/ur034-daily-check-failed-alert.test.ts:45,65`: `date: '2026-06-25'` is now refused; use `businessDate()` (packet D later adds a 5th `expect.anything()` at `:52`) · `tests/data-integrity.test.ts:575-595`: expects 400; make it 409 and rename it "… 409 (B4-10c)" · `tests/cc34-report-and-promote.test.ts:177` (OX-1): the resolve now runs on the transaction client, so add `expect.anything()` as the 4th argument: `toHaveBeenCalledWith('DAILY_CHECK_FAILED', 'vehicles', vehicle.id, expect.anything())`, with the comment `// P1-2 O1 (B4-1): resolved inside open-task's transaction (its client is the 4th argument).`
- **Must pass unchanged:** `p1-1a-end-claim` (its `deployment-auth` mock spreads the real module, `:33-39`), `p1-1a-field-writes`, `ur001-bulk-return-perhub`, `p1-1d-staged-ready`, `cc31-expired-hub-return`, `pr3a-status-writers-guard`, `pr4-signals-cron`, `cc30-cron-lock-connect-error`, `wave-a-correctness`, `pr5c-today-crew-rig`, `fnd6-public-link-gate`, `cr1-consumable-stock`, `fnd2-transfer-consumable-stock`, `pr3c-delete-items` and `cc10-field-fix` (`cc10` and `cc34` mock only `getSession`/`requireAuth`/`requireAdmin`; `requestOwner` uses `requireAuth`, and with a null session its `SELECT 1` reaches the real test database), and every Security test. Practice build: these four were the only changes; the UI suite was unchanged (86 / 664).

**Files.** New `src/lib/offline-limits.ts`; `src/lib/shared-errors.ts`; `src/lib/api-errors.ts`; `src/lib/idempotency.ts`; `src/app/api/cron/dispatch/route.ts`; `src/app/api/deployments/route.ts`; `src/app/api/deployments/[id]/items/route.ts`; `src/app/api/deployments/[id]/items/[kitItemId]/route.ts`; `src/app/api/deployments/[id]/vehicles/route.ts`; `src/app/api/deployments/[id]/transfer/route.ts`; `src/app/api/deployments/[id]/end/route.ts`; `src/app/api/daily-check/[id]/open-task/route.ts`; `src/app/api/daily-check/route.ts`; `src/lib/deployment-auth.ts`; `src/lib/asset-status.ts`; the two new tests; the four changed tests; this packet. (`00_START_HERE.md` goes in the post-merge docs commit, §7.)

**Behaviour changes (PR body):** some 404/403/400 answers become named 409/403s · checks older than 7 days are refused · keys live 10 days · a database error on a keyed write answers 503 instead of applying it without the check · a keyed write with no session gets the wrapper's own 401 (same words), or 503 when the database is down · a replay under another person's session gets 422.

---

## O2 · One queue, fair retries, stays on screen (client engine + auth)

**Goal.** Every reader on a page sees the same queue at once, even offline. Start-up and the data-loss tripwire run once per page. Server errors take about an hour to fail an action. A slow photo holds back only its own deployment. Actions older than 7 days aren't sent. Online writes refresh screens. A database outage never signs anyone out. A PIN reset parks saved work. At most 20 notifying writes per operator per hour, and the limit never starts without the slower retries. Actions already on phones keep working.
Closes UI-1, B5-12, B5-14, B5-11, B5-5 (queue side), B1-10, UI-2/C-05, B5-8, B5-7, N2, and B3-17 (from Security rev 2, BS-5 and BS-10). Depends on O1 (`offline-limits.ts`, `SERVER_UNAVAILABLE_*`, `serverUnavailableResponse`).

**The one shared queue store.** Today each `useOfflineQueue()` keeps its own counts (`useOfflineQueue.ts:229-244`), so the banner, the header badge and the screen disagree, and an offline save moves only its own reader (UI-1). From O2 the page has one store in a pure module. Every reader subscribes to it with `useSyncExternalStore`. Any write by any reader re-reads IndexedDB once and publishes one snapshot. `isOffline` and `syncing` stay per reader (they describe that reader).

2.1 **New `src/lib/offline-queue-db.ts`** (pure: no React, no Sentry). **Move** `DB_NAME`/`STORE`/`DB_VERSION` (`useOfflineQueue.ts:13-15`) and `openDB`/`getAllItems`/`putItem`/`deleteItem`/`getItemById` (`:109-150`) here as `openQueueDB`/`getAllQueueItems`/`putQueueItem`/`deleteQueueItem`/`getQueueItem`, **byte for byte** (2.10 says why); the hook imports them under its old names. Then:
```ts
import type { OfflineQueueItem } from '@/types'
import { QUEUE_MAX_AGE_DAYS } from '@/lib/offline-limits'
const DAY_MS = 86_400_000
const HINT_KEY = 'ahits_pending_hint'
/** A waiting action this old raises the "send it today" warning (Q1: 6 days). */
export const QUEUE_WARN_AGE_MS = (QUEUE_MAX_AGE_DAYS - 1) * DAY_MS
export const CREDENTIAL_CHANGED_EVENT = 'ahits:credential-changed'

/** The signed-in person, from the identity cache useAuth writes (C-05: the field is userId). */
export function readIdentity(): { userId: string } | null {
  try {
    const raw = window.localStorage.getItem('ahits_identity')
    const v = raw ? (JSON.parse(raw) as { userId?: unknown; id?: unknown } | null) : null
    const id = v?.userId ?? v?.id
    return typeof id === 'string' && id ? { userId: id } : null
  } catch { return null }
}

export interface QueueSnapshot {
  items: OfflineQueueItem[]   // oldest first, failed included
  pending: number
  failed: number
  pendingDeployCreate: boolean
  staleQueue: boolean         // a waiting action is 6+ days old
  sessionExpired: boolean
  persistenceGranted: boolean | null
  idbWritable: boolean
  nearQuota: boolean
  possibleDataLoss: boolean
}
const EMPTY: QueueSnapshot = { items: [], pending: 0, failed: 0, pendingDeployCreate: false, staleQueue: false,
  sessionExpired: false, persistenceGranted: null, idbWritable: true, nearQuota: false, possibleDataLoss: false }
let snapshot = EMPTY
const listeners = new Set<() => void>()
export function subscribeQueue(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l) } }
export const getQueueSnapshot = (): QueueSnapshot => snapshot
export const getServerQueueSnapshot = (): QueueSnapshot => EMPTY

const sig = (i: OfflineQueueItem) => `${i.id}|${i.status}|${i.retries}|${i.nextAttemptAt ?? ''}|${i.final ? 1 : 0}|${i.endpoint}|${i.lastError ?? ''}`
function same(a: QueueSnapshot, b: QueueSnapshot): boolean {
  return a.pending === b.pending && a.failed === b.failed && a.pendingDeployCreate === b.pendingDeployCreate &&
    a.staleQueue === b.staleQueue && a.sessionExpired === b.sessionExpired && a.persistenceGranted === b.persistenceGranted &&
    a.idbWritable === b.idbWritable && a.nearQuota === b.nearQuota && a.possibleDataLoss === b.possibleDataLoss &&
    a.items.length === b.items.length && a.items.every((x, k) => sig(x) === sig(b.items[k]!))
}
// Hotfix #270 rule kept: an unchanged queue publishes nothing, so nothing re-renders.
function publish(next: QueueSnapshot): void {
  if (same(snapshot, next)) return
  snapshot = next
  for (const l of listeners) l()
}
export function setQueueFlags(patch: Partial<Pick<QueueSnapshot, 'sessionExpired' | 'persistenceGranted' | 'idbWritable' | 'nearQuota' | 'possibleDataLoss'>>): void {
  publish({ ...snapshot, ...patch })
}

// Page-wide state that used to live in each reader (UI-1).
export const queuePage = {
  backoffCleared: false,                 // BO-14: "server back" sets it; the next flush clears backoff under its lock
  flushed: false,                        // was flushedThisSessionRef (useOfflineQueue.ts:246-248)
  oldHint: null as number | null,        // last session's pending hint, captured before the first recount writes it
  health: null as Promise<[boolean, { usage: number; quota: number; ratio: number } | null, boolean]> | null,
  tripwire: null as Promise<boolean> | null,
}

/** Re-read IndexedDB and publish. Never throws; no IndexedDB (jsdom, SSR) → no-op. */
export async function recountQueue(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const all = (await getAllQueueItems(await openQueueDB())).sort((a, b) => a.createdAt - b.createdAt)
    const waiting = all.filter((i) => i.status !== 'failed')
    try {
      if (queuePage.oldHint === null) queuePage.oldHint = Number(localStorage.getItem(HINT_KEY) ?? '0')
      localStorage.setItem(HINT_KEY, String(waiting.length))
    } catch { /* storage unavailable */ }
    const now = Date.now()
    publish({
      ...snapshot,
      items: all,
      pending: waiting.length,
      failed: all.length - waiting.length,
      pendingDeployCreate: waiting.some((i) => i.endpoint === '/api/deployments' && i.method === 'POST'),
      staleQueue: waiting.some((i) => now - i.createdAt > QUEUE_WARN_AGE_MS),
      sessionExpired: waiting.length === 0 ? false : snapshot.sessionExpired, // nothing parked → no stale prompt
    })
  } catch { /* IDB blip — keep the last snapshot */ }
}
/** This page's queue, oldest first, re-read now. [] without IndexedDB. */
export async function readQueue(): Promise<OfflineQueueItem[]> { await recountQueue(); return snapshot.items }

/** P1-2 (B5-8): the server is back — every waiting action may try again now. Called only by
 *  flush, under its lock (BO-14). One readwrite cursor pass, so a stale read never brings back an
 *  item another pass just sent or failed. Best-effort. */
export async function clearBackoff(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openQueueDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      const req = tx.objectStore(STORE).openCursor()
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) return
        const i = cur.value as OfflineQueueItem
        if (i.status !== 'failed' && i.nextAttemptAt) cur.update({ ...i, nextAttemptAt: undefined })
        cur.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch { /* best-effort */ }
}

export function __resetOfflineQueueForTests(): void {
  snapshot = EMPTY
  queuePage.backoffCleared = false; queuePage.flushed = false; queuePage.oldHint = null; queuePage.health = null; queuePage.tripwire = null
}
```
`tests/setup.ui.ts`: inside the `afterEach`, after the history-guard reset, add `try { offlineQueueDb.__resetOfflineQueueForTests() } catch {}` and `try { serverStatus.__resetServerStatusForTests() } catch {}` with `import * as offlineQueueDb from '@/lib/offline-queue-db'` and `import * as serverStatus from '@/lib/server-status'` (the pattern at `:20-24`).

2.2 **`src/hooks/useOfflineQueue.ts` reads the store.**
- Delete the nine count/flag states (`:229-231`, `:236-240`, `:244`) and `flushedThisSessionRef` (`:246-248`). Add `const view = React.useSyncExternalStore(subscribeQueue, getQueueSnapshot, getServerQueueSnapshot)`. Keep `syncing` and `isOffline` as states.
- `refresh` (`:255-274`) becomes `const refresh = React.useCallback(() => recountQueue(), [])`.
- Every `setSessionExpired(x)` → `setQueueFlags({ sessionExpired: x })`. `:453` → `queuePage.flushed = true`.
- Start-up and the tripwire run once per page (replace `:700-729`; `oldHint` now comes from `queuePage.oldHint`, captured by the first recount on the page, whichever reader runs it):
```ts
    async function init() {
      queuePage.health ??= Promise.all([ensurePersistentStorage(), getStorageEstimate(), probeIdbWritable()])
      const [persisted, estimate, writable] = await queuePage.health
      setQueueFlags({ persistenceGranted: persisted, idbWritable: writable, nearQuota: !!estimate && estimate.ratio > 0.8 })
      await recountQueue()
      // CC-30 tripwire, once per page: a reader mounted after another drained the queue must not
      // call that drain "possible data loss" (UI-1 race, :248 / :714).
      queuePage.tripwire ??= (async () => {
        const oldHint = queuePage.oldHint ?? 0
        if (!(oldHint > 0) || queuePage.flushed) return false
        const items = await getAllItems(await openDB())
        if (items.some((i) => i.status !== 'failed')) return false
        reportPossibleDataLoss(oldHint)
        return true
      })().catch(() => false)
      if (await queuePage.tripwire) setQueueFlags({ possibleDataLoss: true })
    }
```
- The return object reads `view.*` for `pending`, `failed`, `sessionExpired`, `pendingDeployCreate`, `persistenceGranted`, `idbWritable`, `nearQuota`, `possibleDataLoss`, `staleQueue`, and `storageAtRisk`. `listAll` returns `readQueue()`.

2.3 **Fair retries (B5-14).** `src/types/index.ts`, after `invalidates` (`:114`):
```ts
  /** P1-2 (B5-14): don't try again before this time (ms). Set after a failed send. */
  nextAttemptAt?: number
  /** P1-2: Retry can't change this failure (a cached 400, a 422, or too old). The Outbox offers Discard only. */
  final?: boolean
```
In `useOfflineQueue.ts`, module scope:
```ts
// P1-2 (B5-14, Q4): waits between tries — 8 tries span about an hour of server trouble,
// however many screens are open (each reader's 30 s tick just finds nothing due).
const RETRY_WAIT_MS = [30_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000]
function nextAttemptAfter(retries: number): number {
  return Date.now() + RETRY_WAIT_MS[Math.min(Math.max(retries, 1), RETRY_WAIT_MS.length) - 1]!
}
```
- The three not-yet-failing puts — photo server-reached (`:367-373`, flag `failing`), in-flight 409 (`:482-486`) and 5xx (`:525-529`, flag `hitRetryCap`) — become `...(flag ? { status: 'failed' as const, lastError: … } : { nextAttemptAt: nextAttemptAfter(retries) })`.
- The transient branch (`:520-533`) covers 5xx, 408 **and 429**, so all three use these waits. The email limit (2.9) depends on this: a saved report that gets "too many reports" waits 30 s, 1, 2 … 30 min and outlasts the clock hour (CO-4). It ignores `Retry-After`.
- The terminal put (`:490`) adds `final: res.status === 400 || res.status === 422`.
- `retryItem` (`:583`) also clears `nextAttemptAt: undefined, final: undefined`.
- The probe (`:320`) counts an item as drainable only when `i.status !== 'failed' && (queuePage.backoffCleared || !(i.nextAttemptAt && i.nextAttemptAt > Date.now()))`, so a queue that is only waiting out its backoff shows "waiting to sync", never the sync spinner (UXP-1g), and a "server back" pass still runs (2.7).
- **The Outbox's "Stuck? Discard"** (`src/components/operator/OutboxDialog.tsx:25,95`, BO-10): with backoff, `retries >= 3` is reached about 3.5 minutes into an outage, while the queue is meant to try for an hour (§0-d), so the button invites discarding work that would have sent. Delete `STUCK_RETRIES` and keep only the age clause: `const stuck = !failed && loadedAt > 0 && loadedAt - item.createdAt > STUCK_AGE_MS`. Every retry chain now ends in Failed (with Retry) after about an hour, so nothing wedges.
- Extract the dependent-quarantine loop (`:501-518`) into `async function quarantineDependents(db: IDBDatabase, failed: OfflineQueueItem)`; call it there, in the photo branch (`:390-406`), and in 2.4.

2.4 **The 7-day limit (Q1).** Module scope: `const QUEUE_MAX_AGE_MS = QUEUE_MAX_AGE_DAYS * 86_400_000` and ``const TOO_OLD_ERROR = `Saved on this phone more than ${QUEUE_MAX_AGE_DAYS} days ago — too old to send. Discard it, and redo it if it's still needed.` ``. In `flush`, declare `const held = new Set<string>()` before the `for` (`:332`); after the re-read guard (`:341`):
```ts
        // P1-2 (B5-5, Q1): an action older than the queue's limit is never sent.
        if (Date.now() - item.createdAt > QUEUE_MAX_AGE_MS) {
          await putItem(db, { ...item, status: 'failed', final: true, lastError: TOO_OLD_ERROR })
          reportItemFailed(item, TOO_OLD_ERROR)
          await quarantineDependents(db, item)
          continue
        }
        // P1-2 (B5-14): an action that just failed waits for its turn.
        if (item.nextAttemptAt && item.nextAttemptAt > Date.now()) continue
        // P1-2 (B5-11): a slow photo earlier in this pass holds back its deployment's later actions.
        if (held.has(orderKey(item))) continue
```
`src/components/operator/OfflineBanner.tsx:144-145`: "Some actions saved on this phone are 6 days old. Reconnect today — after 7 days they can't be sent."

2.5 **Slow photos (B5-11).**
- `src/lib/photoStore.ts`: `PhotoUploadError` gains `readonly timedOut: boolean` (4th constructor argument, default `false`). `uploadPhotoBlob(blob, filename = …, timeoutMs = PHOTO_UPLOAD_TIMEOUT_MS)` uses `timeoutMs` at `:143`. In its catch (`:147-149`): `const timedOut = controller.signal.aborted || (e as { name?: string } | null)?.name === 'AbortError'`, passed through. Export the default deps (`:196-200`) as `export const defaultPhotoDeps`.
- `useOfflineQueue.ts`, module scope:
```ts
// P1-2 (B5-11): the background send gives a photo 60 s (≈400 KB at 60 kbps); an on-screen
// submit keeps the 20 s default, so a spinner never waits a minute per photo.
const FLUSH_PHOTO_DEPS: ResolveDeps = { ...defaultPhotoDeps, upload: (b, f) => uploadPhotoBlob(b, f, 60_000) }
/** Actions on one deployment (or one endpoint) keep their order behind a slow photo. */
function orderKey(item: OfflineQueueItem): string {
  const m = /^\/api\/deployments\/([^/?]+)/.exec(item.endpoint)
  if (m) return `deployment:${m[1]}`
  if (item.endpoint === '/api/deployments' && item.placeholderId) return `deployment:${item.placeholderId}`
  return item.endpoint.split('?')[0]!
}
```
- `:346` → `resolvePhotoRefs(item.body, FLUSH_PHOTO_DEPS)`. Before the existing `break` (`:409-412`): `if (err instanceof PhotoUploadError && err.timedOut) { held.add(orderKey(item)); continue } // B5-11: weak uplink; other targets still send`. Offline keeps today's FIFO `break`.
- `src/components/operator/OutboxDialog.tsx`, under the label (`:99-101`), for a non-failed item whose `JSON.stringify(item.body ?? null)` contains `localphoto:`: caption "Photos still to upload — this waits for a better signal."

2.6 **B1-10 and C-05.** `mutate`'s `res.ok` branch (`:653-656`): before the return, `if (args.invalidates?.length) dispatchInvalidate(args.invalidates) // B1-10: an online success refreshes screens too`. `currentUserId` (`:64-73`) returns `readIdentity()?.userId ?? 'unknown'` (C-05: the identity's field is `userId`, `types/index.ts:37-43`).

2.7 **A database outage keeps people on their screen (B5-8, accounts d).** Only `/api/auth/me` and login can tell an outage from a sign-out without touching ~120 routes. Every other route still answers 401 during an outage (getSession fails closed, `session.ts:79-82`), and the queue parks 401s without burning a try (`:459-468`). O1's keyed writes answer 503 when the key store or the session lookup can't reach the database. A revoked user also stays on screen during an outage; that is harmless, since nothing works on the server without the database (accounts §6, limit 3).
- `src/lib/auth/session.ts:55-83`: split `getSession`.
```ts
export type SessionCheck =
  | { status: 'ok'; session: SessionPayload }
  | { status: 'none' }        // no / bad / expired token, revoked, suspended, deleted
  | { status: 'unavailable' } // the database couldn't be reached (today's catch at :79-82)
/** P1-2 (B5-8): getSession, but an unreachable database is 'unavailable', not "signed out". */
export async function checkSession(): Promise<SessionCheck> { /* today's body; each `return null` → { status: 'none' }; the DB catch → { status: 'unavailable' } */ }
// Unchanged for every route: an outage still reads as no session, so routes answer 401 and the queue parks.
export async function getSession(): Promise<SessionPayload | null> { const c = await checkSession(); return c.status === 'ok' ? c.session : null }
```
  Security S1 changes only `setSessionCookie` and `clearSession` in this file (the sign-out marker); split `getSession` as written and keep S1's lines.
- `src/app/api/auth/me/route.ts`: `const c = await checkSession()`; `unavailable` → `serverUnavailableResponse()`; `none` → 401 as today; wrap the `homeHubId` read (`:8-11`) and answer `serverUnavailableResponse()` if it throws; reply `{ ...c.session, homeHubId }`. One test calls this route with the session module mocked: Security S3's read guard (`tests/p1-2s3-operator-read-guard.test.ts`), which sweeps every GET. From Security rev 4.1 its mock already has `checkSession` (OX-2), so it passes unchanged. If the guard on your base has no `checkSession` line, both its sweeps fail here: add the line from the Security packet's S3 tests ("Session mock") and name it in the PR body.
- `src/app/api/auth/login/route.ts:86-89` (`:116-119` after S): the catch keeps `console.error` and answers `serverUnavailableResponse()` instead of 500 "Server error". The login page already shows `data.error`.
- `src/app/api/health/route.ts`: add `export async function HEAD() { const r = await GET(); return new NextResponse(null, { status: r.status }) }`. Next would answer HEAD from GET by itself; the explicit one only makes the probe visible (BO-18). Why HEAD: the service worker's default `apis` rule caches `/api/*` GETs and answers them offline (`@serwist/next` `index.worker.mjs:155-166`), so a GET probe can read "up" from a saved copy. No Serwist route matches HEAD, so it always goes to the network. `/api/health` is already public (`proxy.ts:20`), S1's cross-site check exempts HEAD, and S1's renewal skips `/api/` (checked on the review clone).
- **New `src/lib/server-status.ts`** (client):
```ts
import * as React from 'react'
import { mutate as revalidate } from 'swr'
export const SERVER_BACK_EVENT = 'ahits:server-back'
const RECHECK_MS = 30_000
let down = false
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }
// BO-13: the probe gives up after 8 s, so lie-fi never holds a flush (and its lock) on the OS timeout.
const probe = () => {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 8_000)
  return fetch('/api/health', { method: 'HEAD', cache: 'no-store', signal: c.signal }).finally(() => clearTimeout(t))
}

/** One probe: true only when the server answers 503 (database unreachable). Offline → false:
 *  that's "no signal", which the offline banner already says. */
export async function serverIsDown(): Promise<boolean> {
  try { return (await probe()).status === 503 } catch { return false }
}
export function markServerDown(): void {
  if (down) return
  down = true; emit()
  timer = setInterval(() => { void probe().then((r) => { if (r.ok) markServerUp() }).catch(() => {}) }, RECHECK_MS)
}
export function markServerUp(): void {
  if (!down) return
  down = false
  if (timer) { clearInterval(timer); timer = null }
  emit()
  void revalidate('/api/auth/me')
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SERVER_BACK_EVENT))
}
/** BO-5: a 200 from a screen doesn't prove the server is back (the worker answers /api/auth/me from
 *  its cache after 5 s, sw.ts:71). Only this probe, which the worker never answers, clears "down". */
export function recheckServer(): void { if (down) void probe().then((r) => { if (r.ok) markServerUp() }).catch(() => {}) }
export function useServerDown(): boolean {
  return React.useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => down, () => false)
}
export function __resetServerStatusForTests(): void { down = false; if (timer) clearInterval(timer); timer = null }
```
- `src/hooks/useAuth.ts` fetcher (`:35-49`), after the 401 branch:
```ts
  // P1-2 (B5-8): 503 = the server can't reach its database. Keep the last identity (SWR keeps
  // it); never redirect. The redirect at :103-108 still fires only on a real 401.
  if (res.status === 503) { markServerDown(); throw new Error('server-unavailable') }
  // B5-8 (latent, :46-47): never cache an error body as the identity.
  if (!res.ok) throw new Error(`auth/me ${res.status}`)
  // BO-5: this 200 may be the worker's saved copy (a hung database fails after ~5.1 s, the worker
  // answers from cache at 5 s). Only the HEAD probe clears "down".
  recheckServer()
```
- `useOfflineQueue.ts`:
  - **flush 401** (`:459-468`): `if (await serverIsDown()) markServerDown(); else setQueueFlags({ sessionExpired: true })`, then `break` as today.
  - **flush 5xx** (`:520-533`): read the body first; `if (res.status === 503 && (body as { code?: unknown }).code === SERVER_UNAVAILABLE_CODE) markServerDown()`; the backoff put is unchanged.
  - **mutate 401** (`:664-672`): after a stored enqueue, `const reason = (await serverIsDown()) ? 'server' as const : 'auth' as const`; `server` → `markServerDown()`, `auth` → `setQueueFlags({ sessionExpired: true })`; return `{ ok: true, queued: true, data: null, reason }`.
  - **mutate 503** (new, before the generic error return at `:673-674`): when the body's `code` is `SERVER_UNAVAILABLE_CODE`, enqueue the already-resolved `body` (as the 401 branch does) and return `{ ok: true, queued: true, data: null, reason: 'server' }` after `markServerDown()`; a failed enqueue returns the storage error. The key was never claimed (O1's 503 comes first), so the replay is clean.
  - **Lifecycle** (`:733-745`): `const onServerBack = () => { queuePage.backoffCleared = true; void flush() }` on `SERVER_BACK_EVENT`, and `const onCredentialChanged = () => { void recountQueue().then(() => flush()) }` on `CREDENTIAL_CHANGED_EVENT` (recount first: `flush` returns early offline); add both listeners and their removals. (Without the first, work backed off to 30 min would wait that long after the database returned.)
  - **Backoff is cleared under the flush lock (BO-14).** The first line inside `runExclusiveFlush`'s body (`:329-330`): `if (queuePage.backoffCleared) { queuePage.backoffCleared = false; await clearBackoff() }`. Clearing it from the event, outside the lock, could bring back an item another reader had just sent or failed (the race the CC-29 lock exists for, `:26-30`).
- `src/types/index.ts:132`: `reason?: 'auth' | 'server'`.
- `src/components/operator/OfflineBanner.tsx` (`:79-96`): `const serverDown = useServerDown()`. When true, push this first, CRITICAL, id `server-down`:
```tsx
        <Alert severity="warning" sx={bannerSx}>
          Can&apos;t reach the server right now. Keep working — what you save stays on this phone
          {pending > 0 ? ` (${pending} waiting)` : ''} and sends when it&apos;s back. Some screens may not load.
        </Alert>
```
  While it shows, skip the session-expired banner (`:84`: `if (!serverDown && sessionExpired && pending > 0)`).
- `src/app/(operator)/operator/daily-check/page.tsx:589-593`: a `'server'` branch before the `else`: "Can't reach the server — check saved on this phone. It sends when the server is back." (severity `info`).

2.8 **A PIN reset parks saved work (B5-7, N2).**
- `src/lib/shared-errors.ts`: `export const PIN_CHANGE_REQUIRED_CODE = 'PIN_CHANGE_REQUIRED'`.
- `src/proxy.ts:176-179`: add `code: PIN_CHANGE_REQUIRED_CODE` to the 403 JSON. **S2 rewrites this funnel by role:** add the code to every 403 it returns for an API write, whatever its words (after S: one 403 with S2's two wordings, `:202-206`).
- `useOfflineQueue.ts`, terminal branch, right after `errMsg` (`:471`):
```ts
          if (res.status === 403 && (errBody as { code?: unknown }).code === PIN_CHANGE_REQUIRED_CODE) {
            setQueueFlags({ sessionExpired: false }) // BO-4: signed in, waiting for a new PIN — not "Session expired"
            break // B5-7: no try burned; every later write would get the same 403
          }
```
  Why clear it: the store outlives the client navigation through `/login`, so the 401 from the Reset PIN would otherwise leave "Session expired — sign in to send 1 saved action" on the Change PIN screen (BO-4, run on the review clone).
- Photo branch (`:352-353`), first (N2, BO-9: mirrors the main 401 branch, so an outage never reads as "sign in"):
```ts
          if (err instanceof PhotoUploadError && (err.status === 401 || err.status === 403)) {
            if (err.status === 403) setQueueFlags({ sessionExpired: false })
            else if (await serverIsDown()) markServerDown()
            else setQueueFlags({ sessionExpired: true })
            break // N2: an expired session, an outage or a forced PIN change parks a photo action too
          }
```
- `src/app/(operator)/operator/change-pin/page.tsx:47-48`, and S2's `src/app/(admin)/admin/account/page.tsx` at its success toast: `window.dispatchEvent(new Event(CREDENTIAL_CHANGED_EVENT))` before `router.replace`.
- `mutate` is unchanged for this 403: an open screen shows "You must set a new PIN before continuing." and keeps its input; the PIN gate takes the person to Change PIN.
- **What this relies on from Security S1:** Change PIN re-mints the cookie with the new `tokenVersion` and ends the sign-out marker (`setSessionCookie`), and only a screen load renews the sign-in, never a background request (BS-3). So no queue send or bell poll can write the old token back after the new PIN is set, and the saved actions send within seconds. S1's one accepted gap: a screen load still in flight during Change PIN can sign that phone out once; the saved actions then park on the 401 and send after the person signs in again.

2.9 **At most 20 notifying writes per operator per hour (B3-17, §0-n).** Lifted from the Security packet rev 2 §9.3 as written, so the limit never ships without the slower retries (BS-5). The 8 tries span 61.5 minutes, longer than the clock-hour window.
- `src/lib/rate-limit.ts`, append:
```ts
/** P1-2 O2 (B3-17): writes that email a hub or raise an admin alert — per operator, per clock hour. */
export function limitNotifyingWrite(userId: string) {
  return rateLimit(`notify:${userId}`, 20, 60 * 60_000)
}
```
- Call it after the auth check, for non-admins only, in four routes (import `limitNotifyingWrite` from `@/lib/rate-limit`):
  - `src/app/api/deployment-requests/route.ts`, after the parse (`:72-74`), only when `d.status === 'REQUESTED'` (a DRAFT notifies nobody, BS-10);
  - `src/app/api/deployment-requests/[id]/route.ts` PATCH, after the own-request check (`:66`), only when `action === 'submit'` (the GET has a similar check at `:32`; not there);
  - `src/app/api/vehicles/[id]/report-damage/route.ts`, after the session check (`:39`);
  - `src/app/api/inventory/units/[unitId]/report-problem/route.ts`, after the session check (`:31`).
  Each is the same five lines (`cond` is `''`, `&& d.status === 'REQUESTED'` or `&& action === 'submit'`):
```ts
  // P1-2 O2 (B3-17): at most 20 notifying writes per operator per clock hour. A 429 is never
  // cached (idempotency.ts caches 2xx and 400 only), so the queue's backoff retries it.
  if (session.role !== 'ADMIN' <cond>) {
    const rl = await limitNotifyingWrite(session.userId)
    if (!rl.allowed) return NextResponse.json({ error: 'Too many reports in the last hour — try again later.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  }
```
- Checked against O1's `idempotency.ts`: a 429 is neither 2xx nor 400, so `releaseKey` frees the key and the replay runs fresh (ran on the review clone). Security S3 passes the two report replies through `forRole` (S3 3.6b); the limiter sits above it. Data D1 later deletes the alert raises lower in the two request routes (`:105-114`, `[id]:107-110`): different hunks.
- An online screen that hits the limit shows the error and keeps its input (`mutate` returns server errors to the screen). A saved one waits (2.3).

2.10 **Actions already on phones (upgrade, CO-2).** Phones hold saved actions in today's format right now. How O2 reads them:
- The store is the same: `DB_NAME = 'ahits_offline'`, `STORE = 'queue'`, `DB_VERSION = 1`, and the `onupgradeneeded` body are moved, not changed, so the first load after the deploy opens the same database with no upgrade step. `ahits_pending_hint` keeps its key, so the data-loss tripwire doesn't fire.
- An item saved before O2 has no `nextAttemptAt`, so it is due at once. It has no `final`, so Retry is offered as today. Its `retries` carry over (an item at 3 has 5 tries left). Its `idempotencyKey` is sent as before, and O1 keeps that key 10 days.
- An item saved more than 7 days before the deploy turns "too old" on the first pass, with Discard only (§0-c). A failed one that old stays Failed; Retry turns it "too old" at once. §6 tells you to have saved work sent before the deploy.
- No owner yet: O3 stamps them (3.1).

**Operator sees.**
- Offline, the header badge and banner count go up the moment any screen saves something (before: only after reconnecting). "Deployment Queued" clears as soon as the start fails.
- A server outage no longer turns all work red within 2 minutes. The Outbox shows "Waiting"; an action fails only after about an hour.
- A daily check is no longer stuck behind a slow photo; the photo's own row says it's waiting for signal.
- A 7-day-old action shows "too old to send" with Discard only; the 6-day banner says so first.
- During a database outage: the person stays on their screen under "Can't reach the server right now…". Saves say they're kept on the phone. Sign-in says "Can't reach the server right now. Try again in a minute." When the database is back, the banner clears within 30 s and saved work sends.
- After an admin's Reset PIN, the Change PIN screen shows "N action(s) waiting to sync" and nothing turns red. Once the new PIN is set, they send within seconds.
- The 21st report or request in a clock hour says "Too many reports in the last hour — try again later." on screen; a saved one waits in the Outbox and sends later. Waiting items no longer offer "Stuck? Discard" after a few minutes of server trouble, only after a day.
- Actions saved before the update keep sending; any saved more than 7 days before it show "too old to send".

**Tests.**
- New `tests/offline/p1-2-queue-store.test.tsx` (the `useOfflineQueue.test.tsx` harness; `vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))`):
  - (h) Offline, readers A and B. First let both start-up recounts finish (`await act(async () => { await new Promise((r) => setTimeout(r, 50)) })`) and check B's `pending` is 0. Then A enqueues → B's `pending` is 1 at once (fails before 2.2: `expected +0 to be 1`). Without the wait, B's own start-up recount reads A's save and the case passes on O1's code too (OX-6).
  - (i) `ahits_pending_hint = '1'`, empty queue, two readers in one `renderHook(() => [useOfflineQueue(), useOfflineQueue()])` → both `possibleDataLoss: true`; `captureMessage('offline-queue possible-data-loss', …)` called **once**. Then `__resetOfflineQueueForTests()`, set `queuePage.oldHint = 1; queuePage.flushed = true`, mount a fresh reader → `possibleDataLoss: false`.
  - (j) Online `mutate` 200 with `invalidates: ['deployments']` → one `INVALIDATE_EVENT` carrying it.
  - (k) A 500 → retries 1, `nextAttemptAt` ≈ now + 30 s. An immediate flush sends nothing. With `vi.useFakeTimers({ toFake: ['Date'] })`, stepping the clock past each wait (30 s, 1, 2, 4, 8, 16, 30 min) before each flush → the 8th send marks it "Failed after 8 attempts"; the waits sum to 61.5 min.
  - (k2) CO-4: a 429 with `Retry-After: 3600` → pending, retries 1, `nextAttemptAt` ≈ now + 30 s; an immediate flush sends nothing.
  - (l) Queue A (photo, `/api/deployments/d1/items`), B (`/api/deployments/d1/end`), C (`/api/daily-check`); the upload rejects with `Object.assign(new Error('aborted'), { name: 'AbortError' })` → A pending, retries 0; B not sent; C sent.
  - (m) Enqueue, `setSystemTime(+8 days)`, flush → no fetch; failed, `final: true`, `lastError` matches `/more than 7 days/`. (n) At +6.5 days → `staleQueue: true`.
  - (o) A 403 `{ code: 'PIN_CHANGE_REQUIRED' }` → pending, retries 0, a later item not sent. Dispatch `CREDENTIAL_CHANGED_EVENT` with fetch now 200 → both sent.
  - (o2) BO-4: a flush 401 (health 200) sets `sessionExpired`; unmount the reader; with writes now 403 `PIN_CHANGE_REQUIRED`, render `OfflineBanner` → it shows "1 action(s) waiting to sync" and not "Session expired"; the item is pending, retries 0.
  - (p) A photo upload answering 401 (health 200) → pending, retries 0, `sessionExpired` true; 403 → pending, retries 0, `sessionExpired` false. BO-9: a photo 401 with health 503 → `useServerDown()` true, `sessionExpired` false.
  - (q) Flush 401 with `HEAD /api/health` → 503 → `sessionExpired` false and `useServerDown()` true.
  - (r) `mutate` 401 with health 503 → `reason: 'server'`. `mutate` 503 `{ code: 'SERVER_UNAVAILABLE' }` → `{ ok: true, queued: true, reason: 'server' }`, one item queued with the same key.
  - (s) An item backed off to +30 min; `markServerUp()` after `markServerDown()` → the next flush clears `nextAttemptAt` under its lock and the item is sent without moving the clock (BO-14).
  - (t) C-05: a terminal failure's Sentry tag is the identity's `userId`.
  - (u0) CO-2, the upgrade: with raw `indexedDB.open('ahits_offline', 1)` and store `queue` (fresh `IDBFactory`), write three items in today's shape (no `nextAttemptAt`, `final` or `ownerId`), and `ahits_pending_hint = '2'`. A: pending, `retries: 3`, created 1 h ago. B: failed with a `lastError`. C: pending, created 8 days ago. Mount a reader offline → `pending` 2, `failed` 1. Online, fetch 200, flush → exactly one send, A's, with its own `Idempotency-Key`; A deleted. B unchanged (`final` undefined, so the Outbox offers Retry). C failed, `final: true`, `lastError` matches `/more than 7 days/`, no fetch for C. `possibleDataLoss` false.
- New `tests/p1-2-server-unavailable.test.ts` (node): `prisma.user.findUnique` made to reject → `checkSession()` is `unavailable` and `getSession()` null (as today); `GET /api/auth/me` → 503 with `SERVER_UNAVAILABLE_ERROR`; the session lookup fine but the `homeHubId` read rejecting → 503; login while the lookup rejects → 503 with the same body; `HEAD /api/health` → 200 with no body, and 503 when `$queryRaw` rejects.
- New `tests/p1-2-notify-limit.test.ts` (node; Security §9.3's test, CS-22): `vi.useFakeTimers({ toFake: ['Date'] })` with `vi.setSystemTime` at :00:05 of an hour (BS-10). The 21st report-damage from one operator → 429 with a `Retry-After` over 3000; no `idempotency_key` row for its key. Then `DELETE FROM "rate_limit_hit" WHERE "bucket_key" LIKE 'notify:<operatorId>|%'` and the same key → 201. An admin's 21st → 201. Twenty-one DRAFT request creates → 201 each and no `notify:` row. (Passed on the review clone.)
- New `tests/p1-2-proxy-pin-change.test.ts` (node; uses S1's `tests/helpers/proxy-request.ts`, which takes extra cookies): a `mustChangePin` token on `POST /api/daily-check` → 403 with `code: 'PIN_CHANGE_REQUIRED'`, for an OPERATOR and an ADMIN token (S2's two wordings); `POST /api/auth/change-pin` passes.
- New `tests/components/p1-2-useauth-server-down.test.tsx`: an online `/api/auth/me` 503 → no `replace('/login')`, the identity kept, `useServerDown()` true; a 500 with a JSON body doesn't overwrite the identity. BO-5: `markServerDown()`, then `/api/auth/me` answers 200 while `HEAD /api/health` answers 503 → `useServerDown()` stays true; with HEAD 200 the next read clears it.
- `tests/components/OfflineBanner.test.tsx`: with the server down (call `markServerDown()` with `HEAD` stubbed) the banner shows its text; with `sessionExpired` and items pending too, it doesn't say "Session expired"; the 6-day text.
- `tests/components/OutboxDialog.test.tsx`: the photo caption on a waiting item with a `localphoto:` body; BO-10: a pending item created 10 minutes ago with `retries: 5` and `nextAttemptAt` in the future → no "Stuck? Discard" (the existing stuck cases use an aged item and still pass).
- `tests/components/uxp3-daily-check-flow.test.tsx` (mocks `mutate`): a `'server'` reason shows its toast.
- **Existing test that changes:** `tests/offline/useOfflineQueue.test.tsx` (a) (`:113-118`) flushes 8 times back to back, but backoff now skips the item: wrap the loop in `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(Date.now() + 31 * 60_000)` before each flush.
- **Must pass unchanged:** (a2)–(g) in `useOfflineQueue.test.tsx` ((b) and (d) stub every URL with 401, so the health probe isn't a 503 and the label stays `'auth'`), `tests/components/pr5-queue-drain.test.tsx`, `AppShell.test.tsx`, `hotfix-reconnect-reread.test.tsx`, the 17 UI tests that mock `@/hooks/useOfflineQueue`, and the report and request tests (`cc34-report-and-promote`, `cc10-field-fix`, `new3-request-for-operator`: none sends 21 from one operator). Security's tests too, including `p1-2s3-operator-read-guard` with rev 4.1's `checkSession` line (2.7, OX-2). Practice build: with that line, nothing else changed.

**Files.** New `src/lib/offline-queue-db.ts`, `src/lib/server-status.ts`; `src/hooks/useOfflineQueue.ts`; `src/lib/photoStore.ts`; `src/types/index.ts`; `src/lib/shared-errors.ts`; `src/lib/auth/session.ts`; `src/app/api/auth/me/route.ts`; `src/app/api/auth/login/route.ts`; `src/app/api/health/route.ts`; `src/hooks/useAuth.ts`; `src/proxy.ts`; `src/components/operator/OfflineBanner.tsx`; `src/components/operator/OutboxDialog.tsx`; `src/app/(operator)/operator/change-pin/page.tsx`; `src/app/(admin)/admin/account/page.tsx` (S2's); `src/app/(operator)/operator/daily-check/page.tsx`; `src/lib/rate-limit.ts`; `src/app/api/deployment-requests/route.ts`; `src/app/api/deployment-requests/[id]/route.ts`; `src/app/api/vehicles/[id]/report-damage/route.ts`; `src/app/api/inventory/units/[unitId]/report-problem/route.ts`; `tests/setup.ui.ts`; the tests above.

**Behaviour changes (PR body):** actions fail after about an hour of server errors, not 80 s · 7-day-old actions aren't sent, including ones already on phones · a database outage keeps people signed in with a banner; login answers 503 during one · a PIN reset parks saved work · online writes refresh screens · an operator's 21st request or report within a clock hour gets 429, and the queue retries it with the slow waits · "Stuck? Discard" shows only after a day · until a phone reloads onto O2, a database outage can leave its cached name blank; the next good read fixes it (CO-25).

---

## O3 · Shared phones keep people apart

**Goal.** A saved action is only ever sent as the person who saved it. The next person never sees or sends it. Sign-out needs a connection and warns about unsent work. Sign-out, a dead session and a different person signing in clear the phone's saved data, but never the page shells, so the next shift can still start offline.
Closes B3-7, UI-8, OP-17, B5-9 (C-05 landed in O2). Depends on O2's store.

**Two checks, one rule.** The phone holds back other people's actions (client check). The server refuses one that slips through (the proxy compares `X-Queued-For` with the session, 409 `OTHER_USER`, before any route runs, so its key is never claimed). Actions saved before O3 take the name of the person signed in when O3 first runs (CO-3); an action is never sent with no owner while someone is known (BO-11).

**Fits Security S1 rev 2.** Sign out leaves a 2-minute `ahits_signed_out` marker cookie, and the proxy drops a session cookie that arrives next to it (a late renewal from a screen still loading). Only a screen load renews the sign-in. So O3 needs no second logout from the sign-in page (BO-16, CO-5: §9.2), and the queue's 30 s sends and the bell polls can never bring a signed-out session back.

3.1 **Owners on saved actions.** `src/types/index.ts` (`OfflineQueueItem`): `/** P1-2 (O3, OP-17): who saved it; flush sends it only for that person. Actions saved before O3 get one at the first recount with a known person (stampOwners). */ ownerId?: string`. `useOfflineQueue.ts` `enqueue` (`:295-301`): `ownerId: item.ownerId ?? readIdentity()?.userId ?? lastUserId()`. The fallback (BO-11) covers an enqueue after useAuth's 401 bounce already cleared the identity (`useAuth.ts:43,105`): the person on the phone is still the last one who signed in.
- `src/lib/offline-queue-db.ts` (pure, so the hook, the store and the login page share it):
```ts
export const LAST_USER_KEY = 'ahits_last_user_id'
/** O3 (BO-11): the last person who signed in on this phone (written at every sign-in, never cleared). */
export function lastUserId(): string | undefined {
  try { return window.localStorage.getItem(LAST_USER_KEY) ?? undefined } catch { return undefined }
}

/** O3 (CO-3): give every action saved before O3 (no ownerId) to the person signed in now. One
 *  readwrite cursor pass, so a stale read never brings back an item a flush just sent. */
export async function stampOwners(me: string): Promise<void> {
  const db = await openQueueDB()
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).openCursor()
    req.onsuccess = () => {
      const cur = req.result
      if (!cur) return
      const i = cur.value as OfflineQueueItem
      if (!i.ownerId) cur.update({ ...i, ownerId: me })
      cur.continue()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}
```
- **Actions saved before O3 (upgrade, CO-3).** At the start of `recountQueue`, once `me` is read: `if (me && all.some((i) => !i.ownerId)) { await stampOwners(me); all = <re-read> }`. On each phone the first recount after O3 loads (app start, signed in) gives every unowned action, waiting or failed, to that person. Then a person switch hides them like any other. With nobody known (signed out, no identity cached), they stay unowned and are stamped by the next person to sign in there: nothing tells the phone who saved them, and before O3 they would have gone out as that person anyway (§6 tells operators). No flag: after O3 every enqueue names an owner whenever anyone is known, so only pre-O3 actions are ever unowned.

3.2 **The store counts only this person's actions** (`src/lib/offline-queue-db.ts`):
```ts
/** O3: an action belongs to whoever is signed in, or to no one (saved before O3). */
export function belongsHere(i: Pick<OfflineQueueItem, 'ownerId'>, me = readIdentity()?.userId ?? null): boolean {
  return !i.ownerId || i.ownerId === me
}
```
In `recountQueue`: `const me = readIdentity()?.userId ?? null`, the stamp above, then `const mine = all.filter((i) => belongsHere(i, me))`. `items`, `pending`, `failed`, `pendingDeployCreate` and `staleQueue` come from `mine`. New snapshot field `othersPending: number` (waiting actions not `mine`), added to `EMPTY`, `same()` and the hook's return. **The pending hint keeps counting every waiting action**, so a person switch never trips the data-loss tripwire.

3.3 **Flush** (`useOfflineQueue.ts`): read `const me = readIdentity()?.userId ?? null` once per pass, at the top of `flush`, before the probe. **The probe** (`:320`, "is there anything to send?") counts an item when it is past the 7-day limit, whoever saved it (the pass then turns it too old), or when it belongs here and isn't waiting out its backoff (OX-4). Counting only `belongsHere` would return at the probe on a phone where only someone else's actions wait, so their 8-day-old action would never turn too old. As built:
```ts
      // P1-2 (B5-14): an item waiting out its backoff isn't drainable yet — unless "server back"
      // was just set (2.7), which clears every wait under the lock below. O3: only this person's
      // actions count — except one past the 7-day limit, whoever saved it, so the pass turns it
      // "too old" (the age check runs before the owner check).
      const hasDrainable = (await getAllItems(probeDb)).some((i) => i.status !== 'failed' &&
        (Date.now() - i.createdAt > QUEUE_MAX_AGE_MS || (belongsHere(i, me) &&
          (queuePage.backoffCleared || !(i.nextAttemptAt && i.nextAttemptAt > Date.now())))))
```
In the loop, after O2's age check: `if (!belongsHere(item, me)) continue // OP-17: it waits for its owner`. (The age check runs first, so another person's 8-day-old action still turns too old.) Headers (`:419-420`): `if (work.ownerId) headers['X-Queued-For'] = work.ownerId`. Terminal branch, after O2's PIN line: `if (res.status === 409 && (errBody as { code?: unknown }).code === QUEUED_FOR_OTHER_USER_CODE) continue // stays pending, no try burned; the pass moves on`. `reportItemFailed` tags `userId: item.ownerId ?? currentUserId()` (BO-19), so a too-old action of someone who never came back is filed under its owner, not the person now signed in.
`listAll` already returns the store's (own) items; `listFailed` (`:553-561`, no caller today) filters with `belongsHere` too. `retryItem` and `discardFailed` read the item first and do nothing unless `belongsHere(item)`.

3.4 **`src/lib/shared-errors.ts`:** `export const QUEUED_FOR_OTHER_USER_CODE = 'OTHER_USER'` and `export const QUEUED_FOR_OTHER_USER_ERROR = 'Saved by someone else on this phone — it waits for them.'`.

3.5 **`src/proxy.ts`**, right after `const role = payload.role as string` (`:153`; `:175` after S), so after S1's cross-site check, S1's sign-out-marker check and `jwtVerify`, and before S1's renewal and S2's funnel:
```ts
    // P1-2 (O3, B3-7 / OP-17): a saved action names who saved it. Never apply it as someone
    // else — refused here, before any route runs, so its Idempotency-Key is never claimed.
    const queuedFor = request.headers.get('x-queued-for')
    if (queuedFor && pathname.startsWith('/api/') && queuedFor !== String(payload.userId)) {
      return NextResponse.json({ error: QUEUED_FOR_OTHER_USER_ERROR, code: QUEUED_FOR_OTHER_USER_CODE }, { status: 409 })
    }
```
Import both from `@/lib/shared-errors` (dependency-free, so the proxy bundle stays free of DB code).

3.6 **New `src/lib/device-user-data.ts`** (client). **Only the data caches go; the page shells and the start-page redirect stay (BO-3):**
```ts
// P1-2 O3 (B3-7 / UI-8, BO-3): the caches that hold people's data. Page shells, RSC payloads and
// `others` (with the start URL's redirect) stay: they hold no per-person data and let the next shift
// start offline. Photos waiting in IndexedDB are not touched: saved work needs them.
/** Field reads (incl. /api/auth/me), other API reads, photos (`/api/photos/….jpg` match Serwist's
 *  static-image rule), image-optimizer copies, and cross-origin files (storage images, map tiles). */
export const USER_DATA_CACHES = ['ahits-field-reads', 'apis', 'static-image-assets', 'next-image', 'cross-origin'] as const
export async function clearUserCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    await Promise.all(USER_DATA_CACHES.map((n) => caches.delete(n)))
  } catch { /* best-effort */ }
}
```
- Why not every cache (rev 1): every operator and admin page is a client component and the layouts render no person's data, so `ahits-app-pages`, `ahits-app-rsc`, `pages`, `pages-rsc*` and `others` hold none. `others` holds the start URL's redirect (`/` → dashboard, cached as a status-0 redirect) and `/login`. After a clear, sign-in is a client navigation (`login/page.tsx:91`), so no document would be cached again until an online cold start; a phone killed or restored offline would show "You're offline" all shift. That is every handover on a shared phone.
- Why `static-image-assets` too (found in rev 2): photo URLs are `/api/photos/<path>.jpg` (`api/uploads/route.ts:74`; `:80` after S4, same shape), which Serwist's image rule (`/\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/`) matches before the `apis` rule, so people's photos live there for 30 days. `next-image` is empty while the image optimizer is off (#272); it is listed so it stays covered.
- Accepted: a shared phone used by an admin and an operator keeps the last one's `/admin/*` shell (its title and edit buttons follow the role). Offline only, and every write is checked on the server.

3.7 **`src/lib/utils.ts`** (pure; O6 reuses it):
```ts
/** P1-2: fetch that gives up after `ms` (default 12 s). On weak signal a raw fetch waits for the
 *  OS (60 s+); this rejects with an AbortError so the caller's catch can say "No connection". */
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 12_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try { return await fetch(input, { ...init, signal: controller.signal }) } finally { clearTimeout(timer) }
}
```

3.8 **`src/hooks/useAuth.ts`.**
- `logout` (`:72-93`) returns `'ok' | 'offline' | 'failed'` and finishes only when the server says so (B5-9):
```ts
  const logout = async (): Promise<'ok' | 'offline' | 'failed'> => {
    // P1-2 (O3, B5-9, owner): no signal → refuse; the cookie would stay live and the next person
    // would land in this person's app.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
    try {
      const res = await fetchWithTimeout('/api/auth/logout', { method: 'POST' }, 8_000)
      // BO-8: 401 = the server holds no session for this cookie (an expired 24 h token gets it
      // from the proxy) — finish signing out here.
      if (!res.ok && res.status !== 401) return 'failed'
    } catch { return 'failed' }
    // …today's draft purge (:82-86) and identity clear (:87)…
    await clearUserCaches() // B3-7 / UI-8: the next person sees none of this person's saved data
    await mutate('/api/auth/me', null, { revalidate: false })
    router.push('/login')
    return 'ok'
  }
```
- The online 401 bounce (`:103-108`) also calls `void clearUserCaches()` (the session is dead and the phone is online; only a re-fetch is lost).
- The fetcher (`:46-48`): when the identity it writes has a different `userId` from the cached one (none cached counts as different), dispatch `CREDENTIAL_CHANGED_EVENT` after writing it. The queue then recounts and flushes for the person now signed in, at once, not on the next 30 s tick (the mount flush can run before `/api/auth/me` answers).
- The server side of Sign out is S1's: `clearSession` deletes the cookie and sets the 2-minute marker. Nothing to add here.

3.9 **New `src/components/shared/SignOutButton.tsx`**, replacing the Sign out buttons at `OperatorNav.tsx:101` and `AdminNav.tsx:84` (`:87` after S2) (same label and icon; it takes `sx`; S2 puts "Change password" above AdminNav's — keep it). Its own dialogs, not toasts: the navs sit outside `ToastProvider` (`(operator)/layout.tsx:20-21`).
- **Offline:** a Dialog titled "You're offline": "Signing out needs a connection. You're still signed in." [OK]. No request is made.
- **Unsent work:** `await recountQueue()`, then `pending + failed` from `getQueueSnapshot()` (this person's actions only). Above 0 → `ConfirmDialog` titled "Sign out with unsent actions?", message "N action(s) on this phone haven't been sent yet. They stay here and send the next time you sign in on this phone. Nobody else can send or see them.", confirm **Sign out** (`confirmColor="warning"`).
- **`'failed'`:** a Dialog titled "Couldn't sign out" (OX-12): "Couldn't reach the server. You're still signed in — try again when you have signal." [OK].
- Not a hook instance of the queue, so it adds no 30 s timer.

3.10 **Sign-in as someone else.**
- `src/app/api/auth/login/route.ts:85` (`:115` after S): add `userId: user.id` to the success JSON (the login page mounts no `useSWR('/api/auth/me')`, so `mutate()` at `login/page.tsx:90` can't tell it who signed in).
- `src/app/(auth)/login/page.tsx:54`: `fetch('/api/auth/me?live=1')` (O6 stops the service worker answering `?live=1` from its cache).
- After a successful sign-in (before `:90`):
```ts
      // P1-2 (O3, B3-7): a different person on this phone (or the first sign-in since O3) →
      // drop the previous person's saved data (API reads, photos) before anything renders.
      try {
        const prev = localStorage.getItem(LAST_USER_KEY)
        if (data.userId && prev !== data.userId) {
          await clearUserCaches()
          localStorage.removeItem('ahits_identity') // BO-15: the previous person's name never shows, and no enqueue takes their id
        }
        if (data.userId) localStorage.setItem(LAST_USER_KEY, data.userId)
      } catch { /* storage unavailable */ }
```
  Import `LAST_USER_KEY` from `@/lib/offline-queue-db` and `clearUserCaches` from `@/lib/device-user-data`.

3.11 **The next person's view.** `OutboxDialog.tsx` (`:12-20`): optional prop `othersPending?: number`. When above 0, one grey caption at the top of the dialog, the owner's words (round 6): `` `${n} saved action${n === 1 ? '' : 's'} belong${n === 1 ? 's' : ''} to someone else.` `` ("2 saved actions belong to someone else."). `OfflineBanner.tsx:211-218` passes it. No banner, no names, no Discard (owner: the next person never sees or sends them). If that person never comes back, the actions stay hidden there: after 7 days they turn too old (3.3's probe counts them, and O2's age check runs before the owner check), and their photos stay with them (O5's sweep keeps every referenced photo).

**Operator sees.**
- **Signing out:** a warning with the count when work is unsent; a refusal with no signal; an honest message when the server can't be reached.
- **The next person on the phone:** only their own Outbox and counts, plus one grey line: "2 saved actions belong to someone else." No cached data or photos from the previous person. The app still opens offline: the page shells stay.
- **The first person, signing in on that phone again:** their actions send.

**Tests.**
- New `tests/offline/p1-2-shared-phone.test.tsx` (harness as `useOfflineQueue.test.tsx`; identity via `localStorage.ahits_identity`):
  - (u) Identity A, offline enqueue → `ownerId: 'A'`. Identity B, recount, flush → no fetch; `pending` 0, `othersPending` 1. Identity A, recount, flush → sent with `X-Queued-For: A`.
  - (v) A 409 `{ code: 'OTHER_USER' }` → that item pending, retries 0; the next item in the pass still sends.
  - (w) A legacy item (no `ownerId`), nobody known (identity cleared before writing it) → a recount leaves it unowned. Identity A, recount → `ownerId: 'A'`; flush → sent with `X-Queued-For: A`.
  - (w2) CO-3: two unowned items, one waiting and one failed, identity A → one recount stamps both `ownerId: 'A'`. Identity B, recount → `pending` 0, `failed` 0, `othersPending` 1; flush → no fetch.
  - (w3) BO-11: identity cleared, `ahits_last_user_id = 'L'`, enqueue → `ownerId: 'L'`.
  - (w4) BO-19 and OX-4: B signed in, the phone holds only A's item, saved 8 days ago. Online, one flush → it is failed with `lastError` matching `/more than 7 days/`, and its Sentry tag is `A`. (Fails if the probe counts only `belongsHere`.)
  - (x) After a person switch with A's item waiting, `possibleDataLoss` stays false.
  - (y) As B: `listAll()` excludes A's items; `discardFailed(aFailedId)` leaves it.
  - (z) Online, identity cleared, A's item waiting: write identity A and dispatch `CREDENTIAL_CHANGED_EVENT` → it sends without a tick.
- New `tests/p1-2-proxy-queued-for.test.ts` (node; S1's `tests/helpers/proxy-request.ts`): a mismatched header → 409 `OTHER_USER`; a matching or missing header → passes (`x-middleware-next`).
- New `tests/components/p1-2-sign-out.test.tsx`: offline → the dialog with the owner's exact words and no fetch; two unsent (one waiting, one failed, plus someone else's) → the confirm says 3.9's exact text, "2 action(s) on this phone haven't been sent yet. They stay here and send the next time you sign in on this phone. Nobody else can send or see them." (OX-8), and **Sign out** calls `logout`; a logout POST 500 → "Couldn't sign out" with "Couldn't reach the server…"; nothing unsent → signs out with no dialog.
- `tests/components/useAuth-logout.test.tsx`: **breaks** at `:85` → `expect.objectContaining({ method: 'POST' })`. Add: offline → `'offline'`, no fetch, identity kept, no push; a POST 500 → `'failed'`, identity kept; BO-8: a POST 401 → `'ok'`, identity cleared, `push('/login')`; success with a fake `globalThis.caches` holding `ahits-field-reads`, `apis`, `static-image-assets`, `cross-origin`, `ahits-app-pages`, `ahits-app-rsc`, `others`, `pages`, `next-static-js-assets` and `serwist-precache-v2-x` → the four data caches are deleted and the other six kept (BO-3; passed on the review clone); an online 401 bounce → the same.
- `tests/components/LoginPage.test.tsx`: the already-signed-in check calls `/api/auth/me?live=1`; signing in with `userId` ≠ `ahits_last_user_id` (and with none stored) clears the data caches and removes `ahits_identity` (BO-15); the same person does neither. The cases at `:37-91` keep passing (their login mock has no `userId`).
- `tests/components/OutboxDialog.test.tsx`: `othersPending={2}` → "2 saved actions belong to someone else."; `othersPending={1}` → "1 saved action belongs to someone else."; no Retry or Discard for them.
- `tests/components/p1-2-useauth-server-down.test.tsx` (O2's file): identity B written after A → one `ahits:credential-changed` event (CO-22).
- **Breaks** (3.10's `userId`; add `userId: <that user>.id` to each exact login-reply check, with the comment `// P1-2 O3: login names who signed in`; OX-3):
  - `tests/uxp3-login-lockout.test.ts:156` → `toEqual({ role: 'OPERATOR', mustChangePin: false, userId: op.id })` (S1 may add cases to this file; keep them);
  - Security's `tests/p1-2s1-pin-attempts.test.ts:105` (the N1 login) → `{ role: 'OPERATOR', mustChangePin: true, userId: op.id }`;
  - `tests/p1-2s2-admin-password.test.ts:114` → `{ role: 'ADMIN', mustChangePin: true, userId: o.id }` and `:149` → `{ role: 'ADMIN', mustChangePin: true, userId: a.id }`;
  - `tests/p1-2s2-owner.test.ts:214` (the SQL recovery login) → `{ role: 'ADMIN', mustChangePin: true, userId: o.id }`.
  Line numbers are the practice build's; S rev 4.1's longer S1 test moves `p1-2s1-pin-attempts`' line, so find it by its text. Name all five in the PR body.
- **Must pass unchanged:** every other Security test, and the O1 and O2 tests (O3 only adds a case to O2's `p1-2-useauth-server-down`). Practice build: these five were the only breaks besides `useAuth-logout:85` above.

**Files.** `src/types/index.ts`; `src/lib/offline-queue-db.ts`; `src/hooks/useOfflineQueue.ts`; `src/lib/shared-errors.ts`; `src/proxy.ts`; new `src/lib/device-user-data.ts`; `src/lib/utils.ts`; `src/hooks/useAuth.ts`; new `src/components/shared/SignOutButton.tsx`; `src/components/operator/OperatorNav.tsx`; `src/components/admin/AdminNav.tsx`; `src/app/api/auth/login/route.ts`; `src/app/(auth)/login/page.tsx`; `src/components/operator/OfflineBanner.tsx`; `src/components/operator/OutboxDialog.tsx`; the tests above, the four Security tests among them. **No `sw.ts` change** (moved to O6), so O3 ships no new service worker.

**Behaviour changes (PR body):** saved actions carry their owner and wait for them · actions saved before O3 take the name of whoever is signed in when O3 first runs on that phone · sign-out needs a connection and warns about unsent work; an expired sign-in still signs out · sign-out, a dead session and a person switch clear the cached data (API reads, photos, cross-origin files), never the page shells or the start-page redirect · login's reply now carries `userId`.

---

## O4 · "Saved on this phone" (End, Return, checks, Today, Outbox, saved copies)

**Goal.** An offline End or Return says it's saved and can't be done twice. A saved End never returns gear it didn't list (§0-i). Today never shows yesterday's checks as today's (§0-j). Banners name what's waiting. The Outbox says what to do. Saved copies say how old they are.
Closes B5-4, B5-13, B5-2, B1-2 (part), OP-23, B1-4, B5-3, B1-6 (Scan), B1-13 (Requests). Depends on O2/O3's store. **Not touched:** `my-deployment/page.tsx` (D21).
**Eastern time.** Every day here is a business day from `businessDate()` (APP_TIMEZONE; Eastern after the Eastern-time PR). The Eastern-time PR already edits `VehicleChecks.tsx:29-31`, `dashboard/page.tsx:68` and `business-date.ts`: re-grep and keep its lines. Clock times ("Last synced Thu 4:40 PM", "Saved copy from …") stay in the viewer's zone like "Data as of" (Eastern-time packet, question 3); on Piedmont phones that is Eastern anyway.

4.1 **New `src/lib/pending-writes.ts`** (pure):
```ts
import type { OfflineQueueItem } from '@/types'
type Item = Pick<OfflineQueueItem, 'endpoint' | 'method' | 'body' | 'status' | 'label' | 'createdAt'>
const waiting = (i: Item) => i.status !== 'failed'
const dispositionLineIds = (body: unknown): string[] => {
  const d = (body as { itemDispositions?: { kitItemId?: unknown }[] } | null)?.itemDispositions
  return Array.isArray(d) ? d.map((x) => x?.kitItemId).filter((v): v is string => typeof v === 'string') : []
}
/** This deployment's End, saved on this phone and not yet sent. */
export function queuedEnd<T extends Item>(items: T[], rigId: string): T | undefined {
  return items.find((i) => waiting(i) && i.method === 'POST' && i.endpoint === `/api/deployments/${rigId}/end`)
}
/** This deployment's kit lines with a return or usage saved on this phone (Return items, ⊖, Log usage, Scan). */
export function queuedReturnLineIds(items: Item[], rigId: string): Set<string> {
  const base = `/api/deployments/${rigId}/items`
  const out = new Set<string>()
  for (const i of items) {
    if (!waiting(i) || i.method !== 'DELETE') continue
    if (i.endpoint === base) dispositionLineIds(i.body).forEach((id) => out.add(id))
    else if (i.endpoint.startsWith(`${base}/`)) out.add(i.endpoint.slice(base.length + 1))
  }
  return out
}
const isCheck = (i: Item) => waiting(i) && i.method === 'POST' && i.endpoint === '/api/daily-check'
/** Vehicles with a daily check for business day `day` saved on this phone. */
export function queuedCheckVehicleIds(items: Item[], day: string): Set<string> {
  const out = new Set<string>()
  for (const i of items) {
    const b = i.body as { vehicleId?: unknown; date?: unknown } | null
    if (isCheck(i) && b?.date === day && typeof b.vehicleId === 'string') out.add(b.vehicleId)
  }
  return out
}
export const queuedCheckCount = (items: Item[]) => items.filter(isCheck).length
/** "End deployment, Daily check · Truck-01 and 2 more": what's waiting, for banners. */
export function describeWaiting(items: Item[], max = 2): string {
  const labels = items.filter(waiting).map((i) => i.label).filter((l): l is string => !!l)
  if (labels.length === 0) return ''
  const shown = labels.slice(0, max).join(', ')
  return labels.length > max ? `${shown} and ${labels.length - max} more` : shown
}
```

4.2 **New `src/hooks/usePendingWrites.ts`** (its own module on purpose: 17 UI tests mock `@/hooks/useOfflineQueue` with a factory that exports only `useOfflineQueue`):
```ts
'use client'
import * as React from 'react'
import type { OfflineQueueItem } from '@/types'
import { getQueueSnapshot, getServerQueueSnapshot, recountQueue, subscribeQueue } from '@/lib/offline-queue-db'
/** P1-2 (O4): this person's actions saved on this phone and not yet sent (failed excluded), from
 *  the one queue store. [] without IndexedDB (jsdom). No timers, no flush. */
export function usePendingWrites(): OfflineQueueItem[] {
  const view = React.useSyncExternalStore(subscribeQueue, getQueueSnapshot, getServerQueueSnapshot)
  React.useEffect(() => { void recountQueue() }, [])
  return React.useMemo(() => view.items.filter((i) => i.status !== 'failed'), [view.items])
}
```

4.3 **`src/components/shared/useToast.tsx`** (after `useToast`): `const noopToast: ShowToast = () => {}` and `export function useOptionalToast(): ShowToast { return React.useContext(ToastContext) ?? noopToast }`. (`DispositionDialog.test.tsx` renders with no `ToastProvider`, where `useToast` throws.) A test that mocks this module must export it too: `hotfix-reconnect-reread` does (Tests, OX-5).

4.4 **New `src/lib/served-at.ts`:**
```ts
/** "Thu 4:40 PM". */
export function savedTimeLabel(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}
/** Data older than this reads "Saved copy from …". */
export const SAVED_COPY_AFTER_MS = 2 * 60_000
/** When the server made this response: its Date header, which Cache Storage keeps, so a copy the
 *  service worker serves offline still says when it was made. Null when absent (test stubs). */
export function servedAtMs(res: { headers?: { get?: (name: string) => string | null } }): number | null {
  const raw = res.headers?.get?.('date')
  const ms = raw ? Date.parse(raw) : NaN
  return Number.isFinite(ms) ? ms : null
}
```

4.5 **DispositionDialog** (`src/components/shared/DispositionDialog.tsx`), B5-4:
- Imports: `Alert` (MUI, `:4-8`); `useOptionalToast`; `usePendingWrites`; `queuedEnd`, `queuedReturnLineIds`.
- After `:134`:
```ts
  const showToast = useOptionalToast()
  // P1-2 (B5-4): what this phone already saved for this deployment and hasn't sent.
  const pendingWrites = usePendingWrites()
  const endSaved = queuedEnd(pendingWrites, deploymentId)
  const returnSaved = queuedReturnLineIds(pendingWrites, deploymentId)
```
- `held` (`:177`): `items.filter((i) => waitingOf(i)?.whole || (mode === 'remove-items' && returnSaved.has(i.kitItemId)))`. In Return mode a line with a saved return or usage is shown and not sent again. **In End mode it keeps its controls and is sent (BO-12):** if that saved return later fails at sync, End's fallback would otherwise return the line Good to its hub and lose the damage the person marked; when the return does apply first, End's per-line claim skips the line it closed (`end/route.ts:189-192`).
- The mutate body (`:230`): `body: { note, itemDispositions, ...(mode === 'end-deployment' ? { listedKitItemIds: items.map((i) => i.kitItemId) } : {}) }` (4.7).
- The label (`:232`): ``mode === 'end-deployment' ? 'End deployment' : `Return ${names(sendable)}` ``, with a local `names` that maps the sendable lines to their item names (`items.find(…)?.name`): the first two, then "and N more" (B1-4).
- After the error branch (`:240-243`), before `onComplete()`:
```ts
    if (result.queued) {
      const what = mode === 'end-deployment' ? 'End deployment' : 'Return'
      showToast({
        message: result.reason === 'auth' ? `${what} saved on this phone. Sign in to send it.`
          : result.reason === 'server' ? `${what} saved on this phone. It sends when the server is back.`
          : `${what} saved on this phone. It sends when you’re back online.`,
        severity: 'info',
      })
    }
```
- First child of `<DialogContent>` (`:250`):
```tsx
        {endSaved && (
          <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
            {mode === 'end-deployment'
              ? 'End deployment is already saved on this phone. It sends when you’re back online.'
              : 'End deployment is saved on this phone — this equipment goes back with it.'}
          </Alert>
        )}
```
- Per line (`:294`): `{mode === 'remove-items' && returnSaved.has(item.kitItemId) ? (<Typography variant="body2" color="text.secondary">Already saved on this phone — it sends when you’re back online.</Typography>) : w?.whole ? (` … the rest unchanged. In End mode, above that line's controls: `{returnSaved.has(item.kitItemId) && <Typography variant="caption" color="text.secondary" display="block">A return for this line is saved on this phone. Set what happens to the rest.</Typography>}`.
- Confirm button (`:415-418`): add `|| !!endSaved` to `disabled`; in end mode the label reads `Already saved` (checked before `missingHub`).

4.6 **The banner names what's waiting** (`OfflineBanner.tsx`): `const waitingText = describeWaiting(usePendingWrites())`. In `:183-187`: offline → `` `You're offline — showing cached data.${pending > 0 ? ` ${pending} action(s) queued${waitingText ? `: ${waitingText}` : ''}.` : ''}` ``; online → `` `${pending} action(s) waiting to sync${waitingText ? `: ${waitingText}` : ''}.` ``. The existing test regexes still match.

4.7 **End lists what it saw (B5-13, §0-i)** (`src/app/api/deployments/[id]/end/route.ts`):
- Schema (`:61-64`): `listedKitItemIds: z.array(z.string()).max(1000).optional(), // P1-2 (B5-13): the lines the End screen showed`. `:102`: destructure it.
- Beside the other classes (`:52-59`): ``class UnlistedLines extends Error { constructor(names: string[]) { super(`Equipment was added after this End was saved: ${names.join(', ')}. Open End deployment again.`) } }``.
- After `:143` (the B4-13 check), inside the transaction:
```ts
    // P1-2 (B5-13, owner): an End that lists the lines its screen showed never has an unseen line
    // returned for it. An open line it didn't list, not wholly waiting on a transfer, refuses
    // the End by name (409; nothing written; the deployment stays open). Requests without the
    // field (saved before O4, tests, Bug 8) keep the automatic return below.
    if (listedKitItemIds) {
      const listed = new Set(listedKitItemIds)
      const unlisted = lines.filter((l) => {
        const w = waiting.items.get(l.id)
        return !listed.has(l.id) && !(w && (w.qty == null || w.qty >= l.quantity))
      })
      if (unlisted.length > 0) throw new UnlistedLines(unlisted.map((l) => l.item.name))
    }
```
- Catch (`:423`): add `|| err instanceof UnlistedLines`.

4.8 **Today (B5-2, §0-j).**
- `src/lib/business-date.ts`: `export function isOnBusinessDay(iso: unknown, day: string): boolean { return typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) && businessDate(new Date(iso)) === day }`.
- New `src/components/operator/today/useTodayChecks.ts`:
```ts
'use client'
import * as React from 'react'
import { businessDate, isOnBusinessDay } from '@/lib/business-date'
import { usePendingWrites } from '@/hooks/usePendingWrites'
import { queuedCheckVehicleIds } from '@/lib/pending-writes'
import { savedTimeLabel } from '@/lib/served-at'
import type { TodayData } from './types'

/** P1-2 (B5-2): today's checks, honest offline. A Today read on an earlier business day says
 *  nothing about today's checks; checks saved on this phone today count as done. */
export function useTodayChecks(today: TodayData | null) {
  // BO-6: the business day (APP_TIMEZONE) moves while Today stays open overnight (#270 keeps the
  // PWA alive): re-read it when the screen comes back and every minute. Not in render (purity, as
  // daily-check/page.tsx:151); state is set in callbacks only (lint).
  const [day, setDay] = React.useState(() => businessDate())
  React.useEffect(() => {
    const tick = () => setDay(businessDate())
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    const t = window.setInterval(tick, 60_000)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.clearInterval(t) }
  }, [])
  const saved = queuedCheckVehicleIds(usePendingWrites(), day)
  const fromToday = !!today && isOnBusinessDay(today.asOf, day)
  const asOf = today ? Date.parse(today.asOf) : NaN
  return {
    checkedVehicleIds: [...new Set([...(fromToday ? today!.checkedVehicleIds : []), ...saved])],
    checks: fromToday ? today?.vehicleChecks : [],
    savedOnPhone: saved,
    note: today && !fromToday
      ? `${Number.isNaN(asOf) ? '' : `Last synced ${savedTimeLabel(asOf)} — `}today’s checks aren’t known yet.`
      : null,
  }
}
```
- `src/app/(operator)/operator/dashboard/page.tsx`: after `:43`, `const { checkedVehicleIds, checks, savedOnPhone, note } = useTodayChecks(today)`; delete `:46`; `:93-97` passes `note={note}`; `:120-126` passes `checks={checks}` and `savedOnPhone={savedOnPhone}`.
- `src/components/operator/today/TodayPrimaryAction.tsx`: prop `note?: string | null` (`:12-16`). Both returns show `{note && <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.5}>{note}</Typography>}` under the button or under "You're set." (wrap each in a fragment).
- `src/components/operator/today/VehicleChecks.tsx`: prop `savedOnPhone?: Set<string>` (`:19-25`). At `:50-53` (`canOpen` is `:53`; the Eastern-time PR's `checkTime` edit sits above, `:29-31`): `const saved = !who && !!savedOnPhone?.has(rv.vehicleId)` and `const canOpen = !!onViewCheck && (!who || who.byMe) && !saved`. After `:61-66`: `{isDone && saved && (<Typography variant="caption" color="text.secondary" display="block">Saved on this phone — sends when you’re back online</Typography>)}`.

4.9 **Daily check page** (`src/app/(operator)/operator/daily-check/page.tsx`):
- `fetchCheckedToday` (`:111-119`) also counts checks saved on this phone, so the Check tab doesn't re-pick the truck just checked:
```ts
async function fetchCheckedToday(date: string): Promise<Set<string>> {
  const saved = queuedCheckVehicleIds(await readQueue(), date) // P1-2: saved on this phone = filed
  let res: Response
  try { res = await fetch(`/api/daily-check?date=${encodeURIComponent(date)}&pageSize=100`) } catch { return saved }
  if (!res.ok) return saved
  const json = (await res.json()) as { data?: Array<{ vehicleId?: unknown }> } | null
  const ids = (Array.isArray(json?.data) ? json.data : []).map((c) => c?.vehicleId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return new Set([...ids, ...saved])
}
```
- Imports: `readQueue` (`@/lib/offline-queue-db`), `queuedCheckVehicleIds`, `queuedCheckCount` (`@/lib/pending-writes`), `usePendingWrites`.
- OP-23 (`:688-689`, `:706-707`): `const savedChecks = queuedCheckCount(usePendingWrites())` beside `:143`, used instead of `pending`, with the text `{savedChecks} daily check(s) saved on this phone — they send when you’re back online`. Drop `pending` from `:143`.
- The label (`:573`): `` label: `Daily check · ${selectedVehicleName || 'vehicle'}` `` (B1-4).

4.10 **Scan** (`src/app/(operator)/operator/scan/page.tsx`):
- Imports: `readQueue`, `queuedReturnLineIds`, `servedAtMs`, `SAVED_COPY_AFTER_MS`, `savedTimeLabel`.
- `loadActive` (`:81-87`) drops lines with a saved return, so a remount doesn't offer Return again: `const returned = active ? queuedReturnLineIds(await readQueue(), active.id) : new Set<string>()` and `.filter((ki) => !returned.has(ki.id))`.
- B1-6: state `const [lookupSavedAt, setLookupSavedAt] = React.useState<number | null>(null)`. After a successful unit or vehicle read (`:101-115`): `const at = servedAtMs(unitRes /* or vehRes */); setLookupSavedAt(at !== null && Date.now() - at > SAVED_COPY_AFTER_MS ? at : null)` (in the handler, not render). Under each status chip (`:277`, `:378`): `{lookupSavedAt && <Typography variant="caption" color="text.secondary" display="block">Last known status, saved {savedTimeLabel(lookupSavedAt)} — it&apos;s checked again when this sends.</Typography>}`. Write `&apos;`: a raw `'` in JSX text adds two `react/no-unescaped-entities` warnings (OX-7). Reset it in `resolveScan`'s first lines (`:95-97`).

4.11 **The Outbox says what to do (B1-4)** (`OutboxDialog.tsx`):
- While open, re-read on any store change: `React.useEffect(() => { if (!open) return; return subscribeQueue(() => { void load() }) }, [open, load])` beside `:45-47`.
- Under each label (`:99-101`): caption `` `Saved ${savedTimeLabel(item.createdAt)}` ``.
- Failed actions (`:112-126`): **Retry** only when `!item.final`. When `item.final`: caption "Retry can't change this. Discard it, and redo it on the screen if it's still needed." and Discard.

4.12 **Saved copies say how old they are (B5-3, B1-13).**
- `src/hooks/useFreshList.ts`:
```ts
const servedAt = new WeakMap<object, number>()
export const jsonFetcher = async (url: string): Promise<unknown> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  const data: unknown = await res.json()
  const at = servedAtMs(res)
  if (at !== null && data && typeof data === 'object') servedAt.set(data, at)
  return data
}
```
  State: `const [fresh, setFresh] = React.useState<{ at: number; savedCopy: boolean } | null>(null)`. `onSuccess` (`:27-30`, a callback): `const now = Date.now(); const at = (data && typeof data === 'object' && servedAt.get(data as object)) || now; setFresh({ at, savedCopy: now - at > SAVED_COPY_AFTER_MS })`. Return `{ ...swr, updatedAt: fresh?.at ?? null, savedCopy: fresh?.savedCopy ?? false }`. (SWR 2.4.1 calls `onSuccess` with the fetcher's own object, `swr/dist/index/index.mjs:458-461`, so the WeakMap lookup holds.)
- `src/components/shared/FreshnessIndicator.tsx`: prop `savedCopy?: boolean`. At `:20`: ``const label = isValidating ? 'Refreshing…' : !updatedAt ? 'Loading…' : savedCopy ? `Saved copy from ${savedTimeLabel(updatedAt)}` : `Data as of ${time}` ``. Pass `savedCopy` at `dashboard/page.tsx:71`, `requests/page.tsx:202` and `CrewMapView.tsx:49` (destructure it from `useFreshList`).
- `src/components/operator/CrewMapView.tsx`: `pinFromCrew(pos, today)` uses `const bucket = pos.checkBusinessDate ? recencyBucket(pos.checkBusinessDate, today) : pos.bucket` at `:17` and `:24`; `:43` → `const pins = React.useMemo(() => { const today = businessDate(); return (data?.data ?? []).map((p) => pinFromCrew(p, today)) }, [data])`. Import `recencyBucket` (`@/lib/deployment-map`, client-safe) and `businessDate`. D2/D14 wording untouched.
- `src/app/(operator)/operator/requests/page.tsx`: destructure `error` at `:125-126`; import `Alert`; at `:209`: `requests === null && error ? (<Alert severity="error" sx={{ mt: 2 }}>Couldn’t load your requests. Tap the refresh arrow above, or check your connection.</Alert>) : requests === null ? …spinner…`.

**Operator sees.**
- **Offline End:** toast "End deployment saved on this phone. It sends when you're back online." Opening End again shows "End deployment is already saved on this phone…" and a disabled "Already saved".
- **Offline Return:** toast "Return saved on this phone…". That line then reads "Already saved on this phone" in any return dialog and can't be returned again until it sends. In End, the line keeps its choices under "A return for this line is saved on this phone. Set what happens to the rest."
- **Banner:** "You're offline — showing cached data. 2 action(s) queued: End deployment, Daily check · Truck-01."
- **Offline morning:** "Start daily check (2)" with "Last synced Thu 4:40 PM — today's checks aren't known yet." A truck checked on this phone today shows Done with "Saved on this phone". This holds when the app stayed open overnight: Today checks the day again when it comes back on screen.
- **Saved End meets new gear:** the Outbox shows "Equipment was added after this End was saved: Cooler. Open End deployment again."; the deployment stays open.
- **Outbox:** every row says when it was saved; a failure Retry can't fix offers only Discard and says why; the list updates while open.
- **Saved copies:** offline Today, Requests and Crew Map say "Saved copy from Thu 4:40 PM"; crew-map pins age to amber and red; a Scan lookup from a saved copy says so; Requests with nothing saved says it couldn't load instead of spinning.

**Tests.**
- New `tests/components/p1-2-pending-writes.test.ts` (pure): `queuedEnd`; `queuedReturnLineIds` (bulk body, single-line endpoint, failed ignored); `queuedCheckVehicleIds` (day match); `describeWaiting`.
- New `tests/components/p1-2-saved-on-phone.test.tsx` (`import 'fake-indexeddb/auto'`, a fresh `IDBFactory` per test, items written with `openQueueDB`/`putQueueItem`, `recountQueue()` before render):
  - a saved End → DispositionDialog (end mode) shows "already saved" and the button is disabled;
  - `mutate` → `{ ok: true, queued: true }` inside a `ToastProvider` → the toast, then `onComplete`; `reason: 'server'` → the server wording;
  - a saved DELETE `/items` for ki1 → in Return mode ki1 reads "Already saved on this phone" and isn't in the body; in End mode (BO-12) ki1 shows its controls under "A return for this line is saved on this phone…" and is in the body;
  - the end-mode body carries `listedKitItemIds`;
  - the Return label is "Return Cooler and Drill bits" for two lines, "Return Cooler, Drill bits and 1 more" for three (B1-4);
  - Today with `asOf` yesterday → "Start daily check (2)" and "today's checks aren't known yet", no "Checked by";
  - a saved check for v1 today → v1 Done with "Saved on this phone"; Start shows (1);
  - BO-6: `vi.useFakeTimers({ toFake: ['Date'] })` at `2026-10-27T01:00:00Z` (21:00 Eastern) with a Today read from then → v1 done; set the clock to `2026-10-27T11:00:00Z` (07:00 Eastern), dispatch `visibilitychange` → v1 not done and "today's checks aren't known yet" shows (passed on the review clone);
  - the daily check page: a saved check for v1 today → the Check tab doesn't pre-pick v1 (`fetchCheckedToday`), and the line reads "1 daily check(s) saved on this phone — they send when you're back online" (OP-23); its label is "Daily check · Truck-01";
  - Scan: a saved DELETE `/items/ki1` → Scan doesn't offer Return for ki1 after a remount (`loadActive`);
  - OfflineBanner with two saved items → the text lists both labels.
- New `tests/p1-2-end-unlisted.test.ts` (node): lines a, b open; `listedKitItemIds: [a]` → 409 naming b, deployment not ended, stock unchanged; `[a, b]` → 200; no field → today's auto-return (Bug 8 shape); b wholly waiting on a transfer and unlisted → 200.
- New `tests/components/p1-2-saved-copy.test.tsx`: `useFreshList` via a tiny harness (a `date` header 2 days old → `savedCopy` true); Scan with an old `date` header → "Last known status"; Requests with fetch rejecting → the error Alert.
- `tests/components/OutboxDialog.test.tsx`: a `final` failed item → no Retry, the caption; the list re-reads after `setQueueFlags({ sessionExpired: true })` (the `listAll` mock called twice); the "Saved …" caption.
- `tests/components/FreshnessIndicator.test.tsx`: `savedCopy` → "Saved copy from …" (the 5 existing cases pass).
- `tests/components/cc32-crew-map-offline.test.tsx`: a case with `headers: new Headers({ date: new Date(Date.now() - 2 * 86_400_000).toUTCString() })` → "Saved copy from", and a pin whose `checkBusinessDate` is 2 business days old (`businessDate(new Date(Date.now() - 2 * 86_400_000))`) → `RECENCY_COLOR.stale`. The file's `DeploymentMap` mock renders only a pin count, so extend it to render each pin's `color` too, in a sibling `<div data-testid="pin-colors">{pins.map((p) => p.color).join(',')}</div>` (OX-13). Its existing cases still pass.
- **Existing tests that change:**
  - `tests/components/pr5c-today-crew.test.tsx:35` uses `asOf: AT` (2026-10-09), so the crewmate's check would read as not known: use `asOf: new Date().toISOString()`, keep `AT` for `submittedAt`.
  - `tests/components/hotfix-reconnect-reread.test.tsx:13` (OX-5): its `@/components/shared/useToast` mock exports only `useToast`, and DispositionDialog now calls `useOptionalToast` ("No `useOptionalToast` export is defined on the mock"). Make it `vi.mock('@/components/shared/useToast', () => ({ useToast: () => vi.fn(), useOptionalToast: () => vi.fn() }))`, with the comment `// P1-2 O4: DispositionDialog reads useOptionalToast too (a toast for a saved End/Return).`
- **Must pass unchanged:** `DispositionDialog.test.tsx`, `p1-1b-screens.test.tsx`, `OfflineBanner.test.tsx`, `today-sections.test.tsx`, `cc32-daily-check-flow`, `uxp3-daily-check-flow`, `daily-check-gps` (they mock `pending: 0`, no longer read), `tests/data-integrity.test.ts` "Bug 8", `p1-1a-field-writes.test.ts`, `cc31-alert-autoresolve.test.ts`, `p1-1c-where-things-are.test.ts`, and the Security and earlier O tests. Practice build: only the two above changed.

**Files.** New `src/lib/pending-writes.ts`, `src/hooks/usePendingWrites.ts`, `src/lib/served-at.ts`, `src/components/operator/today/useTodayChecks.ts`; `src/components/shared/useToast.tsx`; `src/components/shared/DispositionDialog.tsx`; `src/components/operator/OfflineBanner.tsx`; `src/components/operator/OutboxDialog.tsx`; `src/app/api/deployments/[id]/end/route.ts`; `src/lib/business-date.ts`; `src/app/(operator)/operator/dashboard/page.tsx`; `src/components/operator/today/TodayPrimaryAction.tsx`; `src/components/operator/today/VehicleChecks.tsx`; `src/app/(operator)/operator/daily-check/page.tsx`; `src/app/(operator)/operator/scan/page.tsx`; `src/hooks/useFreshList.ts`; `src/components/shared/FreshnessIndicator.tsx`; `src/components/operator/CrewMapView.tsx`; `src/app/(operator)/operator/requests/page.tsx`; the tests above.

**Behaviour changes (PR body):** a second return of a waiting line is blocked until the first sends (End still shows the line, BO-12) · a saved End that lists fewer lines than are open is refused by name · an offline Today no longer claims today's checks are done, and its day turns over at midnight Eastern while the app stays open · saved copies say "Saved copy from …".

---

## O5 · Photos stay until the action is safe

**Goal.** A photo leaves the phone only after its action got a 2xx, or after the action is stored with the photo's real URL. A resubmit after an error reuses the upload. Old unused photos are swept. Discard takes its photos with it.
Closes B5-6, B5-16. Depends on O2 (`FLUSH_PHOTO_DEPS`, `queuePage`).

5.1 **`src/lib/photoStore.ts`:**
- `ResolveDeps` (`:190-194`) gains `/** P1-2 (B5-6): local ref → URL already uploaded on this page, so a resubmit doesn't upload again. */ uploaded?: Map<string, string>`. `defaultPhotoDeps` gets `uploaded: uploadedThisPage` (a module `new Map()`).
- `walk` (`:212-224`): first `const known = deps.uploaded?.get(value); if (known) { consumed.push(value); return known }`; after the upload, `deps.uploaded?.set(value, url)`.
- New, after `walk`:
```ts
/** P1-2 (B5-6): upload a body's local photos and swap in their URLs, but KEEP the blobs. The caller
 *  deletes them with forgetLocalPhotos only once the action is safe: a 2xx, or the resolved body
 *  durably stored. Throws like resolvePhotoRefs. */
export async function uploadPhotoRefs<T>(body: T, deps: ResolveDeps = defaultPhotoDeps): Promise<{ body: T; refs: string[] }> {
  if (!hasLocalRefs(body)) return { body, refs: [] }
  const refs: string[] = []
  const resolved = (await walk(body, deps, refs)) as T
  return { body: resolved, refs }
}
/** Delete these local photos and their remembered URLs. Best-effort. */
export async function forgetLocalPhotos(refs: string[], deps: ResolveDeps = defaultPhotoDeps): Promise<void> {
  await Promise.all(refs.map(async (ref) => { deps.uploaded?.delete(ref); await deps.deleteBlob(ref).catch(() => {}) }))
}
/** Every local photo ref inside a value. */
export function localPhotoRefsIn(value: unknown): string[] {
  return (JSON.stringify(value ?? null) ?? '').match(/localphoto:[A-Za-z0-9_-]+/g) ?? []
}
/** P1-2 (B5-16): delete stored photos no saved action uses that are older than `olderThanMs`.
 *  Returns how many went. Never throws. */
export async function sweepLocalPhotos(keep: Set<string>, olderThanMs: number, now = Date.now()): Promise<number> {
  try {
    const db = await openDB()
    return await new Promise<number>((resolve) => {
      let n = 0
      const tx = db.transaction(STORE, 'readwrite')
      const req = tx.objectStore(STORE).openCursor()
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) return
        const at = (cur.value as StoredPhoto | undefined)?.createdAt ?? 0
        if (!keep.has(String(cur.key)) && now - at > olderThanMs) { cur.delete(); n++ }
        cur.continue()
      }
      tx.oncomplete = () => resolve(n)
      tx.onerror = () => resolve(n)
    })
  } catch { return 0 }
}
```
- `resolvePhotoRefs` (`:252-259`) keeps its contract on top: `const { body: out, refs } = await uploadPhotoRefs(body, deps); await forgetLocalPhotos(refs, deps); return out`.

5.2 **`src/hooks/useOfflineQueue.ts`:**
- `flush` (`:344-350`): `const { body, refs } = await uploadPhotoRefs(item.body, FLUSH_PHOTO_DEPS)`. If the body changed: `putItem(db, work)` **then** `await forgetLocalPhotos(refs)` — `// B5-6: the URLs are on disk now; never delete before`.
- `mutate` (`:631-639`): `({ body, refs } = await uploadPhotoRefs(args.body))` (the catch still enqueues the original body). `await forgetLocalPhotos(refs)` on `res.ok`; after a stored enqueue in the 401 branch, in O2's 503 branch, and in the network catch (`:676-680`). **Not** on another 4xx/5xx (`:673-674`): the blobs and remembered URLs stay for the resubmit. The 401 branch's comment says "a 401 response proves the upload succeeded and blobs were deleted": make it "the upload succeeded, so `body` carries real URLs; the blobs go once the enqueue is stored" (OX-11).
- `discardFailed` (`:544-551`): read the item first (`getItemById`), delete it, then `await forgetLocalPhotos(localPhotoRefsIn(item?.body))`.
- Start-up, once per page (add `swept: false` to `queuePage` and its reset): after `recountQueue()`, `if (!queuePage.swept) { queuePage.swept = true; const all = await getAllItems(await openDB()); void sweepLocalPhotos(new Set(all.flatMap((i) => localPhotoRefsIn(i.body))), (QUEUE_MAX_AGE_DAYS + 1) * 86_400_000) }`. It reads **every** item, everyone's (O3), so another person's waiting photos stay.

5.3 **`src/components/shared/TransferDialog.tsx:134`:** `const { body: payload, refs } = resolvePhotos ? await uploadPhotoRefs(basePayload) : { body: basePayload, refs: [] as string[] }`. On the success path (`:145`), `await forgetLocalPhotos(refs)`. On failure the note and photos stay (P1-1b 3.2), and now so do their uploads.

**Operator sees.** A photo taken offline, then a submit that gets an error (400, 409, 503), then a fix and a resubmit: the photo arrives (before: the action landed without it, silently). Abandoned photos no longer pile up on the phone. Discard removes the action's photos.

**Tests.**
- `tests/photo-resolve.test.ts` (node): `uploadPhotoRefs` deletes nothing and returns its refs; a second call with the same `uploaded` map uploads nothing and returns the same URL; `forgetLocalPhotos` deletes the blobs and empties the map; `localPhotoRefsIn`. The 5 existing cases pass unchanged.
- New `tests/offline/p1-2-photos-stay.test.tsx` (the harness):
  - "Still stored" below means `expect(await getLocalPhoto(ref)).not.toBeNull()`, never `toBeInstanceOf(Blob)`: under fake-indexeddb in jsdom a stored Blob comes back as a plain object (the realm mismatch `useOfflineQueue.test.tsx` notes for FormData) (OX-14).
  - (n) Online `mutate` with a stored photo → `/api/uploads` 200 `{ url }`, the write 400 → `getLocalPhoto(ref)` still stored. A second `mutate` of the same body → the write 200, uploads called once, the blob gone.
  - (o) A saved photo item flushed with the write answering 500 → the body holds the URL and the blob is gone; the next flush doesn't upload again.
  - (p) Two stored photos, one referenced by a saved item → `sweepLocalPhotos(keep, 8 days, Date.now() + 9 days)` removes only the other (the kept one is still stored, the other `null`).
  - (q) A failed photo item: its photo still stored; Discard → `null`.
- **Existing tests that change:** none (practice build). `useOfflineQueue.test.tsx` (a) and (a2) keep their meaning: a failed upload deletes nothing.

**Files.** `src/lib/photoStore.ts`; `src/hooks/useOfflineQueue.ts`; `src/lib/offline-queue-db.ts` (`swept`); `src/components/shared/TransferDialog.tsx`; `tests/photo-resolve.test.ts`; new `tests/offline/p1-2-photos-stay.test.tsx`.

---

## O6 · Service worker, lists, offline page, timeouts — **merges alone**

**Goal.** The lists operators need offline are saved. A new build's worker drops the old build's HTML pages, and nothing else, so the launch it happens in still works offline. The offline page tells the truth. Online-only actions give up after 12 s on weak signal and say honestly that they may have gone through. The sign-in check never reads a saved copy.
Closes B5-10, B1-5, B5-15, B5-18, OP-31, B5-17, plus accounts c step 9 (moved here). One new service worker ships; `skipWaiting`/`clientsClaim` are untouched (D31).

6.1 **Cache the lists operators need offline** (`src/app/sw.ts:41-67`). The matcher destructures `url: { pathname, searchParams }`.
- First line (`:45`), O3's sign-in check: `(pathname === '/api/auth/me' && !searchParams.has('live')) ||`. `/api/auth/me?live=1` then falls to Serwist's NetworkOnly rule for `/api/auth/*` (`index.worker.mjs:151-153`).
- After `pathname.startsWith('/api/hubs') ||` (`:55`):
```ts
          // P1-2 (B5-10 / B1-5): reads every operator needs offline that carry no per-person data:
          // the per-type daily-check list, the request composer's projects and categories, and the
          // people picker. EXACT paths; the admin template list (no vehicleType) stays out. Cleared
          // at sign-out with the rest of ahits-field-reads (O3).
          (pathname === '/api/checklist-templates' && searchParams.has('vehicleType')) ||
          pathname === '/api/projects' ||
          pathname === '/api/categories' ||
          pathname === '/api/operators' ||
```

6.2 **Old-build pages don't outlive their build (B5-15, BO-2).** Every deploy ships a new service worker (the build id is inside `sw.js`). On the first launch online, the new worker installs *after* the page has loaded and RoutePrefetcher has warmed it. Rev 1 deleted six caches at activation, which threw away exactly what that launch had just warmed, plus the start URL's redirect in `others`; an operator who then drove out of signal had no offline tab switching and no offline cold start. The real hazard is narrower: an **HTML document from an older build** names scripts this worker's precache dropped, so served offline it is a white page. RSC payloads from another build are harmless (Next does a full-page load on a build mismatch, `next/dist/client/components/router-reducer/fetch-server-response.js`).
- New `src/lib/sw-cache-hygiene.ts` (pure, no DOM globals, so a test drives it with a fake CacheStorage):
```ts
// P1-2 O6 (B5-15, BO-2): what a newly active service worker clears. Pure (no DOM globals), so
// tests drive it with a fake CacheStorage. sw.ts imports it by a relative path.

/** Caches that can hold HTML documents (operator/admin pages, Serwist's `pages`, and `others`,
 *  which also holds the start URL's redirect `/` → dashboard). */
export const DOCUMENT_CACHES = ['ahits-app-pages', 'pages', 'others'] as const
/** The operator tabs a cold start can land on; re-fetched after an update so they open offline. */
export const OPERATOR_DOCUMENTS = ['/operator/dashboard', '/operator/daily-check', '/operator/my-deployment', '/operator/scan', '/operator/requests', '/operator/map'] as const

type CacheLike = { keys(): Promise<readonly Request[]>; match(r: Request): Promise<Response | undefined>; delete(r: Request): Promise<boolean>; put(r: Request | string, res: Response): Promise<void> }
type StorageLike = { has(name: string): Promise<boolean>; open(name: string): Promise<CacheLike> }

const norm = (u: string): string => { const p = u.split('?')[0]!.split('#')[0]!; try { return decodeURI(p) } catch { return p } }

/** The build's own scripts a page names: `<script src="/_next/static/…">`. */
export function pageScripts(html: string): string[] {
  return [...html.matchAll(/<script[^>]*\ssrc="(\/_next\/static\/[^"]+)"/g)].map((m) => norm(m[1]!))
}

/** An HTML document from an older build names a script this worker didn't precache: served
 *  offline it is a white page. A document whose scripts are all precached is kept. */
export function isOldBuildDocument(html: string, precached: ReadonlySet<string>): boolean {
  return pageScripts(html).some((src) => !precached.has(src))
}

/** The precached URLs, normalised. */
export function precachedSet(entries: readonly (string | { url: string })[]): Set<string> {
  return new Set(entries.map((e) => norm(typeof e === 'string' ? e : e.url)))
}

/** Delete only old-build HTML from the document caches. Redirects (status 0, opaque), non-HTML
 *  entries and this build's pages stay. Does nothing without a build manifest (dev). Returns how many went. */
export async function pruneOldBuildDocuments(storage: StorageLike, precached: ReadonlySet<string>): Promise<number> {
  if (![...precached].some((u) => u.startsWith('/_next/static/'))) return 0
  let n = 0
  for (const name of DOCUMENT_CACHES) {
    if (!(await storage.has(name))) continue
    const cache = await storage.open(name)
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      if (!res || res.type === 'opaqueredirect' || res.status !== 200) continue
      if (!(res.headers.get('content-type') ?? '').includes('text/html')) continue
      const html = await res.clone().text().catch(() => '')
      if (isOldBuildDocument(html, precached)) { await cache.delete(req); n++ }
    }
  }
  return n
}

/** Re-fetch the operator documents this build serves (online, signed in), so a cold start offline
 *  after an update still opens. A redirect (signed out, PIN change) or a failure stores nothing. */
export async function rewarmDocuments(storage: StorageLike, fetchFn: (path: string) => Promise<Response>): Promise<void> {
  const cache = await storage.open('ahits-app-pages')
  await Promise.all(OPERATOR_DOCUMENTS.map(async (path) => {
    try {
      const res = await fetchFn(path)
      if (res.ok && !res.redirected && (res.headers.get('content-type') ?? '').includes('text/html')) await cache.put(path, res)
    } catch { /* offline: nothing to warm */ }
  }))
}
```
- `src/app/sw.ts`: `import { precachedSet, pruneOldBuildDocuments, rewarmDocuments } from '../lib/sw-cache-hygiene'` (relative: the worker bundle doesn't need the `@/` alias), and before `serwist.addEventListeners()` (`:125`):
```ts
// P1-2 O6 (B5-15, BO-2): HTML from the previous build names scripts this worker's precache dropped,
// so an old document served offline is a white page. At activation delete only those documents,
// then re-fetch the operator tabs (online, at most 5 s) so a cold start offline still opens. This
// build's pages, the RSC caches and the start URL's redirect in `others` stay: they hold what this
// launch warmed seconds before the update installed (Next does a full load when an RSC payload's
// build differs, next/dist/client/components/router-reducer/fetch-server-response.js).
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await pruneOldBuildDocuments(caches, precachedSet(precacheEntries)).catch(() => 0)
    await Promise.race([
      rewarmDocuments(caches, (path) => fetch(path, { credentials: 'same-origin', cache: 'no-store' })).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  })())
})
```
- Notes. The re-fetch is a screen load in the proxy's eyes, so under Security S1 it may renew the sign-in; it happens only when the person has just opened the app, which is the rule's intent. Signed out, or under a forced PIN change, it gets a redirect and stores nothing; S1's sign-out marker turns a late cookie into a redirect too. On the review clone this bundled into `public/sw.js` (`npm run build`), and on real build output this build's HTML was kept and an older build's was flagged (§9.3).

6.3 **Offline page (B5-18, §0-k)** (`src/app/~offline/page.tsx:35-38`): the paragraph becomes §0-k's words. In `sw.ts:25`, set `OFFLINE_PAGE_REVISION` to the PR's date; the hotfix comment requires it, or phones never see the new words.

6.4 **Warm the templates (B5-10).** New `src/hooks/useWarmChecklistTemplates.ts`: `export function useWarmChecklistTemplates(types: string[])` runs one effect keyed on the sorted, de-duplicated `types.join(',')`; when `navigator.onLine`, it calls `fetch('/api/checklist-templates?vehicleType=' + encodeURIComponent(t)).catch(() => {})` for each type. The worker stores them. Call it in `dashboard/page.tsx` right after `const vehicles = deployment?.vehicles ?? []` (`:47` at base, `:50` after O4) with `vehicles.map((v) => v.vehicle.type)` (OX-15).

6.5 **Say when the standard list is used** (`daily-check/page.tsx:371-395`): state `const [templateFallback, setTemplateFallback] = React.useState(false)` beside `:181`. In the `.then`, right after `if (!active) return`: `setTemplateFallback(d === null)` (`null` = a failed read; `{ items: null }` = no template set up, not a fallback). In the `.catch`: `setTemplateFallback(true)`. After the `staleTemplate` Alert (`:728-732`): `{templateFallback && <Alert severity="warning" sx={{ mb: 2 }}>Using the standard checklist — this vehicle’s own list didn’t load. Check only the items that apply.</Alert>}`.

6.6 **Prefetch the map (OP-31)** (`src/components/operator/RoutePrefetcher.tsx:12-18`): add `'/operator/map'` to the operator tabs. No `controllerchange` re-warm (CO-13): with 6.2, activation keeps what this launch warmed, and the worker re-fetches the operator documents itself. Phone-test step 3b (§6) checks the operator who ignores "A new version…".

6.7 **Online-only actions give up after 12 s (B5-17, BO-7)**, with O3's `fetchWithTimeout`:
- `my-deployment/page.tsx` (**0 net lines**): `:38` → `import { groupBy, formatDate, fetchWithTimeout } from '@/lib/utils'`; `fetch(` → `fetchWithTimeout(` on the same lines at `:311`, `:340`, `:365`, `:394` and `:419` (accept/decline, cancel transfer, handoff accept/decline, cancel handoff, entire-deployment transfer); their five catch toasts `'Network error. Please try again.'` (`:326`, `:350`, `:380`, `:404`, `:435`) → `'No answer from the server — it may have gone through. Check below before you try again.'` These handlers already refuse when the phone knows it is offline (`:304`, `:334`, `:358`, `:388`, `:413`), so the catch means lie-fi or a dropped reply, and a retry after a success gets "no longer pending" or "already waiting".
- **Leave the rental add alone:** `:1001` and `:1017` stay `fetch(` and the rental catch (`:1032`) as it is. `POST /api/vehicles` carries no Idempotency-Key, so cutting it off while the server may still be creating the vehicle invites a second rental vehicle on retry.
- `src/components/shared/TransferDialog.tsx`: add `import { fetchWithTimeout } from '@/lib/utils'` (it imports nothing from there yet, OX-15); `fetchWithTimeout` at `:135`; the catch toast (`:151`) → `'No answer from the server — it may have gone through. Check your transfers before you try again.'` (a retry of a transfer that went through gets "already waiting on a transfer", `transfer/route.ts:112`).
- `wc -l` must print the base count.

**Operator sees.** The daily check shows the vehicle's own list offline (or says it's using the standard one). Requests, projects and the people list work offline. After a deploy, no white page or "Something went wrong" from an old cached page, and the app still opens offline after that first launch, even without tapping Reload. The offline page says what is saved and what needs a connection. On weak signal, Accept, Decline, Cancel transfer, Entire-deployment transfer and Transfer stop after 12 s with "No answer from the server — it may have gone through. Check … before you try again." (before: a minute or more of spinner). Add rental vehicle waits as long as it takes.

**Tests.**
- New `tests/components/p1-2-sw-offline.test.ts` (source guard, comments stripped, as `cc32-sw-map-cache.test.ts`): the four list matchers are present; `checklist-templates` appears only with `searchParams.has('vehicleType')`; the `/api/auth/me` match excludes `live`; an `activate` listener calls `pruneOldBuildDocuments` and `rewarmDocuments`, and `sw.ts` calls `caches.delete(` nowhere; `OFFLINE_PAGE_REVISION` is not `'2026-10-25'`.
- New `tests/components/p1-2-sw-cache-hygiene.test.ts` (pure; runs in both suites; a fake CacheStorage whose caches map paths to `Response`s; passed on the review clone):
  - `ahits-app-pages` holds `/operator/dashboard` (this build's scripts) and `/operator/scan` (an old script); `others` holds `/` as `{ type: 'opaqueredirect', status: 0 }`, `/login` (old HTML) and a `text/plain` entry; `ahits-app-rsc` holds an old payload → `pruneOldBuildDocuments` returns 2; `ahits-app-pages` keeps `/operator/dashboard`; `others` keeps `/` and the text entry; `ahits-app-rsc` is untouched.
  - A manifest with no `/_next/static/` entries (dev) → 0, nothing deleted.
  - `isOldBuildDocument`: a route-group chunk written `%28operator%29` with a `?dpl=` query matches its precached `(operator)` URL; an unknown script → true.
  - `rewarmDocuments` with a fetch answering this build's HTML → six entries; with `redirected: true` → none.
- `tests/components/offline-page-reload.test.tsx`: a case for the new words ("Transfers and PIN changes need a connection"); still exactly one `<script>`.
- New `tests/components/p1-2-warm-templates.test.tsx`: a template read that rejects → the "standard checklist" Alert; `{ items: null }` → no Alert; a Today with two TRUCKs and one TRAILER → exactly two template fetches; RoutePrefetcher prefetches `/operator/map`.
- New `tests/components/p1-2-online-timeouts.test.tsx`: `fetchWithTimeout` rejects at 12 s under `vi.useFakeTimers()`; TransferDialog with a fetch that settles only on abort → after 12 s the "may have gone through" toast shows and loading clears; a source guard that the five handler bodies in the page call `fetchWithTimeout(` and the two rental calls still call `fetch(`.
- **Existing tests that break:** none (practice build; `hotfix-no-reload-on-online.test.ts` and `cc32-sw-map-cache.test.ts` pass; no test pins "Network error"). `offline-page-reload` only gains the case above.

**Files.** `src/app/sw.ts`; new `src/lib/sw-cache-hygiene.ts`; `src/app/~offline/page.tsx`; new `src/hooks/useWarmChecklistTemplates.ts`; `src/app/(operator)/operator/dashboard/page.tsx`; `src/app/(operator)/operator/daily-check/page.tsx`; `src/components/operator/RoutePrefetcher.tsx`; `src/app/(operator)/operator/my-deployment/page.tsx` (0 net); `src/components/shared/TransferDialog.tsx`; the tests above.

**Behaviour changes (PR body):** a new service worker; at activation it deletes only the previous build's HTML pages and re-fetches the operator tabs · four more lists are saved offline (cleared at sign-out) · the offline page's words · five online-only transfer actions time out at 12 s and say they may have gone through; Add rental doesn't time out.

---

## 4 · Shared files and order (Eastern time and Security go first; Data after)

**Order.** The Eastern-time PR (and its docs commit, D-E1), then S1 → S2 → S3 → S4, then O1 → O6, then D1 → D3. Every O PR branches from the then-current `development`, after all of S1–S4 and the O PRs before it have merged. Re-grep anchors; where an earlier PR moved a block, apply the O change to the moved block. None of these overlaps changes what an earlier hunk does. Before O1, confirm in STATUS §2 that the Eastern-time PR and S1–S4 are merged, and in `DECISIONS.md` that D-E1 and D-S1…D-S3 are written (§7.5). The tables give base lines (`3dbaea8`) and, after a semicolon, the lines the practice build found after S4.

**With the Eastern-time PR (lands before P1-2).**

| File | Eastern-time PR | Offline | How to rebase |
|---|---|---|---|
| `src/lib/business-date.ts` | `DEFAULT_TIMEZONE`, `startOfBusinessDay` | O4 adds `isOnBusinessDay` at the end | Append after ET's helper. |
| `src/components/operator/today/VehicleChecks.tsx` | `checkTime` gets `timeZone: appTimezone()` (`:29-31`) | O4 `savedOnPhone` (`:19-25`, `:50-53`, `:61-66`) | Independent hunks; keep ET's line. |
| `src/app/(operator)/operator/dashboard/page.tsx` | the date line (`:68`) | O4 `useTodayChecks` (`:43-46`, `:93-97`, `:120-126`); O6 template warm (after `const vehicles`: `:47`; `:50` after O4) | Independent hunks. |
| `tests/components/pr5c-today-crew.test.tsx` | `CHECKED_AT` (`:23`) | O4 `asOf` (`:35`) | Keep both. |
| `src/**` | the guard test refuses a zone name outside `business-date.ts` | every O day uses `businessDate()`; no zone written | Run `tests/components/eastern-time-guard.test.ts`. |

Practice build: O1's 7-day window and O4's Today use the business day; the guard was green at every PR and the BO-6 test passed.

**With Security (S1–S4, merged first).** Security S edits none of `useOfflineQueue.ts`, `useAuth.ts`, `OfflineBanner.tsx`, `OutboxDialog.tsx`, `sw.ts`, the login page or `OperatorNav.tsx` (its §0.1).

| File | Security | Offline | How to rebase |
|---|---|---|---|
| `src/proxy.ts` | S1: cross-site check at the top of `handleRequest` (`:121-129`; `:134`); sign-out marker check right after the token is read (`:142`; `:158`); screen-load-only renewal (`:164`; `:188`). S2: the change funnel by role (`:171-184`; one 403 with two wordings at `:202-206`). | O2: `code` on the funnel's 403. O3: the `X-Queued-For` block right after `const role` (`:153`; `:175`). | O2 adds `code: PIN_CHANGE_REQUIRED_CODE` to the one 403 JSON S2's funnel returns (both wordings). O3's block goes after S1's marker check and `jwtVerify`, before S1's renewal and S2's funnel. |
| `src/lib/auth/session.ts` | S1: `setSessionCookie` and `clearSession` (the 2-minute marker) | O2: splits `getSession` into `checkSession` | Independent hunks; split `getSession` as written. |
| `src/app/api/auth/login/route.ts` | S1: sign-in records. S2: the admin password rule. | O2: the outer catch → 503 (`:86-89`; `:116-119`). O3: `userId` in the success JSON (`:85`; `:115`). | One-line edits wherever S left the catch and the success return. |
| `src/app/api/cron/dispatch/route.ts` | S1: step 2b, the sign-in purge, right after the reap (`:109`), and `signInsPurged` in the return (`:462`; `:471`) | O1: the reap's SQL and comment only (`:99-109`; `:99-110`) | Keep S1's block below. |
| `src/components/admin/AdminNav.tsx` | S2: "Change password" above Sign out (Sign out `:84`; `:87`) | O3: Sign out → `<SignOutButton />` | Replace only the Sign out Button. |
| `src/app/(admin)/admin/account/page.tsx` | S2: new page | O2: the credential-changed event before its redirect | — |
| `src/app/(operator)/operator/change-pin/page.tsx` | S1: the toast at `:47` | O2: the event before `router.replace` (`:48`) | Keep S1's words. |
| `src/app/api/vehicles/[id]/report-damage/route.ts`, `src/app/api/inventory/units/[unitId]/report-problem/route.ts` | S3: replies through `forRole` (3.6b, `:69`, `:78`) | O2: the email limit after the session check (`:39`, `:31`, unchanged after S) | Independent hunks; the limit sits above S3's reply. |
| `src/app/api/deployment-requests/route.ts`, `…/[id]/route.ts` | — (S4 no longer has the limit) | O2: the limit (`:72-74`; `[id]:66`, PATCH) | — |
| `src/lib/rate-limit.ts` | — (S4 doesn't touch it) | O2: `limitNotifyingWrite` | Append. |
| `src/app/api/daily-check/route.ts` | S3: the GET's `vehicle` include (`:79`) | O1: the POST window (`:13-18`, `:114-119`) | Independent hunks. |
| `src/lib/shared-errors.ts` | none | O1, O2, O3 append constants | Append-only. |
| The hub portal routes | S4 deletes the dead copy `src/app/s/[token]/transition/route.ts`; `/api/s/[token]/transition` is the one wrapped portal route | O1: `requestOwner` binds `/s/…` and `/api/s/…` to the link's path | Keep both prefixes: old links, and `fnd6-public-link-gate` posts to a `/s/…` URL (OX-18). |
| `src/app/api/uploads/route.ts` | S4: a per-user upload limit (429 "Too many uploads"); the photo URL is built at `:80` (was `:74`) | No O edit. A queued photo that gets S4's 429 is a server-reached photo failure: one try, then O2's waits. O3's `static-image-assets` clear still covers `/api/photos/<path>.<ext>`. | — |
| `tests/p1-2s3-operator-read-guard.test.ts` | S3 adds it. From Security rev 4.1 its session mock has `checkSession`. | O2: `/api/auth/me` reads `checkSession`, and the guard sweeps that route | Nothing, if S's line is there; otherwise O2 adds it (2.7, OX-2). |
| `tests/uxp3-login-lockout.test.ts`; S's `p1-2s1-pin-attempts`, `p1-2s2-admin-password`, `p1-2s2-owner` | S1 may add cases to `uxp3`; S1 and S2 add exact login-reply checks | O3: `userId` in all five checks (O3 Tests, OX-3) | Keep S's cases; change only those checks. |
| `tests/components/LoginPage.test.tsx`, `tests/components/useAuth-logout.test.tsx` | S1 may add cases | O3: new cases; `useAuth-logout:85` | Keep S's cases. |
| `tests/helpers/proxy-request.ts` | **S1** adds it (`tokenFor`, `proxyRequest(path, { method, token, headers, cookies })`) | O2, O3 use it | — |

**What O relies on from S1 (BS-3).** Only a screen load renews the sign-in, never a background request, and Sign out leaves a 2-minute marker that drops a late session cookie. O2's "a PIN reset parks saved work and it sends within seconds of the new PIN" and O3's sign-out both rely on it. If S1 shipped without that rule, tell the owner before O2's acceptance row 2.

**For packet D (after O6).** D's §4 already lists what it rebases on here; revs 2 and 3 add (the practice build didn't build D on O, so D re-greps):
- `src/components/shared/DispositionDialog.tsx`: O4 edits `:134`, `:177` (`held`, now only in Return mode), `:230-250`, `:294` and the confirm button (`:415-418`: `|| !!endSaved` and the "Already saved" label). D3 edits `:181`, `:196`, `:360-364`, `:415` and `:418`. Keep both sets of conditions on the button.
- `src/app/api/cron/dispatch/route.ts`: O1 owns `:99-109` (`:99-110` after S); S1's 2b sits below; D1 edits `:84-97` and the return (`:462`; `:471` after S); D3 INV-3 `:229-242`.
- The deployment routes: O1's record lines and fallback replies (`deployments/route.ts:307`, `:372`; `items/route.ts:116-117`, `:261`, `:304-305`, `:316-317`, `:640`, `:665-666`; `end/route.ts:92-96`, `:420`, `:427`, and O4's `listedKitItemIds` and `UnlistedLines`; `transfer/route.ts:162`, `:175`) are different hunks from D2's and D3's.
- D's §4 rows that name **S4** for the per-operator limit (the request routes, the report routes) now mean **O2**. D2's race tests still use a fresh operator for each run.
- D3 must not touch `deployment-auth.ts` (B5 §3 is done here). D1 changes `tests/ur034-daily-check-failed-alert.test.ts:52` after O1 changed its dates.

---

## 5 · Gate (every PR, before opening it)

`npx prisma generate` · `rm -rf .next` (an older build's `.next/types` can break `tsc`; as Security §5, SX-11) · `npx tsc --noEmit` (0) · `npx eslint .` (0 errors; no new warnings in touched files; state the count. Practice build: 47 warnings at S4 and at every O PR) · `npm run test:ui` (green) · `npm run build` · `wc -l "src/app/(operator)/operator/my-deployment/page.tsx"` = the base count (1454 at `3dbaea8`; 1454 at every O PR in the practice build).
- **Base counts:** `npm run test:ui` on the base; the DB suite from the `verify` job log of the base commit's `deploy.yml` run (it runs only in CI). State both suites' base and new counts (the `.test.ts` files under `tests/components` run in both). A local Postgres must run in UTC, as CI's does.
- **Existing tests:** each PR's Tests section lists every existing test the practice build had to change ("Existing tests that change", "Breaks"). Any other failing test, after the flake re-runs below, is a stop-and-report.
- Under heavy machine load the UI suite's 5 s timeouts flake (STATUS §6). Re-run failing untouched files alone before reading anything into them.
- Two DB-suite flakes with no O code on their path (OX-16). Re-run each alone; neither is O's to fix:
  - `tests/r4-hub-stock-reserve.test.ts` "skips reserve for SERIALIZED…": lines inserted together share `createdAt` (the family of Security's `f3-line-checklist` flake, SX-16). Seen once in O2's first run; 4 of 4 alone passed.
  - `tests/p1-2s1-pin-attempts.test.ts` "1 right and 19 wrong PINs in parallel", **only if S1 merged before Security rev 4.1**: it assumes the right PIN reserves its slot first, and Postgres may reserve five wrong ones first (about 1 run in 10). Rev 4.1's version sets the order and doesn't flake.
- Lint: set state only in callbacks, never in an effect body, so touched files gain no `react-hooks/set-state-in-effect` warning.
- **Every PR:** `grep -rnE "D-O[0-9]" src tests` → 0 (the real decision numbers are written instead) · `tests/components/eastern-time-guard.test.ts` passes (no zone name in `src`).

Anchor greps:
- **After O1:** `grep -n "INTERVAL '48 hours'" src/app/api/cron/dispatch/route.ts` → 0 · `grep -n "return true // table missing" src/lib/idempotency.ts` → 0 · `grep -n "if (!owner) return handler()" src/lib/idempotency.ts` → 0 and `grep -c "typeof owner !== 'string'" src/lib/idempotency.ts` → 1 · `grep -c recordCommitted` ≥ 1 in `deployments/route.ts`, `items/route.ts` (≥ 2), `items/[kitItemId]/route.ts`, `vehicles/route.ts`, `transfer/route.ts`, `end/route.ts` · `grep -rn "Not found or forbidden" src/app/api` → 0 · `grep -n "PAST_WINDOW_DAYS = 3" src/app/api/daily-check/route.ts` → 0.
- **After O2:** `grep -n "useState(0)" src/hooks/useOfflineQueue.ts` → 0 · `grep -c "nextAttemptAt" src/hooks/useOfflineQueue.ts` ≥ 4 · `grep -n "PIN_CHANGE_REQUIRED_CODE" src/proxy.ts` ≥ 1 · `grep -n "export async function HEAD" src/app/api/health/route.ts` → 1 · `grep -n "'Server error'" src/app/api/auth/login/route.ts` → 0 · `grep -rln limitNotifyingWrite src/app/api` → 4 files · `grep -n "STUCK_RETRIES" src/components/operator/OutboxDialog.tsx` → 0 · `grep -c "backoffCleared" src/hooks/useOfflineQueue.ts` ≥ 2 · `grep -n "markServerUp()" src/hooks/useAuth.ts` → 0 · `grep -n "DB_VERSION = 1" src/lib/offline-queue-db.ts` → 1 · `grep -c "checkSession:" tests/p1-2s3-operator-read-guard.test.ts` → 1 (OX-2).
- **After O3:** `grep -n "X-Queued-For" src/hooks/useOfflineQueue.ts` ≥ 1 · `grep -in "x-queued-for" src/proxy.ts` ≥ 1 · `grep -rn "onClick={logout}" src/components` → 0 · `grep -c clearUserCaches src/hooks/useAuth.ts "src/app/(auth)/login/page.tsx"` → each ≥ 1 · `grep -n "caches.keys()" src/lib/device-user-data.ts` → 0 · `grep -c stampOwners src/lib/offline-queue-db.ts` ≥ 2 · `git fetch origin` then `git diff --stat "$(git merge-base HEAD origin/development)" -- src/app/sw.ts` → empty (compare with the PR's own base, not `origin/development`; Data packet DX-7) · `grep -c "Date.now() - i.createdAt > QUEUE_MAX_AGE_MS ||" src/hooks/useOfflineQueue.ts` → 1 (the probe, OX-4).
- **After O4:** `grep -n "listedKitItemIds" src/components/shared/DispositionDialog.tsx "src/app/api/deployments/[id]/end/route.ts"` → each ≥ 1 · `grep -n "today?.checkedVehicleIds" "src/app/(operator)/operator/dashboard/page.tsx"` → 0 · `grep -n "pending sync" "src/app/(operator)/operator/daily-check/page.tsx"` → 0 · `grep -c "visibilitychange" src/components/operator/today/useTodayChecks.ts` ≥ 1 · `grep -c "it&apos;s checked again" "src/app/(operator)/operator/scan/page.tsx"` → 2 (OX-7).
- **After O5:** `grep -n "resolvePhotoRefs" src/hooks/useOfflineQueue.ts src/components/shared/TransferDialog.tsx` → 0 · `grep -c "forgetLocalPhotos" src/hooks/useOfflineQueue.ts` ≥ 4.
- **After O6:** `grep -c "fetchWithTimeout(" "src/app/(operator)/operator/my-deployment/page.tsx"` → 5 · `grep -c "may have gone through" "src/app/(operator)/operator/my-deployment/page.tsx"` → 5 · `grep -n "Network error" "src/app/(operator)/operator/my-deployment/page.tsx"` → 0 · `grep -c "await fetch('/api/vehicles'" "src/app/(operator)/operator/my-deployment/page.tsx"` → 1 · `grep -n "caches.delete(" src/app/sw.ts` → 0 · `grep -c "pruneOldBuildDocuments" src/app/sw.ts` → ≥ 1 · `grep -n "anything you do is queued" "src/app/~offline/page.tsx"` → 0 · after `npm run build`: `grep -c "opaqueredirect" public/sw.js` ≥ 1.

PR title `P1-2 O<n> · <plain outcome>`. Body: what/why, finding IDs, **Behaviour changes**, **Interpretations** (each PR's are its rows in §9), the decision numbers used (`D-On = Dnn`), tests changed outside this packet's list, my-deployment line count, lint warning count, both suites' counts.

---

## 6 · Owner steps

**Before each merge.** The session reads the admin dashboard's Active Deployments and the time, merges only inside the D48 window, and states both. Test data goes in through the app's screens, named "ZZ P1-2 … (throwaway)", and is cleaned up through the app. **The session never types a PIN or password and never signs in as anyone.** Rows marked (owner) are yours: anything that needs a sign-in, a Reset PIN, a phone or two logins. Rows marked (session) the session does in your signed-in admin tab.

**Evenings.** One merge each, in order: O1, O2, O3, O4, O5, O6. A second merge the same evening only if its PR was already green on a branch rebased after the first merge, touches a different area, and the first has deployed and passed its smoke. O6 always merges alone, on an evening of its own.

**Send your saved work before the O2 and O3 nights.**
- **The afternoon before O2 merges**, tell operators: "Open AHITS with signal before tonight, so anything saved on your phone sends." After O2, anything that has waited on a phone more than 7 days shows "too old to send", with Discard only.
- **The afternoon before O3 merges**, tell operators: "Open AHITS with signal before tonight, and sign out before you hand a phone to someone else." After O3, anything still saved on a phone belongs to whoever is signed in on it when the app first opens after the update.

**After O1** (optional, Supabase SQL Editor, read only; for information):
```sql
-- O1-R1 · saved-action keys: how many, the oldest, and claims left by requests that died
SELECT count(*) AS keys, min(created_at) AS oldest,
       count(*) FILTER (WHERE status_code IS NULL AND created_at < now() - interval '10 minutes') AS stuck_claims
FROM idempotency_key;
```
Before O1 the oldest is about 2 days old; within 10 days after, it reaches about 10. Any `stuck_claims` clear themselves the next time the phone sends that action. Nothing to undo: it's a read.

**Every merge (session):** `/api/health` answers 200 (from O2, a `HEAD` request too); the new version is live; the Active Deployments count, read in your admin tab with the tab visible.

**Acceptance (app screens, after each merge).** All rows below are (owner): each needs a sign-in on a phone.
- **O1:** As a test operator on your phone, on a test deployment: airplane mode on → Add items (one test consumable) → "saved". On the laptop, as admin, End that deployment. Phone: airplane mode off → the Outbox shows "This deployment has already ended." Discard it.
- **O2:** (1) Airplane mode on → do a daily check → the header badge and the banner count it at once. (2) A test operator saves one action offline. Admin → Team → Reset PIN on that operator. Phone: airplane mode off → sign in with the temporary PIN → the Change PIN screen shows "1 action(s) waiting to sync", not "Session expired", and nothing turns red → set the new PIN → it sends within seconds. Then the do-now note "after a Reset PIN, open the Outbox and tap Retry" is retired (§7).
- **O3** (two test operator logins, one phone): A, airplane mode on → save a daily check → Sign out → "Signing out needs a connection…" → airplane mode off → Sign out → "Sign out with unsent actions? 1 action…" → Sign out. B signs in → B's screens show none of A's; B's Outbox (open it from the banner if B has something waiting) shows "1 saved action belongs to someone else."; nothing of A's is sent. **Then B, still signed in: airplane mode on, swipe AHITS away, reopen it → B's Today opens (a saved copy), not "You're offline".** Airplane mode off. B signs out. A signs in → A's check sends.
- **O4:** (1) Airplane mode on → End a test deployment → toast "End deployment saved on this phone…"; open End again → "Already saved". Airplane mode off → it ends. (2) Airplane mode on → Return one test item → that line reads "Already saved on this phone". (3) The next morning, before the phone gets signal, with the app left open overnight: Today shows "Start daily check" with "Last synced … — today's checks aren't known yet."
- **O5:** Airplane mode on → Report a problem on a test unit with a photo → airplane mode off → the report arrives with its photo.
- **O6:** the phone test below.

**Android phone test (O6, about 30 min; §0-l).** You need the Android phone from the A6-Lite pass, with AHITS installed as an app (Chrome ⋮ → Install app); a laptop with Chrome; and a USB cable.
**Set up once:** on the phone, Settings ▸ About phone ▸ tap Build number 7 times, then Settings ▸ System ▸ Developer options ▸ USB debugging on. Plug in the cable and tap Allow on the phone. On the laptop, open `chrome://inspect/#devices` and tick Discover USB devices. Open AHITS on the phone; an AHITS entry appears under the phone's name; click **inspect**. A window opens on the laptop. After you close and reopen the app, click inspect again.
**If a step fails:** take a photo of the phone and a screenshot of the laptop window's Console tab, note the step and the time, merge nothing else that evening, and paste them to the session. The session doesn't revert without your go. To unstick that phone: airplane mode off, then tap Reload.
1. **Before the merge**, with signal, on the current version: open Home, Check, My Deployment, Requests, Scan and Crew Map (menu), about 10 s each. **Pass:** each loads. Then tell the session "step 1 done". The session doesn't merge O6 until you do.
2. The session merges O6 and reports Active Deployments, the time and `/api/health` 200. **Pass:** it reports the new version live.
3. Swipe AHITS away from recent apps. Open it with signal and wait 15 s. **Pass:** Home loads. If "A new version of AHITS is available" shows, **don't** tap Reload yet.
3b. Airplane mode on (still without Reload). Tap every bottom tab and open Crew Map from the menu. **Pass:** each shows its screen or "You're offline"; never a white page. This is the operator who ignores the prompt and drives out of signal. Airplane mode off, then tap Reload if the prompt shows.
4. Open My Deployment, then Requests ▸ New Request, then Cancel. In the laptop window: Application (top) ▸ Cache storage (left). **Pass:** `ahits-app-pages` lists the six operator pages (dashboard, daily-check, my-deployment, scan, requests, map), and none of them has a "Time cached" before step 2. `ahits-app-rsc` and `others` are still there (the update didn't empty them). `ahits-field-reads` lists `/api/checklist-templates?vehicleType=…`, `/api/projects`, `/api/categories` and `/api/operators`. Click `/api/operator/today` there: its response headers include `date`. **Fail:** a page cached before step 2 in `ahits-app-pages`, a missing list, or an empty `others`.
5. Airplane mode on. Swipe AHITS away and reopen it. Tap every bottom tab, open Crew Map from the menu, open Daily Check, open End deployment and Add items, and Cancel both. **Pass:** each shows its screen or "You're offline"; never a white page, "Something went wrong" or a spinner longer than 10 s. The Console shows no red `ChunkLoadError` (an error about missing app code). Daily Check shows the vehicle's own checklist, with no "Using the standard checklist". Today says "Saved copy from …".
6. Airplane mode off. **Pass:** within 10 s every "You're offline" page reloads into its screen by itself.
7. Optional, weak signal: in the laptop window, Network ▸ the throttling list ▸ Add… ▸ a profile with 100% packet loss; select it and repeat step 5. **Pass** as in step 5.
8. Note only: after more than an hour offline, does the Crew Map's base map still draw? Write yes or no.
**Record** in the A6 row "Deploy then offline (B5-15)": pass or fail for steps 3, 3b, 5 and 6, with the date. If step 3b fails but 5 passes, tell the session: §7's Tell operators gets "After an update, open the app once with signal before you go out."

**Tell operators.**
- After O2: "If the app says it can't reach the server, keep working; it sends when the server is back."
- After O3: "On a shared phone, sign out before you hand it over. Your saved work waits for you, and nobody else sees it."

---

## 7 · Merge and close (each PR, on the owner's go)

> **What you do at each merge:** say "go" in chat and do the §6 rows marked (owner). For O6, do phone-test step 1 first and tell the session "step 1 done". The session reads Active Deployments, merges, watches the deploy, runs its own smoke and writes the docs.

1. Your explicit go in chat; CI green.
2. Merge inside the D48 window, as `DECISIONS.md` D48 states it on the PR's base (with its 2026-10-26 pace amendment), or when the admin dashboard shows 0 Active Deployments. Read the count and the time just before merging, and state both.
   - If another PR merged in this window: confirm it touched a different area and has deployed and passed its smoke. If not, stop and ask.
   - **O6:** only after you say phone-test step 1 is done, and nothing else merges that evening.
3. Watch `deploy.yml` through env-drift; `/api/health` 200; record the revision.
4. **The session's own smoke:** `/api/health` 200 (from O2 also `HEAD /api/health` 200); the new revision serving; and, in your signed-in admin tab with the tab visible, the dashboard's Active Deployments count. **The session never types a PIN or password and never signs in as anyone.** Every §6 acceptance row needs a sign-in, so all are yours: the session lists them as owed in its report.
5. One docs-only commit, merged by the session on green. **Named files only:** `CHANGELOG.md`, `STATUS.md`, `DECISIONS.md`, `AHITS_A6_DEVICE_CHECKLIST.md`, and at O1 also `00_START_HERE.md`.
   - **`DECISIONS.md`:** the PR's decision below. It gets its number at the moment it is written, in this order: the Eastern-time decision first, then Security's three, then O's, then Data's (OX-9).
     1. Check that the decisions before it are there. Each of these must print 1 or more: `grep -c "The business day is Eastern" DECISIONS.md` (the Eastern-time decision), then `grep -c "Sign-ins are recorded, the lockout is exact" DECISIONS.md`, `grep -c "one Owner guards the admin accounts" DECISIONS.md` and `grep -c "Operators and outside links see and change only" DECISIONS.md` (Security's three). From O2 on, grep the earlier O decisions' titles (below) too. **If one prints 0, stop and tell the owner:** that docs commit lands first. Numbered now, the O decision would take the number it needs.
     2. Read `DECISIONS.md` and give the decision the number after the highest one there. With every earlier decision in, there is no gap.
     House format: Date, Owner Max, Status **ACTIVE** with the PR, squash and revision, Read-with, Decision, Revisit triggers, Rationale. Write the number into the CHANGELOG and STATUS lines in place of D-On, and state the mapping (`D-On = Dnn`) in the STATUS bullet.
   - **`CHANGELOG.md`:** one line, `date · #PR · outcome · revision`.
   - **`STATUS.md`:** one RESUME BOX bullet (PR, squash, revision, Active Deployments and time, smoke result, the §6 rows owed), the `_Last updated_` line, the §2 merged list, and the step-7 anchor for the PR.
   - **`AHITS_A6_DEVICE_CHECKLIST.md`:** the PR's rows after the last row on the base (33 onward if S1 took 31–32), columns as row 13. Add the number of new rows to the count on `:5` ("N rows × 5 targets").

   No handoff file unless the session ends mid-work.

| PR | CHANGELOG line (outcome) | STATUS step-7 anchor | Decision | A6 rows |
|---|---|---|---|---|
| O1 | A saved action applies once; late checks keep their date for 7 days | `recordCommitted` (`src/lib/idempotency.ts`) | **D-O1** + the D26 lines | — |
| O2 | Every count on the phone agrees; about an hour of retries; outages and PIN resets keep work; at most 20 reports an hour | `recountQueue` (`src/lib/offline-queue-db.ts`) | **D-O2** | 1 (next free) |
| O3 | Shared phones keep people apart | `QUEUED_FOR_OTHER_USER_CODE` (`src/proxy.ts`) | **D-O3** | 1 |
| O4 | Screens say "saved on this phone"; saved copies say how old they are | `useTodayChecks` (`src/components/operator/today/`) | **D-O4** | 3 |
| O5 | Photos stay until their action is safe | `uploadPhotoRefs` (`src/lib/photoStore.ts`) | — | — |
| O6 | A new version clears only the old version's pages; lists saved offline; online actions time out | `pruneOldBuildDocuments` (`src/lib/sw-cache-hygiene.ts`) | D31 qualifier | 1 |

**At O1, also:** commit this packet on the O1 branch (if it is already tracked, skip that), and add the `00_START_HERE.md` row `build P1-2 O1–O6 → AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md` in the post-merge docs commit.

**At O2, also (STATUS):** add to the RESUME BOX bullet: "A PIN reset parks saved work; it sends once the new PIN is set (P1-2 O2). The do-now note 'tap Retry after a Reset PIN' is retired." That note lives in the Security packet's §6 and your notes, not in STATUS today; if STATUS carries it by then, delete that line.

**Decisions** (house format; Owner Max; ACTIVE with the PR). The Decision lines are in plain words; the How line is for the code.
- **D-O1 · A saved action applies once; late checks keep their date for 7 days.**
  - Decision: a saved action applies once. The server remembers it 10 days, longer than the phone keeps it. If the server can't check that memory, it refuses the write and the phone tries again later; it never applies one unchecked. A saved answer goes back only to the person who sent it. A late daily check keeps its real date up to 7 days back (Eastern business days); older ones are refused with a clear message, never moved to today. A write to an ended deployment says "This deployment has already ended."; someone no longer on the crew is told "You're not on this deployment any more."
  - How: `IDEMPOTENCY_KEEP_DAYS` 10, `QUEUE_MAX_AGE_DAYS` 7 (`src/lib/offline-limits.ts`); a NULL claim older than 10 min is taken over; any key-store error, or no session with the database down, → 503 before the handler runs; no session otherwise → 401 from the wrapper; each queued deployment write records its answer in its own transaction (`recordCommitted`); replies are bound to the user (hub portal: the link's path).
  - Amends: **D26** (window 3 → 7 days; older refused). On D26's Date/Owner/Status line append ` · **Superseded-by: D<n>** (in part: the past window, 2026-10-26)`; keep ACTIVE and Shipped. Under D26 append: `- **Amended by D<n> (2026-10-26, owner, P1-2 O1):** the past window is 7 days (PAST_WINDOW_DAYS = QUEUE_MAX_AGE_DAYS, src/lib/offline-limits.ts), counted in business days (APP_TIMEZONE). Older checks are refused with 409, never re-dated. A future date is still clamped to today (FND-7).`
  - Revisit triggers: a phone that must hold work longer than 7 days.
  - Rationale: B5-5, B4-10, DM-6, B4-1, B3-11, B5-19, B5 §3, BO-1.
- **D-O2 · The phone keeps saved work through server trouble and PIN resets.**
  - Decision: every count on the phone agrees. A saved action that hits server errors keeps trying for about an hour (8 tries: 30 s, 1, 2, 4, 8, 16, 30 min), then shows Failed with Retry. A saved action older than 7 days isn't sent (a warning at 6 days; then "too old", Discard only), including ones already on phones when O2 went live. A database outage never signs anyone out: the app keeps them on their screen under "Can't reach the server right now", keeps saves on the phone, and sends them within about 30 s of the server coming back. After an admin's Reset PIN, saved actions wait and send once the new PIN is set. A slow photo holds back only its own deployment's actions. At most 20 writes that email a hub or raise an admin alert per operator per clock hour; the 21st is told "Too many reports in the last hour — try again later." and a saved one waits.
  - How: one queue store (`src/lib/offline-queue-db.ts`, IndexedDB unchanged: `ahits_offline` v1); `/api/auth/me` and login answer 503 during an outage and only `HEAD /api/health` clears the banner; `limitNotifyingWrite` (`src/lib/rate-limit.ts`).
  - Revisit triggers: crews that work offline for more than a week; a crew that needs more than 20 reports an hour.
  - Rationale: UI-1, B5-14, B5-5, B5-8, B5-7, N2, B5-11, B3-17 (moved from the Security packet, BS-5).
- **D-O3 · A shared phone keeps people apart.**
  - Decision: each saved action carries who saved it and is sent only as that person; the phone holds it back and the server refuses it otherwise. The next person never sees or sends it; their Outbox says only "2 saved actions belong to someone else". If that person never comes back, the actions stay hidden on that phone and are never sent as anyone else. Actions saved before this change belong to whoever was signed in when it first opened on that phone. Sign-out needs a connection. With unsent work, sign-out warns with the count, then signs out; the work sends when that person next signs in on that phone. Sign-out, a dead session and a different person signing in clear the saved data on the phone (waiting photos stay); the saved screens stay, so the next shift can still start offline.
  - Revisit triggers: phones assigned to one person each; a phone that fills up with someone else's hidden actions.
  - Rationale: B3-7, UI-8, OP-17, B5-9, BO-3; round 6.
- **D-O4 · "Saved on this phone" is shown, and saved copies say how old they are.**
  - Decision: an offline End or Return says it's saved and can't be done twice. A saved End that finds equipment it never listed is refused by name, and the deployment stays open. On an offline morning Today shows "Start daily check" with "Last synced … — today's checks aren't known yet."; checks saved on this phone today count as done; a second check of a truck a crewmate already checked is refused by name at sync (D47). "Today" turns over at midnight Eastern, even with the app left open. Screens served from a saved copy say "Saved copy from …". The Outbox says when each action was saved and offers only Discard when Retry can't help.
  - Revisit triggers: a crew that ends deployments offline more than once a week.
  - Rationale: B5-4, B5-13, B5-2, B1-2 (part), B5-3, B1-6, B1-13, B1-4, BO-6.
- **D31 qualifier (O6):** `From P1-2 O6, a new version of the app deletes the previous version's saved pages when it takes over, keeps everything else, and saves the operator tabs again. The update prompt is unchanged.`

**A6 rows** (`| N | **Title (P1-2 On)** — … | ☐ | ☐ | ☐ | ☐ | ☐ |`, numbered from the next free row):
- O2: **Offline save counts at once** — airplane mode on, save a daily check → the header badge and the banner count it at once.
- O3: **Shared phone** — A saves offline, signs out online (warned with the count) → B sees none of it and sends none of it, only "1 saved action belongs to someone else", and B's app reopens offline → A signs in again → it sends. Offline Sign out is refused.
- O4: **Offline End** — "saved on this phone"; End again → "Already saved".
- O4: **Offline morning** — with the app left open overnight, Today says today's checks aren't known yet, with "Last synced …".
- O4: **Saved copies** — airplane mode on → Today, Requests and Crew Map say "Saved copy from …".
- O6: **Deploy then offline (B5-15)** — §6 phone test steps 3, 3b, 5 and 6.

No reverts without the owner's go.

**Parked (not in O):**
- **My Deployment, after the D21 split:** per-row "Pending" chips; "Ending — waiting to send" on the card; blocking a second Log usage, Add items or Add vehicles while one waits (B1-2 rest, B5-4 rest); its endless spinner (B1-13); "Last known status" in its builders and NewDeploymentDialog (B1-6 rest); the outage wording on its screens (BO-21).
- `reason: 'server'` wording on NewDeploymentDialog, ReportProblemDialog, Requests and Scan: they still say "No network…" during an outage (BO-21). Copy only.
- UI-14 (`extractError` → `apiErrorMessage`): waits for a copy review.
- UI-10, UI-23, the storage notice shown to admins, and the offline page's operator buttons shown to admins: polish.
- "A new version is available" right after a cold open (B5-15, second point; D31): revisit after the O6 phone test.
- Crew Map base map after an hour offline: phone-test step 8 notes it.
- API-27 (online-only actions send no Idempotency-Key): O6 bounds the wait and says "it may have gone through"; Add rental keeps no time limit for that reason (BO-7).
- Day 13 of the 14-day sign-in cap, "sign in again before tomorrow's shift" (B5-8): in no map; its own small PR if crews hit the cap.
- Sign-out ends this phone's cookie only; a copied token lasts until it expires. Change PIN ends every copy (accounts §9; Security §6 "Owner to know").
- Someone who never comes back to a shared phone: their hidden actions and the photos they name stay on that phone (round 6: leave them). Sign-out doesn't sweep photos (B5-16).
- Recording the answer inside the daily-check, report, field-fix and request transactions (BO-22): rare, and those transactions are Data D1's and D2's hunks.

---

## 8 · Paste prompts

Build O1:
```
Build P1-2 O1 in AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md (repo root, rev 3), exactly as written: the override line under the banner, §0, the O1 section, §4, §5, §7 and the O1 rows of §9. Read AGENTS.md first and follow CLAUDE.md except where the packet overrides it. First confirm in STATUS §2 that the Eastern-time PR and every Security PR (S1, S2, S3 and S4) are merged to development, and that DECISIONS.md holds the Eastern-time decision and Security's three (§7.5 step 1); if not, stop and tell me. The packet file is untracked in the repo root: commit it on this branch (skip that if it is already tracked). Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-o1-saved-action-once from current development. Re-grep every anchor; if a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only, never git add -A. Run the §5 gate and state both suites' base and new counts and the my-deployment wc -l. Open the PR to development titled "P1-2 O1 · A saved action applies once" and give me the number when CI is green. Do not merge it. No reverts without my go.
```
Build O2 (after O1 merges):
```
Build P1-2 O2 in AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md (repo root, rev 3), exactly as written: the override line under the banner, §0, the O2 section, §4, §5, §7 and the O2 rows of §9. Read AGENTS.md and node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md and route.md first; follow CLAUDE.md except where the packet overrides it. First confirm O1 is merged to development and /api/health shows its revision; if not, stop and tell me. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-o2-one-queue from current development. Re-grep every anchor (S1 and S2 moved proxy.ts, session.ts and the login route; S2 added the admin Account page; S3 changed the two report routes; S3's read guard should already mock checkSession, 2.7). Keep DB_NAME, STORE, DB_VERSION and the upgrade body byte for byte (2.10). If a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only, never git add -A. Run the §5 gate and state both suites' counts and the my-deployment wc -l. Open the PR to development titled "P1-2 O2 · One queue, fair retries, stays on screen" and give me the number when CI is green. Do not merge it. No reverts without my go.
```
Build O3 (after O2 merges):
```
Build P1-2 O3 in AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md (repo root, rev 3), exactly as written: the override line under the banner, §0, the O3 section, §4, §5, §7 and the O3 rows of §9. Read AGENTS.md and node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md first; follow CLAUDE.md except where the packet overrides it. First confirm O2 is merged to development and /api/health shows its revision; if not, stop and tell me. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-o3-shared-phones from current development. Re-grep every anchor (S1 and S2 moved proxy.ts, the login route and AdminNav). Clear only the caches 3.6 lists. Do not touch src/app/sw.ts. Five exact login-reply checks change, four of them Security's (O3 Tests, Breaks). If a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only, never git add -A. Run the §5 gate and state both suites' counts and the my-deployment wc -l. Open the PR to development titled "P1-2 O3 · Shared phones keep people apart" and give me the number when CI is green. Do not merge it. No reverts without my go.
```
Build O4 (after O3 merges):
```
Build P1-2 O4 in AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md (repo root, rev 3), exactly as written: the override line under the banner, §0, the O4 section, §4, §5, §7 and the O4 rows of §9. Read AGENTS.md first; follow CLAUDE.md except where the packet overrides it. First confirm O3 is merged to development and /api/health shows its revision; if not, stop and tell me. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-o4-saved-on-phone from current development. Re-grep every anchor (the Eastern-time PR moved VehicleChecks.tsx, the Today page and business-date.ts; keep its lines). Every day comes from businessDate(); write no time-zone name. Do not touch src/app/(operator)/operator/my-deployment/page.tsx (D21). If a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only, never git add -A. Run the §5 gate and state both suites' counts and the my-deployment wc -l. Open the PR to development titled "P1-2 O4 · Saved on this phone" and give me the number when CI is green. Do not merge it. No reverts without my go.
```
Build O5 (after O4 merges):
```
Build P1-2 O5 in AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md (repo root, rev 3), exactly as written: the override line under the banner, §0, the O5 section, §4, §5, §7 and the O5 rows of §9. Read AGENTS.md first; follow CLAUDE.md except where the packet overrides it. First confirm O4 is merged to development and /api/health shows its revision; if not, stop and tell me. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-o5-photos-stay from current development. Re-grep every anchor (O2 and O3 moved useOfflineQueue.ts). If a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only, never git add -A. Run the §5 gate and state both suites' counts and the my-deployment wc -l. Open the PR to development titled "P1-2 O5 · Photos stay until the action is safe" and give me the number when CI is green. Do not merge it. No reverts without my go.
```
Build O6 (after O5 merges):
```
Build P1-2 O6 in AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md (repo root, rev 3), exactly as written: the override line under the banner, §0, the O6 section, §4, §5, §7 and the O6 rows of §9. Read AGENTS.md first; follow CLAUDE.md except where the packet overrides it. First confirm O5 is merged to development and /api/health shows its revision; if not, stop and tell me. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2-o6-service-worker from current development. my-deployment/page.tsx must end at its base line count (0 net); leave the two rental fetch calls as they are. At activation, sw.ts deletes only old-build HTML through src/lib/sw-cache-hygiene.ts; no caches.delete in sw.ts. If a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only, never git add -A. Run the §5 gate, including the sw.js check after npm run build, and state both suites' counts and the my-deployment wc -l. Open the PR to development titled "P1-2 O6 · Service worker, lists, offline page, timeouts" and give me the number when CI is green. Say in the PR body that it ships a new service worker and merges alone. Do not merge it. No reverts without my go.
```
Merge (any O PR, after my go):
```
Go on PR #<n>. Follow §7 of AHITS_PACKET_P1-2O_OFFLINE_2026-10-26.md: merge only inside the D48 window as DECISIONS.md states it on the PR's base (with its 2026-10-26 pace amendment), or with 0 Active Deployments, and state the Active Deployments count and the time read. If another PR merged in this window, confirm it touched a different area and has deployed and passed its smoke; if not, stop and ask me. For O6: wait until I say §6 phone-test step 1 is done, then merge, and merge nothing else that evening. Watch the deploy through env-drift and /api/health. Your own smoke is §7 step 4: /api/health 200 (from O2 also HEAD /api/health 200), the new revision serving, and the Active Deployments count in my signed-in admin tab with the tab visible. Never type a PIN or password and never sign in as anyone: every §6 acceptance row is mine, so list them as owed. Clean up any test data through the app's screens. Then the one docs-only commit (§7.5, named files only: CHANGELOG.md, STATUS.md, DECISIONS.md, AHITS_A6_DEVICE_CHECKLIST.md, and at O1 00_START_HERE.md), check DECISIONS.md as §7.5 says (stop if the Eastern-time or Security decisions are missing), give the decision the number after the highest one there, and merge that commit on green. No reverts without my go. Report back.
```

---

## 9 · Findings ledger: corrected, moved, rejected (everything else in the maps and the reviews is applied)

Each PR's Interpretations for its PR body are its rows here (the PR column). `rev-O/REV2_CHANGES.md` maps every review ID to its step.

### 9.1 · From the maps (rev 1, updated where rev 2 changed the outcome)

| # | PR | Finding | Verdict | Why |
|---|---|---|---|---|
| 1 | O1 | MAP_offline B5-4: "a second End → 409" | **Corrected** | True only for admins. `end/route.ts:93-96` checks the crew before "ended", and End closes the crew's assignments, so a crewmate's saved End after the deployment ended gets 403 "Forbidden". O1 1.9 checks "ended" first. |
| 2 | O1 | OFF-1's `notWritable` helper vs I4b's reshaped `getAuthorizedActiveRig` | **I4b chosen** | The plan takes B5 §3 from I4b. One function, four callers, no extra query, and it also names the 403 ("You're not on this deployment any more."), which fixes OFF §6's parked "reassigned-away operator gets 404". P1-1a's hook mock still wraps it. |
| 3 | O1 | OFF-1 (DM-6): keep a pass-through for a missing table (42P01) | **Rejected** | `recordCommitted` runs inside the write's transaction and can't skip a missing table, and the table exists since `20260617130000_wave1_idempotency`. One rule: any key-store error → 503. |
| 4 | O1 | OFF-1: `claimKey` throws → the route answers 500 | **Changed** | An unhandled throw gives Next's HTML 500. O1 catches it and answers JSON 503 `SERVER_UNAVAILABLE`, which O2's queue and banner understand. |
| 5 | O1 | E4 (B3-11): `owner = session?.userId ?? public:<path>` | **Corrected (rev 2: BO-1)** | On a signed-in route with a revoked or lapsed session, the replay of the person's own committed write would read as a different request and fail 422, final. Rev 1 then ran the handler alone, which let a database blip apply a replay twice (BO-1). Rev 2: the hub portal binds to its path; elsewhere, no session → the wrapper answers 401 (503 with the database down) and the handler never runs. |
| 6 | O1 | OFF-1 takeover + I1's five record sites | **Extended** | A takeover re-runs a write that committed but never recorded. O1 also records in End and the single return (a re-run of Log usage decrements twice). The other wrapped routes' re-run outcomes are listed (1.5) as an Interpretation (and BO-22, 9.2). |
| 7 | O2 | Accounts d: the outage probe is a GET to `/api/health` | **Changed to HEAD** | Serwist's default `apis` rule caches `/api/*` GETs and serves them offline (`index.worker.mjs:155-166`), so the probe could read "up" from a saved copy. No Serwist route matches HEAD. Next answers HEAD from GET by itself; the explicit export only makes it visible (BO-18). |
| 8 | O2 | Accounts d + OFF-2 backoff | **Added a wake** | With backoff, work that failed during an outage could wait up to 30 min after the database came back. `markServerUp` fires `ahits:server-back`; the next flush clears backoff under its lock and sends (rev 2: BO-14). |
| 9 | O2 | Accounts d: only 401s park during an outage | **Added 503** | After O1, a keyed write can get 503 `SERVER_UNAVAILABLE` (a blip after the session check). Flush marks the server down; `mutate` saves the work on the phone with `reason: 'server'`. |
| 10 | O2 | B5-7: park the PIN 403 | **Queue only** | The owner's words: "parks the item". An open screen's `mutate` keeps showing "You must set a new PIN before continuing." and keeps its input. Interpretation. |
| 11 | O2 | OFF-2's per-reader state + a "queue changed" event | **Replaced** | The plan's "one shared queue store": a pure module read through `useSyncExternalStore`. Counts, items, `sessionExpired` and storage flags are shared; no event loop. The hint is captured by the first recount on the page, so a light reader recounting first can't hide the tripwire. |
| 12 | O2 | OFF-2: the sync spinner during backoff | **Fixed** | The probe counted every waiting item as drainable, so a queue waiting out its backoff would flash "Syncing…" every 30 s (UXP-1g). It now skips items not yet due (unless "server back" was just set). |
| 13 | O3 | OFF-9 (`ownerId`/`ownerName`, a banner naming the owner) vs accounts c (`userId`, Outbox line, proxy header) | **Merged** | One design: field `ownerId`, the client check plus accounts c's proxy header. No names and no banner. The Outbox line is the owner's round-6 words: "2 saved actions belong to someone else". |
| 14 | O3 → O6 | Accounts c step 9: `sw.ts` excludes `/api/auth/me?live=1` | **Moved to O6** | Any `sw.ts` change ships a new service worker, which must merge alone. Until O6, O3's cache clears (sign-out, 401 bounce, person switch) already remove the saved `/api/auth/me` (it is in `ahits-field-reads`). |
| 15 | O3 | Accounts c: a private 8 s AbortController in logout | **Shared helper** | OFF-8's `fetchWithTimeout` is created in O3 (`utils.ts`) and reused by O6. |
| 16 | O3 | Accounts c step 8: clear caches only when a *different* stored person signs in | **Widened** | Also on the first sign-in after O3 (nothing stored yet), so a phone shared before O3 starts clean. Rev 2 clears only the data caches (BO-3). |
| 17 | — | Accounts d step 13 (D27 renewal) | **Moved** | To the Security packet (S1), per the plan. |
| 18 | O4 | OFF-4: per-line "Return saved on this phone" | **Reworded** | Log usage (a partial single-line DELETE) lands there too. Now "Already saved on this phone — it sends when you're back online." In End mode the line keeps its controls (BO-12). |
| 19 | O4 | OFF-5 step 2: optional label edits in `my-deployment/page.tsx` | **Rejected** | D21, and the Add items label would need names that aren't on those lines. |
| 20 | O6 | OFF-7 step 7.9: re-run the phone test on the Next 16.4.2 PR | **Dropped** | #272 (Next 16.4.3) merged before this packet. |
| 21 | O6 | OFF-8: the rental vehicle catch | **Reversed (rev 2: BO-7)** | Rev 1 cut the rental add off at 12 s. `POST /api/vehicles` has no Idempotency-Key, so a cut-off while the server still creates the vehicle invites a second vehicle on retry. Rev 2 leaves both rental calls and their catch alone. |
| 22 | — | §0-j: "the server refuses a second same-day check by name" | **Verified, no change** | `daily-check/route.ts:132-133` + `rig-daily-checks.ts:79-93`, under an advisory lock: `Already checked today by <name> at <time>`. Limit: it applies while the truck is on an active rig and the submitter on its open crew. If the rig ended or the person left the crew before the sync, a second check files; there is no shared crew to protect then. Retry stays offered for that 409 (it repeats the same words). |
| 23 | O4 | A saved Add items then a saved End on the same phone | **Known limit** | The End can't list lines that don't exist yet, so it is refused by name at sync ("Equipment was added after this End was saved…"). Safe; the operator ends again. |
| 24 | O4 | A line with a saved partial return, then a saved End | **Interpretation** | End shows the line with its controls and sends it (BO-12). At sync the return applies first; End's per-line claim skips a line the return closed, and otherwise returns the rest as the person chose. |
| 25 | — | MAP anchors | **Corrected** | End's no-hub 400 is `end/route.ts:427` (map: 426-427). The cc29 case is `:99-108` (map: 96-104). Rev 2: `idempotency.ts` has no comment above `releaseKey` (`:159`, CO-14); `canOpen` is `VehicleChecks.tsx:53`; Scan's `loadActive` starts at `:81`. |
| 26 | O1 | OFF-1 test (d): `$queryRaw` rejected for every call | **Narrowed** | `mockRejectedValueOnce`: `requireAuth` is mocked, so the first `$queryRaw` is the key read; the test then checks no row was written. |
| 27 | — | B5-1 (reconnect reload) | **Done elsewhere** | Hotfix #270. |
| 28 | O4 | B1-1 (pins freeze) | **Applied** | The same fix as B5-3 (O4 4.12). |
| 29 | O2 | UI-1 "one timer" | **Interpretation** | Each reader keeps its 30 s timer; backoff and the flush lock make extra ticks find nothing due. |
| 30 | O2 | UI-2 "one identity reader for all three" | **Partly** | Only the queue moves to `readIdentity()`; useAuth and the drafts keep theirs. |
| 31 | O4 | OP-23 "remove it" | **Changed** | The line stays and now counts daily checks only. |
| 32 | O6 | Q6 iPhone option | **Dropped** | The owner chose Android. |
| 33 | O2 | `reason: 'server'` handled only on the daily check and End/Return (BO-21) | **Interpretation** | NewDeploymentDialog, ReportProblemDialog, Requests, Scan and My Deployment (D21) still say "No network…" during an outage; the banner says the truth. Parked (§7). |
| 34 | O1 | The routes that don't record (BO-22) | **Interpretation** | A takeover re-runs them only after an instance died between commit and the stored answer. A late check then fails as "already exists" though it was filed; the others append a note or answer "no longer pending". Never a double stock move. |
| 35 | O4 | Clock times on business-day screens | **Interpretation** | "Last synced …" and "Saved copy from …" stay in the viewer's zone, like "Data as of" (Eastern-time packet question 3). Every day comparison uses `businessDate()`. |
| 36 | O3 | A phone used by an admin and an operator | **Accepted** | Shells stay at sign-out (BO-3), so offline the last role's `/admin/*` shell can show (title, edit buttons). Every write is still checked on the server. |

### 9.2 · From the reviews (rev 2): where this packet differs from the fix text

Every other review item is applied as written.

| Item | Verdict | Why |
|---|---|---|
| BO-1 "answer 401 in the wrapper" | **Applied, stronger** | Also answers 503 `SERVER_UNAVAILABLE` when the database can't be reached (one `SELECT 1` after the session lookup failed), so a real outage reads as server trouble and the phone backs off, not "sign in". The hub portal binds to its path before any session lookup. Ran: (f), (f2), (f3). |
| BO-2 "delete `ahits-app-pages` and `pages` at activation, re-fetch the operator documents" | **Changed** | Deleting those two caches would also delete the HTML the current launch fetched from the new build seconds before activation, and BO-2 itself showed the new worker installs after that page load. Rev 2 deletes only HTML that names a script this worker didn't precache (`ahits-app-pages`, `pages`, `others`), keeps redirects, non-HTML, RSC and this build's pages, then re-fetches the operator documents exactly as BO-2 wrote. Ran on a fake CacheStorage and on real build output. |
| BO-3 "clear `ahits-field-reads`, `apis`, `cross-origin`" | **Applied, extended** | Photo URLs (`/api/photos/….jpg`) match Serwist's image rule first, so people's photos live in `static-image-assets` for 30 days; it is cleared too, with `next-image`. |
| BO-10 / CO-10 (Stuck? Discard) | **BO-10's form** | Both drop the retries clause and keep the 24 h one. CO-10 also hides the button while an item waits for its next try; rev 2 doesn't, so a day-old item can always be discarded (that is the escape hatch's point), and backoff ends every chain within about an hour anyway. |
| BO-14 (clear backoff inside the lock) | **Applied, extended** | `clearBackoff` is also one readwrite cursor pass, so no stale read can bring an item back even from a non-flush writer. |
| BO-16 / CO-5 (re-post logout from the login page) | **Not taken** | Security S1 rev 2 adds a 2-minute `ahits_signed_out` marker at Sign out; the proxy drops a session cookie that arrives next to it (a late screen-load renewal), on `/api/auth/me?live=1` too. S §9.2 (BS-3) and §9.4 say O3 needs no second logout. A second logout would add a request and nothing else. |
| BO-18 (HEAD is automatic) | **Note fixed, export kept** | Harmless and explicit; the tests read the same either way. |
| BO-19 ("delete others' too-old items") | **Tag applied; deletion not offered** | Round 6: someone who never returns keeps their actions hidden on the phone, never sent as anyone else. The Sentry tag uses the item's owner. |
| BO-22 (record in four more transactions) | **Not taken** | Rare (an instance killed between commit and the stored answer, then a replay 10+ minutes later); the outcome is a named failure or an appended note, never a double apply; and the daily-check, report, field-fix and request transactions are Data D1's and D2's hunks. Interpretation (9.1 row 34) and Parked. |
| CO-1 (S4's limit merges after O2) | **Superseded** | Security rev 2 moved the limit into O2 (2.9), so S1–S4 all merge before O1 as the order says; the prompt checks it. |
| CO-3 (stamp once, behind an `ahits_owner_stamp_v1` flag) | **Changed** | No flag: the stamp runs whenever someone is known and an unowned action exists. After O3 every enqueue names an owner when anyone is known, so only pre-O3 actions are unowned, and a flag would leave a late-found one unowned for good. With nobody known they wait for the next sign-in (CO-3: "send as today"); nothing on the phone says who saved them. |
| CO-11, CO-26 (D48 wording) | **Applied as "the D48 window"** | No clock time anywhere: D48 as `DECISIONS.md` states it on the PR's base, with its amendment from docs PR #275. |
| CO-12 (A6 numbering) | **Applied** | "Next free row", and the O4 saved-copy row added (6 rows). |
| CO-13 (re-warm on `controllerchange`) | **Covered by BO-2** | Activation now keeps what this launch warmed and re-fetches the operator documents, so the page needn't re-warm. Phone-test step 3b checks it; if it fails, Tell operators gets one line. |
| CO-16 (`session.ts`: "none") | **Changed** | Security rev 2 now edits `setSessionCookie` and `clearSession` (the marker); §4 lists them. `shared-errors.ts`: none, as CO-16 says. |
| CO-17 (D-number order) | **Applied, wording follows the rule** | Placeholders; each takes the next free number when first written into `DECISIONS.md`. |
| CO-28 (S1's renewal) | **Applied** | §4 and O2 2.8 state what O relies on from S1 (BS-3, the marker). |

### 9.3 · Re-run on the scratch clone

`rev-O/tree`, branch `rev2` (on top of the reviewer's `probe` snapshot), Postgres 16 on port 5493 in UTC, Next 16.2.9 as installed there. The base is `3dbaea8` plus the Eastern-time PR's diff (`p12/et/eastern-time.diff`), the reviewer's build of O1–O4's queue and server parts, and rev 2's fixes. Nothing was pushed.
- **BO-1:** `tests/zz-rev2-o1-owner.test.ts` (5/5): a blip on the replay's session lookup → 401, the handler ran once, then the stored 200; with the database down too → 503 `SERVER_UNAVAILABLE`; no session → 401, no row; the portal binds to its path; the takeover SQL. The reviewer's `zz-probe-o1-blip` (which asserted the double apply) now fails as it should. `fnd6-public-link-gate`, `cc10-field-fix`, `p1-1a-end-claim` green.
- **B3-17:** `tests/p1-2-notify-limit.test.ts` (3/3): the 21st → 429 with `Retry-After`, its key freed, then 201 after the window rows are deleted; an admin unlimited; drafts don't count.
- **O2/O3:** `tests/offline/zz-rev2-o2-o3.test.tsx` (9/9): BO-4 (the real `OfflineBanner` shows "1 action(s) waiting to sync", not "Session expired", then the item sends on the credential event); the queue upgrade (u0); a 429's 30 s wait; server back under the lock; a photo 401 in an outage; BO-5 (a 200 from `/api/auth/me` doesn't clear "down" while HEAD says 503); the pre-O3 stamp; nobody known; the `ahits_last_user_id` fallback. The reviewer's `zz-probe-o2-pin-park` now fails as it should. `useOfflineQueue.test.tsx` (a) passes with 2.x's clock change.
- **BO-6:** `tests/components/zz-rev2-o4-today-midnight.test.tsx`: at 07:00 Eastern after a `visibilitychange`, yesterday evening's read no longer counts.
- **BO-2 / BO-3:** `tests/components/zz-rev2-o3-o6-caches.test.ts` (5/5) and, on real output of `npm run build` (green; `public/sw.js` carries the helper), `zz-rev2-o6-realbuild.test.ts`: this build's `_global-error.html` is kept, the same page from an older build (`scratchpad/build`, 2026-10-22) is flagged.
- **Full suites:** DB 88 files / 709 tests and UI 85 files / 654 tests, all green except the two rev-1 probes that assert the old bugs (1 skipped each: the real-build probe needs `OLD_BUILD_DIR`). `tsc --noEmit` 0. my-deployment 1454 lines, untouched.
- **Not built:** O3's sign-out button and login page, O4's screens, O5, and O6 beyond the cache helper. Build sessions follow the packet's tests for those.

### 9.4 · Rev 3: the practice build

`p12/stack/STACK_O.md` built O1–O6 on the Eastern-time PR and Security S1–S4 (base + #273 + #272; tree `p12/stack/tree`, tags `stack-O1` … `stack-O6`), with the gate on Postgres 16 in UTC. Where the builder's code was the better answer, rev 3 uses it. `p12/stack/FOLD_O.md` maps each ID to its step. Interpretations for the PR bodies stay in 9.1.

| ID | Sev | PR | Verdict | Where |
|---|---|---|---|---|
| OX-1 `cc34` asserts 3 arguments | Med | O1 | Applied: moved to "Existing tests that change", with the builder's line | 1.5, O1 Tests |
| OX-2 S3's read guard sweeps `/api/auth/me` | Med | O2 | Applied **in Security rev 4.1**: its mock has `checkSession` from S3 on. O2 points to it and keeps the line as a fallback. "No test mocks this route" dropped | 2.7, O2 Tests, §4, §5 After O2; Security S3 tests |
| OX-3 four Security login-reply checks | Med | O3 | Applied: added to Breaks, with the builder's lines | O3 Tests, §4, §8 Build O3; Security §0.1 |
| OX-4 someone else's old action never turns too old | Med | O3 | Applied: the builder's probe (past 7 days counts, whoever saved it) | 3.3, 3.11, (w4), §5 After O3 |
| OX-5 `hotfix-reconnect-reread`'s toast mock | Med | O4 | Applied: moved to "Existing tests that change", with the builder's mock | 4.3, O4 Tests |
| OX-6 test (h) passed on O1's code | Low | O2 | Applied: wait for both start-ups and check B is 0 first (the builder's wait) | O2 Tests (h) |
| OX-7 raw `'` in the Scan caption | Low | O4 | Applied: `it&apos;s` | 4.10, §5 After O4 |
| OX-8 "2 actions" vs "2 action(s)" | Low | O3 | Applied: 3.9's exact text | O3 Tests (sign-out) |
| OX-9 decision numbers | Low | all | Applied: placeholders kept. Each docs commit checks the Eastern-time and Security decisions are in `DECISIONS.md`, stops if not, then takes the number after the highest. (On the stack D-E1 was missing, so D53 was free and a literal session would have given it to D-O1; the builder's mapping was D-O1 = D57 … D-O4 = D60.) | Banner, §4 Order, §7.5, §8 Build O1 and Merge |
| OX-10 three early returns | Info | O1 | Applied | 1.5 |
| OX-11 stale comments | Info | O1, O5 | Applied: the two O1 comments in the builder's words; O5's named | 1.7, 1.8, 5.2 |
| OX-12 the `'failed'` dialog had no title | Info | O3 | Applied: "Couldn't sign out" | 3.9, O3 Tests |
| OX-13 the map mock hides pin colours | Info | O4 | Applied: the builder's mock | O4 Tests (`cc32`) |
| OX-14 a stored Blob comes back as a plain object | Info | O5 | Applied: "still stored" means `not.toBeNull()` | O5 Tests |
| OX-15 a moved line, a missing import | Info | O6 | Applied | 6.4, 6.7, §4 |
| OX-16 two DB flakes | Info | — | Applied: both in §5; S1's test fixed in Security rev 4.1 | §5; Security S1 tests |
| OX-17 the upgrade (2.10) | Info | O2 | **Noted, no change.** The old hook's items read fine under O2, cross-version run included | — |
| OX-18 one portal path left after S4 | Info | O1 | Applied: both prefixes kept, and why | 1.3, §4 |
| OX-19 the email limit, the offline-page revision | Info | O2, O6 | **Noted, no change.** The 21st report → 429, then 201 with the same key; admins and drafts unlimited; `OFFLINE_PAGE_REVISION` set to the PR's date | — |
| §3 cross-packet notes | — | all | Applied: lines after S4 in §4; D re-greps | §4 |

Also from the practice build: its counts per PR (banner), the lint count and `rm -rf .next` (§5), and one new grep each after O2, O3 and O4 (§5).
