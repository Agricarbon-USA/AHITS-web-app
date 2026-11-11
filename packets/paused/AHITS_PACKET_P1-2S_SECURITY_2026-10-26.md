# Packet P1-2 S · Security · S1–S4 · rev 4.1 · 2026-10-28

> **OPEN for the owner:** none. Round 8 (2026-10-27) confirmed §0-t: once a shop enters its invoice number, the link stops taking changes, and the owner corrects a wrong number in the repair's details.

> **REV 4.1 (2026-10-28), after the Offline practice build** (`p12/stack/STACK_O.md`: O1–O6 built on S1–S4). Changed only where an Offline finding belongs here:
> - **S1's "1 right and 19 wrong PINs" test now sets its own order (OX-16).** It failed about 1 run in 10: Postgres can reserve five wrong slots before the right PIN's, and the exact lockout then rightly refuses it. The test now holds each step until the one before it is done, in two cases. Each case fails if its rule is removed (S1 tests).
> - **S3's read guard also mocks `checkSession` (OX-2).** O2 adds that function and `/api/auth/me` reads it. With the line here from the start, O2 doesn't touch this test (S3 tests).
> - **§0.1** names the S1 and S2 login-reply checks that O3 changes (OX-3). §9.7 lists the three.

> **REV 4 (2026-10-28), after the practice build** (`p12/stack/STACK_ES.md`: the Eastern-time PR, then S1–S4, on base + #273 + #272; 0 High, 1 Medium, 10 Low, 9 Info). Every gate was green, and every named test, anchor and count matched. What changed:
> - **Sentry (Medium, SX-1):** Sentry sends a link's query without its `?` (`token=abc`), and the rev 3 pattern missed it. The pattern now also matches `token=` at the start of a string, with a test (1.11).
> - **Decision numbers (SX-2):** S1 starts only after the Eastern-time PR's docs commit (it writes D-E1) is merged. S1 then reads `DECISIONS.md` and takes the next free numbers (§7, §8).
> - **Build steps:** run the migration check with `bash` (SX-3). Delete files with `git rm` and leave them out of `git add` (SX-8). Delete `.next` before `tsc` (SX-11).
> - **Tests:** the read guard seeds in `beforeEach` (SX-6). S2's admin Change-PIN test sends the admin's real password, so it fails on the old code (SX-9). A dead shop link's GET records a `VIEWED` event (SX-10).
> - **Wording and anchors:** D-S2's migration name in the S2 docs commit (SX-4), which maintenance fields to hide (SX-5), guard gap (d) named (SX-7), and the Info items (SX-12…18). §9.6 lists every finding.

> **REV 3 (2026-10-27), after the owner's round 7.** What changed:
> - **A shop's link after the repair is closed (§0-t, S4 4.3 and 4.3b):** it takes only the invoice number. This holds while the repair has no invoice number, for 30 days from the close, whether an admin or an operator's field fix closed it. The shop sees one plain line and one button. The number only fills an empty Invoice #, before or after the close. S4 now edits the shop branch of `s/[token]/page.tsx`: D21(b) freezes only the reservation branch, which stays byte-identical.
> - **Field fix (round 7): any operator, any repair.** S3's field-fix reply still carries no cost. Its test now uses another crew's gear with a shop repair (3.6b). §0.1 and §9.4 now say D2's custody check is gone.
> - **Admin limits on Requests** are now your decision (§0-q, 4.2), not an interpretation. Rev 2 capped the quantity there but did not trim the text. 4.1 now trims it too.
> - **STATUS §4 pace sentence:** your own docs PR adds it. This packet only references it (§7).
> - **Found while re-running:** S3 3.1's `forRole` failed `tsc`, so it now uses a cast. Rev 2 said the Close repair dialog takes the invoice number. It doesn't: the repair's details do (4.3).
> - Every change and the re-runs: `rev-S/REV3_CHANGES.md`.

> **REV 2 (2026-10-26), after two reviews (`rev-S/BREAK_S.md`, `rev-S/COMPLETE_S.md`) and the owner's round 6.** What changed:
> - **Owner takeover (BS-1):** kept as decided. Other admins can reset the Owner even while email can't go out. Added: a bell message to the Owner on every such reset (S2 2.5), a 15-second "didn't go out" warning for the resetting admin, an SQL self-recovery path (§6 S2-3 and `PILOT_ROLLBACK.md` §4, S2 2.13b), and both accepted risks in §0.
> - **The email rate limit (B3-17) moved to the Offline packet's O2** (BS-5), so it can't start before O2's slower retries. S4 no longer has it (§9).
> - **Staying signed in (BS-3):** only opening a screen renews the sign-in, never a background request. Sign out leaves a 2-minute marker, so a screen that was still loading can't sign the phone back in (S1 1.9).
> - **Repair costs (BS-2):** the report-damage, report-problem and field-fix replies no longer carry them to operators (S3 3.6b).
> - **Hub portal text (BS-4):** over-long text is trimmed, never refused (S4 4.1).
> - Lockout race fix (BS-6), fuller Sentry scrub (BS-7), the guard test's data written out (CS-3), the rental-price test (CS-9), a substitute only on a consumable line (CS-21).
> - Decisions are placeholders (D-S1, D-S2, D-S3). The Supabase checks and the Data API switch are "do now, before S1". The session never types a PIN or password. Plain words in §0, §6 and §7. Every review item and its verdict: `rev-S/REV2_CHANGES.md`.

> STATUS: runnable packet, rev 4.1. Four PRs in order (S1 → S2 → S3 → S4), one Claude Code session each. **Practice-built as a whole** on 2026-10-28 (`p12/stack/STACK_ES.md`): the Eastern-time PR, then S1–S4, on base + #273 + #272, every gate green. Rev 4 folds in its findings (§9.6); rev 4.1 two test fixes from the Offline practice build on top (§9.7). Before that, the reviewers probed the server code on a scratch clone of `3dbaea8` (§9). **If a named test, anchor or count differs from the packet, stop and report before improvising.** · WROTE: rev 1, 2026-10-26, from `MAP_accounts.md` (a, b, e, and the D27 renewal from d), `MAP_exposure.md` (E1, E2, E3, E5, E6), `OWNER_DECISIONS_P1-2.md` and `PLAN_P1-2.md`. REVISED: rev 2, 2026-10-26, from both reviews, the owner's round 6 and the rules set since rev 1; rev 3, 2026-10-27, from the owner's round 7; rev 4, 2026-10-28, from the practice build; rev 4.1, the same day, from the Offline practice build. §9 lists what was corrected, moved or rejected. · READ-WITH: `CLAUDE.md`, `STATUS.md`, `DECISIONS.md` (D2, D3, D15, D16, D20, D21, D26, D27, D30, D44, D45, D48 with its 2026-10-26 merge-pace amendment, D50–D52, and D-E1, the Eastern-time decision), `AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md` (its override line, §5 and §7 house rules), `AHITS_HOTFIX_2026-10-22_VEHICLE-CHECKER-FIELDS.md` (H-a: never return a full user row), `AGENTS.md` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (S1 and S2 edit `src/proxy.ts`).
> WHY: P1-2's security half. Today:
> - Admins can't change or reset a password, and a role change leaves the person unable to sign in.
> - Change PIN leaves other phones signed in, and sign-ins aren't recorded.
> - The 5-try lockout can be raced, and Reset PIN doesn't unlock.
> - Phones ask for the PIN every morning.
> - Operators receive costs, insurance dates, colleagues' emails and colleagues' full checks.
> - The unused Supabase anon key is still mounted.
> - The hub portal takes any unit or quantity, and shop links outlive their repair.
>
> SLOT: after P1-1a–e and the Eastern-time PR, **including its post-merge docs commit** (it writes D-E1 into `DECISIONS.md`; §7). #273 and #272 are merged (live `ac1410a`). Order S → O → D (`PLAN_P1-2.md`).
> - ORDER, and why: S1 → S2 → S3 → S4. S2 builds on S1's `tokenVersion` bump, audit actions and proxy test helper. S3 and S4 don't depend on each other and may share a window.
> - Migrations: S1 none · **S2 one, additive** (`users.isOwner` + a partial unique index), so S2 merges alone · S3 none · S4 none.
> - Decisions: placeholders **D-S1** (S1), **D-S2** (S2) and **D-S3** (S3 and S4). The S1 PR writes all three into `DECISIONS.md` and gives each the next free number, after D-E1 (§7). Never commit a placeholder in `src` or `tests`.
> - Anchors: base `scratchpad/p12/base` @ `3dbaea8` (development + P1-1a–e dry run). Every auth file, the proxy, the report and field-fix routes, the portal libraries and both `/api/s/[token]` routes are byte-identical to live `ac1410a`. `src/app/s/[token]/page.tsx` differs only in P1-1's `formatDay` lines (`:4`, `:230`, reservation branch). P1-1 moved `cron/dispatch`, both inventory routes, `DailyCheckViewer.tsx`, the vehicles and inventory pages, `deployment-requests.ts`, `deployment-requests/[id]`, `admin-actions.ts`, `PILOT_ROLLBACK.md` and `schema.prisma`; the Eastern-time PR moves more. **Re-grep every anchor.**
> - D21: `src/app/(operator)/operator/my-deployment/page.tsx` is 1454 lines at `3dbaea8`. No S PR touches it. State `wc -l` in every PR body anyway.
> - Test baselines: at `3dbaea8` the node suite has 79 files and the UI suite 76. Re-count both suites (files and tests) on each PR's base and state them next to the new counts. Practice build (files / tests): DB 82 / 697 after the Eastern-time PR → S1 87 / 726 → S2 90 / 748 → S3 93 / 766 → S4 96 / 786; UI 78 / 636 → 81 / 644 → 83 / 654 → 85 / 661 → 86 / 664.
> - #272 moved Next to 16.4.3. Read the proxy doc above in the installed version before editing `src/proxy.ts`.

**The P1-1 override line applies.** No handoff file unless the session ends mid-work. Write one `CHANGELOG.md` line plus the STATUS lines in §7 instead. Stage named files only (each PR lists them), never `git add -A`. A deleted file: `git rm <path>` deletes and stages it in one step; never name it in `git add` (a deleted path makes the whole `git add` fail and stage nothing). After each commit, check `git show --stat HEAD` against the PR's list (SX-8). This packet file sits untracked in the repo root: commit it on the S1 branch, never on `development`.

---

## 0 · Owner decisions (final: apply them, don't re-ask)

| # | Decision | PR | Becomes |
|---|---|---|---|
| a | **Admins keep a password (8+ characters); operators keep a 6-digit PIN.** A credential always matches the role. | S2 | D-S2 |
| b | **Only the Owner (Max) may reset another admin's password.** A reset sets a temporary password, forces a change at next sign-in, signs out every device and is recorded in the account log. | S2 | D-S2 |
| c | **The Owner mark** is a yes/no mark on your account. The database allows only one person to have it. You set it once in Supabase (§6 S2-1, with its undo); the app never changes it. | S2 | D-S2 |
| d | **Owner recovery:** any other admin may reset your password (the only admin password they may reset). Each time, you get an email and a bell message in the app: "Your password was reset by <name> at <time>." On staging, emails don't go out yet (D15). The admin who did it sees whether your email went out, and is told to tell you if it didn't. | S2 | D-S2 |
| e | **Owner guard:** only you change your own role, status or details. Other admins may only reset your password, so they can't unlock you or sign you out everywhere either (a reset already does both). | S2 | D-S2 |
| f | **Any admin may promote or demote.** The save asks for a temporary credential of the new kind (a password for a new admin, a PIN for a new operator). The person must change it at next sign-in, and is signed out everywhere. | S2 | D-S2 |
| g | **Until the Owner mark is set:** a reset of another admin's password is refused with `Only the Owner can reset another admin's password, and no Owner is set yet.` Everything else works: operator Reset PIN, promote and demote, Change password, invites. Admin resets are never open to every admin. | S2 | D-S2 |
| h | **Overnight:** opening any screen more than 1 hour after the last renewal renews the 24-hour sign-in. Background refreshes don't renew it. The 24-hour idle limit and the 14-day cap stay. This replaces part of D27. | S1 | D-S1 + D27 line |
| i | **Change PIN and Change password sign out the person's other devices** (not the one used). | S1 (PIN), S2 (password) | D-S1 |
| j | **Sign-in attempts are recorded:** time, result, IP and device. They're kept 12 months, shown to admins only, and recorded for real accounts only. | S1 | D-S1 |
| k | **Lockout: 5 tries → 15 minutes, made exact.** A reset also clears the lock. The lockout message keeps "Contact your ops lead". | S1 | D-S1 |
| l | **Links:** invite links carry their code after "#", so it never reaches server logs. Hub and shop links look the same as today. No link code reaches our error tracker (Sentry). Another website can't make the app save anything. | S1 | D-S1 |
| m | **Vehicles:** operators see plate, VIN, rental company and agreement, but not insurance or registration dates and not costs (rental, repairs, invoices). Admins see everything. Operators can type the rental price on Add Rental but never see it again. | S3 | D-S3 |
| n | **Colleagues' daily checks:** operators get a short view (date, result, who, one-line issue summary). No GPS, no photos, no answers. Their own checks are unchanged. The Crew Map stays as it is (the colleague's last-check pin and day). | S3 | D-S3 |
| o | **Purchasing:** supplier and reorder link are hidden from operators, as unit cost already is. Repair costs, PO, invoice and the dashboard's spend panel are admin-only. The daily check's Site pre-fill stays. | S3 | D-S3 |
| p | **Supabase:** you do the read-only checks and turn the Data API off now, before S1 (§6 Do now). It needs no code: the app never uses the Data API. S3 then removes the unused public key from the app. Its stored copy stays until no older app version needs it (§6 E3-after). | §6 + S3 | D-S3 |
| q | **Hub portal:** a line is capped at the requested quantity, and takes only the units and substitutes its checklist offers. The same limits apply when an admin fills a line on Requests: text trimmed, quantity no more than requested (your decision, round 7). A request link stops when the request ends. View agreement downloads the PDF. | S4 | D-S3 |
| r | **At most 20 writes that email a hub or raise an admin alert, per operator per hour.** Moved to the Offline packet (O2): it must not start before O2's slower retries, or a phone gives up on the 21st report within minutes. | O2 | O2's decision |
| s | **Merge pace** (D48's 2026-10-26 amendment, already recorded): up to two merges per evening window, only when they touch different areas. Each deploys and passes its smoke before the next merges. A PR with a migration merges alone, so S2 merges alone. | §7 | — |
| t | **A shop's link after the repair is closed** (round 7; replaces "a shop link stops when its repair closes"). An admin, or an operator through a field fix, may close a repair. Either way, the shop's link then takes only the invoice number. The page says `This repair is closed. You can still add your invoice number.`, with a name box, an invoice box and one button. Every other action is gone. It stops once the repair has an invoice number, or 30 days after the close, and then it is dead as before. Those 30 days count even if the link's own end date comes sooner. The shop's number only fills an empty Invoice #: it never replaces one already there, before or after the close. A wrong one: you correct it in the repair's details. | S4 | D-S3 |

**Accepted risks (owner, round 6).**
1. **Demote, then promote back.** Any admin can demote another admin and promote them back with a password they chose. Both steps are in the account log, and the person is signed out each time. You accepted this.
2. **Taking over your account while email can't go out.** Until staging emails work (D15), another admin could reset your password, sign in as you, and from your account reset other admins, and no email would reach you. What tells you: the bell message the next time you sign in (it can be marked read but not removed), Team → Activity → Sign-ins, and the email once D15's gate is met. If you can't sign in, you take your account back yourself with §6 S2-3. You accepted this.

**Default applied, say if you object (round 7).** "Until an admin records it" is read as "until the repair has an invoice number", so the shop's own number ends it too. The shop's page can only send one number anyway. You correct a wrong one in the repair's details.

D26's 7-day amendment belongs to the Offline packet (O1), not here.

Field fix rules belong to the Data packet. Round 7: any operator may close any repair, whoever has the gear, including one with a shop. S only keeps the field-fix reply free of costs (S3 3.6b), and S4's shop link reacts to that close like any other.

Not here (Offline packet): signing out on a shared phone with unsent work, offline sign-out, and the "can't reach the server" banner. That is accounts map c and d: B3-7, UI-8, OP-17, B5-9 and C-05 (O3), and B5-7, B5-8 and N2 (O2). The email rate limit (B3-17) is O2's too.

### 0.1 · Shared files with the other packets

- **S edits none of these:** `src/hooks/useOfflineQueue.ts`, `src/hooks/useAuth.ts`, `src/components/operator/OfflineBanner.tsx`, `src/components/operator/OutboxDialog.tsx`, `src/app/sw.ts`, `src/app/(auth)/login/page.tsx`, `src/components/operator/OperatorNav.tsx`, and any sign-out button. No map step in S needs them. If one turns out to, stop and report it.
- **Offline (O) touches these too.** S lands first, and O rebases onto it:
  - `src/proxy.ts`: S1 adds the cross-site check at the top of `handleRequest`, the sign-out marker check where the token is read (`:142`) and the screen-load renewal rule (`:164`). S2 rewrites the `mustChangePin` funnel (`:171-184`; `:196-209` after S1). O2 adds `code: 'PIN_CHANGE_REQUIRED'` to that funnel's 403, and O3 adds the `X-Queued-For` check after `jwtVerify`.
  - `src/lib/auth/session.ts`: S1 changes `setSessionCookie` and `clearSession` (the sign-out marker). O2 changes `getSession` and adds `checkSession`. S3's read guard mocks `checkSession` from the start, so O2 leaves that test alone (OX-2).
  - `src/app/api/auth/login/route.ts`: S1 records sign-ins and S2 changes the admin password rule. O2 answers 503 in the catch, and O3 adds `userId` to the success JSON. Write S's login-reply checks as exact `toEqual`, as listed. O3 then adds `userId` to them, not here (OX-3): `tests/uxp3-login-lockout.test.ts:156`, and S's own `p1-2s1-pin-attempts` (the N1 login), `p1-2s2-admin-password` (two) and `p1-2s2-owner` (the SQL recovery login).
  - `src/app/(operator)/operator/change-pin/page.tsx`: S1 changes the toast. O2 dispatches `ahits:credential-changed` here **and** from S2's new `/admin/account` page.
  - `src/components/admin/AdminNav.tsx`: S2 adds Change password above Sign out. O3 swaps the Sign out button for its `SignOutButton`.
  - `src/app/api/cron/dispatch/route.ts`: S1 adds the sign-in purge right after step 2. O1 changes step 2's 48 h to 10 days.
  - `src/app/api/vehicles/[id]/report-damage/route.ts`, `src/app/api/inventory/units/[unitId]/report-problem/route.ts`: S3 passes the reply through `forRole` (3.6b). O2 adds the rate limit (moved from S4, §9).
- **Data (D) touches these too:**
  - `src/app/api/maintenance/field-fix/route.ts`: S3 changes only the reply (`:98`). D changes the rules. Round 7 dropped D2's custody check: any operator may close any repair. Keep the reply through `forRole`.
  - `src/lib/deployment-requests.ts`: S4 adds checks in `setLineFulfillment`. D3 wraps it in a locked transaction: keep S4's checks inside it.
- **S4 alone** edits `src/lib/status-links.ts`, both `/api/s/[token]` routes, `src/app/s/[token]/page.tsx` and `src/app/api/deployment-requests/[id]/lines/[lineId]/route.ts` (checked: no O, D or Eastern-time step names them).
- **The Eastern-time PR (lands first):** `PILOT_ROLLBACK.md` §1 and `:97` (S1 and S2 add their §1 paragraphs at the end of the per-PR paragraphs, after the Eastern-time one), `Makefile:201` (S3 edits `:202` only) and `README.md:43` (S3 deletes `:37` only). Its guard test refuses a time-zone name anywhere in `src` outside `business-date.ts` (no `America/…`, `CDT`, `EST` and so on, even in comments): S2's times use `timeZone: appTimezone()`.
- Exposure E4's B3-11 (idempotency replies bound to the user) is O1's. S3's narrower responses don't reach phones that still hold full bodies in `ahits-field-reads` (7 days) or `apis` (24 h). O3's sign-out cache purge clears those.

---

## S1 · Sign-in records, an exact lockout, staying signed in

**Goal.** §0 h, i (PIN), j, k, l. Closes B3-2, B3-6, N1, B3-13, B3-16 and accounts Q9 (D27 renewal). No migration: `account_audit_log.action` is a `String` (`prisma/schema.prisma:848`).

1.1 **Exact lockout** (`src/lib/auth/pin.ts:31-77`). Keep `MAX_ATTEMPTS`, `LOCK_DURATION_MS`, `PIN_LOCKED_ERROR`, `PinVerifyResult`, `hashPin`, `verifyPin` and the alert as they are.
```ts
export async function verifyPinDetailed(userId: string, pin: string): Promise<PinVerifyResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true, pinLockedAt: true, name: true, email: true } })
  if (!user?.pinHash) return { ok: false, reason: 'no-pin' }
  if (user.pinLockedAt) {
    if (Date.now() - user.pinLockedAt.getTime() < LOCK_DURATION_MS) return lockedResult(user.pinLockedAt)
    // Lapsed lock: clear it, only while it is still the same lock (a fresh one is never undone).
    await prisma.user.updateMany({ where: { id: userId, pinLockedAt: user.pinLockedAt }, data: { pinLockedAt: null, failedPinAttempts: 0 } })
  }
  // P1-2 S1 (B3-6, D-S1): take one of the MAX_ATTEMPTS slots in one conditional UPDATE, BEFORE the
  // bcrypt compare. However many requests arrive at once, at most 5 compares run between unlocks.
  const reserved = await prisma.user.updateMany({
    where: { id: userId, pinLockedAt: null, failedPinAttempts: { lt: MAX_ATTEMPTS } },
    data: { failedPinAttempts: { increment: 1 } },
  })
  if (reserved.count === 0) return lockNow(userId, user)
  if (await bcrypt.compare(pin, user.pinHash)) {
    // A right PIN inside the allowed tries clears the count and any lock a racing wrong try set.
    // No lastLoginAt here: the login route writes it, so Change PIN's check is not a sign-in.
    await prisma.user.updateMany({ where: { id: userId }, data: { failedPinAttempts: 0, pinLockedAt: null } })
    return { ok: true }
  }
  const now = await prisma.user.findUnique({ where: { id: userId }, select: { failedPinAttempts: true } })
  return (now?.failedPinAttempts ?? 0) >= MAX_ATTEMPTS ? lockNow(userId, user) : { ok: false, reason: 'wrong' }
}

const lockedResult = (at: Date): PinVerifyResult => ({ ok: false, reason: 'locked', lockedUntil: new Date(at.getTime() + LOCK_DURATION_MS) })

