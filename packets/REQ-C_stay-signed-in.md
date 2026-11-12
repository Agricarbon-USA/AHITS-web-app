# REQ-C: Phones stay signed in for 4 days without use

Nov 11, 2026, against `development` @ `3d87588`. One PR, one commit per fix. No migration, service-worker change or new package. Match the quoted text.

## Read this first
- Build only after REQ-B has merged: `src/app/api/auth/login/route.ts` must read `password: z.string().min(1)`. If not, stop and say so. Fix 2 signs a promoted operator out, and only REQ-B lets that person sign in again. The two share no code or test file; both edit `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md`.
- The owner chose 4 idle days on Nov 11, 2026 (was 24 hours). Cost: a lost phone nobody reports opens the app for up to 4 days.
- New for users: a change of role signs that person out.

## 1. Sign-in every morning
**Today.** A sign-in lasts 24 hours and renews only on use more than 12 hours after the last renewal. Sign in at 6:00, work to 15:00, open at 6:05 next day: signed out.

**Rule.** Use more than 1 hour after the last renewal renews. A sign-in ends 4 days after its last renewal, or 14 days after the PIN was typed, whichever comes first (today a late renewal runs to day 15).

**Change.** `src/lib/auth/session-edge.ts`:
```ts
// now: export const SESSION_DURATION = 60 * 60 * 24 // 24h, in seconds
export const SESSION_DURATION = 60 * 60 * 24 * 4 // idle sign-out: 4 days, in seconds
export const RENEW_AFTER = 60 * 60 // renew a token more than 1 hour old
// mintSessionToken, new first lines:
const nowSec = Math.floor(Date.now() / 1000)
const exp = Math.min(nowSec + SESSION_DURATION, claims.authAt + MAX_SESSION_LIFETIME) // exact 14-day cap
// now: .setIssuedAt()  .setExpirationTime('24h')   →   .setIssuedAt(nowSec)  .setExpirationTime(exp)
// maybeRenewSessionToken. Now: if (nowSec <= iat + SESSION_DURATION / 2) return null // not yet past half-life
if (nowSec <= iat + RENEW_AFTER) return null
// now: if (nowSec - authAt > MAX_SESSION_LIFETIME) return null // past the absolute cap
if (nowSec - authAt >= MAX_SESSION_LIFETIME) return null
```
`src/proxy.ts`: no renewal where the route sets its own cookie (Sign out, Change PIN). Replace `const renewedToken = await maybeRenewSessionToken(payload as Record<string, unknown>, Math.floor(Date.now() / 1000))` with
```ts
const renewedToken = pathname.startsWith('/api/auth/')
  ? null
  : await maybeRenewSessionToken(payload as Record<string, unknown>, Math.floor(Date.now() / 1000))
```
Update the "24h" / "half-life" comments in both files, and "the 24h JWT lapsed" in `src/hooks/useOfflineQueue.ts` (comment only). jose is locked at 5.10.0: check `node_modules/jose/dist/types/jwt/produce.d.ts` says a number given to `setIssuedAt` / `setExpirationTime` is used as the claim itself.

**Test.** New `describe` in `tests/auth-pin-session.test.ts` (nothing tests these files today). Read claims with jose `decodeJwt`. `mintSessionToken` always stamps "now", so sign old tokens by hand: `new SignJWT({ ...claims, authAt }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt(now - 7200).setExpirationTime(now + 3600).sign(secret)`. Cases: a fresh token has `exp − iat` = `SESSION_DURATION`; `maybeRenewSessionToken` → null at 30 minutes, a token with the same claims and `authAt` at 61 minutes; `authAt` 13 days ago → `exp` = `authAt` + 14 days; exactly 14 days ago → null; `proxy()` with a 2-hour-old `ahits_session` cookie sets a new one on `/api/notifications`, none on `/api/auth/logout`.

## 2. A change of role signs the person out
**Today.** The role inside the sign-in decides which pages open (`proxy.ts`: `pathname.startsWith(ADMIN_PATHS[0]) && role !== 'ADMIN'`), and renewal copies it. A promoted operator is kept out of admin pages until they sign out and in: up to 14 days with fix 1. Reset PIN ends sign-ins by raising `tokenVersion`; a role change does not.

