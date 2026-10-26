# Hotfix · Signal returning no longer reloads the app · 2026-10-25

> STATUS: runnable hotfix (paste the §9 prompt into Claude Code) · WROTE: 2026-10-25 (rev 3, after two build-and-test reviews of every step) · READ-WITH: `CLAUDE.md`, DECISIONS D16 (merge is the deploy), D21 (my-deployment must not grow), D31 (update prompt), D48 (merge window)
> WHY: every time a phone gets signal back, the whole app reloads. `@serwist/next` 9.5.11 defaults `reloadOnOnline` to `true`. `next.config.ts` never turns it off, so the package's injected `sw-entry` runs `addEventListener("online", () => location.reload())` on every page. Work in progress is lost with no message: Start/End deployment picks, Add items, Report a problem, the request composer. Only the daily check keeps a draft. Found by the 2026-10-23 offline review (B5-1). Confirmed in the code and in the installed package.
> SLOT: next, before P1-1. Own PR. No migration. Six steps (seven files), four tests. `my-deployment/page.tsx` is not touched.

---

## 0 · Owner decisions (final: apply them, don't re-ask)

| # | Decision |
|---|---|
| H2-a | **Signal returning never reloads a screen that can hold unsaved work.** Waiting saves still send on their own (unchanged). |
| H2-b | **Screens re-read their data when signal returns**, without a reload, so nothing shown stays stale. Picks and typed text stay. |
| H2-c | **The "You're offline" page is the one exception.** It has nothing to lose, so it reloads itself when signal returns, which brings back the real screen. |
| H2-d | **Waiting-to-sync counts stay correct without the reload.** A phone can have several queue readers (banner, header badge, screen), and one can keep showing "N waiting" after another reader has sent them. The reload hid this. While online, every reader now re-counts on its regular 30-second check. |

No new decision number. No copy changes.

---

## 1 · Data

No migration.

## 2 · Code

2.1 **`next.config.ts`**: in `withSerwistInit({ … })`, add after `register: true,`:
```ts
  // Hotfix 2026-10-25: the package default (true) reloads every page when signal returns and wipes unsaved work.
  reloadOnOnline: false,
```
This flag only controls the reload. Service-worker registration is a separate flag and is unchanged.

2.2 **`src/hooks/useOfflineQueue.ts`**, in `flush` (~`:318-321`), at the probe's early return:
`if (!hasDrainable) return` → `if (!hasDrainable) { await refresh(); return }`
`refresh` sets numbers and booleans only, so an unchanged queue doesn't re-render. It never calls `setSyncing`, so the "no sync spinner on an empty queue" rule (UXP-1g) holds. No other change in this file.

2.3 **Screens re-read on reconnect (H2-b).** New `src/components/shared/RefreshOnReconnect.tsx`:
```tsx
'use client'
import * as React from 'react'
import { ENTITY_KEYS, dispatchInvalidate } from '@/lib/invalidation'

// Hotfix 2026-10-25: signal returning no longer reloads the page (next.config.ts
// reloadOnOnline: false). Instead, tell every mounted screen to re-read its data,
// through the same invalidation event a drained queue already uses. Screen state is
// untouched, except what a re-read already resets (see the packet). At most once per
// 10 s, so a flapping signal doesn't flood reads.
export function RefreshOnReconnect() {
  React.useEffect(() => {
    let last = 0
    const onOnline = () => {
      const now = Date.now()
      if (now - last < 10_000) return
      last = now
      dispatchInvalidate(ENTITY_KEYS)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return null
}
```
Mount it once in `src/components/ui/AppShell.tsx`, next to `<ServiceWorkerUpdater />` (~`:163`), with its import beside the ServiceWorkerUpdater import (~`:13`).
- **Why this way:** My Deployment (`useInvalidation(['deployments','transfers'])`, `my-deployment/page.tsx:267`) and Scan (`useInvalidation(['deployments'])`, `scan/page.tsx:81`) already re-read on this event, and so do the admin `useListQuery` lists. Every `useFreshList` list already re-reads on reconnect through SWR (`useFreshList.ts:24`); Today and Requests also re-read on the event, which is harmless. No screen file changes, and D21 holds.
- **Known and unchanged:**
  - A few one-time reads re-run only when their screen is opened again: My Deployment's vehicle, person and hub pickers (a 409 already re-reads the item picker), the daily-check template, and the request composer's options.
  - Admin screens re-read too. On admin Hubs the inbound selection clears, and admin tables show their loading skeleton for a moment. If signal isn't really back, a re-read can show a "Could not load" toast. None of this is worse than today's reload.
  - At most once per 10 s. A second reconnect inside 10 s isn't re-read.
  - On reconnect with queued work, My Deployment can briefly show the kit from before the drain if its first read is slow. It corrects on the next re-read. The fix (keep only the newest read) waits for the my-deployment split (D21).