/** Set the lock once (pinLockedAt: null guard). Only the request that set it raises PIN_LOCKED. */
async function lockNow(userId: string, user: { name: string; email: string }): Promise<PinVerifyResult> {
  const at = new Date()
  // Only while the tries are still used up: a right PIN that cleared them is never re-locked by a late request.
  const set = await prisma.user.updateMany({ where: { id: userId, pinLockedAt: null, failedPinAttempts: { gte: MAX_ATTEMPTS } }, data: { pinLockedAt: at } })
  if (set.count === 1) {
    // PR-4 (P-6): awaited; a failure to raise never blocks the lockout.
    await createAlert('PIN_LOCKED', 'users', userId, { name: user.name, email: user.email }).catch(() => {})
    return lockedResult(at)
  }
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { pinLockedAt: true } })
  return row?.pinLockedAt ? lockedResult(row.pinLockedAt) : { ok: false, reason: 'wrong' }
}
```
- A reservation that wins but never finishes (the instance freezes) leaves the count at 5 with no lock. The next attempt gets `count 0`, so `lockNow` sets a lock (the count is still 5), and it lapses normally.
- The `gte` guard (BS-6): without it, a request that found no free slot could set the lock after a right PIN had cleared everything, leaving the person signed in but locked. With it, a right PIN that holds a slot ends signed in and unlocked, whether the wrong tries' lock comes before or after its clear (S1 tests, OX-16). If a racing wrong try locked the account for a moment first, its PIN_LOCKED alert clears itself on the next cron run (D45).
- Exact also means the right PIN can lose: if five wrong tries reserve their slots before it, it is refused as `locked` like any sixth try. Postgres may order parallel requests that way, so no test may assume the first request in a `Promise.all` reserves first (OX-16).

1.2 **Change PIN signs out other devices** (`src/app/api/auth/change-pin/route.ts:45-49`):
- Add `tokenVersion: { increment: 1 }` to the update's `data`, with the comment `P1-2 S1 (B3-2, D-S1): every other device's session ends; this one is re-minted below with the new version.` The re-mint at `:54-61` already reads `updated.tokenVersion`.
- After the update: `await writeAudit(session.userId, 'PIN_CHANGED', session.userId)`. Add `import { writeAudit } from '@/lib/audit'`: the route doesn't import it yet.
- `src/app/(operator)/operator/change-pin/page.tsx:47`: the toast reads `PIN updated. Any other device signed in as you is now signed out.`

1.3 **Audit actions** (`src/lib/audit.ts:5-19`):
- Add `'LOGIN_OK' | 'LOGIN_FAIL' | 'PIN_CHANGED'`.
- Export `SIGN_IN_ACTIONS = ['LOGIN_OK', 'LOGIN_FAIL'] as const` and `SIGN_IN_KEEP_DAYS = 365`.

1.4 **Record sign-ins** (`src/app/api/auth/login/route.ts`). Add `import { writeAudit } from '@/lib/audit'` (not imported yet). After `input` (`:35`):
```ts
    const ua = (req.headers.get('user-agent') ?? '').slice(0, 200)
    // P1-2 S1 (B3-2, D-S1): one row per attempt on a REAL account. actorId must be a user, so an
    // unknown email writes nothing. Best-effort: writeAudit never throws (audit.ts:31-42).
    const record = (u: { id: string }, action: 'LOGIN_OK' | 'LOGIN_FAIL', reason?: string) =>
      writeAudit(u.id, action, u.id, { ...(reason && { reason }), mode: input.mode, ip, ua })
```
- `:38-40`: split. `!user` → the generic 401, no row. `!user.isActive` → `await record(user, 'LOGIN_FAIL', 'inactive')`, then the same generic 401.
- `:45` and `:48` record `'wrong-tab'`; `:49` records `'no-pin'`; inside `if (!result.ok)` (`:56`) record `result.reason` (`wrong`, `locked` or `no-pin`). The responses are unchanged.
- Just before `createSession` (`:75`): `await record(user, 'LOGIN_OK')`.

1.5 **Read them** (`src/app/api/users/audit/route.ts:10-22`): `?kind=signin` adds `action: { in: [...SIGN_IN_ACTIONS] }`, and `?kind=account` adds `action: { notIn: [...SIGN_IN_ACTIONS] }`. With no `kind`, the route behaves as today.

1.6 **Team → Activity** (`src/app/(admin)/admin/users/page.tsx:346-394`, `ActivityDialog`):
- Two tabs, **Account changes** (`/api/users/audit?kind=account`) and **Sign-ins** (`/api/users/audit?kind=signin&limit=200`). Fetch on open and on tab change, and set state only inside the fetch callbacks. The callback stores the tab with its rows, so the spinner needs no `setLoading` in the effect (SX-13; as built):
  ```tsx
  const [tab, setTab] = React.useState<ActivityTab>('account') // type ActivityTab = 'account' | 'signin'
  // P1-2 S1 (D-S1): fetched on open and on tab change; state is set only in the fetch callbacks.
  const [result, setResult] = React.useState<{ tab: ActivityTab; rows: AuditRow[] } | null>(null)
  React.useEffect(() => {
    if (!open) return
    let live = true
    const url = tab === 'signin' ? '/api/users/audit?kind=signin&limit=200' : '/api/users/audit?kind=account'
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (live) setResult({ tab, rows: d.data ?? [] }) })
      .catch(() => { if (live) setResult({ tab, rows: [] }) })
    return () => { live = false }
  }, [open, tab])
  const loading = !result || result.tab !== tab
  const logs = loading ? [] : result.rows
  ```
- `AuditRow` gains `metadata?: { reason?: string; ip?: string; ua?: string } | null` (the route already selects it).
- A sign-in row reads `Signed in — <name>` or `Sign-in failed (<words>) — <name>`, with `<ip> · <device> · <time>` underneath. `<device>` is a short label from the user agent: `iPhone/iPad`, `Android`, `Mac`, `Windows`, `Linux` or `Other`, plus `Chrome`, `Safari`, `Firefox` or `Edge` when known. Admins see the short label; the full string stays in the row.

  | Reason | Words |
  |---|---|
  | wrong | wrong PIN or password |
  | locked | locked |
  | inactive | account suspended |
  | wrong-tab | wrong tab |
  | no-pin | no PIN set |
- Account rows keep `label()`, plus three fixed labels: `PIN_CHANGED` → `PIN changed`, `PASSWORD_CHANGED` → `Password changed`, `RESET_PASSWORD` → `Password reset` (S2 writes the last two).

1.7 **N1: Reset PIN also unlocks** (`src/app/api/users/[id]/route.ts:103-107`): the `pin` branch also sets `data.failedPinAttempts = 0; data.pinLockedAt = null`. That makes the comment at `:126-127` true.

1.8 **12-month retention** (`src/app/api/cron/dispatch/route.ts`, right after step 2 at `:109`):
```ts
  // 2b) P1-2 S1 (D-S1): sign-in records are kept 12 months, then deleted. Account changes are kept.
  let signInsPurged = 0
  try {
    signInsPurged = (await prisma.accountAuditLog.deleteMany({
      where: { action: { in: [...SIGN_IN_ACTIONS] }, createdAt: { lt: new Date(now.getTime() - SIGN_IN_KEEP_DAYS * 86_400_000) } },
    })).count
  } catch { /* transient: non-fatal, as step 2 */ }
```
Add `signInsPurged` to `run()`'s return (`:462`).

1.9 **Staying signed in (D27 renewal)** (`src/lib/auth/session-edge.ts`, `src/lib/auth/session.ts`, `src/proxy.ts`):
- After `MAX_SESSION_LIFETIME` (`session-edge.ts:18`): `export const RENEW_AFTER_SECONDS = 60 * 60 // D-S1 (amends D27): a screen load more than 1 h after the last renewal renews`.
- `:85`: `if (nowSec <= iat + RENEW_AFTER_SECONDS) return null // not renewed within the last hour`.
- Comments that go stale (SX-15):
  - The doc comment at `session-edge.ts:68-76`: "when the session is past half-life" → "on a screen load more than 1 hour after the last renewal (D-S1)", and "ride the current token until half-life" (`:72`) → "ride the current token until then".
  - The proxy comment at `src/proxy.ts:155-163`: "Past half-life" → "On a screen load more than 1 hour after the last renewal (D-S1)".
  - The proxy comment at `src/proxy.ts:217-221`: "Applied on the main pass-through (every page + API request)" → "Applied on the main pass-through (screen loads only: `renewable` above)".
- **Renew on screen loads only** (`src/proxy.ts:164`, BS-3). This replaces rev 1's `/api/auth/*` skip:
  ```ts
      // P1-2 S1 (BS-3, D-S1): renew on screen loads only (GET, not /api/). A background poll still in
      // flight when the person signs out or changes their PIN must never write the old token back.
      const renewable = request.method === 'GET' && !pathname.startsWith('/api/')
      const renewedToken = renewable ? await maybeRenewSessionToken(payload as Record<string, unknown>, Math.floor(Date.now() / 1000)) : null
  ```
  - Why: the bell and incoming polls (every 45 s) and the queue (every 30 s) are API requests. Renewing on them meant a poll sent just before Sign out could bring the session back when its reply landed (the last `Set-Cookie` wins), so on a shared phone the next person would be signed in as the last one. During Change PIN, a poll could write the old version back and sign out the phone that was used. Probe: a 61-minute-old token on `GET /api/notifications` was re-minted with its old `tokenVersion`.
  - This also covers `/api/auth/*`: change-pin re-mints with a bumped `tokenVersion` (1.2), and logout deletes the cookie.
  - Router prefetches still renew, and the proxy can't tell them apart: Next strips `next-router-prefetch` and `rsc` from the request the proxy sees (the proxy doc's "RSC requests and rewrites"; `next/dist/server/web/adapter.js`, the `FLIGHT_HEADERS` loop; the app doesn't set `skipProxyUrlNormalize`). `RoutePrefetcher` warms 12 screens on every reconnect. So the marker below closes Sign out for every kind of request.
- **Sign-out marker** (BS-3):
  - `src/lib/auth/session-edge.ts`, after `SESSION_COOKIE` (`:13`):
    ```ts
    // P1-2 S1 (BS-3, D-S1): set by Sign out for 2 minutes. A session cookie seen next to it is a late
    // renewal from a screen load sent before Sign out, so the proxy drops it.
    export const SIGNED_OUT_COOKIE = 'ahits_signed_out'
    export const SIGNED_OUT_SECONDS = 120
    ```
  - `src/lib/auth/session.ts`: `setSessionCookie` (`:130-134`) adds `cookieStore.delete(SIGNED_OUT_COOKIE) // a real sign-in ends the sign-out marker` after its `set`. `clearSession` (`:136-139`) adds `cookieStore.set(SIGNED_OUT_COOKIE, '1', { ...sessionCookieOptions(), maxAge: SIGNED_OUT_SECONDS })` after its `delete`. Import both names.
  - `src/proxy.ts`, right after `const token = request.cookies.get(SESSION_COOKIE)?.value` (`:142`):
    ```ts
      // P1-2 S1 (BS-3, D-S1): after Sign out, a session cookie next to the marker is a late renewal. Drop it.
      if (token && request.cookies.has(SIGNED_OUT_COOKIE)) {
        const out = pathname.startsWith('/api/')
          ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
          : NextResponse.redirect(new URL('/login', request.url))
        out.cookies.delete(SESSION_COOKIE)
        return out
      }
    ```
  - Only `clearSession` (logout) sets the marker, and only `setSessionCookie` (login, change-pin) clears it. So a session cookie next to it can only be a late write-back. Public paths (`/login`, `/api/auth/login`) are checked earlier and never see it.
  - Left open (accepted): a late screen-load renewal during Change PIN can still sign out the phone that was used; it asks for the new PIN once.
- Idle limit: a phone on which no screen is opened for 24 hours after its last renewal signs in again. A screen load renews once the last renewal is over an hour old, so that is 23–24 hours after the last screen was opened. Background refreshes don't count. The 14-day cap from `authAt` is unchanged.

1.10 **Cross-site writes refused** (`src/proxy.ts`, at the top of `handleRequest`, right after `const { pathname }` at `:122`, before `PUBLIC_PATHS` at `:127`, so it covers login, invite completion and the portal):
```ts
  // P1-2 S1 (B3-13, D-S1): an API write must come from this app's own pages. SameSite=Lax alone
  // still lets another site's form or fetch reach /api/auth/login and /api/s/*.
  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && isCrossSite(request)) {
    return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 })
  }
```
```ts
function isCrossSite(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site) return site !== 'same-origin' && site !== 'none'
  const origin = req.headers.get('origin')
  if (!origin) return false // Cloud Scheduler → /api/cron/dispatch, and old clients
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim()
  try { return new URL(origin).host !== host } catch { return true }
}
```
- Compare hosts, not whole origins: TLS ends at Google's front end, so the scheme the app sees can differ.
- Don't require `application/json`: `/api/uploads` takes multipart, and this check already stops the text/plain form trick.
- App fetches, the queue and service-worker fetches all send `same-origin`. There is no webhook route (checked: `src/app/api/*`). The reviewer's 10-case matrix passed (BS-15).