**Change.** `src/app/api/users/[id]/route.ts`: `if (forceLogout || pin || isActive === false) {` →
```ts
if (forceLogout || pin || isActive === false || (role !== undefined && role !== target.role)) {
```
Add "change the role" to the comment above it. Nobody signs himself out: an admin cannot change his own role (`selfDemote` is refused first).

**Test.** `tests/auth-invite-rbac.test.ts`, beside 'suspending a user bumps tokenVersion': a changed role → `tokenVersion` + 1; the same role sent again → unchanged (the Manage form always sends `role`).

## Must not change
- Cookie flags. The database check in `getSession`. `proxy.ts` never imports `session.ts`. `createSession` and its callers.
- `login/route.ts`, lockout, every sign-in error message. Sign-out at once on Deactivate, Reset PIN and "Log out of all devices". The self and last-admin guards.
- `prisma/`, `src/app/sw.ts`, `next.config.ts`, `package.json`, `.github/`.
- Known, left alone: a request in flight at Sign out can bring the sign-in back when it is over 1 hour old (was 12). An admin made Field Operator still needs a Reset PIN in the same save.

## How to tell it worked
1. **Claude Code.** The owner signs in before the merge and leaves the tab open. After the green deploy run, reload the admin dashboard and open Users: no sign-in is asked (old sign-ins carry over).
2. **Owner.** Sign in on your phone after the deploy. Next morning, and after the next weekend, the app opens without email and PIN.

## Audit, merge, docs
- **Audit: yes.** Sign-in and permissions: the planning Claude audits the PR before merge.
- **Merge:** no migration, no service-worker change → any time, on the owner's go.
- **Doc lines, same PR** (if a line has been edited since, it is the one on that subject):
  - `STATUS.md` In flight: delete `4. REQ-C: stay signed in for 4 idle days.` (number 3 once REQ-B has merged) and renumber what follows.
  - `STATUS.md` Known hazards: nothing to remove. Add `- A lost phone stays signed in for up to 4 days. Users → Manage → "Log out of all devices" ends it at once.`
  - `STATUS.md` Known hazards: also add `- After a Reset PIN, an admin who signs in may see a blank sign-in form, and Change PIN may not move on after "PIN updated." Opening the app address again continues. Seen in the #282 live check; to fix in the second set of quick fixes.`
  - `STATUS.md` Next, the "Quick fixes, second set" line: add `; the two missing redirects after an admin Reset PIN; the Makefile's forced PATH line` before its closing full stop.
  - `DECISIONS.md`: `- A phone stays signed in for 4 days without use, up to 14 days after the PIN was typed; an admin can cut it off at once. (D27, Nov 11) — not built yet, REQ-C (today: 24 hours; most crews sign in each morning)` → `- A phone stays signed in for 4 days without use, up to 14 days after the PIN was typed; an admin can cut it off at once, and a change of role signs that person out. (D27, Nov 11)`
  - If the paused-packets list still starts a line with `A phone used yesterday opens today;`, remove that clause.
- **CHANGELOG line:** `- <date the PR is opened> · #<PR> · Phones stay signed in for 4 days without use (was 24 hours), 14 days at most; a change of role signs that person out`

## Prompt for Claude Code
```
Read CLAUDE.md, AGENTS.md, STATUS.md and packets/REQ-C_stay-signed-in.md (if it is missing, stop and say so). This Next.js is modified (AGENTS.md): read the relevant node_modules/next/dist/docs (proxy, cookies) before writing code.

Branch from the latest origin/development. Build exactly REQ-C: one commit per fix, each with its tests. If a quoted line does not match the code, stop and report it.

Gate: npm run lint, npm run type-check, npm run test:ui, npm run build (placeholder env values from .github/workflows/verify.yml). Server tests (npm test) run in CI.

Open ONE PR into development with the code, the tests, the doc lines and the CHANGELOG line REQ-C names (the PR number goes in once it exists), and the request file itself. It is untracked: `git add packets/REQ-C_stay-signed-in.md`, by name. Write "needs audit" on the PR. Wait for CI.

Report the PR number, the CI result and anything that did not match the code. Then stop: the PR needs an audit and the owner's go before merge.

After the merge and a green deploy run, do the live check marked "Claude Code" and post the result as a PR comment. If it fails, stop and tell the owner. Do not revert.

Safety: named files only. Never `git add -A` or `git add .`. Never `git stash`, `git reset`, `git checkout <ref> -- .`. Never read .env files. Type no PIN or password. Do not merge without the owner's go.
```