2.4 **`src/app/~offline/page.tsx`** (H2-c): the page reloads itself with an **inline script**, not a client component. After a deploy, the service worker can still serve this HTML with its old JS chunks gone; an inline script needs no chunks.
- Add `import { headers } from 'next/headers'`.
- At module level: `const RELOAD_WHEN_ONLINE = "window.addEventListener('online',function(){location.reload()})"`.
- Make the page `export default async function OfflinePage()`, and read `const nonce = (await headers()).get('x-nonce') ?? undefined` (the CSP is nonce-based, `proxy.ts:64`, and `/~offline` gets a nonce, `proxy.ts:25`).
- As the first child of `<main>`: `<script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: RELOAD_WHEN_ONLINE }} />`.
- Comment, directly above `RELOAD_WHEN_ONLINE`: `// Hotfix 2026-10-25 (H2-c): this page has nothing to lose, so it reloads itself when signal returns. An inline script, not a client component: the service worker can serve this HTML after a deploy has removed its JS chunks. The nonce lets it pass the CSP.`
- Nothing else on the page changes.

2.5 **`src/app/sw.ts`**: today `/~offline` is precached with `revision: null` (`:21-26`), so a phone keeps the copy from its **first** install forever. Without this step, 2.4 never reaches a phone that already has the app.
- After `const STATIC_PRECACHE = ['/~offline']`, add:
```ts
// Hotfix 2026-10-25: a revision, not null. With null the precache keeps the copy from
// the phone's FIRST install forever, so a change to ~offline/page.tsx never reaches it.
// Bump this whenever src/app/~offline/page.tsx changes.
const OFFLINE_PAGE_REVISION = '2026-10-25'
```
- In `precacheEntries`, change `revision: null` to `revision: OFFLINE_PAGE_REVISION`.
- Nothing else in `sw.ts` changes. skipWaiting and clientsClaim are untouched (D31).
- Don't use `additionalPrecacheEntries` in `next.config.ts` instead: it replaces the public-folder precache list, which would drop the icons and `manifest.json`.

2.6 **`src/components/shared/DispositionDialog.tsx`: an open dialog survives a re-read.** With 2.1 and 2.3, a re-read can change the kit while End deployment is open: another device changed it, or the phone's own queued Add items drained on reconnect. Today a line added since the dialog opened has no entry, so `dispositions.get(id)!.quantity` throws and the whole page shows the error screen. Derive each line from the current `items`:
- After `applyFinalHub` (~`:127`):
```ts
  // Hotfix 2026-10-25: a re-read can change the kit while this dialog is open (signal
  // returning, a drained queue). A line added since opening gets its default; a line
  // that has left is not sent.
  const current = items.map((i) => dispositions.get(i.kitItemId) ?? initialDisposition(i, finalHubId || undefined))
```
- `missingHub` (`:128`) reads `current.some(…)`.
- `setDisp`'s base (`:136`) becomes `prev.get(kitItemId) ?? current.find((d) => d.kitItemId === kitItemId)!`.
- The submit's `itemDispositions` (`:147`) maps `current`, not `Array.from(dispositions.values())`.
- The render's `disp` (`:224`) is `current.find((d) => d.kitItemId === item.kitItemId)!`.
- Nothing else in the dialog changes. P1-1b rewrites this dialog and keeps `current`.