1.11 **Sentry scrub** (new `src/lib/sentry-scrub.ts`, structurally typed, so no Sentry type import) (BS-7):
- `scrubUrl(u)`: `/s/<x>` and `/api/s/<x>` → `/s/[token]` and `/api/s/[token]`; `token=<x>` at the start of a string, or after `?`, `&` or `#` → `token=[redacted]`. Sentry fills `request.query_string` with the search **without** its `?` (`token=abc`), so the pattern must also match at the start (SX-1: rev 3's `[?&#]` alone sent the raw invite token on `GET /api/users/invite/validate?token=…`). As built:
  ```ts
  const TOKEN_PATH = /(\/(?:api\/)?s\/)[^/?#\s"'\\]+/g
  // Also at the start of a string: Sentry's request.query_string is the search without its "?".
  const TOKEN_PARAM = /((?:^|[?&#])token=)[^&#\s"'\\]*/g

  /** `/s/<x>` → `/s/[token]`, `/api/s/<x>` → `/api/s/[token]`, `token=<x>` (first, or after ?, & or #) → `token=[redacted]`. */
  export function scrubUrl(u: string): string {
    return u.replace(TOKEN_PATH, '$1[token]').replace(TOKEN_PARAM, '$1[redacted]')
  }
  ```
- `scrubDeep(v, depth = 0)`: every string value, at depth ≤ 8 in objects and arrays, goes through `scrubUrl`; a `token` key with a string value becomes `[redacted]`.
- `scrubBreadcrumb(b)`: `message` through `scrubUrl`, and `data` through `scrubDeep`. That covers `data.url`, `data.from`, `data.to` and a console breadcrumb's `data.arguments` (`proxy.ts:116` logs `path=${pathname}`, which can be `/s/<token>`).
- `scrubEvent(e)`: first delete `request.headers['next-router-state-tree']` (any letter case; it carries the token as a bare route segment, so no URL rule finds it). Then `scrubDeep` over `request` (its `url`, `query_string`, `Referer` and `next-url` headers), `scrubUrl` over each `exception.values[].value`, `scrubDeep` over `extra`, `scrubUrl` over `transaction`, and `scrubBreadcrumb` over every breadcrumb.
- On the reviewer's real SDK shapes this leaks none of 6 test tokens and leaves `/api/status-links/x`, `/admin/users/x` and `/operator/scan` alone.
- Wire it in:
  - `src/components/shared/SentryProvider.tsx:33`: `Sentry.init({ dsn, tracesSampleRate: 0, beforeSend: scrubEvent, beforeBreadcrumb: scrubBreadcrumb })`.
  - `src/instrumentation.ts:15-18`: the same.
  - `src/instrumentation.ts:35`: `path: scrubUrl(request.path)`.

1.12 **Invite token after `#`:**
- `src/lib/invite-token.ts`: `export function setupUrlFor(rawToken: string): string { return \`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/setup-account#token=${encodeURIComponent(rawToken)}\` }`. Use it at `src/app/api/users/invite/route.ts:72`, `invite/[id]/route.ts:47` and `bulk/route.ts:52`. Delete the now-unused `appUrl` line in each: `invite/route.ts:71`, `invite/[id]/route.ts:46`, `bulk/route.ts:26` (each is read only by its `setupUrl` line; checked).
- `src/app/api/users/invite/validate/route.ts`: move the checks into `async function check(req, token)`. `GET` keeps reading `?token=`, for setup pages that are already open. A new `POST` reads `{ token }` from the body. Both share the 20 / 10 min / IP limiter.
- `src/app/setup-account/page.tsx:18-41`:
  - Read the token **once**, only while `tokenRef.current === null`: React Strict Mode runs the effect twice in development, and the second run must not read the hash that the first run cleared (BS-8). In that branch, read it from `window.location` (`new URLSearchParams(location.hash.slice(1)).get('token') ?? new URLSearchParams(location.search).get('token') ?? ''`, the second for links sent before S1) into the ref, then `window.history.replaceState(null, '', '/setup-account')`.
  - Validate with `POST /api/users/invite/validate` `{ token: tokenRef.current }`. A missing token goes through the same promise chain (`Promise.resolve({ error: 'No invite token found in this link.' })`), so state is set only in callbacks.
  - The effect's deps are `[]`. Drop `useSearchParams`: `replaceState` updates it (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:343-345`), which would rerun an effect keyed on it with an empty token.
  - `handleSubmit` (`:62`) sends `tokenRef.current`.

1.13 **`PILOT_ROLLBACK.md`**:
- Q4 (`:129-135` at `3dbaea8`): add `AND a."action" NOT IN ('LOGIN_OK', 'LOGIN_FAIL')`, and a scope line: `Sign-ins are in Team → Activity → Sign-ins.`
- Under §1, at the end of the per-PR paragraphs (after the Eastern-time PR's paragraph): `**P1-2 S1 (no migration).** Rolling back leaves sign-in rows in account_audit_log; the old revision ignores them, and it ignores the ahits_signed_out cookie. Phones renew at half-life again. Invite links created while S1 served carry #token=, which the old setup page can't read: regenerate them (Team → Pending invites → Regenerate link) after rolling back.`

**Not touched:** every file in §0.1's first list.

**Files (stage these only):** `src/lib/auth/pin.ts`, `src/lib/auth/session-edge.ts`, `src/lib/auth/session.ts`, `src/proxy.ts`, `src/lib/audit.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/change-pin/route.ts`, `src/app/(operator)/operator/change-pin/page.tsx`, `src/app/api/users/[id]/route.ts`, `src/app/api/users/audit/route.ts`, `src/app/(admin)/admin/users/page.tsx`, `src/app/api/cron/dispatch/route.ts`, `src/lib/sentry-scrub.ts`, `src/components/shared/SentryProvider.tsx`, `src/instrumentation.ts`, `src/lib/invite-token.ts`, `src/app/api/users/invite/route.ts`, `src/app/api/users/invite/[id]/route.ts`, `src/app/api/users/bulk/route.ts`, `src/app/api/users/invite/validate/route.ts`, `src/app/setup-account/page.tsx`, `PILOT_ROLLBACK.md`, the tests below (with `tests/helpers/proxy-request.ts`), and the docs in §7 "In the S1 PR". Size **M** (about +700 / −60 in `src`).

**Tests.** Label rows that also pass on the old code "regression guard" in the PR body.
- **Node** `tests/p1-2s1-pin-attempts.test.ts` (mock alerts as `tests/auth-pin-session.test.ts:10`):
  - 20 parallel wrong `verifyPinDetailed` calls run `bcrypt.compare` (`vi.spyOn(bcrypt, 'compare')`) at most 5 times. The account ends locked, and `createAlert` is called once.
  - 1 right and 19 wrong PINs, **in a set order** (BS-6, OX-16). Not a plain `Promise.all`: Postgres may reserve five wrong slots before the right PIN's, the lockout then rightly refuses it, and the test failed about 1 run in 10. Gates fix the order: the right PIN takes slot 1 and its compare waits; the wrong compares wait until all 20 tries have reserved; every lock attempt waits. Case "lock after": the lock attempts run after the right PIN's clear, and the `gte` guard refuses them (no alert). Case "lock first": one lock lands, then the right PIN, inside its slot, clears it (one alert). Both end `ok`, no lock, count 0, 5 compares. Remove the `gte` guard and "lock after" fails; stop the right PIN clearing the lock and "lock first" fails (checked on a private clone of `stack-S4`: 10 of 10 runs green, `tsc` and eslint clean). As checked:
    ```ts
    // OX-16: the order is set here, not left to Postgres (which may reserve five wrong slots before the
    // right PIN's, and then the exact lockout rightly refuses it). The right PIN takes slot 1 and its
    // compare waits; the wrong compares wait until all 20 tries have reserved; every lock attempt waits.
    // lockFirst false: the lock attempts run after the right PIN cleared the count (the gte guard refuses
    // them). lockFirst true: one locks first, and the right PIN, inside its slot, clears that lock.
    it.each([false, true])('1 right PIN in slot 1, 19 wrong at once (lock first: %s): the right one signs in; no lock, count 0 (BS-6)', async (lockFirst) => {
      const op = await operatorWithPin()
      const gate = () => { let open!: () => void; const wait = new Promise<void>((r) => { open = r }); return { wait, open } }
      const rightReserved = gate(), rightGo = gate(), allReserved = gate(), allLocking = gate(), lockGo = gate()
      const compare = bcrypt.compare.bind(bcrypt)
      const compares = vi.spyOn(bcrypt, 'compare').mockImplementation((async (pin: string, hash: string) => {
        if (pin === RIGHT) { rightReserved.open(); await rightGo.wait } else await allReserved.wait
        return compare(pin, hash)
      }) as never)
      const updateMany = prisma.user.updateMany.bind(prisma.user)
      let reservations = 0, lockTries = 0
      vi.spyOn(prisma.user, 'updateMany').mockImplementation((async (args: { data: { failedPinAttempts?: unknown; pinLockedAt?: unknown } }) => {
        if (args.data.pinLockedAt instanceof Date) { if (++lockTries === 19) allLocking.open(); await lockGo.wait }
        const out = await updateMany(args as never)
        if (typeof args.data.failedPinAttempts === 'object' && ++reservations === 20) allReserved.open()
        return out
      }) as never)

      const right = verifyPinDetailed(op.id, RIGHT)
      await rightReserved.wait
      const wrong = Promise.all(Array.from({ length: 19 }, () => verifyPinDetailed(op.id, WRONG)))
      await allLocking.wait // 4 wrong took slots 2–5 and failed, 15 found none: all 19 want to lock
      expect(await row(op.id)).toEqual({ failedPinAttempts: 5, pinLockedAt: null })
      if (lockFirst) { lockGo.open(); expect((await wrong).every((r) => !r.ok && r.reason === 'locked')).toBe(true) }
      rightGo.open()
      expect(await right).toEqual({ ok: true })
      lockGo.open()
      expect((await wrong).every((r) => !r.ok)).toBe(true)
      expect(compares).toHaveBeenCalledTimes(5)
      expect(await row(op.id)).toEqual({ failedPinAttempts: 0, pinLockedAt: null })
      expect(vi.mocked(createAlert).mock.calls.filter((c) => c[0] === 'PIN_LOCKED')).toHaveLength(lockFirst ? 1 : 0)
    })
    ```
    The file's helpers: `operatorWithPin()` (an operator whose `pinHash` is `hashPin(RIGHT)`), `row(id)` (its `failedPinAttempts` and `pinLockedAt`), `RIGHT = '246810'`, `WRONG = '000000'`, `bcrypt` from `bcryptjs`, alerts mocked, and `afterEach(() => { vi.restoreAllMocks() })`. It relies on 1.1's shapes: a reservation's `data.failedPinAttempts` is `{ increment: 1 }`, and only `lockNow` writes a `Date` to `pinLockedAt`.
  - With 4 tries used, the right PIN → ok, and the count and lock are cleared.
  - After an admin `PATCH { unlockPin: true }`, the right PIN works.
  - N1: lock an operator, then `PATCH { pin }` → `pinLockedAt` null and count 0, and login with the temporary PIN → 200 with `mustChangePin: true`.
- **Node** `tests/p1-2s1-sign-in-records.test.ts` (capture `cookies().set` in the `next/headers` mock):
  - Change PIN → `tokenVersion` +1. A token minted before → `getSession()` null; the newly set cookie is valid; one `PIN_CHANGED` row.
  - A good login writes one `LOGIN_OK` with `ip`, `ua` and `mode`. A wrong PIN writes `LOGIN_FAIL` `wrong`. An inactive account writes `inactive`, and the wrong tab writes `wrong-tab`. An unknown email writes no row.
  - Change PIN doesn't move `lastLoginAt`.
  - `?kind=signin` returns only sign-in rows, and `?kind=account` none of them.
  - The cron (harness `tests/pr4-signals-cron.test.ts:8-22`) deletes a 400-day-old `LOGIN_OK` and keeps a 400-day-old `RESET_PIN` and a 300-day-old `LOGIN_FAIL`.
  - `clearSession()` sets `ahits_signed_out` (httpOnly, path `/`, max-age 120) and deletes `ahits_session`; `setSessionCookie()` sets `ahits_session` and deletes the marker.
- **Node** `tests/p1-2s1-session-renewal.test.ts` (pure, jose): `maybeRenewSessionToken` returns null at 30 minutes and a token at 61 minutes, with the same `authAt` and claims. Past 14 days from `authAt` → null.
- **Node** `tests/p1-2s1-proxy.test.ts`, with a new helper `tests/helpers/proxy-request.ts`: `tokenFor(claims, { iatAgoSec, authAgoSec })` signs with jose and `PIN_SESSION_SECRET`, and `proxyRequest(path, { method, token, headers, cookies })` builds a `NextRequest` carrying the session cookie and any extra cookies. "Passes" means `x-middleware-next: 1`.
  - `POST /api/auth/login`: `sec-fetch-site: cross-site` → 403; `same-site` → 403; `same-origin` → passes.
  - No `sec-fetch-site`: `Origin: https://evil.example` → 403; `Origin: null` → 403; an Origin equal to the `host` header → passes. Set `host` explicitly: a `NextRequest` built from a URL has none.
  - A cross-site `GET` passes. `POST /api/cron/dispatch` with neither header passes.
  - A token issued 2 h ago: `GET /operator/dashboard` → the response sets `ahits_session`. `GET /api/notifications`, `GET /api/auth/me`, `POST /api/auth/change-pin` and `POST /api/daily-check` → no `ahits_session` from the proxy. A 30-minute-old token on `GET /operator/dashboard` → none (BS-3).
  - Sign-out marker: `ahits_session` plus `ahits_signed_out` → `GET /operator/dashboard` is a 307 to `/login` and `GET /api/notifications` a 401, and each response deletes `ahits_session`. The marker alone on `GET /login` passes.
- **UI** `tests/components/p1-2s1-activity-sign-ins.test.tsx`: Activity → Sign-ins requests `?kind=signin&limit=200` and renders `Sign-in failed (wrong PIN or password) — Sam K.` with the IP and `iPhone/iPad · Safari`.
- **UI** `tests/components/p1-2s1-sentry-scrub.test.ts` (pure): `scrubUrl`, `scrubEvent` and `scrubBreadcrumb` cases, including `/api/status-links/x` left alone and `#token=abc` redacted. Add (BS-7): a console breadcrumb whose `data.arguments[0]` holds `/s/abc`; a `next-url: /s/abc` request header; a `next-router-state-tree` header (gone after the scrub); an exception value with `/api/s/abc/transition`. Add (SX-1): the event's `request.query_string: 'token=abc'` (Sentry's shape, no `?`). None of them still contains `abc` (`expect(JSON.stringify(event)).not.toContain('abc')`).
- **UI** `tests/components/p1-2s1-setup-account-token.test.tsx` (mock `next/navigation`): a `#token=abc` link POSTs `{ token: 'abc' }` once and the hash is gone. Rendered inside `<React.StrictMode>`, it still validates `abc` and never shows "No invite token found". A legacy `?token=abc` link still works, and Submit sends `abc`.
- **Change** (name each in the PR):
  - `tests/copy-link-invite.test.ts:39` `tokenFromUrl` reads the hash: `new URLSearchParams(new URL(setupUrl).hash.slice(1)).get('token') ?? ''`.
  - `tests/copy-link-invite.test.ts:63` expects `/\/setup-account#token=/`. Add a POST-validate case beside `validateReq` (`:31`).
  - `tests/invite-email-mode.test.ts:54` expects `/setup-account#token=/`.
- **Must pass unchanged:** `tests/auth-pin-session.test.ts`, `tests/uxp3-login-lockout.test.ts`, `tests/auth-invite-rbac.test.ts`, `tests/cc31-alert-autoresolve.test.ts`, `tests/components/uxp6-users-form.test.tsx`, `tests/components/LoginPage.test.tsx`, `tests/components/useAuth-logout.test.tsx`, `tests/hotfix-no-full-user-rows-guard.test.ts`.

**Behaviour changes (PR body):**
- Change PIN signs the person out on their other devices. Unsent work there waits (401-parked) and sends after they sign in on that device.
- Every sign-in attempt on a real account is recorded. Change PIN no longer moves "Last login".
- The lockout is exact under parallel tries, and Reset PIN also unlocks.
- A phone renews its sign-in when a screen opens more than an hour after the last renewal: a phone used yesterday opens today without a PIN. Background requests never renew.
- Sign out leaves a 2-minute `ahits_signed_out` cookie; a session cookie that arrives late next to it is dropped.
- API writes from another website get 403.
- New invite links read `…/setup-account#token=…`. Links sent earlier still work.
- Sentry no longer receives hub, shop or invite tokens.

**Interpretations (PR body):**
- A right PIN inside the allowed tries also clears a lock that a racing wrong try set (1.1).
- "Any use" (§0-h) means opening any screen; background refreshes don't renew (BS-3).
- The device label is derived for display only.

**What people see.**
- **Admin:** Team → Activity has an Account changes tab and a Sign-ins tab. A Reset PIN on a locked operator works at once.
- **Operator:** the Change PIN toast says other devices are signed out. The other phone asks for the PIN on its next online screen. The lockout message is unchanged. In the morning the app opens without a PIN if it was used the day before.

**Acceptance (app screens).** State Active Deployments first. Every row needs a sign-in, so all are the owner's. The session may read Team → Activity → Sign-ins in your admin window after you have signed in.
1. (owner) Test operator on two browsers (A and B). On A, Change PIN → the new toast. On B, the next screen goes to Sign in.
2. (owner) Team → Activity → Sign-ins shows those sign-ins with your IP and device. Type a wrong PIN once → `Sign-in failed (wrong PIN or password)`. Then do §6 S1-1.
3. (owner) Lock the test operator (5 wrong PINs) → Reset PIN → they sign in with the temporary PIN straight away, with no Unlock.
4. (owner) Copy-link invite to a test email → the link has `#token=` → setup works → sign in.
5. (owner) Next morning: a phone used the afternoon before opens without a PIN.

Cross-site, Sentry, the sign-out marker and parallel lockout: node and UI tests only.

---

## S2 · Admin passwords and the Owner (one additive migration; merges alone)

**Goal.** §0 a–g and i (password). Closes B3-1. After S2, admins can rotate after #268, and #269 finishes (§6 S2-2).

2.1 **Migration and schema.** Name it `prisma/migrations/<YYYYMMDDHHMMSS>_p1_2s2_owner_mark/migration.sql`, using UTC (`date -u +%Y%m%d%H%M%S`) at build time, later than every migration on `development` (at `3dbaea8` the last is `20261026031339_p1_1e_reservation_hold_expired`).
- `prisma/schema.prisma`, model `User` (`:178-220`), after `mustChangePin` (`:198`):
  ```prisma
    // P1-2 S2 (D-S2): the Owner. Set and moved only by SQL in the Supabase SQL Editor (packet §6 S2-1),
    // never by the app. At most one user has it: partial unique index users_one_owner (migration only).
    isOwner       Boolean  @default(false)
  ```
- Migration. Keep comments free of `;` and `'`: `scripts/check-migration-safety.sh` splits on `;` and strips only comments without a `'` (`:90`). Write the real number for D-S2 in its first comment line.
  ```sql
  -- P1-2 S2 (D-S2): the Owner mark. Additive: one boolean column with a default, and a partial
  -- unique index so at most one user is the Owner. The app never writes it. The owner sets it
  -- once in the Supabase SQL Editor (packet section 6, S2-1). Prisma cannot model a filtered
  -- unique index, so the index lives here only. Never run prisma migrate dev to sync it.
  ALTER TABLE "users" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;
  CREATE UNIQUE INDEX "users_one_owner" ON "users" ("isOwner") WHERE "isOwner" = true;
  ```
  The script passes it: `ADD COLUMN … NOT NULL` has a `DEFAULT`, and nothing matches its destructive pattern. Run it as `bash scripts/check-migration-safety.sh "origin/development"` (the file isn't executable; CI calls it with `bash` too, SX-3), **after** committing; before a commit it reports a false "no migrations". The old revision never selects the column, and its inserts get the default (all checked by the reviewer, BS-17).
- CI builds the test DB with `db push`, so the index isn't there. `tests/p1-2s2-owner.test.ts` creates it in `beforeAll` from the migration file's statement (with `IF NOT EXISTS`), and drops it in `afterAll` only if it created it (precedent: P1-1a's handoff index).

2.2 **One password rule** (`src/lib/validation.ts`, after `:25`):
```ts
/** Admin password, at SET time (invite completion, change, reset, promotion). Login takes any non-empty string. */
export const adminPasswordSchema = z.string().min(8, 'Password must be at least 8 characters').max(200, 'Password is too long')
```
- `src/app/api/users/invite/complete/route.ts:43-45`: use `adminPasswordSchema.safeParse(credential)` and its first issue's message.

2.3 **Change PIN becomes role-aware** (`src/app/api/auth/change-pin/route.ts`). Keep the route name: the proxy allow-list names it (`src/proxy.ts:174`; `:199` after S1).
```ts
const operatorSchema = z.object({ currentPin: z.string().min(1, 'Enter your current PIN'), newPin: newPinSchema })
const adminSchema = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: adminPasswordSchema })
// in POST:
const raw: unknown = await req.json().catch(() => ({}))
// BS-9: a JSON string or number body is not an object; `'x' in body` would throw (500).
const body: Record<string, unknown> = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
const isAdmin = session.role === 'ADMIN'
if (isAdmin && 'newPin' in body) return NextResponse.json({ error: 'Admins change their password from Change password in the menu.' }, { status: 400 })
if (!isAdmin && 'newPassword' in body) return NextResponse.json({ error: 'Field operators sign in with a 6-digit PIN.' }, { status: 400 })
```
- Parse with the matching schema. Then the existing steps: same-as-current (`New password must be different from your current password.` for admins), verify (`Current password is incorrect.`, or the locked answer), hash, S1's `tokenVersion` bump, re-mint.
- The audit row is `isAdmin ? 'PASSWORD_CHANGED' : 'PIN_CHANGED'`. `src/lib/audit.ts` adds `'RESET_PASSWORD' | 'PASSWORD_CHANGED'`.

2.4 **Admin sign-in** (`src/app/api/auth/login/route.ts:11`):
- The admin field becomes `password: z.string().min(1)`. A short entry is then an ordinary wrong-password 401 that counts toward the lock, not a 400 "Invalid input".
- After a successful admin sign-in with `input.password.length < 8` and `!user.mustChangePin`: `prisma.user.update({ … data: { mustChangePin: true } })`, and the token and response carry `mustChangePin: true`.
- That repairs an admin who was given a 6-digit PIN, or an operator promoted before S2: they sign in on the Admin tab and land on Change password.

2.5 **Account rules** (`src/app/api/users/[id]/route.ts`):
- **Schema (`:13-25`):** add `tempPassword: adminPasswordSchema`.
- **Target (`:34-37`):** select `email: true, isOwner: true` as well.
- **Self guard (`:45-54`), added after it:** `isSelf && (pin || tempPassword)` → 400 `Change your own password from Change password in the menu.`
- **Owner rules**, right after the self guard and before the last-admin guard (`:56`):
  ```ts
  // P1-2 S2 (D-S2): the Owner, read from the database on every call. The app never writes isOwner.
  const actorIsOwner = (await prisma.user.findUnique({ where: { id: session.userId }, select: { isOwner: true } }))?.isOwner === true
  const roleChanging = role !== undefined && role !== target.role
  // Owner guard (§0-e): only the Owner changes the Owner's account; other admins may only reset its password.
  if (target.isOwner && !isSelf && !actorIsOwner) {
    const onlyReset = !!tempPassword && Object.keys(parsed.data).every((k) => k === 'tempPassword')
    if (!onlyReset) return NextResponse.json({ error: `Only ${target.name} can change this account. You can reset their password; they get an email and a bell message.` }, { status: 403 })
  }
  // §0-b, g: only the Owner resets another admin's password. A promotion or demotion is not a reset.
  if (tempPassword && target.role === 'ADMIN' && !roleChanging && !target.isOwner && !actorIsOwner) {
    const ownerSet = (await prisma.user.count({ where: { isOwner: true } })) > 0
    return NextResponse.json({ error: ownerSet
      ? "Only the Owner can reset another admin's password."
      : "Only the Owner can reset another admin's password, and no Owner is set yet." }, { status: 403 })
  }
  ```
- **Credential kind**, after the D44 guard (`:72-83`):
  ```ts
  const newRole = role ?? target.role
  const fieldError = (field: 'pin' | 'tempPassword', msg: string) =>
    NextResponse.json({ error: { formErrors: [], fieldErrors: { [field]: [msg] } } }, { status: 400 })
  if (pin && newRole === 'ADMIN') return fieldError('pin', 'Admins sign in with a password — set a temporary password instead.')
  if (tempPassword && newRole !== 'ADMIN') return fieldError('tempPassword', 'Field operators sign in with a 6-digit PIN — set a temporary PIN instead.')
  if (roleChanging && !(newRole === 'ADMIN' ? tempPassword : pin))
    return newRole === 'ADMIN'
      ? fieldError('tempPassword', 'Set a temporary password so they can sign in as an admin.')
      : fieldError('pin', 'Set a temporary PIN so they can sign in on their phone.')
  ```
- **Writes (`:103-122`):** one branch for both credentials:
  - `if (pin || tempPassword) { data.pinHash = await hashPin((pin ?? tempPassword)!); data.mustChangePin = true; data.failedPinAttempts = 0; data.pinLockedAt = null; actions.push({ action: pin ? 'RESET_PIN' : 'RESET_PASSWORD' }) }`. This replaces S1's `pin` branch.
  - `tokenVersion` is bumped on `forceLogout || pin || tempPassword || roleChanging || isActive === false`.
  - `PIN_LOCKED` resolves on `pin || tempPassword || unlockPin` (`:130`).
- **Owner bell and email**, after the update and before the audit loop (`:133`). Owner, round 6: other admins can reset the Owner whether or not the email goes out; the Owner also gets a bell message.
  ```ts
  let ownerEmail: EmailReport | undefined
  if (tempPassword && target.isOwner && !isSelf) {
    const when = new Intl.DateTimeFormat('en-US', { timeZone: appTimezone(), month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date())
    // P1-2 S2 (D-S2, owner round 6): a bell message to the Owner, written before the email (which can
    // take seconds). An event notice to one person, like a declined transfer: no Alert row, so no
    // admin bell, no evaluator and no Resolve (D45 is about alerts). It stays until the Owner opens it.
    await prisma.notification.create({ data: { userId: target.id, type: 'PASSWORD_RESET', title: 'Your password was reset',
      body: `Your password was reset by ${session.name} at ${when}.`, link: '/admin/users' } }).catch(() => {})
    ownerEmail = emailReport(await tryEmail({ to: target.email, subject: 'Your AHITS password was reset', kind: 'OTHER',
      html: ownerPasswordResetEmail({ ownerName: target.name, actorName: session.name, when }) }))
  }
  ```
  - Imports: `tryEmail` (`@/lib/email/resend`), `emailReport` and `type EmailReport` (`@/lib/email-outcome`), `appTimezone` (`@/lib/business-date`).
  - The `RESET_PASSWORD` row's meta is `{ owner: true, emailed: ownerEmail.emailed }`.
  - Respond `{ data: safeUser, ...(ownerEmail && { ownerEmail }) }`.
  - Neither the bell message nor the email ever contains the temporary password.
  - The bell uses the existing machinery: `GET /api/notifications` lists it in the Owner's bell, and opening it marks it read (`/api/notifications/read`). Nothing deletes notifications.
  - Scratch clone: the row read `Your password was reset by Ana at Oct 27, 2026, 12:30 AM <zone>.`, the zone being the app's business zone (Eastern after the Eastern-time PR).
- **`src/lib/email/templates.ts`**, after `inviteEmail` (`:108`): `ownerPasswordResetEmail({ ownerName, actorName, when })`, every value through `esc()`:

  > Your AHITS password was reset · `<actor>` reset the password on your AHITS admin account (`<owner>`) on `<when>`. You were signed out on every device. To sign in, ask `<actor>` for the temporary password, then choose your own. If you didn't expect this, sign in as soon as you can and check Team → Activity. If you can't sign in, use the Owner recovery steps (PILOT_ROLLBACK.md §4).

2.6 **Team reads the mark** (`src/app/api/users/route.ts:11-31`): select `isOwner: true` too, and each row gains `isSelf: u.id === session.userId`. The page then needs no `useAuth`. It can't use one anyway: `useAuth` calls `useRouter`, and `tests/components/uxp6-users-form.test.tsx` renders the page without an app router.

2.7 **No 6-digit admins by API** (`src/app/api/users/route.ts:50`): `if (rest.role === 'ADMIN')` → 400 `Invite admins instead — they set their own password.` The route has no UI caller (API-31).

2.8 **Each role goes to its own change screen** (`src/proxy.ts:171-184`; `:196-209` after S1):
```ts
    if (payload.mustChangePin === true) {
      // P1-2 S2 (B3-1, D-S2): each role changes its own kind of credential.
      const changePath = role === 'ADMIN' ? '/admin/account' : '/operator/change-pin'
      if (pathname.startsWith('/api/')) {
        // … mutating / allowed unchanged …
        if (mutating && !allowed) {
          return NextResponse.json({ error: role === 'ADMIN' ? 'You must set a new password before continuing.' : 'You must set a new PIN before continuing.' }, { status: 403 })
        }
      } else if (!pathname.startsWith(changePath)) {
        return NextResponse.redirect(new URL(changePath, request.url))
      }
    }
```
`/admin/account` isn't in `OPERATOR_VIEW_ADMIN_PATHS` (`:39-47`), so the role guard bounces operators from it.

2.9 **New page `src/app/(admin)/admin/account/page.tsx`, "Change your password"** (model: `src/app/(operator)/operator/change-pin/page.tsx`, 101 lines):
- Fields: `Current password`, `New password (8+ characters)` and `Confirm new password`, all `type="password"`.
- On mount, read `/api/auth/me` and set state in the `.then`. When it reports `mustChangePin`, show an info Alert: `An admin set a temporary password, or yours is under 8 characters. Choose a new one to continue.`
- Client checks: `New password must be at least 8 characters.` and `New password and confirmation don’t match.`
- It POSTs `{ currentPassword, newPassword }` to `/api/auth/change-pin`. Errors: `typeof d.error === 'string' ? d.error : d.error?.newPassword?.[0] ?? d.error?.currentPassword?.[0] ?? 'Could not change your password.'`
- On success, toast `Password updated. Any other device signed in as you is now signed out.`, then `router.replace('/admin/dashboard')`. The button reads `Update password`.
- No `ahits:credential-changed` event: that is O2's.

2.10 **AdminNav** (`src/components/admin/AdminNav.tsx:82-85`): above Sign out, for `isAdmin` only, add `<Button startIcon={<KeyIcon />} onClick={() => router.push('/admin/account')} fullWidth size="small" color="inherit">Change password</Button>` (`@mui/icons-material/Key`).

2.11 **Team page** (`src/app/(admin)/admin/users/page.tsx`):
- `UserRow` (`:41-55`) gains `isOwner?: boolean; isSelf?: boolean`. In `AdminUsersPage`: `const owner = users.find((u) => u.isOwner) ?? null` and `const iAmOwner = !!users.find((u) => u.isSelf)?.isOwner`. Pass both to `AccountDialog`.
- `roleChip` (`:480-482`): the Owner's row adds `<Chip size="small" variant="outlined" label="Owner" />`.
- Row actions (`:614-652`): on the Owner's row, when you aren't the Owner, hide Unlock and Deactivate/Reactivate. Manage stays.
- `AccountDialog`: rename `resetPin` → `resetCredential` (`:209`, `:225`, `:233`, `:242`). One field, whose kind follows the Role select (`:313-317`) through this helper:
  ```ts
  const PASSWORD_HELP = '8+ characters. They sign in on the Admin tab with it, then choose their own.'
  type Cred = { field: 'pin' | 'tempPassword'; label: string; helper: string; required: boolean } | { field: null; helper: string }
  function credentialFor(user: UserRow, role: 'ADMIN' | 'OPERATOR', iAmOwner: boolean, ownerName: string | null): Cred {
    if (user.isSelf) return { field: null, helper: 'Change your own password from Change password in the menu.' }
    if (role !== user.role) return role === 'ADMIN'
      ? { field: 'tempPassword', label: 'Temporary password', helper: PASSWORD_HELP, required: true }
      : { field: 'pin', label: 'Temporary PIN', helper: 'They sign in on the Field Operator tab with it, then choose their own.', required: true }
    if (user.role === 'OPERATOR') return { field: 'pin', label: 'Reset PIN (optional)', helper: 'Leave blank to keep the current PIN. The operator is asked to change it on next login.', required: false }
    if (user.isOwner) return { field: 'tempPassword', label: 'Reset password (optional)', helper: `${user.name} gets an email and a bell message when you reset it. ${PASSWORD_HELP}`, required: false }
    if (iAmOwner) return { field: 'tempPassword', label: 'Reset password (optional)', helper: PASSWORD_HELP, required: false }
    return { field: null, helper: ownerName ? `Only the Owner (${ownerName}) can reset another admin's password.` : "Only the Owner can reset another admin's password. No Owner is set yet." }
  }
  ```
  - A `field: null` result renders the helper as a caption, with no input. The PIN kind keeps today's digits-only `onChange` and `inputMode: 'numeric'`. The password kind takes any text with `autoComplete="off"`; plain text, so the admin can read it out.
  - Changing the Role select clears `resetCredential`.
- **Owner-guard mode** (`user.isOwner && !user.isSelf && !iAmOwner`):
  - Full Name, Role, Home Hub and Hourly Rate are disabled, and Log out of all devices is hidden.
  - An info Alert reads `Only <name> can change this account. You can reset their password; they get an email and a bell message.`
  - Save sends `{ tempPassword }` only. With the field empty, it sends nothing and closes.
- **Client checks (`:281`):** PIN kind: the existing 6-digit message. Password kind: `A temporary password needs at least 8 characters.` Required and empty: the server's two "Set a temporary …" messages.
- **Body (`:290`):** send `pin` or `tempPassword` according to the kind.
- **Field errors (`:261-263`):** map both `pin` and `tempPassword` onto `resetCredential`.
- **Toast:** when the response has `ownerEmail`, use `copy('user.update').ownerReset(name, ownerEmail.emailed)` through `useToast()`: success for `SENT`; otherwise a warning with `duration: 15_000`, so the resetting admin sees that the email didn't go out. Otherwise use today's `${name} updated`.
  - The page already toasts whatever `onSuccess(msg)` passes, so this would show two toasts (SX-14). `onSuccess` takes `string | null`: after the Owner toast, call `onSuccess(null)`, and the page shows a toast only for a message. As built:
    ```tsx
    const ownerEmail = (data as { ownerEmail?: { emailed: EmailOutcome } }).ownerEmail
    if (ownerEmail) {
      const sent = ownerEmail.emailed === 'SENT'
      pushToast({ message: copy('user.update').ownerReset(user.name, ownerEmail.emailed), severity: sent ? 'success' : 'warning', ...(!sent && { duration: 15_000 }) })
      onSuccess(null)
    } else {
      onSuccess(successMsg)
    }
    // in AdminUsersPage:
    <AccountDialog … onSuccess={(msg) => { if (msg) showToast(msg); load() }} />
    ```

2.12 **Copy** (`src/lib/copy/admin-actions.ts:160`): `'user.update'` gains a field, so no new contract row is needed (the P1-1 `gone` precedent):
```ts
  ownerReset: (name: string, emailed: EmailOutcome) => emailed === 'SENT'
    ? `${name}'s password was reset. ${name} was emailed and will see a bell message.`
    : `${name}'s password was reset. The email to ${name} didn't go out (${emailed.toLowerCase()}) — tell them yourself. They will see a bell message when they sign in.`,
```
In `tests/components/copy-contract.test.tsx:65`, the `user.update` effect reads `Saves the account fields, a reset PIN or temporary password (D-S2: admin resets need the Owner; an Owner reset emails the Owner and leaves a bell message).` (with D-S2's real number).

2.13 **`PILOT_ROLLBACK.md` §1**, after S1's paragraph (write the migration folder's real name for `<ts>_p1_2s2_owner_mark`): `**P1-2 S2 (Owner mark, migration <ts>_p1_2s2_owner_mark).** Rolling back leaves users.isOwner and users_one_owner in place; the old revision ignores them. While the old revision serves, the Team page offers a 6-digit Reset PIN on admins again, which locks an admin out: don't use it. After rolling forward nothing needs fixing. Never drop the column.`

2.13b **`PILOT_ROLLBACK.md`, new section `## 4. Owner account recovery (SQL)`**, just before `## Restore drill`: the text of §6 S2-3 below (the pgcrypto check, the UPDATE with its expected `UPDATE 1`, the no-mark variant, what to do after, and the undo).

**Interpretations (PR body):**
- §0-e reads "other admins may only reset the Owner's password", so their Unlock and Log out of all devices on the Owner's row are refused too.
- A promotion or demotion bumps `tokenVersion`, so the person is signed out everywhere.
- The Owner's own edits of their own row are unchanged. Self-demote and self-deactivate stay refused (CR-7).
- The Owner's bell message is an event notice to one person, not an alert (§9).

**Files (stage these only):** `prisma/schema.prisma`, `prisma/migrations/<ts>_p1_2s2_owner_mark/migration.sql`, `src/lib/validation.ts`, `src/lib/audit.ts`, `src/app/api/auth/change-pin/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/users/route.ts`, `src/app/api/users/invite/complete/route.ts`, `src/proxy.ts`, `src/app/(admin)/admin/account/page.tsx`, `src/components/admin/AdminNav.tsx`, `src/app/(admin)/admin/users/page.tsx`, `src/lib/email/templates.ts`, `src/lib/copy/admin-actions.ts`, `PILOT_ROLLBACK.md`, and the tests below. Size **M–L** (about +820 / −60).

**Tests.**
- **Node** `tests/p1-2s2-admin-password.test.ts`:
  1. An admin posts `{ currentPassword, newPassword }` → 200. Admin login with the new password → 200; with the old one → 401. One `PASSWORD_CHANGED` row. `tokenVersion` +1; a token minted before → `getSession()` null; the newly set cookie is valid (CS-23).
  2. An admin posting `{ currentPin: <the admin's real password>, newPin: '135792' }` → 400 `Admins change their password from Change password in the menu.`, and `pinHash` is unchanged. Send the real password (SX-9): with a wrong one, the old route also answers 400 (`Current PIN is incorrect.`), so the test would pass without the fix; with the real one, the old route changes the hash. An operator posting `{ currentPin: <their real PIN>, newPassword }` → 400 `Field operators sign in with a 6-digit PIN.` (check the text: the old route's schema also refuses this body). A JSON string body (`"x"`) → 400 for both roles, never 500 (BS-9; a regression guard: the old route answers 400 too).
  3. `PATCH` an admin with `{ pin }` → 400 `fieldErrors.pin`, and `pinHash` is unchanged.
  4. Promote with `{ role: 'ADMIN' }` alone → 400; with `tempPassword` → 200, `mustChangePin` set, `tokenVersion` +1, and admin login works (`mustChangePin: true`).
  5. Demote with `{ role: 'OPERATOR' }` alone → 400; with `pin` → 200, and PIN login works.
  6. A self `{ tempPassword }` → 400.
  7. `POST /api/users` with `role: 'ADMIN'` → 400.
  8. An admin whose credential is 6 characters signs in on the Admin tab → 200, `mustChangePin: true`, stored on the user.
  9. Invite completion with a 201-character password → 400.
- **Node** `tests/p1-2s2-owner.test.ts` (index from the migration file in `beforeAll`; mock `tryEmail` from `@/lib/email/resend`):
  - A second `isOwner = true` → unique violation.
  - No Owner set: admin A resets admin B → 403 `…no Owner is set yet.`; B unchanged.
  - Owner O resets admin B → 200: `mustChangePin`, `tokenVersion` +1, lock cleared, one `RESET_PASSWORD` row, and no notification for anyone.
  - Non-Owner A resets B → 403 `Only the Owner can reset…`.
  - A resets O with `{ tempPassword }` → 200. `tryEmail` is called once, to O's email, with no temporary password in the HTML. The response's `ownerEmail.emailed` matches the mock. O has exactly one notification: type `PASSWORD_RESET`, title `Your password was reset`, body matching `/^Your password was reset by <A's name> at .+\.$/`, link `/admin/users`, `alertId` null, unread; no other user gets one, and no body contains the temporary password. With `tryEmail` answering `FAILED`, it's still 200 with `emailed: 'FAILED'`, and the bell row is still written.
  - A sends `{ tempPassword, name }`, `{ name }`, `{ role: 'OPERATOR', pin }`, `{ isActive: false }`, `{ hourlyRate }`, `{ homeHubId }`, `{ unlockPin: true }` or `{ forceLogout: true }` to O → each 403, and O is unchanged.
  - O renames themself → 200. Any admin promotes an operator with `tempPassword` → 200 (no Owner needed).
  - `GET /api/users` marks `isOwner` and `isSelf`.
  - The recovery SQL (§6 S2-3), run with `$executeRawUnsafe` after `CREATE SCHEMA IF NOT EXISTS extensions` and `CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions` (if the test database refuses the extension, `it.skipIf` that case with a message, and say in the PR body whether it ran in CI): `UPDATE 1`; a token minted before → `getSession()` null; admin login with the temporary password → 200 with `mustChangePin: true`; Change password back to the old one → 200. (Passed on the scratch clone, Postgres 16; the hash starts `$2a$12$`.)
- **Node** `tests/p1-2s2-proxy-change-funnel.test.ts` (S1's helper):
  - ADMIN with `mustChangePin` on `GET /admin/dashboard` → 307 to `/admin/account`; `/admin/account` passes.
  - OPERATOR → `/operator/change-pin`, as today.
  - `POST /api/auth/change-pin` passes. `POST /api/hubs` → 403 with the password wording for an admin and the PIN wording for an operator.
- **UI** `tests/components/p1-2s2-admin-account.test.tsx`: it sends `{ currentPassword, newPassword }`; a mismatch is an inline error with no request; the notice shows when `/api/auth/me` reports `mustChangePin`.
- **UI** `tests/components/p1-2s2-team-credential.test.tsx` (fetch stub as `uxp6-users-form`):
  - Each row of the `credentialFor` table shows its label or caption.
  - A required field left empty → inline error, no request.
  - Promote sends `tempPassword` and no `pin`; demote the reverse.
  - The Owner's row seen by a non-Owner: the other fields are disabled, the body is exactly `{ tempPassword }`, and an `ownerEmail: { emailed: 'FAILED' }` reply shows the "didn't go out" warning toast.
  - Your own row has no field. The Owner's row hides Deactivate for a non-Owner.
- **Change** (name each in the PR):
  - `tests/auth-invite-rbac.test.ts:146-156` ("allows demoting an admin…") sends `{ role: 'OPERATOR', pin: '482913' }`.
  - `tests/components/copy-contract.test.tsx:65` gets the row text above.
- **Must pass unchanged:** `tests/components/uxp6-users-form.test.tsx` (its row has no `isSelf` or `isOwner`, so the label stays `Reset PIN (optional)`), `tests/cc31-alert-autoresolve.test.ts:49-86`, `tests/pr3b-guards.test.ts`, `tests/uxp3-login-lockout.test.ts` (`:137` admin password `correct-horse`), `tests/hotfix-no-full-user-rows-guard.test.ts`, and S1's tests.

**Behaviour changes (PR body):**
- The Team page offers a password, never a PIN, for an admin. A role change asks for a temporary credential of the new kind, and the person is signed out everywhere.
- Admins change their password from Change password in the menu. Change PIN refuses admins.
- An admin with a credential under 8 characters is sent to Change password at sign-in.
- Admin password resets need the Owner; until the mark is set they are refused. Other admins may only reset the Owner's password. The Owner is emailed and gets a bell message, and the reset goes ahead even when the email can't go out.
- `POST /api/users` refuses admins. Admin invite passwords are 8–200 characters.

**What people see.**
- **Admin:** a Change password entry above Sign out. On Team, your row says `Owner` once the mark is set.
- An admin whose password was reset lands on Change your password and can do nothing else until it's changed.
- Non-Owner admins see a caption, not a field, on other admins' rows.
- **Owner:** a bell message each time another admin resets your password. The admin who did it sees a warning for 15 seconds when your email didn't go out.

**Acceptance (app screens).** State Active Deployments first. Run them in the order §7 gives for S2.
1. (session) Before S2-1: Team → another admin → the caption `…No Owner is set yet.` and no field.
2. (session) After S2-1: your row reads `Owner`.
3. (owner) As Owner: reset a test admin's password → toast. The test admin signs in on the Admin tab → Change your password → done → the dashboard.
4. (owner) Promote a test operator with a temporary password → they sign in on the Admin tab → Change your password. Demote them back with a temporary PIN → PIN tab → Change PIN.
5. (owner) §6 S2-2: each admin changes their own password.

"Another admin resets the Owner": node tests only. Doing it on staging resets your real password.

---

## S3 · What operators can read

**Goal.** §0 m, n, o, p (code). Closes B3-5, B3-8, B3-9 (a, b, c, e, h; f and g through the sweep) and B3-10's code half, and corrects the PRD rows. §6 Do now (the Supabase checks and the Data API switch) is the owner's, before S1.

3.1 **New `src/lib/role-fields.ts`:**
```ts
import type { Prisma } from '@prisma/client'

// P1-2 S3 (D-S3, owner rules 2026-10-26): what an operator may read. Admins read everything.
// Every route that returns these rows to a non-admin passes them through forRole().
// tests/p1-2s3-operator-read-guard.test.ts fails CI if any GET leaks one of these values.
export const ADMIN_ONLY = {
  vehicle: ['insuranceExpires', 'registrationExpires', 'rentalCostAmount', 'rentalCostPeriod'], // plate, VIN, rental company and agreement stay
  task: ['estimatedCost', 'actualCost', 'purchaseOrder', 'invoiceNumber'],                    // any repair cost
  item: ['unitCost', 'supplier', 'reorderUrl'],                                                // purchasing
} as const

export function forRole<T extends object>(row: T, kind: keyof typeof ADMIN_ONLY, role: string | undefined): T {
  if (role === 'ADMIN') return row
  const out = { ...row } as Record<string, unknown> // a cast: a typed declaration fails tsc (TS2322, rev 3)
  for (const k of ADMIN_ONLY[kind]) delete out[k]
  return out as T
}

// A colleague's daily check as an operator sees it: date, result, who, issue summary.
export const DAILY_CHECK_PEER_SELECT = {
  id: true, date: true, passFail: true, issues: true, vehicleId: true, operatorId: true,
  operator: { select: { id: true, name: true } },
} satisfies Prisma.DailyCheckSelect

export function toPeerCheck(check: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(DAILY_CHECK_PEER_SELECT).map((k) => [k, check[k]]))
}
```
The schema has no other cost-like column on these models (checked: `Vehicle`, `MaintenanceTask`, `InventoryItem`, `InventoryUnit`).

3.2 **Vehicles** (`src/app/api/vehicles/route.ts`): `:58` `...v,` → `...forRole(v, 'vehicle', session.role),`; and `:120` `{ ...vehicle, hubId … }` → `{ ...forRole(vehicle, 'vehicle', session.role), hubId: hubId ?? null }` (the operator's Add Rental echo).

3.3 **Vehicle detail** (`src/app/api/vehicles/[id]/route.ts`):
- `:55`: `include: { operator: { select: { id: true, name: true } } } },` → `select: DAILY_CHECK_PEER_SELECT },` for everyone. The drawer reads only `id, date, passFail, operator.name` (`admin/vehicles/page.tsx:90, 840-859`), and the full check opens in the viewer.
- `:92`:
  ```ts
  const { photos, maintenanceTasks, ...row } = vehicle
  return NextResponse.json({ data: {
    ...forRole(row, 'vehicle', session.role),
    maintenanceTasks: maintenanceTasks.map((t) => forRole(t, 'task', session.role)),
    ...(session.role === 'ADMIN' ? { photos } : {}), // the 6-photo strip is admin-only; no screen reads it (page.tsx:97)
    assignedOperatorId, hubId, hubName, assignedOperatorName, lastCheckSite,
  } })
  ```

3.4 **Daily checks:**
- `src/app/api/daily-check/route.ts:79`: `vehicle: true` → `vehicle: { select: { id: true, name: true, type: true } }`, for everyone. No screen reads more: `daily-check/page.tsx:111-119` and `TodayCheckSummary.tsx:57-62` read ids only.
- `src/app/api/daily-check/[id]/route.ts:26-31`: replace the 403 with:
  ```ts
  // P1-2 S3 (D-S3): own checks and admins read the full check. A colleague's check shows date,
  // result, who and the issue summary only: no answers, GPS, photos, odometer, site or timing.
  if (session.role !== 'ADMIN' && check.operatorId !== session.userId) {
    return NextResponse.json({ data: { ...toPeerCheck(check), vehicle: check.vehicle, limited: true } })
  }
  ```
  The header comment (`:5-10`) says the same.

3.5 **Dashboard feeds** (`src/app/api/dashboard/feeds/route.ts`): at `:177` add `const isAdmin = session.role === 'ADMIN'`. At `:185`: `...(isAdmin ? { maintenanceWatch: maintenanceWatchTotal } : {}),`. At `:191`: `...(isAdmin ? { maintenanceWatch } : {}),`. The comment at `:9-12` adds `Maintenance spend is admin-only (D-S3).`

3.6 **Maintenance:** `src/app/api/maintenance/route.ts:114-121` → `const data = withReported.map((t) => forRole(t, 'task', session.role))`. `src/app/api/maintenance/[id]/route.ts:81-86` → `return NextResponse.json({ data: forRole({ ...task, rig, reportedBy }, 'task', session.role) })`.

3.6b **Replies to an operator's reports and field fixes (BS-2).** These return a whole `MaintenanceTask` row. When a report joins an open repair (one open task per asset, `maintenance.ts:150-170`), that row carries the admin-set cost, PO and invoice. `withIdempotency` also stores and replays the body.
- `src/app/api/vehicles/[id]/report-damage/route.ts:69` → `return NextResponse.json({ data: forRole(result, 'task', session.role) }, { status: 201 })`.
- `src/app/api/inventory/units/[unitId]/report-problem/route.ts:78` → `return NextResponse.json({ data: forRole(task, 'task', session.role) }, { status: 201 })`.
- `src/app/api/maintenance/field-fix/route.ts:98` → the same with `task`. Its row is the new field-fix record, which carries no cost today; `forRole` keeps it that way.
  - Round 7: any operator may close any repair this way, whoever has the gear, including a shop repair with its costs set. The closed repair isn't in the reply.
  - If the Data packet's revision adds the closed repairs to the reply, each goes through `forRole` too (§9.4).
- Import `forRole` from `@/lib/role-fields` in each.
- Scratch clone: before, both report replies carried all 4 sentinels; after, none, and an admin still gets every key. `tests/cc10-field-fix.test.ts` stays green. Rev 3: another crew's unit with a shop repair carrying all 4 values → 201, the repair closed, none of the 4 in the reply. An admin still gets all 4.

3.7 **Inventory:**
- `src/app/api/inventory/route.ts`: `:330` drops `unitCost` from the destructure; `:349-350` become `...forRole(rest, 'item', session.role),`; fix the comment at `:328-329`.
- `src/app/api/inventory/[id]/route.ts`: `:126` → `...forRole(rest, 'item', session.role),`. Delete `:137-138`.

3.8 **Colleagues' emails (B3-8)** (`src/lib/deployment-assignments.ts`):
- Drop `email: string;` from the two roster types (`:37`, `:39`) and `email: string | null;` from the row types (`:54`, `:120`).
- Drop `u."email", ` from the SQL (`:56`, `:130`) and `email: a.email ?? '', ` from `:69`, `:72`, `:146` and `:149`.
- Keep `role` (D3). No reader uses the roster's email (checked: no `.operator?.email` or `.operator.email` in `src`; `tsc` is clean without it, BS-18).

3.9 **Screens (needed):**
- `src/components/admin/DailyCheckViewer.tsx`:
  - `ViewerCheck` (`:34-50`) gains `limited?: boolean`.
  - In `DailyCheckDetails`, **before `:66`** (`check.photos.filter` at `:68` would throw on a short view), return the short view when `check.limited`: the Pass/Fail chip and `<vehicle> · <operator> · <date>` header (as `:73-80`), an `Issue summary` block when `issues` is set, and `Only the person who did this check, and admins, see the full check.`
  - In `DailyCheckViewer`, `const canEdit = useCanEdit()` (from `@/components/shared/ReadOnly`), and `:233` → `{check && !check.passFail && canEdit && (`. The open-task route is admin-only, so operators only ever got a 403 from that button.
- `src/app/(admin)/admin/dashboard/page.tsx:193-205`: wrap the Maintenance watch `<Grid item>` in `{canEdit && (…)}` (`canEdit` is at `:55`). Otherwise its "No maintenance spend recorded" would be false.

3.10 **Screens (hide labels whose values operators no longer get, so "—" never reads as "none").** Each guard is `canEdit &&`:
- `src/app/(admin)/admin/vehicles/page.tsx`: the Insurance and Registration header cells (`:562-563`) and body cells (`:618-619`, `:649-650`); the drawer rows (`:714-715`); Cost basis (`:742-746`). The expiry banner (`:474`) already shows only when its count is above 0.
- `src/app/(admin)/admin/inventory/page.tsx:1264-1280`: Unit Cost, Supplier, Reorder URL.
- `src/app/(admin)/admin/maintenance/page.tsx`: the list's Cost header (`:663`) and cell (`:697`); in the repair's details, the PO # / Invoice # `Stack` (`:787-790`) and the Est. / Actual cost `Stack` (`:793-798`). Date delivered (`:791-792`) sits between them and stays visible: it isn't a cost (SX-5).

3.11 **The user guard covers more (B3-9)** (`tests/hotfix-no-full-user-rows-guard.test.ts`):
1. Scan every `.ts` and `.tsx` under `src/` (gap e).
2. `findFullUserRows` matches the whole file text, and computes the line from `m.index` (gaps a, b):
   ```ts
   const re = new RegExp(`['"]?\\b(${fields.join('|')})['"]?\\s*:\\s*(?:true\\b|\\{\\s*(?:include|omit|where|orderBy|take|skip|distinct|cursor)\\b)`, 'g')
   ```
   It has zero hits across `src/` at `3dbaea8` (checked, and re-checked by the reviewer).
3. New `findRawUserColumns(file, text)` (gap c). For each backtick block containing `"users"`, collect aliases from `/"users"\s+(?:AS\s+)?([a-z]\w*)/gi`, minus SQL keywords. Flag `alias."col"` or `alias.*` with `col` outside `{id, name, role}`, and `SELECT * FROM "users"`. Checking per block avoids the `u` alias for units in `deployment-requests.ts`. At `3dbaea8` it flags exactly the two roster blocks (`deployment-assignments.ts:55`, `:121`); after 3.8, none.
4. An opt-out needs a reason of at least three words: `/\/\/\s*user-fields:\s*ok\s+\S+\s+\S+\s+\S+/` (gap h). No opt-out exists in `src` today.
5. Self-tests. Flagged: `operator:\n    true`, `'operator': true`, `user: { include: {…} }`, `operator: { omit: { pinHash: true } }`, `` `SELECT u."email" FROM "users" u` ``. Not flagged: `actor: { label: x }`, `operator: { select: { id: true } }`, `` `SELECT u."name" FROM "users" u` ``.
6. Gap (d): a `prisma.user.*` result spread into a response. The users POST and PATCH strip only `pinHash`, so `tokenVersion`, `failedPinAttempts` and `pinLockedAt` go back, but only to admins. No change. Say so in the header (SX-7), for example `Gap (d), a prisma.user result spread into a reply (users POST and PATCH), is admin-only and needs no change (admins see everything).`

The read guard below sweeps GETs only. Replies to writes an operator can make are checked by name in `tests/p1-2s3-operator-reads.test.ts`: 3.2 (Add Rental) and 3.6b (reports, field fix).

3.12 **Supabase anon key out (B3-10, code)**:
- Delete `src/lib/supabase/client.ts` and `src/lib/supabase/server.ts` with `git rm src/lib/supabase/client.ts src/lib/supabase/server.ts` (that also stages the deletion). They have no importers, and they are the only readers of the key and of `@supabase/ssr`. Keep `admin.ts` (uploads, photos).
- `npm uninstall @supabase/ssr` (this changes `package.json:33` and `package-lock.json`).
- `Makefile:202`: remove `NEXT_PUBLIC_SUPABASE_ANON_KEY=$(SECRET_NS)_NEXT_PUBLIC_SUPABASE_ANON_KEY:latest,`. `--set-secrets` replaces the whole list, so the new revision drops it. Leave `:201` alone (it holds `APP_TIMEZONE`, which the Eastern-time PR edits) and the env-drift step (`deploy.yml:153-201` after the Eastern-time PR, which doesn't name it; SX-17).
- `.github/workflows/verify.yml:52`: delete the placeholder line.
- `README.md:37`: delete the row.
- `PROD_CUTOVER_RUNBOOK.md`: delete the `:53` row and the `:83` `mk` line, drop the name from the `:107` loop, and change "Create all 11 secrets" (`:71`) and "Verify all 11 exist" (`:104`) to "all 10" (BS-12).
- Run `grep -n NEXT_PUBLIC_SUPABASE_ANON_KEY .env.example .env.test.example`; delete each matching line (they're templates) and name the result in the PR body. `docs/archive/*` stays as history.
- Leave the CSP (`src/proxy.ts:63,75`) and `next.config.ts` alone.
- **Don't delete the Secret Manager secret** (§6 E3-after). Nothing at build or run time needs the key (Dockerfile, Makefile `env-check`, env-drift and CI checked, BS-18).

3.13 **PRD rows (`AHITS_PRD_v2.md`, docs, same PR):** write D-S3's real number.
- `:58`: replace the SEC-2 clause with `Operators see plate/VIN and rental company/agreement; insurance and registration dates and all costs are admin-only (P1-2 S3, D-S3; SEC-2 as written never landed).`
- `:163` (a): append `— *not landed; superseded by P1-2 S3 (D-S3)*`.
- `:171`: remove `vehicle‑PII, `.
- `:655` and `:658`: replace each whole line with the line below (SX-12). Each keeps its bold title; the marker and status change.
  ```markdown
  - 🟡 **Operators can read cost/spend fields** — **Partly fixed (S5, f1216ec); regressed** in vehicle detail, the dashboard spend feed and PO/invoice. Closed by P1-2 S3 (D-S3).
  - ✅ **`vehicles/[id]` leaked `pinHash`/PII** — **FIXED by hotfix #268 (2026-10-22), not Session 3.**
  ```

**Not touched:** `src/app/sw.ts` (the cache purge is O3's).

**Files (stage these only):** `src/lib/role-fields.ts`, `src/app/api/vehicles/route.ts`, `src/app/api/vehicles/[id]/route.ts`, `src/app/api/vehicles/[id]/report-damage/route.ts`, `src/app/api/inventory/units/[unitId]/report-problem/route.ts`, `src/app/api/maintenance/field-fix/route.ts`, `src/app/api/daily-check/route.ts`, `src/app/api/daily-check/[id]/route.ts`, `src/app/api/dashboard/feeds/route.ts`, `src/app/api/maintenance/route.ts`, `src/app/api/maintenance/[id]/route.ts`, `src/app/api/inventory/route.ts`, `src/app/api/inventory/[id]/route.ts`, `src/lib/deployment-assignments.ts`, `src/components/admin/DailyCheckViewer.tsx`, `src/app/(admin)/admin/dashboard/page.tsx`, `src/app/(admin)/admin/vehicles/page.tsx`, `src/app/(admin)/admin/inventory/page.tsx`, `src/app/(admin)/admin/maintenance/page.tsx`, `package.json`, `package-lock.json`, `Makefile`, `.github/workflows/verify.yml`, `README.md`, `PROD_CUTOVER_RUNBOOK.md`, `AHITS_PRD_v2.md` (and an `.env*.example` only if it named the key), and the tests below. Size **L** (about +720 / −120, plus the lockfile).
- **Deleted, already staged by `git rm` (3.12):** `src/lib/supabase/client.ts` and `src/lib/supabase/server.ts`. Never name them in `git add`: a deleted path makes the whole `git add` fail, and the practice build's S3 commit went out without `package.json`, the lockfile and the 4 new tests (SX-8). After committing, `git show --stat HEAD` lists every file above, the two deletions among them (34 in the practice build, with `.env.example`).

**Tests.**
- **Node** `tests/p1-2s3-operator-reads.test.ts` (harness as `tests/hotfix-vehicle-detail-user-fields.test.ts`). As an operator:
  - `/api/vehicles` and `/api/vehicles/[id]` carry `vin`, `licensePlate`, `rentalCompany`, `rentalAgreementNumber` and `rentalAgreementUrl`, and lack the 4 vehicle keys.
  - `dailyChecks[0]` keys are exactly `[date, id, issues, operator, operatorId, passFail, vehicleId]`. The task lacks the 4 task keys. There is no `photos` key.
  - `/api/daily-check/[colleague's]` → 200, `limited: true`, and none of `checklistJson`, `gpsLat`, `photos`, `site`, `odometer`. Your own check still has `gpsLat` and `checklistJson`.
  - The `/api/daily-check` row's `vehicle` keys are `[id, name, type]`.
  - Feeds: no `maintenanceWatch` and no `counts.maintenanceWatch`.
  - Maintenance list and detail lack the 4 task keys. Inventory list and detail lack `unitCost`, `supplier` and `reorderUrl`.
  - `/api/deployments/mine`: `secondaryOperators[].operator` keys are `[id, name, role]`.
  - Add Rental (CS-9): `POST /api/vehicles` with the required fields plus `isRental: true, rentalCostAmount: 123.45, rentalCostPeriod: 'DAY'` → 201. The reply has neither `rentalCostAmount` nor `rentalCostPeriod`, and the stored row has 123.45 and `DAY`.
  - Reports (BS-2): a vehicle and a unit each with an open repair whose `estimatedCost`, `actualCost`, `purchaseOrder` and `invoiceNumber` are set. `report-damage` and `report-problem` → 201, and neither body contains any of the 4 keys or their values.
  - Field fix (round 7): an operator of another crew, on a unit in someone else's kit whose open repair is `AT_SHOP` and carries the 4 values → 201. The repair is closed, and the reply has none of the 4 keys or values.
  - As an admin, every one of those keys is present, including the Add Rental echo and the report replies.
- **Node** `tests/p1-2s3-operator-read-guard.test.ts`: the guard (CS-3: everything it needs is here). Every `route.ts` under `src/app` that exports `GET` (55 at `3dbaea8`) is swept as an operator over one seeded world, whose admin-only columns hold unique sentinels.
  ```ts
  // P1-2 S3 guard (D-S3): no GET an operator can call returns an admin-only value. Every route.ts under
  // src/app that exports GET is swept as an operator over one seeded world whose admin-only columns
  // hold unique sentinels. A new GET is swept automatically; a new DYNAMIC route fails here until it
  // gets a PARAMS entry or a SKIP reason. Self-test: as an admin, the same sweep finds every sentinel,
  // so "found none" means something. Replies to writes are not swept: p1-2s3-operator-reads checks them.
  const SENTINELS = {
    'vehicle.insuranceExpires': '2099-01-23', 'vehicle.registrationExpires': '2098-02-17',
    'vehicle.rentalCostAmount': '98765.43',
    'task.estimatedCost': '87654.32', 'task.actualCost / maintenanceWatch': '76543.21',
    'task.purchaseOrder': 'PO-SENTINEL-7741', 'task.invoiceNumber': 'INV-SENTINEL-5523',
    'item.unitCost': '65432.17', 'item.supplier': 'SUPPLIER-SENTINEL', 'item.reorderUrl': 'reorder.sentinel.example',
    'colleague check gpsLat': '12.345678', 'colleague check gpsLng': '-98.765432',
    'colleague check answers': 'NOTE-SENTINEL-CHECK', 'colleague check photo': 'PHOTO-SENTINEL',
    'colleague email A': 'colleague.a.sentinel@example.test', 'colleague email B': 'colleague.b.sentinel@example.test',
    'colleague hourlyRate': '54321.98',
  }
  // Allowed by an owner decision, with its reason (D2/D30: the Crew Map shows the last check's GPS).
  const ALLOW: Record<string, string[]> = { 'api/map/crew': ['colleague check gpsLat', 'colleague check gpsLng'] }
  const SKIP: Record<string, string> = {
    'api/photos/[...path]': 'streams Storage objects, not JSON (S4 tests its headers)',
    'api/s/[token]': 'public token link, no session; its own dead-link tests',
    'api/cron/dispatch': 'Bearer-gated job, not a read',
    'api/users/invite/validate': 'public invite-token check',
    'api/debug/sentry-test': 'throws on purpose for Sentry',
  }
  ```
  - **Enumerate routes:** walk `src/app` for `route.ts` matching `/export\s+(async\s+function|const)\s+GET\b/`. The key is the path relative to `src/app` with route groups `(…)` removed.
  - **`PARAMS`** covers the 13 other dynamic GETs:
    - `api/daily-check/[id]` → the colleague's check and your own
    - `api/deployments/[id]`, `/history`, `/operators` → rig R
    - `api/deployment-requests/[id]` → `{ id: 'missing' }` (no admin-only fields; 404 is fine)
    - `api/inventory/[id]`, `/stock`, `/references` → the item
    - `api/inventory/units/by-qr/[qrCodeId]` → the unit's `qrCodeId`
    - `api/maintenance/[id]` → the open task and the completed task
    - `api/projects/[id]` → P
    - `api/vehicles/[id]` → V
    - `api/vehicles/by-qr/[qrCodeId]` → `V.qrCodeId`
  - **`QUERIES`:** `api/maintenance`: `''`, `?rigId=R`, `?vehicleId=V`, `?tab=completed` · `api/inventory`: `''`, `?mode=options` · `api/daily-check`: `''`, `?vehicleId=V` · `api/transfers`: `''`, `?direction=incoming`, `?direction=outgoing`.
  - **Seed** with `tests/helpers/fixtures.ts` plus Prisma:
    - The admin; the caller (operator, SECONDARY on rig R through `ensureOpenAssignment`); colleague A (PRIMARY on R, email `colleague.a.sentinel@example.test`); colleague B (SECONDARY on R, email `colleague.b.sentinel@example.test`, `hourlyRate` 54321.98).
    - Rig R2 (PRIMARY B) with a PENDING transfer to the caller.
    - Vehicle V on R with the vehicle sentinels, plus `vin`, `licensePlate`, a rental company and an agreement number.
    - A's check on V today with the GPS sentinels, `checklistJson: [{key:'m',label:'Mirror',value:'no',note:'NOTE-SENTINEL-CHECK'}]`, `issues: 'Cracked mirror'` and `passFail: false`, and a Photo on it: `url: '/api/photos/rig-events/x/PHOTO-SENTINEL.jpg'`, `context: 'DAILY_CHECK'`, `vehicleId: V`, `uploadedById: A` (required).
    - The caller's own check on another vehicle, with different GPS.
    - An open task on V with the estimate, PO and invoice sentinels, and a completed task on V (`completedAt` now, `actualCost` 76543.21).
    - A serialized item with the item sentinels and one unit in R's kit.
    - Project P, with `addProjectLink(R, P)` and `rig.projectId = P`.
  - **Seed in `beforeEach`, never `beforeAll`** (SX-6): `tests/setup.ts` empties every table after each test, so a `beforeAll` world is gone by the second `it`. The operator sweep would then pass on an empty database, and the admin self-test would fail. As built: `beforeEach(async () => { W = await seed() }, 60_000)` with the comment `// tests/setup.ts wipes every table after each test, so each test seeds the world afresh.` Give each sweep `it` 120 s.
  - **Session mock** (as built, plus `checkSession`, OX-2). The Offline packet's O2 adds `checkSession` to `session.ts`, and `/api/auth/me` then reads it. Without this line the real one runs, calls `cookies()` outside a request, and both sweeps fail. Here in S3 nothing calls it yet, so it is inert (checked at `stack-S4`: `tsc` clean, the guard 3 of 3).
    ```ts
    let mockSession: object | null = null
    vi.mock('../src/lib/auth/session', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../src/lib/auth/session')>()),
      getSession: () => Promise.resolve(mockSession),
      // O2 (B5-8) adds checkSession and /api/auth/me reads it; mocked from the start so O2 needs no change here.
      checkSession: () => Promise.resolve(mockSession ? { status: 'ok', session: mockSession } : { status: 'none' }),
      getSessionClaims: () => Promise.resolve(mockSession),
      requireAuth: () => Promise.resolve(mockSession),
      requireAdmin: () => Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
    }))
    ```
    A route that reads the session through a function this mock doesn't cover fails both sweeps. A later PR that adds such a function adds it here.
  - **Call** `mod.GET(new NextRequest(url), { params: Promise.resolve(p) })`. Record any status ≥ 500 as a failure, and any sentinel found in `await res.text()` that `ALLOW` doesn't list for that route.
  - `it`s: (1) more than 45 GET routes, and every dynamic one is in `PARAMS` or `SKIP`; (2) the operator sweep returns `[]`; (3) self-test: as an admin, every sentinel is found by at least one route.
  - **If the sweep finds a sentinel the packet didn't predict, stop and report it** (a new exposure). Never add an `ALLOW` without the owner.
- **UI** `tests/components/p1-2s3-view-only.test.tsx`:
  - `DailyCheckDetails` with `limited: true` shows the summary and none of "Checklist", "Photos" or "Location (GPS)".
  - Under `<ReadOnlyProvider canEdit={false}>`: the dashboard has no "Maintenance watch", the viewer on a failing check has no "Open repair task from this check", and the vehicle drawer has no "Insurance expires" or "Cost basis".
- **UI** `tests/components/p1-2s3-no-anon-key.test.ts` (pure):
  - No file under `src/` or `.github/`, and none of `Makefile`, `README.md` or `PROD_CUTOVER_RUNBOOK.md`, contains `SUPABASE_ANON_KEY`.
  - `src/lib/supabase/` holds only `admin.ts`.
  - `package.json` has no `@supabase/ssr`.
- **Change:** `tests/hotfix-no-full-user-rows-guard.test.ts` (3.11).
- **Must pass unchanged:** `tests/hotfix-vehicle-detail-user-fields.test.ts`, `tests/cc10-field-fix.test.ts`, `tests/components/p1-1b-screens.test.tsx` (admin view), `tests/components/DailyCheckViewer.test.tsx`, `tests/components/TodayCheckSummary.test.tsx`, `tests/components/uxp6-item-form.test.tsx`, `tests/cc14-operator-today.test.ts`, `tests/pr5c-today-crew-rig.test.ts`.

**Behaviour changes (PR body):**
- Operators no longer receive insurance or registration dates, rental cost, repair costs, PO or invoice (in reads, and in the replies to their reports and field fixes), the dashboard spend panel, unit cost, supplier or reorder link, colleagues' emails, colleagues' check details beyond the short view, or the vehicle photo strip.
- The daily-check list's `vehicle` is `{ id, name, type }` for everyone.
- An operator who taps a colleague's check gets the short view, where it used to read "Could not load this check". Operators no longer see "Open repair task from this check", which only ever gave them a 403.
- Phones keep earlier full responses in their caches for up to 7 days, until O3.
- The anon key is no longer mounted, and `@supabase/ssr` is gone.

**Interpretations (PR body):** the vehicle drawer's recent-checks list uses the short select for admins too (they open the viewer for the full check). Hiding the labels (3.10) goes beyond the map's "needed" list; it does what the owner's rule says.

**Acceptance (app screens).** State Active Deployments first.
1. (owner) As a test operator, Vehicles → a rental: VIN, plate, company and agreement show; there is no insurance, registration or cost basis.
2. (owner) As the test operator, open a colleague's check from a vehicle → the short view.
3. (owner) As the test operator: Dashboard has no Maintenance watch. Maintenance shows no cost, PO or invoice. Inventory shows no unit cost or supplier.
4. (session) As an admin, all of it is visible.
5. (session) Open a maintenance task with a photo → it loads (Storage uses the service key) → `/api/health` OK.

---

## S4 · Links and uploads

**Goal.** §0 q and t. Closes B3-12 and B3-14. B3-17 (the rate limit) moved to the Offline packet's O2 (4.7). D21(b) freezes the portal's reservation channel; its branch of `s/[token]/page.tsx` stays byte-identical. D21(b) keeps the shop (WORK_ORDER) channel "fully maintained", so 4.3b edits that branch only. Security hardening applies to both (D21: "security ≠ features").

4.1 **Text limits: trim, never refuse** (`src/app/api/s/[token]/transition/route.ts:10-27`, the live route; BS-4). The portal page can't show a field error, and a cached 400 locks its fixed key (`${token}:${action}`, `s/[token]/page.tsx:117`): every later try of that action would get 422 "already used", and the page renders the error object as a React child (`:121`). In both schemas (`lineActionSchema`, `requestActionSchema`):
- `actorLabel: z.string().min(1, 'Please enter your name').transform((s) => s.slice(0, 120))`
- `note: z.string().optional().transform((s) => s?.slice(0, 2000))`
- In `lineActionSchema` only: `denyReason` and `stagedCondition`: `z.string().optional().transform((s) => s?.slice(0, 500))`.
- An empty name is still a 400, as today (the page checks it before sending). `applyTransition` already trims the whole-request fields (`status-links.ts:257-258`); the line path stored them untrimmed.
- **The admin line route too** (owner, round 7: the portal limits bind an admin who fills a line). In `src/app/api/deployment-requests/[id]/lines/[lineId]/route.ts`, `schema` (`:13-15`) gets the same three transforms, under the comment `// P1-2 S4 (D-S3, owner round 7): the portal's text limits bind an admin too. Trimmed, never refused.`:
  - `denyReason` and `stagedCondition`: `.transform((s) => s?.slice(0, 500))`
  - `note`: `.transform((s) => s?.slice(0, 2000))`
  - It has no `actorLabel` (the actor is the admin's user id).
  - Rev 2 capped the quantity there (4.2, shared `setLineFulfillment`) but left the text unbounded. On the scratch clone, rev 2's route stored a 501-character deny reason whole; with this change it stores 500.

4.2 **A line takes only what its checklist offers** (`src/lib/deployment-requests.ts`, `setLineFulfillment`):
- Add `l."resolvedUnitId"` to the SELECT (`:360-363`) and `resolvedUnitId: string | null` to its type (`:349-358`).
- After the serialized check (`:377`):
```ts
  // P1-2 S4 (B3-12, D-S3): a line takes only what its checklist (getLineChecklist) offers.
  if (input.resolvedUnitId && input.resolvedUnitId !== line.resolvedUnitId) {
    const ok = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM "inventory_units" u
      WHERE u."id" = ${input.resolvedUnitId} AND u."inventoryItemId" = ${line.specificInventoryItemId}
        AND ${pickableUnitSql('u')}`
    if (ok.length === 0) return { ok: false, error: "That unit isn't one this line can take." }
  }
  if (input.substitutedItemId) {
    const ok = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM "inventory_items" sub JOIN "inventory_items" orig ON orig."id" = ${line.specificInventoryItemId}
      WHERE sub."id" = ${input.substitutedItemId} AND sub."id" <> orig."id" AND sub."categoryId" = orig."categoryId"
        AND orig."itemType" = 'CONSUMABLE' AND sub."itemType" = 'CONSUMABLE' AND sub."deletedAt" IS NULL`
    if (ok.length === 0) return { ok: false, error: "That item can't stand in for this line." }
  }
  if (input.fulfilledQty != null && input.fulfilledQty > line.requestedQty) {
    return { ok: false, error: `No more than ${line.requestedQty} — the quantity asked for.` }
  }
```
- `orig."itemType" = 'CONSUMABLE'` (CS-21): the checklist offers substitutes only on consumable lines, so a serialized line takes none. On the scratch clone this broke nothing beyond the two `p1-1d-staged-ready` seeds below.
- The same rules hold on the admin route (`src/app/api/deployment-requests/[id]/lines/[lineId]/route.ts:44`), which shares the function. That is the owner's decision (round 7: text trimmed, quantity no more than requested, for an admin too), not an interpretation. The text half is in that route's own schema (4.1).
- `src/components/shared/FulfillmentChecklist.tsx:231`: `inputProps={{ min: 1, max: line.requestedQty }}`. Leave `onChange` (`:233`) unclamped, so the server's message shows and `tests/components/FulfillmentChecklist.test.tsx:47-53` (asked 2, typed 5) passes unchanged. The new errors are strings, so the checklist's `{error}` (`:254`) renders them.

4.3 **Links die with their subject; a closed repair's shop link takes the invoice number only** (`src/lib/status-links.ts`, §0-t; owner round 7 amends the exposure rule "a shop's link stops working once the repair is closed"):
- `RESOLVE_INCLUDE` (`:159-171`) adds `deploymentRequest: { select: { status: true } },`. The task's `include` already brings `status`, `deletedAt`, `completedAt` and `invoiceNumber`.
- Replace `isLinkActionable` (`:187-192`) with:
```ts
/** P1-2 S4 (D-S3, owner round 7): after its repair closes, a shop link takes the invoice number for this long. */
export const INVOICE_DAYS_AFTER_CLOSE = 30

type LinkGate = {
  type: string
  state: string
  expiresAt: Date
  maintenanceTask?: { status: string; deletedAt: Date | null; completedAt: Date | null; invoiceNumber: string | null } | null
  deploymentRequest?: { status: string } | null
}

/** P1-2 S4 (B3-12, D-S3): a link stops when its repair closes or its request ends. invoiceOnly() is the one exception. */
export function subjectClosed(link: Pick<LinkGate, 'maintenanceTask' | 'deploymentRequest'>): boolean {
  const t = link.maintenanceTask
  if (t && (t.status === 'COMPLETED' || t.deletedAt)) return true
  const r = link.deploymentRequest
  return !!r && ['FULFILLED', 'CANCELLED', 'DENIED'].includes(r.status)
}

/**
 * P1-2 S4 (D-S3, owner round 7): a repair closed by an admin or by an operator's field fix keeps its
 * shop link for the invoice number only, while the repair has none, for 30 days from the close, even
 * past the link's own end date. A revoked link, a link that had run out before the close, and a
 * deleted repair stay dead.
 */
export function invoiceOnly(link: LinkGate, now = Date.now()): boolean {
  const t = link.maintenanceTask
  if (link.type !== 'WORK_ORDER' || link.state === 'REVOKED' || !t || t.deletedAt || t.status !== 'COMPLETED' || !t.completedAt) return false
  if (t.invoiceNumber?.trim()) return false
  if (link.expiresAt.getTime() <= t.completedAt.getTime()) return false
  return now < t.completedAt.getTime() + INVOICE_DAYS_AFTER_CLOSE * 86_400_000
}

/** Terminal/blocked states a recipient can no longer act on. */
export function isLinkActionable(link: LinkGate): boolean {
  if (invoiceOnly(link)) return true
  if (link.state === 'REVOKED' || link.state === 'COMPLETED' || link.state === 'EXPIRED') return false
  if (subjectClosed(link)) return false
  if (link.expiresAt.getTime() < Date.now()) return false
  return true
}
```
- A link the shop already marked completed (state `COMPLETED`) still takes the invoice after the close: the shop's "Mark completed" usually comes first. Before the close it takes nothing, as today.
- **`applyTransition`**, the gate (`:245-259`) becomes:
```ts
  // P1-2 S4 (D-S3, owner round 7): after the repair closes, the shop's link takes the invoice number only.
  const invoiceWindow = invoiceOnly(link)
  const stateTerminal = link.state === 'REVOKED' || link.state === 'COMPLETED' || subjectClosed(link)
  const expired = link.state === 'EXPIRED' || link.expiresAt.getTime() < Date.now()
  if (!invoiceWindow && (stateTerminal || (expired && !opts?.bypassExpiry))) {
    return { ok: false, status: 409, error: 'This link is no longer active.' }
  }
  const action = input.action.toUpperCase()
  if (!ALLOWED_ACTIONS[link.type].includes(action)) {
    return { ok: false, status: 400, error: 'Action not permitted for this link.' }
  }
  if (invoiceWindow && action !== 'INVOICED') {
    return { ok: false, status: 409, error: 'This repair is closed. You can still add your invoice number.' }
  }
  const actorLabel = input.actorLabel.trim().slice(0, 120) || 'recipient'
  const note = input.note?.trim().slice(0, 2000) || null
  const now = new Date()
  // P1-2 S4 (D-S3): Submit invoice # needs the number. 422, not 400: withIdempotency caches a 400
  // under the page's fixed key (`${token}:INVOICED`), and the retry with the number would be refused.
  const invoiceNumber = action === 'INVOICED' ? (note ?? '').slice(0, 100) : ''
  if (action === 'INVOICED' && !invoiceNumber) {
    return { ok: false, status: 422, error: 'Type the invoice number, then tap Submit invoice # again.' }
  }
```
- **The invoice write.** `await prisma.$transaction(async (tx) => {` (`:273`) becomes `const outcome = await prisma.$transaction(async (tx) => {`, and its first statement, before "Record the event first", is:
```ts
    // P1-2 S4 (D-S3): the invoice number only fills an empty Invoice #. It never replaces one already
    // recorded (by an admin, or sent before), and it is the only field INVOICED writes. Checked
    // first, so a refused number records no event.
    if (action === 'INVOICED' && link.type === 'WORK_ORDER' && link.maintenanceTaskId) {
      const filled = await tx.maintenanceTask.updateMany({
        where: { id: link.maintenanceTaskId, deletedAt: null, OR: [{ invoiceNumber: null }, { invoiceNumber: '' }] },
        data: { invoiceNumber },
      })
      if (filled.count === 0) return 'invoice-taken' as const
    }
```
  - The `INVOICED` branch (`:294-305`) drops its `maintenanceTask.update` (written above). Its link update becomes `data: invoiceWindow ? { state: 'COMPLETED', completedAt: link.completedAt ?? now, actedAt: now } : { state: 'ACTED', actedAt: now }`: after the close the link's work is done. Its bell body becomes `` `${actorLabel} submitted an invoice (#${invoiceNumber})${invoiceWindow ? ' after the repair was closed' : ''}.` ``.
  - The callback ends with `return 'done' as const` (just before its `})`, `:344`). Right after the transaction: `if (outcome === 'invoice-taken') return { ok: false, status: 409, error: 'This repair already has an invoice number. If it needs changing, please contact Agricarbon.' }`.
  - The conditional `updateMany` is what stops an overwrite: an admin who saves an invoice number between the shop's page load and its Submit wins, and the shop gets the 409.
- The admin's hub Receive passes HUB_RETURN links, which have neither subject, so it's unaffected.
- **`src/app/api/s/[token]/route.ts`:** import `invoiceOnly`. After `const state` (`:33`), before `if (!actionable)` (`:41`):
```ts
  // P1-2 S4 (D-S3, owner round 7): a closed repair's link offers the invoice number only, and shows
  // only what names the job (no problem notes, serial number or return address).
  if (invoiceOnly(link) && link.maintenanceTask) {
    const t = link.maintenanceTask
    return NextResponse.json({
      type: link.type,
      state: link.state,
      actionable: true,
      invoiceOnly: true,
      allowedActions: ['INVOICED'],
      recipientName: link.recipientName,
      label: LINK_LABELS[link.type],
      subject: { kind: 'work_order', taskName: t.taskName, asset: t.vehicle?.name ?? t.item?.name ?? 'Equipment' },
    })
  }
```
  The portal GET already serves no details for a non-actionable link (`:35-49`).
- **The close.** Every close path sets `completedAt` through `closeDamageTask` (`maintenance.ts:305`): an admin's Close repair (`/complete`), the PATCH to COMPLETED, and an operator's field fix. So the 30 days count from the real close, whoever closed it. Reopen clears `completedAt` (`:295`), and the link follows the open-repair rules again. A scheduled task's Complete & reschedule never sets COMPLETED, so its link is unaffected. A scheduled task set to COMPLETED by the PATCH without a `completedAt` gets no window: its link stops, as in rev 2.
- **Where the admin records the invoice number:** the repair's details (Invoice #, then Save details: `admin/maintenance/page.tsx:789`, `saveDraft` `:403-418`, `PATCH /api/maintenance/[id]`), before or after the close. The Close repair dialog (`:1087-1140`) has no invoice field. Rev 2 said it had.
- Scratch clone (rev 3): the code above, as written, passed every case of `tests/p1-2s4-shop-invoice.test.ts` below.

4.3b **The shop's page after the close** (`src/app/s/[token]/page.tsx`, the shop branch only):
- `Context` (`:45-54`) gains `invoiceOnly?: boolean` with the comment `// P1-2 S4: the repair is closed; the link takes the invoice number only.`
- In the non-reservation return, the actionable test (`:298`) gets a middle branch at `:307` (`) : (`), between the dead-link card and the `Update status` card:
```tsx
      ) : ctx.invoiceOnly ? (
        // P1-2 S4 (D-S3, owner round 7): after the repair is closed, the invoice number is all the link takes.
        <div style={card}>
          <p style={{ marginTop: 0 }}>This repair is closed. You can still add your invoice number.</p>
          <label style={{ fontSize: 13, color: color.inkSoft }}>Your name</label>
          <input value={actorLabel} onChange={(e) => setActorLabel(e.target.value)} placeholder="e.g. Joe at Eastside Repair"
            style={inputStyle} />
          <label style={{ fontSize: 13, color: color.inkSoft }}>Invoice number</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
          {error && <p style={{ color: color.errorAlt, fontSize: 14 }}>{error}</p>}
          <button disabled={submitting} style={btn}
            onClick={() => { if (!note.trim()) { setError('Please enter the invoice number first.'); return } setChosen('INVOICED'); void submit('INVOICED') }}>
            {submitting ? 'Submitting…' : ACTION_LABELS.INVOICED}
          </button>
        </div>
```
- What the shop sees, in order:
  - Before the close: the page as today.
  - After the close: the work-order card (asset and `Work: <task>`, with no problem notes, serial number or return address), then `This repair is closed. You can still add your invoice number.`, `Your name`, `Invoice number` and one button, `Submit invoice #`.
  - After Submit: today's `✓ Thank you` card. Opened again: `This has been completed — thank you.`
  - After 30 days, or once an admin has recorded the invoice number: today's dead-link text (`No further action is available.`, or `This link has expired…`, or `This has been completed — thank you.` if the shop had marked it completed).
- The reservation branch (`:150-281`) stays byte-identical (§5 grep). No new hex colours (the page is under the hex rule; tokens only).

4.4 **Delete `src/app/s/[token]/transition/route.ts`** (36 lines, no callers) with `git rm "src/app/s/[token]/transition/route.ts"` (that also stages the deletion). It's a second public write path under the same idempotency scope, outside `/api/`, so S1's cross-site check doesn't cover it. The page posts to `/api/s/…` (`src/app/s/[token]/page.tsx:115,179,208`).
- Then `rm -rf .next` before §5's `npx tsc --noEmit` (SX-11). `tsconfig.json` includes `.next/types/**`, and an earlier build's types for this route still import the deleted file: the practice build's tsc failed with 3 × TS2307 until `.next` was rebuilt. CI starts without `.next`, so only a local run hits it.

4.5 **Agreements download** (`src/app/api/photos/[...path]/route.ts:34-40`): add `...(contentType === 'application/pdf' ? { 'Content-Disposition': 'attachment; filename="document.pdf"' } : {})` to the headers. Read access is unchanged: no writer sets a daily-check photo. The View agreement button (`admin/vehicles/page.tsx:750-752`) keeps its label.

4.6 **Size before buffering** (`src/app/api/uploads/route.ts`, before `:17`):
```ts
  // P1-2 S4 (B3-14): refuse an oversized body before buffering it.
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_SIZE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }
```
Keep the check at `:28`. Cloud Run's own request cap bounds chunked bodies.

4.7 **Moved to the Offline packet (O2): the per-operator limit on notifying writes (B3-17).** It must not start before O2's slower retries. Before O2, the queue retries a 429 every 30 s and shows "Failed after 8 attempts" about 4 minutes later, while the limit's window is a clock hour (`rate-limit.ts:60`), so an operator could Discard a real report (BS-5). After O2 the retries span 61.5 minutes and outlast it. O2 builds it from the text in §9. S4 touches neither `src/lib/rate-limit.ts` nor the four routes.

**Not touched:** the reservation branch of `src/app/s/[token]/page.tsx` (`:150-281`, D21(b)); `src/lib/maintenance.ts` and the field-fix route (every close already sets `completedAt`).

**Files (stage these only):** `src/app/api/s/[token]/transition/route.ts`, `src/app/api/s/[token]/route.ts`, `src/app/s/[token]/page.tsx`, `src/app/api/deployment-requests/[id]/lines/[lineId]/route.ts`, `src/lib/deployment-requests.ts`, `src/lib/status-links.ts`, `src/components/shared/FulfillmentChecklist.tsx`, `src/app/api/photos/[...path]/route.ts`, `src/app/api/uploads/route.ts`, and the tests below. Size **M** (about +295 / −55).
- **Deleted, already staged by `git rm` (4.4):** `src/app/s/[token]/transition/route.ts`. Never name it in `git add` (SX-8). After committing, `git show --stat HEAD` lists every file above plus the deletion (15 in the practice build).

**Tests.**
- **Node** `tests/p1-2s4-portal-bounds.test.ts` (harness as `tests/fnd6-public-link-gate.test.ts`):
  - A unit of another item → 400. qty = requested + 1 → 400. A substitute from another category, or a serialized one → 400. A consumable substitute on a serialized line → 400 (CS-21).
  - Trim (BS-4): on a shop link, a 121-character `actorLabel` and a 2001-character note → 200, and the `status_link_events` row stores 120 and 2000 characters. On a hub line, a 501-character deny reason and a 2001-character note → 200, stored as 500 and 2000. An empty name → 400. (All passed on the scratch clone.)
  - After the request is cancelled, the link's GET returns `actionable: false`, and a line action → 409.
  - The admin line route (owner, round 7): qty above requested → 400 `No more than <n> — the quantity asked for.` A 501-character deny reason and a 2001-character note → 200, stored as 500 and 2000. A 501-character condition → stored as 500. (Passed on the scratch clone, rev 3; rev 2's route stored 501.)
- **Node** `tests/p1-2s4-shop-invoice.test.ts` (round 7; harness as `tests/fnd6-public-link-gate.test.ts`, with the session mock of `tests/cc10-field-fix.test.ts` for the field fix and the admin PATCH; mock only `createAlert` and `resolveActiveAlert`). Give each request its own `x-forwarded-for`: the portal allows 60 calls per IP in 5 minutes. A vehicle repair, `AT_SHOP`, with `notes`, an estimate and a PO, and a WORK_ORDER link:
  1. **After close, within 30 days.**
     - Closed by `closeDamageTask(COMPLETED)`: GET → `actionable: true`, `invoiceOnly: true`, `allowedActions: ['INVOICED']`; the `subject` keys are exactly `[asset, kind, taskName]`, and the body doesn't contain the notes. `INVOICED` with note `  INV-77  ` → 200: `invoiceNumber` is `INV-77`, the link is `COMPLETED`, and each admin has one `Shop invoiced — …` bell ending `after the repair was closed.` The next GET → `actionable: false`. A second number → 409, and `INV-77` stays.
     - Closed by a field fix from an operator of another crew (round 7), after the shop had tapped Mark completed (link `COMPLETED`): GET → `invoiceOnly: true`, and `INVOICED` → 200.
     - Closed 10 days ago, with the link's own `expiresAt` 1 day ago → still takes it. Each of these → GET `actionable: false`, then `INVOICED` → 409, `invoiceNumber` stays null, and the INVOICED call adds no event: a link whose `expiresAt` was before the close, a revoked link, a deleted repair. The GET itself records a `VIEWED` event (`markViewed`), so count the events after the GET and compare after the INVOICED call (SX-10).
     - An empty number → 422 and no event row. The same `Idempotency-Key` with `INV-5` → 200 (a 422 isn't cached).
  2. **After 30 days.** `completedAt` 31 days ago → GET `actionable: false`, with no `invoiceOnly`. `INVOICED` → 409, and `invoiceNumber` stays null.
  3. **After an admin records the invoice.**
     - `PATCH /api/maintenance/[id] { invoiceNumber: 'ADMIN-9' }` as an admin → GET `actionable: false`, `INVOICED` → 409, and `ADMIN-9` stays.
     - Race: a link resolved before the PATCH and passed to `applyTransition` after it → 409 `…already has an invoice number…`. `ADMIN-10` stays, and no event row is added.
     - Before the close: an open repair with an admin's number → 409, and the number stays. An open repair without one → 200, the link `ACTED` (regression guard).
  4. **Trying to change anything else after close.** `RECEIVED`, `IN_PROGRESS` and `COMPLETED` → each 409 `This repair is closed. You can still add your invoice number.`, with no event row, and the repair row and link state unchanged. `INVOICED` with extra keys (`status`, `actualCost`, `notes`, `invoiceNumber: 'EVIL'`, `taskName`) and note `INV-9` → 200. Every column except `invoiceNumber` and `updatedAt` equals the snapshot taken before, and `invoiceNumber` is `INV-9`.
  - All passed on the scratch clone (rev 3).
- **UI** `tests/components/p1-2s4-shop-invoice-page.test.tsx` (fetch stub). The page reads `use(params)`, so render inside `await act(async () => { render(<Suspense fallback={null}>…</Suspense>) })`.
  - The invoice-only reply → `This repair is closed. You can still add your invoice number.`, an `Invoice number` box, and exactly one button, `Submit invoice #`. No `Update status`.
  - An empty box → `Please enter the invoice number first.` and no POST. With `INV-42` → one POST to `/api/s/tok/transition` with `{ action: 'INVOICED', actorLabel, note: 'INV-42' }`, then the Thank you card.
  - An open repair's reply still shows `Update status` and 4 buttons (regression guard).
  - Passed on the scratch clone (rev 3).
- **Node** `tests/p1-2s4-photos-uploads.test.ts`:
  - Mock `@/lib/supabase/admin` to return a PDF Blob → the response has the `attachment` header; an image doesn't.
  - A `content-length` of 20 MB → 413, and `req.formData` (spied) is never called.
- **Change** `tests/p1-1d-staged-ready.test.ts`. Two cases seed a **serialized** substitute through `setLineFulfillment` (`makeReservation`, `:71`, used at `:391` and `:627`), which the portal now refuses. Seed those two lines by SQL instead (`UPDATE "deployment_request_lines" SET "fulfillmentStatus" = 'EDITED', "substitutedItemId" = … WHERE "id" = …`), with the comment `legacy row: the portal no longer accepts a serialized substitute (P1-2 S4)`. Their assertions stay. Re-grep: the merged P1-1d may differ from the dry run.
- **Must pass unchanged:** `tests/fnd6-public-link-gate.test.ts` (asked 3, confirms 3), `tests/f3-line-checklist.test.ts`, `tests/ur010-hold-through-claim.test.ts`, `tests/r4-hub-stock-reserve.test.ts`, `tests/cc34-schedules-and-alerts.test.ts:138-157` (a shop COMPLETED on an open task), `tests/cc31-alert-autoresolve.test.ts:130-149`, `tests/cc31-expired-hub-return.test.ts`, `tests/cc10-field-fix.test.ts`, `tests/pr3a-status-owner-routes.test.ts`, `tests/ur005b-photo-proxy.test.ts`, `tests/uxp3-photos-d36.test.ts`, `tests/components/FulfillmentChecklist.test.tsx`.

**Behaviour changes (PR body):**
- The hub portal and Admin → Requests take only a unit of the line's item that is pickable, a same-category consumable substitute on a consumable line, and at most the requested quantity. On Requests that is the owner's decision (round 7).
- Portal text over its limit is trimmed, never refused: name 120 characters, note 2000, deny reason and condition 500. Admin → Requests trims a line's note, deny reason and condition the same way (owner, round 7).
- A request link stops once the request is Fulfilled, Cancelled or Denied.
- A shop link, once its repair is closed (by an admin, or by an operator's field fix), takes only the invoice number, for 30 days from the close, while the repair has none. Then it stops. Its page shows one line, a name box, an invoice box and one button, and no longer shows the problem notes, serial number or return address.
- Submit invoice # needs a number (422 when empty, so the page can try again). The number is cut to 100 characters. It only fills an empty Invoice #, before or after the close: it never replaces one already recorded.
- `/s/<token>/transition` (no callers) is gone.
- A PDF opens as a download.
- An upload over 10 MB is refused before it's read.

**Interpretations (PR body):**
- "Until an admin records it" (round 7) is read as "until the repair has an invoice number": the shop's own number ends it too. The page can only send one, and an admin corrects a wrong one in the repair's details. This is the owner's default, applied; the owner may still object (§0).
- The 30 days count from the close (`completedAt`), even past the link's own end date, for a link that was still live at the close. A link the shop marked completed counts as live.
- Before the close, too, the shop's number never replaces one already recorded (round 7: "can't overwrite one an admin already recorded").

**Acceptance (app screens).** State Active Deployments first.
1. (session) Admin → Requests → a test reservation line → Edit → a quantity above the requested → `No more than <n> — the quantity asked for.`
2. (session) A test rental with an agreement PDF → View agreement downloads it.
3. (session) A test vehicle's repair → Send WO to a test address → Copy link → Close repair… → open the link in a private window. It reads `This repair is closed. You can still add your invoice number.`, with one button, `Submit invoice #`. Enter `ZZ P1-2 shop (throwaway)` and `ZZ-INV-1` → Thank you. The repair's details show Invoice # `ZZ-INV-1`, and the link now says `This has been completed — thank you.`
4. (session) A second test vehicle's repair: Send WO → Copy link → Close repair… → type an Invoice # in its details → Save details. Its link then says `No further action is available.`

Limits, units and substitutes, an operator's close, the 30 days and the race: node tests only.

---

## 5 · Gate (every PR, before opening it)

`npx prisma generate` · `rm -rf .next` (an older build's `.next/types` can import a file the PR deleted, and `tsconfig.json` includes them; CI starts without `.next`; SX-11) · `npx tsc --noEmit` (0) · `npx eslint .` (0 errors; no new warnings in touched files; state the count. The Eastern-time dry run had 49 warnings and 0 errors. In files S touches: `users/page.tsx` (4), `setup-account` (1), `DailyCheckViewer` (1), the admin dashboard (1), `vehicles/page.tsx` (2), `inventory/page.tsx` (3), `maintenance/page.tsx` (1), `s/[token]/page.tsx` (0, rev 3 scratch clone). Re-count on the base. Practice build: 49 → 47 at S1 (`users/page.tsx` 4 → 3, `setup-account` 1 → 0), then 47 through S4.) · `npm run test:ui` (green) · `npm run build` · `wc -l "src/app/(operator)/operator/my-deployment/page.tsx"` (1454, unchanged) · S2: `bash scripts/check-migration-safety.sh "origin/development"` **after** committing (the script isn't executable: without `bash` it gives `Permission denied`; SX-3).
- The DB suite runs in CI. State both suites' base and new counts. The `.test.ts` files under `tests/components` run in both suites. A local Postgres must run in UTC, as CI's does.
- Under heavy load the UI suite's 5 s timeouts flake (STATUS §6). Re-run a failing untouched file alone before reading anything into it.
- The DB suite's `tests/f3-line-checklist.test.ts` "uses fulfilledQty and effective item for reserves" can flake (`expected 4 to be 5`). Its three lines are inserted in one transaction, so they share `createdAt`, and its `ORDER BY "createdAt"` can swap the two item-A lines. Seen once in rev 3's full run; 6 of 6 runs alone passed. The same flake can also read `expected { ok: false, … } to deeply equal { ok: true }` (seen once in the practice build's S4 run; 3 of 3 alone passed; SX-16). It's an untouched test and not S's to fix: re-run it alone.

Anchor greps:
- **Every PR:** `grep -rnE "D-S[0-9]" src tests` → 0 (the real decision numbers are written instead).
- **After S1:**
  - `grep -c "failedPinAttempts: { lt: MAX_ATTEMPTS }" src/lib/auth/pin.ts` → 1, `grep -c "failedPinAttempts: { gte: MAX_ATTEMPTS }" src/lib/auth/pin.ts` → 1, and `grep -n "lastLoginAt:" src/lib/auth/pin.ts` → 0.
  - `grep -n "SESSION_DURATION / 2" src/lib/auth/session-edge.ts` → 0, and `grep -c RENEW_AFTER_SECONDS src/lib/auth/session-edge.ts` → ≥ 2.
  - `grep -n "tokenVersion: { increment: 1 }" src/app/api/auth/change-pin/route.ts` → 1.
  - `grep -c isCrossSite src/proxy.ts` → ≥ 2, `grep -c renewable src/proxy.ts` → ≥ 2, and `grep -n "startsWith('/api/auth/')" src/proxy.ts` → 0.
  - `grep -c SIGNED_OUT_COOKIE src/proxy.ts src/lib/auth/session.ts src/lib/auth/session-edge.ts` → each ≥ 1.
  - `grep -c SIGN_IN_ACTIONS src/lib/audit.ts src/app/api/users/audit/route.ts src/app/api/cron/dispatch/route.ts` → each ≥ 1.
  - `grep -rn "setup-account?token=" src` → 0, and `grep -n "const appUrl" src/app/api/users/invite/route.ts "src/app/api/users/invite/[id]/route.ts" src/app/api/users/bulk/route.ts` → 0.
  - `grep -c beforeSend src/components/shared/SentryProvider.tsx src/instrumentation.ts` → each 1, and `grep -c next-router-state-tree src/lib/sentry-scrub.ts` → ≥ 1.
  - `grep -cF '((?:^|[?&#])token=)' src/lib/sentry-scrub.ts` → 1 (SX-1).
- **After S2:**
  - `grep -n isOwner prisma/schema.prisma` → 1.
  - `grep -c adminPasswordSchema src/lib/validation.ts src/app/api/auth/change-pin/route.ts "src/app/api/users/[id]/route.ts" src/app/api/users/invite/complete/route.ts` → each ≥ 1.
  - `grep -n "credential.length < 8" src/app/api/users/invite/complete/route.ts` → 0.
  - `grep -n "'/admin/account'" src/proxy.ts src/components/admin/AdminNav.tsx` → each ≥ 1.
  - `grep -c "no Owner is set yet" "src/app/api/users/[id]/route.ts"` → 1, and `grep -c "PASSWORD_RESET" "src/app/api/users/[id]/route.ts"` → 1.
  - `grep -n "Owner account recovery" PILOT_ROLLBACK.md` → 1.
- **After S3:**
  - `ls src/lib/supabase` → `admin.ts` only.
  - `grep -rn SUPABASE_ANON_KEY src .github Makefile README.md PROD_CUTOVER_RUNBOOK.md` → 0, and `grep -n "all 11" PROD_CUTOVER_RUNBOOK.md` → 0.
  - `grep -n '"@supabase/ssr"' package.json` → 0.
  - `grep -n 'u."email"' src/lib/deployment-assignments.ts` → 0.
  - `grep -c "as Record<string, unknown>" src/lib/role-fields.ts` → 1 (rev 3: the typed `const out` fails `tsc`).
  - `grep -n "vehicle: true" src/app/api/daily-check/route.ts` → 0.
  - `grep -c "forRole(" src/app/api/vehicles/route.ts "src/app/api/vehicles/[id]/route.ts" src/app/api/maintenance/route.ts "src/app/api/maintenance/[id]/route.ts" src/app/api/inventory/route.ts "src/app/api/inventory/[id]/route.ts" "src/app/api/vehicles/[id]/report-damage/route.ts" "src/app/api/inventory/units/[unitId]/report-problem/route.ts" src/app/api/maintenance/field-fix/route.ts` → each ≥ 1.
- **After S4:**
  - `ls "src/app/s/[token]/transition"` → no such directory.
  - `grep -c subjectClosed src/lib/status-links.ts` → ≥ 3.
  - `grep -c invoiceOnly src/lib/status-links.ts` → ≥ 4, and `grep -c invoiceOnly "src/app/api/s/[token]/route.ts" "src/app/s/[token]/page.tsx"` → each ≥ 2.
  - `grep -c "This repair is closed. You can still add your invoice number." src/lib/status-links.ts "src/app/s/[token]/page.tsx"` → each 1, and `grep -c "invoiceNumber: null" src/lib/status-links.ts` → 1.
  - `git diff -U0 origin/development -- "src/app/s/[token]/page.tsx" | grep "^@@"` → 2 hunks (`Context` and the shop branch), none inside `if (isRes) {`.
  - `grep -n "\.max(" "src/app/api/s/[token]/transition/route.ts"` → 0, and `grep -c "slice(0, " "src/app/api/s/[token]/transition/route.ts"` → 6.
  - `grep -c "slice(0, " "src/app/api/deployment-requests/[id]/lines/[lineId]/route.ts"` → 3.
  - `grep -c "orig.\"itemType\" = 'CONSUMABLE'" src/lib/deployment-requests.ts` → 1.
  - `grep -rn limitNotifyingWrite src` → 0 (it is O2's).
  - `grep -c attachment "src/app/api/photos/[...path]/route.ts"` → 1.
  - `grep -c content-length src/app/api/uploads/route.ts` → 1.

PR title `P1-2 Sx · <plain outcome>`. Body:
- what and why, with finding IDs;
- **Behaviour changes** and **Interpretations**;
- the decision numbers used (`D-S1 = Dnn`, …);
- tests changed outside this packet's lists;
- my-deployment line count;
- lint warning count.

## 6 · Owner steps and reads

### Do now, before S1 (read only, then one switch)

Use the staging project (D16); prod isn't set up yet (D1). Nothing here needs code.

**E3b-1 · Security Advisor (read only).** Supabase → Advisors → Security Advisor. Note every "RLS Disabled in Public" error and how many tables it lists. Take a screenshot. Nothing to undo.

**E3b-2 · Data API settings (read only).** Integrations → Data API (older dashboards: Project Settings → API). Note whether **Enable Data API** is on, and in its settings whether `public` is listed under **Exposed schemas** and whether **Automatically expose new tables** is on. Nothing to undo.

**E3b-3 · Four lookups (read only).** SQL Editor. Run them one at a time and don't save them. Nothing to undo.
```sql
select c.relname as table_name, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;

select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by 1, 2 order by 1, 2;

select tablename, tableowner from pg_tables where schemaname = 'public' order by 1;
select rolname, rolsuper, rolbypassrls from pg_roles
where rolname in ('postgres', 'anon', 'authenticated', 'service_role');
```

**E3b-4 · Read the result.** If the Data API is on, `public` is exposed, `anon` can SELECT `users`, and `rls_on` is false for `users`, then anyone holding the public key can read everyone's PIN and password hashes. That is Critical: do E3b-5 at once and tell the session.

**E3b-5 · Turn the Data API off (today).** Integrations → Data API → **Enable Data API** off. The app never uses it.
- Then check, with the app open in a tab: open a maintenance task that has a photo (it must load: photos use the private key, not the Data API), and `/api/health` must say OK.
- **Undo:** the same switch back on. Do it at once if either check fails.
- If you'd rather keep the Data API on: remove `public` from Exposed schemas instead. Undo: add it back.

**E3b-6 · Mapbox (read only).** In the Mapbox account → Tokens, find the token stored as `AHITS_MAPBOX_TOKEN` (the map pages send it to the browser). Check that it starts with `pk.` and that its URL restrictions list the staging address. If you add a restriction, the undo is to remove it.

**E3b-7 · Don't change the JWT secret in Supabase.** It also changes the private key the app uses for photos, and photos break. With the Data API off, the public key can't read anything. Locking every table down further is later work (P2).

**Sign-in log check (read only, once).** Cloud Run → `ahits-web-app-staging` → Logs. Filter for `POST /api/auth/login` as far back as the logs go (at least since 2026-10-22), and look for IP addresses you don't recognise. Nothing to undo.

**Do-now notes stay true until their PR ships:**
- Reset PIN doesn't unlock: also tap Unlock PIN (until S1).
- After a Reset PIN: the operator sets the new PIN, opens the Outbox and taps Retry, not Discard (until O2).
- No Reset PIN, Change PIN or role change on an admin; add admins by invite (until S2).

### After each PR

**S1-1 · After S1 deploys (2 minutes):** sign in once. In Team → Activity → Sign-ins, the top row's IP should be your own public IP (compare with any "what is my IP" page). If it shows a Google address instead, tell the session "sign-in IP is wrong"; it is a one-line setting. Nothing to undo: it's a read.

**S2-0 · Before S2 (read only, Supabase SQL Editor):**
```sql
-- who is an admin today
SELECT id, name, email, "isActive", "mustChangePin", "lastLoginAt" FROM users WHERE role = 'ADMIN' ORDER BY name;
```

**S2-1 · Right after S2 deploys, when the session asks: set the Owner mark (once).** Use the email you sign in to AHITS with.
```sql
UPDATE users SET "isOwner" = true
WHERE email = '<your AHITS admin email>' AND role = 'ADMIN' AND "isActive" = true;
-- expect: UPDATE 1. Then check (one row: you):
SELECT name, email FROM users WHERE "isOwner";
```
If it says `UPDATE 0`, run S2-0 again and copy your email exactly as it is listed there.
**Undo**, or to move the mark (run this first, then S2-1 with the new email):
```sql
UPDATE users SET "isOwner" = false WHERE "isOwner";
```
A second Owner fails with `duplicate key value violates unique constraint "users_one_owner"`. That means run the undo first. Until S2-1, the app refuses admin password resets (§0-g).

**S2-2 · After S2-1: rotate admin passwords (finishes #269).** Each admin opens Change password (above Sign out) and sets a new one. An admin who forgot theirs: you (the Owner) reset it on Team. Before the mark is set, any admin can demote them to operator and promote them back with a temporary password.

**S2-3 · Take your account back yourself (Supabase SQL Editor; no other admin needed).** Use it if you can't sign in, for example after someone else reset your password. It works once S2 is live. The same steps are in `PILOT_ROLLBACK.md` §4.
1. Check that the password tool is there (read only; expect one row):
   ```sql
   select extname from pg_extension where extname = 'pgcrypto';
   ```
   If there's no row: Database → Extensions → `pgcrypto` → Enable. Undo: Disable it again.
2. Pick a temporary password of 8+ characters, without the `'` character, and run:
   ```sql
   UPDATE users SET "pinHash" = extensions.crypt('<temporary password>', extensions.gen_salt('bf', 12)),
     "mustChangePin" = true, "failedPinAttempts" = 0, "pinLockedAt" = NULL, "tokenVersion" = "tokenVersion" + 1
   WHERE "isOwner";
   -- expect: UPDATE 1
   ```
   `UPDATE 0` means the Owner mark isn't set: use `WHERE email = '<your AHITS admin email>' AND role = 'ADMIN'` instead.
3. Sign in on the Admin tab with the temporary password. You land on Change your password: choose your own.
4. Then look at Team → Activity (Sign-ins and Account changes) for anything done from your account, and reset any admin password that was changed.
- What it does: a new password only you know, any lock cleared, and every device signed out, including anyone else using your account. It was checked on a test database: the app signed in with the password it set.
- **Undo:** there's nothing to put back. If you ran it by mistake, sign in with the temporary password and choose your old password again.

**E3-after · The old public key's stored copy (after S3).** Keep `AHITS_NEXT_PUBLIC_SUPABASE_ANON_KEY` in Google Secret Manager: an older app version still needs it if we ever roll back to it. Delete it once no version you'd roll back to lists it (Cloud Run → `ahits-web-app-staging` → Revisions → each one's Variables & Secrets). **Undo:** recreate it from Supabase → Project Settings → API keys → `anon`.

**Owner to know:**
- Until staging emails work (D15), the "your password was reset" email can't reach you. The bell message and Team → Activity still do (accepted risk 2, §0).
- Sign out on one phone ends that phone's sign-in only. "Log out of all devices", Change PIN and Change password end every copy.
- On an iPhone, the home-screen app and Safari keep separate sign-ins. Change PIN in Safari signs the home-screen app out too.
- After S4: when a repair is closed, by you or by an operator's field fix, the shop's link takes only the invoice number for 30 days. You get a bell when it comes in. A wrong number: change Invoice # in the repair's details and Save details. Once Invoice # is filled, by you or the shop, the link stops.

## 7 · Merge and close (each PR, on the owner's go)

> **What you do at each merge:** say "go" in chat and do the rows marked (owner). For S2, also run §6 S2-1 when the session asks. The session reads Active Deployments, merges, watches the deploy, runs the rows marked (session) and writes the docs.

1. Your explicit go in chat; CI green.
2. Merge inside the D48 window, as `DECISIONS.md` D48 states it on the PR's base, or when the admin dashboard shows 0 Active Deployments. Read the count and the time just before merging, and state both.
   - Pace (D48's 2026-10-26 amendment): **window 1: S1** (alone; it changes sign-in for everyone). **Window 2: S2** (alone; it has a migration). **Window 3: S3, then S4** (different areas: what operators read, versus the portal and uploads), each deployed and smoked before the next.
   - Before S1: you have done §6 Do now, and the Eastern-time PR's docs commit is merged (it writes the Eastern-time decision into `DECISIONS.md`, and S1 numbers its decisions after it). Before S3: confirm §6 Do now again.
3. Watch the deploy through its settings check (env-drift) and `/api/health` 200. Note the app version (the Cloud Run revision). S2: the database step (`migrate`) applies `<ts>_p1_2s2_owner_mark`.
4. Smoke the PR's acceptance rows with the tab visible. State Active Deployments first. Test data goes in through the app's screens, named "ZZ P1-2 … (throwaway)". Clean up through the app.
   - **The session never types a PIN or password and never signs in as anyone.** It runs only the rows marked (session), in the admin window you have signed in. Rows marked (owner) are yours; the session lists them as owed in its report. Physical, overnight and two-login rows are always yours.
   - **S2 runs in this order:** (1) row 1 (session); (2) the session stops and asks you to run §6 S2-1; (3) once you confirm, row 2 (session) and rows 3–5 (owner); (4) the docs commit. §6 S2-2 is yours, afterwards.
5. One docs-only commit, named files only (`CHANGELOG.md`, `STATUS.md`, `DECISIONS.md`, and at S1 `AHITS_A6_DEVICE_CHECKLIST.md`), merged by the session on green:
   - **`CHANGELOG.md`:** one line, `- <date> · #<n> · <outcome> · <revision>`. Outcomes:
     - S1: `Sign-ins are recorded; the lockout is exact and Reset PIN unlocks; Change PIN signs out other devices; phones stay signed in overnight; invite links carry the token after #`
     - S2: `Admins keep a password and change it from the menu; only the Owner resets another admin; the Owner is emailed and gets a bell message when reset; role changes set a temporary credential`
     - S3: `Operators no longer receive costs, insurance dates, colleagues' emails or colleagues' full checks; Supabase anon key removed`
     - S4: `Hub portal lines take only what the checklist offers, up to the quantity asked; portal text is trimmed; a closed repair's shop link takes only the invoice number, for 30 days; uploads have a size check`
   - **`STATUS.md`:** one bullet at the top (the RESUME BOX: PR, merge commit, revision, Active Deployments count and time, smoke result, rows owed), the `_Last updated_` line and the §2 merged list.
     - S2 also replaces, in the 2026-10-22 #268 bullet, the bold text from `PIN rotation (#269): operators only…` through `…Admin credentials wait for P1-2.` with `PIN rotation: operators by Reset PIN; admins by Change password (P1-2 S2).` Once §6 S2-2 is done, append ` Done <date>.`
     - The STATUS close-step 7 anchors: S1 `SIGN_IN_ACTIONS` (`src/lib/audit.ts`), S2 `adminPasswordSchema` (`src/lib/validation.ts`), S3 `ADMIN_ONLY` (`src/lib/role-fields.ts`), S4 `subjectClosed` (`src/lib/status-links.ts`).
   - **Device checklist, at S1** (`AHITS_A6_DEVICE_CHECKLIST.md`), the next free rows after #270's row 30 (31 and 32 if nothing else landed); update the rows-count line. Write D-S1's number:
     - `Overnight sign-in (D-S1): use the app in the afternoon; next morning it opens without asking for the PIN.`
     - `Change PIN signs out other devices (D-S1): signed in on phones A and B, Change PIN on A → B's next online screen asks for the PIN; B's saved actions send after signing in there. On iPhone, the home-screen app keeps its own sign-in: Change PIN in Safari signs it out too.`
   - **Decisions:** at S1's close, D-S1 → ACTIVE; at S2's, D-S2 → ACTIVE; at S4's, D-S3 → ACTIVE. Each gets an ACTIVE stamp with PR, merge commit and revision, as D49's. At S2's close, also replace `<ts>_p1_2s2_owner_mark` in D-S2's Read-with with the migration folder's real name (S1 wrote D-S2 before the migration existed; SX-4).

   No handoff file unless the session ends mid-work. Named files only.

**In the S1 PR itself** (not the post-merge docs commit):
- Commit this packet file.
- Add the `00_START_HERE.md` row `| build P1-2 S1–S4 | \`AHITS_PACKET_P1-2S_SECURITY_2026-10-26.md\` |`.
- **Number the decisions** (SX-2). A decision gets its number when it is first written into `DECISIONS.md`, so the order matters:
  1. The Eastern-time PR's post-merge docs commit writes D-E1 (`The business day is Eastern …`). S1 starts only after that commit is merged.
  2. Check: `grep -n "The business day is Eastern" DECISIONS.md` on this branch → 1 line. If it finds none, **stop and tell the owner**: that docs commit merges first. Never number S's decisions before D-E1 is there: the first free number would be D-E1's.
  3. Then read `DECISIONS.md`. D-S1, D-S2 and D-S3 take the next three free D-numbers after the highest one there, in that order.

  Append all three together (house format, owner Max, PROPOSED), with the D27 line below. Write those numbers, never the placeholder, in every code comment, test text, CHANGELOG and STATUS line and PR body this packet produces, and state the mapping (`D-S1 = Dnn`, …) in the PR body. S2–S4 read the numbers from `DECISIONS.md`. The texts:
- **D-S1 · Sign-ins are recorded, the lockout is exact, and a phone stays signed in overnight.** Date: decided 2026-10-26 (accounts map Q4, Q5, Q8, Q9, Q10, Q11), recorded <date> · Status: PROPOSED (ACTIVE when P1-2 S1 merges) · Supersedes in part: D27 · Read-with: D27, D45, `src/lib/auth/pin.ts`, `src/lib/audit.ts` (`SIGN_IN_ACTIONS`), `src/lib/auth/session-edge.ts` (`RENEW_AFTER_SECONDS`, `SIGNED_OUT_COOKIE`), this packet.
  - Decision: changing your PIN or password signs out every other device, not the one used.
  - Decision: every sign-in attempt on a real account is recorded, with time, result, IP address and device. Admins see it under Team → Activity → Sign-ins. Rows are kept 12 months, then deleted. Attempts on emails that aren't accounts are not recorded.
  - Decision: 5 wrong tries lock the account for 15 minutes, exactly, however many tries arrive at once. A PIN or password reset also clears the lock. The message still says "Contact your ops lead".
  - Decision: opening any screen more than 1 hour after the last renewal renews the 24-hour sign-in; background requests never do. The 24-hour idle limit and the 14-day cap stay. Sign out can't be undone by a screen that was still loading.
  - Decision: API writes from other websites are refused. Invite links carry their token after `#`. Hub and shop links keep their format, and every link token is scrubbed from Sentry.
  - Revisit triggers: someone is repeatedly locked out by another person; a crew behind one hotspot hits the per-IP sign-in limit (C-07).
  - Rationale: B3-2, B3-6, N1, B3-13, B3-16; crews re-entered PINs every morning.
- **D-S2 · Admins sign in with a password, and one Owner guards the admin accounts.** Date: decided 2026-10-26 (accounts rounds 1 and 3, shape round 5, round 6), recorded <date> · Status: PROPOSED (ACTIVE when P1-2 S2 merges) · Read-with: D15, D20, D44, D45, `src/app/api/users/[id]/route.ts`, migration `<ts>_p1_2s2_owner_mark`, `PILOT_ROLLBACK.md` §4, this packet.
  - Decision: text from §0 a–g.
  - Decision (round 6): each reset of the Owner by another admin emails the Owner and leaves a bell message ("Your password was reset by <name> at <time>"), and goes ahead even when the email can't go out. The Owner can take the account back by SQL (`PILOT_ROLLBACK.md` §4).
  - Accepted risks (round 6): any admin can demote an admin and promote them back with a password they chose; until D15's gate is met, another admin could take over the Owner account with no email reaching the Owner.
  - Revisit triggers: D15's gate is met; the Owner changes; a second person needs to reset admin passwords; demote-then-promote or an Owner reset is misused.
  - Rationale: B3-1. After #268 admins couldn't rotate, and a PIN written over an admin's password locked them out.
- **D-S3 · Operators and outside links see and change only what their work needs.** Date: decided 2026-10-26 (exposure map Q1–Q9, owner rules), amended 2026-10-27 (round 7: the shop's invoice after close; the portal limits bind admins), recorded <date> · Status: PROPOSED (ACTIVE when P1-2 S4 merges) · Read-with: D2, D21(b), D30, `src/lib/role-fields.ts`, `src/lib/status-links.ts` (`subjectClosed`, `invoiceOnly`), this packet.
  - Decision: text from §0 m–q and t. (§0-r, the rate limit, is the Offline packet's O2.)
  - Decision (round 7): once a repair is closed, by an admin or by an operator's field fix, the shop's link takes only the invoice number. That lasts while the repair has none, for 30 days from the close; then the link stops. The shop's number never replaces one already recorded.
  - Revisit triggers: a screen an operator needs reads a hidden field; a hub needs more than the requested quantity; a shop needs to correct an invoice number it sent.
  - Rationale: B3-5, B3-8, B3-9, B3-10, B3-12, B3-14; round 7 (an operator who closes a shop repair can't know the invoice number).
- **D27 line.** On D27's Date/Owner/Status line, append ` · **Superseded-by: D-S1** (in part: the renewal threshold, 2026-10-26)`. Keep Status ACTIVE and the Shipped field. Under D27, append: `- **Superseded in part by D-S1 (2026-10-26, owner, P1-2 S1):** the token is re-minted when a screen is opened more than 1 hour after the last renewal (\`RENEW_AFTER_SECONDS\`, \`src/lib/auth/session-edge.ts\`), not past half-life. Background requests (/api/*) never renew. Sign out leaves a 2-minute marker cookie, so a late renewal can't sign the phone back in. The 24-hour idle limit and the 14-day cap stay. A phone used yesterday opens this morning without a PIN.`
- **Not this packet's lines:** D26's 7-day amendment is O1's (`MAP_offline.md` §7). D48's merge-pace amendment is already recorded (docs PR #275, `ac1410a`); this packet follows it and doesn't record it again. The pace sentence in `STATUS.md` §4's merge checklist comes in your own docs PR; no S commit adds it.

No reverts without the owner's go.

**Parked (not in S):**
- B7-1: login forgets where the user was going (after O3).
- B7-13 and OP-27: setup-account has no Sign in after "already used".
- OP-28: PinChangeGate fetches `/api/auth/me` on every route change.
- C-07: the per-IP sign-in limit for a crew behind one hotspot.
- A progressive lockout (rejected, Q8).
- Hub-link format change (rejected, Q10).
- Locking every table down in Supabase (row-level security, P2).
- Deleting the old public key's stored copy (§6 E3-after).
- D-04, naming the lockout contact.
- B3-11 is O1's; B3-17 (the rate limit) is O2's.

## 8 · Paste prompts

Build S1:
```
Build P1-2 S1 in AHITS_PACKET_P1-2S_SECURITY_2026-10-26.md (repo root), exactly as written: the override line under the banner, §0, §0.1, the S1 section, §5, §7. Follow CLAUDE.md except where the packet overrides it. Read AGENTS.md and node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md before editing src/proxy.ts. I have done §6 Do now. The packet file is untracked in the repo root: commit it on this branch, with the §7 "In the S1 PR" docs, and give D-S1, D-S2 and D-S3 their numbers as §7 says. Start only after the Eastern-time PR's docs commit is merged: if DECISIONS.md on development has no "The business day is Eastern" entry (D-E1), stop and tell me. Then read DECISIONS.md and take the next three free numbers. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2s1-sign-in from current development. Re-grep every anchor; if a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only. Open the PR to development titled "P1-2 S1 · Sign-in records, an exact lockout, staying signed in" and give me the number when CI is green. Do not merge it. No reverts without my go.
```
Build S2 (after S1 merges):
```
Build P1-2 S2 in AHITS_PACKET_P1-2S_SECURITY_2026-10-26.md (repo root), exactly as written: the override line under the banner, §0, §0.1, the S2 section, §5, §7. Follow CLAUDE.md except where the packet overrides it. Read AGENTS.md and node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md before editing src/proxy.ts. Read D-S2's number from DECISIONS.md. One additive migration: name it with a UTC timestamp later than every migration on development, and run bash scripts/check-migration-safety.sh "origin/development" after committing. Owner read S2-0 is done. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2s2-admin-owner from current development. Re-grep every anchor; if a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only. Open the PR to development titled "P1-2 S2 · Admin passwords and the Owner" and give me the number when CI is green. Do not merge it. No reverts without my go.
```
Build S3 (after S2 merges):
```
Build P1-2 S3 in AHITS_PACKET_P1-2S_SECURITY_2026-10-26.md (repo root), exactly as written: the override line under the banner, §0, §0.1, the S3 section, §5, §7. Follow CLAUDE.md except where the packet overrides it. Read D-S3's number from DECISIONS.md. I have done §6 Do now (E3b-1…5). Don't delete any Secret Manager secret. Delete files with git rm and leave them out of git add; check git show --stat HEAD against the packet's list. If the read guard finds a sentinel the packet didn't predict, stop and report it. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2s3-operator-reads from current development. Re-grep every anchor; if a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only. Open the PR to development titled "P1-2 S3 · What operators can read" and give me the number when CI is green. Do not merge it. No reverts without my go.
```
Build S4 (after S3 merges):
```
Build P1-2 S4 in AHITS_PACKET_P1-2S_SECURITY_2026-10-26.md (repo root), exactly as written: the override line under the banner, §0, §0.1, the S4 section, §5, §7. Follow CLAUDE.md except where the packet overrides it. Read D-S3's number from DECISIONS.md. In src/app/s/[token]/page.tsx change only the Context type and the shop branch (4.3b); the reservation branch stays byte-identical (D21(b)). Don't touch src/lib/rate-limit.ts (the rate limit is the Offline packet's O2). Name the tests/p1-1d-staged-ready.test.ts change in the PR body. Delete files with git rm and leave them out of git add; check git show --stat HEAD against the packet's list. Delete .next before tsc. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-2s4-links-uploads from current development. Re-grep every anchor; if a named test, anchor or count differs from the packet, stop and tell me. Never type a PIN or password. Named files only. Open the PR to development titled "P1-2 S4 · Links and uploads" and give me the number when CI is green. Do not merge it. No reverts without my go.
```

Merge (any of the four, after my go):
```
Go on PR #<n>. Follow §7 of AHITS_PACKET_P1-2S_SECURITY_2026-10-26.md: merge only inside the D48 window as DECISIONS.md states it (with its 2026-10-26 pace amendment: S2 alone; S3 then S4 may share a window, each deployed and smoked before the next), and state the Active Deployments count and the time read; watch the deploy through env-drift and /api/health; smoke the PR's (session) acceptance rows with the tab visible and test data through the app's screens. Never type a PIN or password or sign in as anyone: the (owner) rows are mine, so list them as owed. For S2: after acceptance row 1, stop and ask me to run §6 S2-1. Clean up; then the one docs-only commit (§7.5, named files only: CHANGELOG.md, STATUS.md, DECISIONS.md, and at S1 AHITS_A6_DEVICE_CHECKLIST.md) and merge it on green. No reverts without my go. Report back.
```

## 9 · Findings ledger: corrected, moved, rejected (everything else in the maps and reviews is applied)

### 9.1 · From the maps (rev 1)

| Finding | Verdict | Why |
|---|---|---|
| Exposure E5 step 1 (`s/[token]/transition/route.ts:10-27`, "both schemas") | Corrected path | The two schemas are in `src/app/api/s/[token]/transition/route.ts:10-27`. `src/app/s/[token]/transition/route.ts` is the 36-line dead copy that step 4 deletes. |
| Exposure E5's substitute rule (same category, consumable) | Applied; one other packet's test changes | `tests/p1-1d-staged-ready.test.ts` seeds a serialized substitute through `setLineFulfillment` (`:71`, used at `:391`, `:627`). The checklist never offers one (units `deployment-requests.ts:459-468`, substitutes `:486-512`), so those two seeds move to SQL as legacy rows (4.2 tests). |
| Exposure E5 UI `max` | Narrowed | Leave `onChange` unclamped. `FulfillmentChecklist.test.tsx:47-53` types 5 on a line asking 2; the server refuses it with a message. |
| Exposure E3 runbook edits | Added two | `PROD_CUTOVER_RUNBOOK.md:71` and `:104` say "all 11"; both become 10 (`:71` added in rev 2, BS-12). |
| Exposure E3 test scope | Added a step | The `.env*.example` templates may list the key: grep them and delete the line if so. `docs/archive` stays. |
| Exposure E1 step 13 ("recommended") | Applied, and widened | The owner's rule is "operators don't see" them, and "—" reads as "none". The Maintenance list's Cost column (`:663`, `:697`) is added. |
| Exposure E1 read guard | Rule added; data written out | A sentinel the map didn't predict is a stop-and-report, never an `ALLOW`. Photo seed needs `uploadedById`. Verified 55 GET routes and the 13 dynamic ones `PARAMS` names. Rev 2 writes the map's data into the packet (CS-3). |
| Exposure E2 counts | Verified | The widened regex has 0 hits in `src/`, and the raw-SQL check flags exactly `deployment-assignments.ts:55,121` at `3dbaea8`. |
| Exposure E4 B3-11 | Moved to O1 | Plan: B3-11 → O1 only. |
| Exposure E4 B3-17 (rate limit) | Moved to O2 (rev 2) | §9.3. |
| Accounts e setup-account step (token from `useSearchParams` + `replaceState`) | Corrected | `replaceState` updates `useSearchParams` (Next docs `04-linking-and-navigating.md:343-345`), so an effect keyed on it would rerun with no token and show "No invite token found". Read `window.location` once, guarded by the ref; deps `[]`. |
| Accounts e tests | Added one | `tests/copy-link-invite.test.ts:39` (`tokenFromUrl`) reads `?token=` and must read the hash. The map named only `:63` and `:32`. |
| Accounts a step 1 (success resets the count only) | Refined | Success also clears a lock that a racing wrong try set (an `updateMany`). The existing lockout tests pass unchanged. |
| Accounts a (renewal now hourly) | Changed in rev 2 | Renew on screen loads only, plus the sign-out marker (BS-3, §9.2). |
| Accounts a step 7 (device) | Specified | A short OS and browser label for display. The user-agent string is stored, cut to 200 characters. |
| Accounts a, extra | Added | `PILOT_ROLLBACK.md` Q4 would fill with about 20 sign-in rows a day: it now excludes them. |
| Accounts b Q2 default ("any other admin resets an admin") | Superseded | Owner: Owner-only, plus the Owner mark (S2 now has a migration; the map said none), the Owner email and bell, the Owner guard and §0-g. |
| Accounts b step 10 (Team page) | Changed | The page can't call `useAuth` (its `useRouter` breaks `uxp6-users-form` with no app router). `GET /api/users` marks `isSelf` and `isOwner` instead. |
| Accounts d step 13 (Q9 renewal) | Moved into S1 | Plan. The rest of accounts d (B5-7, B5-8, N2) is O2's. |
| Accounts c (shared phone: B3-7, UI-8, OP-17, B5-9, C-05) | Moved to O3 | Plan (C-05 per plan O2). §0 says so. |
| B3-3, B3-4 | Done elsewhere | P1-1a. |
| B3-15 | Moved | Data packet D2. |
| B3-10 "revoke anon/authenticated grants", "RLS on all tables" | Not now | With the Data API off they grant nothing; RLS is P2 (§6 E3b-7). |
| B3-14 "CSP: sandbox" on PDFs | Not added | Download (attachment) means the PDF never renders on our address. |
| Map PR names (`P1-2a…e`, `E1…E6`) and test names | Renamed | S1–S4 and `p1-2s1-…` to `p1-2s4-…`, so test files map to PRs. |
| `OWNER_DECISIONS_P1-2.md` "OPEN" list | Treated as answered | "Who may promote/demote" is answered in round 3, grouping and order in round 5, and rev 1's two OPEN items in round 6. The offline and integrity Qs belong to the other packets. |
| Owner email on staging (rev 1 OPEN 2) | Answered (round 6) | Kept as decided, plus the bell. Accepted risk 2 in §0. |
| Demote-then-promote (rev 1 OPEN 1) | Answered (round 6) | Accepted, no extra code. Accepted risk 1 in §0. |
| Exposure E6 `X-Content-Type-Options` | Already sent | `next.config.ts:27` sends `nosniff` on every route (BS-20), so nothing to add. |

### 9.2 · From the reviews (rev 2): where this packet differs from the fix text

Every other review item is applied as written. `rev-S/REV2_CHANGES.md` maps each ID to its step.

| Item | Verdict | Why |
|---|---|---|
| BS-1 "the Owner reset fails closed unless the email is SENT" (409) | **Not applied (owner, round 6)** | The owner kept the decision: other admins can reset the Owner even while email can't go out. Applied instead: the bell message to the Owner (2.5), the 15-second "didn't go out" warning for the resetting admin (2.11), the SQL self-recovery (§6 S2-3, `PILOT_ROLLBACK.md` §4) and accepted risk 2 in plain words (§0). The test keeps "FAILED → still 200" and adds "the bell row is still written". |
| Owner bell: alert or notification? | A bell notification, not an alert | In this app an alert goes to every admin's bell and the admin email (`dispatchPendingAlerts`), needs a new enum value (a migration) and, under D45, an evaluator or a Resolve owner. The owner asked for a message to the Owner. A direct `Notification` row is the existing pattern for an event notice to one person (declined transfers, reservation updates: `notification.create` in `transfers/[id]/decline/route.ts:158`, `status-links.ts:434`). D45's D-j still applies to the email outcome the resetting admin sees. |
| BS-3 "skip `next-router-prefetch: 1` and `Purpose: prefetch`" | **Changed** | Next 16 strips `next-router-prefetch` and `rsc` from the request the proxy sees (proxy doc, "RSC requests and rewrites"; `adapter.js` `FLIGHT_HEADERS`; the app doesn't set `skipProxyUrlNormalize`), and Next sends values `1`, `2` or `3`. The clause would be dead in production; the reviewer's probe passed only because it built the request by hand. Kept: renew only on `GET` outside `/api/`. Added: the 2-minute sign-out marker, which drops a late renewal of any kind after Sign out (proven on the scratch clone). That also closes the reviewer's residual ("a screen load in flight at Sign out"), so O3 needs no second logout. Left open: a late renewal during Change PIN can sign out the phone that was used, once. |
| BS-5 "move 4.7 to its own PR after O2, or note 'not before O2'" | **Moved into the Offline packet's O2** | "S4 after O2" would break the Offline packet's gate (O1's prompt and §4 require every S PR merged first) and split S across packets. Inside O2, the limit can never ship without the slower retries. Spec for O2: §9.3. |
| BS-10 (count only REQUESTED creates; pin the clock in tests) | Moved with B3-17 | Written into the O2 spec (§9.3). |
| BS-11 (the qty cap also binds Admin → Requests) | Kept shared; **owner's decision (round 7)** | The admin screen uses the same checklist and the same `setLineFulfillment`. Rev 2 listed it as an interpretation; round 7 made it the owner's decision (text trimmed, quantity no more than requested, for admins too). §0-q, 4.1 and 4.2 say so; §9.5. |
| BS-13 (the Offline and Data packets name the wrong PR) | Noted for them | This packet doesn't edit sibling packets. §9.4. |
| BS-17 (optional: `users_one_owner` in `verify.yml`) | Not taken | The per-test `beforeAll` with `IF NOT EXISTS` matches P1-1 practice and works on a local database too (CS agreed). |
| CS-1 "record the D48 amendment in S1" | **Not applied (rule since rev 1)** | The amendment is already recorded by docs PR #275 (`ac1410a`). §0-s and §7 reference it. The STATUS §4 checklist sentence is not added here either: the owner adds it in his own docs PR (answered 2026-10-27). |
| CS-2 (placeholders) | Applied | No hard-coded decision number is left. D-S1…D-S3 get their numbers when the S1 PR writes them into `DECISIONS.md`. |
| CS-10 "stacked dry run, or a banner line" | Banner line | No full stacked build was run for rev 2; the reviewers' scratch clone ran the server code, and rev 2 re-ran the affected probes there. |
| CS-19 "since 2026-10-22" | Widened | "As far back as the logs go (at least since 2026-10-22)": the #268 exposure was live before that date. A read only. |
| `lockNow` answer when no lock was set | Added (rev 2) | With BS-6's guard, a late request can find the account unlocked; it now answers "wrong", not "locked until …". |

### 9.3 · For the Offline packet's next revision: O2 gains B3-17 (moved from S4 4.7)

- **Why O2:** the limit must not start before O2's slower retries (BS-5). O2's backoff covers the 429 branch (`useOfflineQueue.ts:520-533`, the "5xx / 408 / 429" put), and its 8 tries span 61.5 minutes, longer than the clock-hour window.
- **Code** (`src/lib/rate-limit.ts`):
  ```ts
  /** P1-2 O2 (B3-17): writes that email a hub or raise an admin alert — per operator, per clock hour. */
  export function limitNotifyingWrite(userId: string) {
    return rateLimit(`notify:${userId}`, 20, 60 * 60_000)
  }
  ```
- Call it after the auth check, for non-admins only, in:
  - `src/app/api/deployment-requests/route.ts`, after the parse (`:72-74`), only when `d.status === 'REQUESTED'` (a DRAFT notifies nobody, BS-10);
  - `src/app/api/deployment-requests/[id]/route.ts`, after the own-request check (`:66`), only when `action === 'submit'`;
  - `src/app/api/vehicles/[id]/report-damage/route.ts` (after `:39`);
  - `src/app/api/inventory/units/[unitId]/report-problem/route.ts` (after `:31`).
- Blocked → 429 `{ error: 'Too many reports in the last hour — try again later.' }` with `Retry-After: <retryAfterSec>`. Check against O1's `idempotency.ts` that a 429 is still not stored and frees its key.
- **Test** `tests/p1-2-notify-limit.test.ts`: `vi.useFakeTimers({ toFake: ['Date'] })` with `vi.setSystemTime` at :00:05 of an hour (BS-10). The 21st report-damage from one operator → 429 with `Retry-After`. An admin isn't limited. A DRAFT request create doesn't count. A 429 isn't cached: `DELETE FROM "rate_limit_hit" WHERE "bucket_key" LIKE 'notify:<operatorId>|%'`, then the same key → 201 (CS-22).
- **Grep:** `grep -rln limitNotifyingWrite src/app/api` → 4 files.
- **Decision:** the Security packet's §0-r ("at most 20 writes that email a hub or raise an admin alert, per operator per hour", map default) becomes part of O2's decision. Behaviour change for O2's PR body: an operator's 21st request or report within a clock hour gets 429, and the queue retries it with O2's backoff.
- **Shared files:** S3 already passes the report replies through `forRole` (3.6b); add the limiter above it.

### 9.4 · Other notes for the sibling packets' next revisions

- **Offline:** `tests/helpers/proxy-request.ts` is added by **S1**, not S2 (O `:593`, `:724`, `:1142`; BS-13), and now takes extra `cookies`. In O's §4 table: `src/proxy.ts` S1 also adds the sign-out marker check (where the token is read, `:142`) and the screen-load renewal rule (`:164`); add `src/lib/auth/session.ts` (S1: `setSessionCookie`, `clearSession`; O2: `getSession`, `checkSession`); add the report-damage and report-problem routes (S3 reply, O2 limiter). O's §0-m says the D48 amendment is "recorded by the Security packet": it was recorded by docs PR #275. O3 needs no second logout from `/login` (the marker covers it).
- **Data:** in D's §4 table, `src/lib/deployment-requests.ts`: "S4: checks in `setLineFulfillment`; keep them inside D3's locked transaction" (BS-13); `src/app/api/maintenance/field-fix/route.ts`: "S3: the reply through `forRole` (`:98`)"; the deployment-requests routes row: the rate limit is O2's, not S4's. D's §0 pace row says "recorded by the Security packet": it was recorded by docs PR #275.
- **Data, round 7 (field fix: any operator, any repair).** These notes are from S's side only; D's revision owns the rules.
  - Whatever field fix returns to an operator stays through `forRole(…, 'task', …)`. If D adds the closed repairs to the reply, each one goes through it too: a shop repair carries its costs, PO and invoice.
  - S3's operator-reads test now field-fixes another crew's unit with an `AT_SHOP` repair and expects 201. D's custody 403 and shop 409 (2.7) would break it; round 7 removes both.
  - S4's shop link reads only the repair's `status`, `completedAt`, `deletedAt` and `invoiceNumber`. A field-fix close needs nothing extra for it, as long as it keeps closing through `closeDamageTask`, which sets `completedAt`.
  - D's 2.7 "a live work order counts as with a shop" no longer blocks a field fix. The shop's link then moves to invoice-only (S4 4.3).
- **From the practice build (rev 4, `p12/stack/STACK_ES.md` §3).** Line numbers after S lands; re-grep anyway.
  - **Offline:** after S1 and S2, `src/proxy.ts`'s one funnel 403 (two wordings) is at `:203-206` (O2 anchors `:176-179`); O2's `code` goes there. S1's sign-out marker check sits before `jwtVerify` (`:158-164`, `:174`) and the renewal is at `:186-189`, so O3's block goes after `:174` and before `:186`. Login's catch still answers `'Server error'` after S. (Taken into the Offline packet rev 3, §4, with the lines its practice build found.)
  - **Data:** after S4, `setLineFulfillment`'s transaction starts at `:417` (D3 anchors `:397-418`), with S4's checks just before it. After S3, field-fix's transaction is at `:67` (was `:66`) and `restoreIfClear` at `:95`; D's grep `hasOpenAssignment\|WORK_ORDER\|status: 403` → 0 still holds.

### 9.5 · Rev 3: the owner's round 7, and what the re-run found

`rev-S/REV3_CHANGES.md` has each item with its re-run.

| Item | Verdict | Why |
|---|---|---|
| Exposure Q8 / E5: "a shop's link stops once the repair is closed" | **Amended (round 7)** | After the close the link takes the invoice number only, while the repair has none, for 30 days (§0-t, 4.3, 4.3b). Closes by admins and by an operator's field fix both count. |
| D21(b) and `s/[token]/page.tsx` | Shop branch edited | D21(b) freezes the reservation-forwarding channel. It keeps the WORK_ORDER channel "fully maintained", so the shop branch may change. The reservation branch stays byte-identical (§5 grep). Rev 2's "the frozen page is untouched" was wider than D21(b). |
| "Until an admin records it" | Read as "until the repair has an invoice number" (default, owner may object) | The app doesn't record who typed an invoice number. The page's key for Submit invoice # is fixed (`${token}:INVOICED`), so a shop can't send a second number from it anyway. An admin corrects a wrong one in the repair's details. |
| 30 days vs the link's own end date | 30 days from the close | The owner's words. A shop link usually has days left when the repair closes, so stopping at its own end date would cut most windows short. A link that had already run out or been revoked before the close stays dead. |
| An empty Submit invoice # | 422, before and after the close | A 400 would be cached under the page's fixed key, and the retry with the number would get "already used" (the BS-4 trap). Before rev 3 an empty one was accepted and cached, with the same effect. |
| "Can't overwrite one an admin already recorded" | Before and after the close | One conditional write (`invoiceNumber` null or empty). Before rev 3, the shop's number replaced the admin's. |
| Rev 2 4.3: "the admin records the invoice number in the Close repair dialog" | **Corrected** | The dialog has destination and method only (`admin/maintenance/page.tsx:1087-1140`). The admin uses the repair's details (`:789`, Save details → `PATCH /api/maintenance/[id]`). |
| S3 3.1 `forRole` | **Fixed** | `const out: Record<string, unknown> = { ...row }` fails `tsc` (TS2322: `T` has no index signature). `{ ...row } as Record<string, unknown>` passes, and the behaviour is the same. Rev 2's probes ran under vitest, which doesn't type-check. |
| Write-integrity Q2 (field-fix custody, D2 2.7) | **Replaced (round 7)** | Any operator may close any repair. S keeps the reply free of costs (3.6b) and tests it on another crew's shop repair. §0.1 and §9.4 updated. |
| BS-11 / round 7 "admin limits" | Owner's decision; **text trim added** | Rev 2 bound the admin to the quantity, unit and substitute checks (shared `setLineFulfillment`), but its route schema left the text unbounded: on the scratch clone a 501-character deny reason was stored whole. 4.1 gives that route the portal's three trims. §0-q, 4.2. |
| STATUS §4 pace sentence | The owner's docs PR | §7 "Not this packet's lines". |

### 9.6 · Rev 4: the practice build

`p12/stack/STACK_ES.md` built the Eastern-time PR and S1–S4 on base + #273 + #272 (tree `p12/stack/tree`, tags `stack-E`, `stack-S1` … `stack-S4`). Where the builder's code was the better answer, rev 4 uses it. `p12/stack/FOLD_ES.md` maps each ID to its step.

| ID | Sev | Verdict | Where |
|---|---|---|---|
| SX-1 Sentry query without `?` | Med | Applied: the builder's pattern and test case | 1.11, S1 tests, §5 After S1 |
| SX-2 decision numbers | Low | Applied: S1 starts after the Eastern-time docs commit, checks D-E1 is there, then takes the next free numbers. Placeholders stay | Banner, §7 step 2 and "In the S1 PR", §8 Build S1; Eastern-time packet rev 3 §7.5 |
| SX-3 migration check needs `bash` | Low | Applied. P1-1's §5 has the same line: not this packet's | 2.1, §5, §8 Build S2 |
| SX-4 `<ts>` left in D-S2 | Low | Applied | §7.5 Decisions, 2.13 |
| SX-5 Date delivered isn't a cost | Low | Applied | 3.10 |
| SX-6 guard seed wiped after each test | Low | Applied: `beforeEach`, as built | S3 tests, read guard |
| SX-7 gap (d) unnamed | Low | Applied: named from the B3-9 audit text | 3.11 item 6 |
| SX-8 `git add` of a deleted path | Low | Applied | Override line, 3.12, 4.4, S3 and S4 Files, §8 Build S3 and S4 |
| SX-9 weak admin Change-PIN test | Low | Applied: the admin's real password, and both error texts | S2 tests, admin-password 2 |
| SX-10 a dead link's GET writes `VIEWED` | Low | Applied | S4 tests, shop-invoice 1 |
| SX-11 stale `.next/types` | Low | Applied | 4.4, §5, §8 Build S4 |
| SX-12 PRD lines given as fragments | Info | Applied: both lines in full | 3.13 |
| SX-13 spinner without `setLoading` | Info | Applied: the builder's code | 1.6 |
| SX-14 two toasts | Info | Applied: the builder's code | 2.11 |
| SX-15 missing import, stale comments | Info | Applied | 1.2, 1.4, 1.9 |
| SX-16 second flake symptom | Info | Applied | §5 |
| SX-17 env-drift range | Info | Applied | 3.12 |
| SX-18 S2 proxy anchors | Info | Applied: post-S1 lines beside the base ones | §0.1, 2.3, 2.8 |
| SX-19 real P1-1a (#277) | Info | **Noted, no change.** No S step touches #277's `src` files; the docs differences are cosmetic; anchors in files the real P1-1b–e moves are re-grepped, as the banner says | — |
| EX-1 base test counts | Info | Applied in the Eastern-time packet (rev 3) | Its SLOT and Counts lines |
| §3 cross-packet notes | — | Noted for the sibling packets | §9.4 |

### 9.7 · Rev 4.1: the Offline practice build

`p12/stack/STACK_O.md` built O1–O6 on `stack-S4` (tags `stack-O1` … `stack-O6`). Three of its findings touch this packet; the Offline packet rev 3 takes the rest. `p12/stack/FOLD_O.md` maps every ID.

| ID | Sev | Verdict | Where |
|---|---|---|---|
| OX-16 S1's parallel-PIN test assumes an order | Info (O) | **Applied here.** The test fixes the order with gates, in two cases, each failing if its rule is removed. Checked on a private clone of `stack-S4` (10 of 10 green; `tsc`, eslint clean). Not run on the stack tree | 1.1 notes, S1 tests (pin attempts) |
| OX-2 `/api/auth/me` moves to `checkSession` (O2) | Med (O) | **Applied here, not in O2:** the guard's session mock has the `checkSession` line from S3 on. O2 points to it | S3 tests (read guard, Session mock), §0.1 |
| OX-3 O3 adds `userId` to the login reply | Med (O) | **Stays in O3** (S's exact checks guard the reply's shape; O3 changes them on purpose). §0.1 names them | §0.1 |