2.7 **Not touched:** every API route, `ServiceWorkerUpdater.tsx`, `RoutePrefetcher.tsx`, and every screen file, including `my-deployment/page.tsx` (D21).

## 3 · UI

No visible change, except that work in progress is no longer wiped and screens refresh themselves on reconnect.

## 4 · Tests

All four run in the UI suite (`npm run test:ui` picks up `tests/components` and `tests/offline` only).

**4.1 Config guard (pure):** `tests/components/hotfix-no-reload-on-online.test.ts`
- Read files with `node:fs`, as `tests/components/cc32-sw-map-cache.test.ts` does. Strip `/* */` blocks and `//` comment lines before matching, so a comment can't pass the check.
- Case 1: match `withSerwistInit\(\{[\s\S]*?\}\)` in `next.config.ts` and expect `/reloadOnOnline:\s*false/` in it. Fail message: `next.config.ts must set reloadOnOnline: false (see AHITS_HOTFIX_2026-10-25).`
- Case 2: `src/app/sw.ts` no longer contains `STATIC_PRECACHE.map((url) => ({ url, revision: null }))`, and contains `revision: OFFLINE_PAGE_REVISION`.

**4.2 Queue counts:** `tests/offline/useOfflineQueue.test.tsx`: add case (g) to the existing harness. jsdom has no `navigator.locks` there, so the localStorage-lease path runs. B skips only while A's fetch is still open.
- Offline, mount readers A and B. A enqueues `POST /api/deployments` with a `placeholderId`.
- Stub `fetch` to wait on a promise the test holds open, then answer 409.
- Go online with `setOnline(true)` only. Don't dispatch an `online` event: that runs each reader's own listener, which flushes by itself and races the explicit calls. Call `a.flush()` without awaiting it. `await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))`, then `await b.flush()`.
- Expect B: `pending 1`, `pendingDeployCreate true`.
- Release the promise and await A. Expect A: `pending 0`, `failed 1`.
- `await b.flush()` again. Expect `fetch` called once in total, and B: `pending 0`, `failed 1`, `pendingDeployCreate false`.
- Before 2.2 it fails at B's `pending` (stays 1).

**4.3 Re-read on reconnect:** `tests/components/hotfix-reconnect-reread.test.tsx` (harness as `tests/components/pr5b-pickup-deployed.test.tsx:12-40`: mock `useOfflineQueue`, `useAuth`, `useToast`; stub `fetch`). The URL is `/operator/my-deployment` with no query string; don't copy that file's `?fromRequestId=` `beforeEach`. `afterEach`: `vi.useRealTimers()`, `vi.unstubAllGlobals()`.
- Case 1: render `<><RefreshOnReconnect /><MyRigPage /></>` with `/api/deployments/mine` answering `{ data: null }` → "No active deployment". Switch the stub to answer a rig. Dispatch `new Event('online')` inside `act` → "No active deployment" goes away and an "End Deployment" button shows.
- Case 2: render `<RefreshOnReconnect />` alone and listen for `INVALIDATE_EVENT` on `window`. Two `online` events 1 s apart give one event carrying every `ENTITY_KEYS` entry. Use `vi.useFakeTimers({ toFake: ['Date'] })`, and advance the clock 11 s → a third `online` gives a second event. Remove the listener at the end.
- Case 3 (2.6): a rig with one line → open End Deployment → the stub now answers the rig with a second line → dispatch `online` → the dialog shows the second line, and nothing crashes.

**4.4 Offline page:** `tests/components/offline-page-reload.test.tsx`
- `vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-nonce': 'test-nonce' }) }))`, then `render(await OfflinePage())`.
- Expect exactly one `<script>`, with `nonce="test-nonce"`.
- `vi.stubGlobal('location', { ...window.location, reload })`. (`vi.spyOn(window.location, 'reload')` throws under this jsdom.) Run `new Function(script.textContent ?? '')()` → reload not called yet. Dispatch `new Event('online')` → reload called once. `vi.unstubAllGlobals()` in `afterEach`.

Local gate before the PR: `npx prisma generate`, `npx tsc --noEmit`, `npx eslint .` (0 errors; no new warnings in touched files), `npm run test:ui`, `npm run build`, and `wc -l "src/app/(operator)/operator/my-deployment/page.tsx"` → 1467 (unchanged). The DB suite runs in CI.

## 5 · Owner steps after merge

1. Merge inside D48 (after 8 pm Central, or when Active Deployments = 0). State the count.
2. Watch the deploy through env-drift and `/api/health`.
3. **Get the new build on the phone first:** fully close the app, reopen it online, and wait 10 s. If "A new version of AHITS is available" shows, tap Reload.
4. **Phone test, as an operator:** My Deployment → Add items → pick two items, don't save → airplane mode on → wait 5 s → airplane mode off → wait 10 s → the picks are still there, and the page did not reload. Close without saving.
5. **Same phone, in the browser (Safari or Chrome), online:** open `<staging URL>/operator/dashboard`, sign in if asked, and wait 10 s. On iPhone the browser keeps its own copy of the app, apart from the home-screen app, so it needs the new build too. Then airplane mode on → open `<staging URL>/operator/dashboard?hf2=1` (a new query string is never in the cache, so "You're offline" shows) → airplane mode off → the dashboard loads by itself.
6. Other phones pick up the fix on their next app launch (D31 auto-apply). Until then, a phone may still reload once.

## 6 · Legacy data

None.

## 7 · Session close

- `AHITS_A6_DEVICE_CHECKLIST.md`:
  - Add **row 30**: `**Reconnect mid-form (HF2)** — in Add items or End deployment, make picks → airplane mode on, then off → wait 10 s → the picks are still there, and no reload. On the offline page, airplane mode off → the real screen loads by itself.` Columns as row 13.
  - Row 13: append `Every count (header badge, banner, screen) is back to 0 within 30 s.`
  - `:5`: "29 rows × 5 targets" → "30 rows × 5 targets".
- `STATUS.md`:
  - One resume-box line (hotfix merged, revision).
  - Correct the PIN-rotation line to: **"PIN rotation (#269): operators only, by admin Reset PIN. Don't use Change PIN or Reset PIN on admin accounts: admin sign-in takes an 8+ character password, and a 6-digit PIN written over it locks the admin out. Admin credentials wait for P1-2."**
- One `CHANGELOG.md` line (create it if absent: date · PR · outcome · revision).
- Commit this file with the PR. A docs-only follow-up PR after the merge, as usual. Named files only.

## 8 · Size and behaviour changes (PR body)

One PR. Do not split.

Behaviour changes:
- Signal returning no longer reloads the screen. Screens re-read their data instead (admin tables flash their loading state). The offline page still reloads itself.
- An open End deployment dialog now takes in a line added while it was open, instead of crashing.
- Open phones now pick up a new build only when the app is relaunched or the operator taps Reload on the update prompt. Later PRs must keep working with the previous build's screens for longer.

---

## 9 · Paste into Claude Code

```
Build the hotfix in AHITS_HOTFIX_2026-10-25_KEEP-WORK-ON-RECONNECT.md (repo root), exactly as written. Follow CLAUDE.md. Branch from current development: feature/20261025/Agricarbon-USA-hotfix-keep-work-on-reconnect. Named files only (never git add -A): next.config.ts, src/hooks/useOfflineQueue.ts, src/components/shared/RefreshOnReconnect.tsx, src/components/ui/AppShell.tsx, src/app/~offline/page.tsx, src/app/sw.ts, src/components/shared/DispositionDialog.tsx, the four test files in §4, and this packet. Run the §4 local gate. Open the PR to development titled "Hotfix · Signal returning no longer reloads the app", with a body covering what and why, a diff summary, the tests, and the §8 behaviour changes. Give me the PR number when CI is green. Do not merge it. No reverts.
```

Merge (after the owner's go):
```
Go on PR #<n>. Merge only inside D48 and state the Active Deployments count and the time read. Watch the deploy through env-drift and /api/health. Then do §7 of AHITS_HOTFIX_2026-10-25_KEEP-WORK-ON-RECONNECT.md as one docs-only PR, and merge it on green. Steps 3–5 of §5 are mine. No reverts. Report back.
```
