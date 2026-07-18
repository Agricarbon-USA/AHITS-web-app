# AHITS — Session Handoff · 2026-07-18 (session 9)

> STATUS: canonical · UPDATED: 2026-07-18 · READ-WITH: `STATUS.md`, `DECISIONS.md`

## What shipped

**CC-25 · Live-camera QR viewfinder (PR #186, merged `34ba13b`).** Replaced the shutter-tap → still-image → jsQR flow — the most-repeated hardware gesture — with a continuous `getUserMedia` viewfinder, in ONE shared component consumed in three places. **This completes the reflection-increment sequence (CC-22 → CC-25).**

- **`src/lib/qr-scan.ts`** — the decode step, isolated so it's `vi.mock`-able (jsdom has no camera). `BarcodeDetector` where available (native rate); else **jsQR capped ≤8 decodes/sec on a ≤640px downscaled frame** (never full-res per rAF). jsQR imported **once**, not per frame. Ambient `BarcodeDetector` type (not in lib.dom). Torch + BarcodeDetector are absent on iOS Safari, so **the jsQR path is the real iOS path**.
- **`src/components/shared/QrScannerDialog.tsx`** — `<video playsinline muted autoplay>` viewfinder. `onResolve` union (`ok` / `not-found` / `offline` / `error+message`) so the caller owns the lookup and the dialog shows **honest distinguished failures** — "Code not found" (server said no) vs "Can't verify right now" (fetch threw / offline). The old "Failed to process image" lie is gone. Manual-entry fallback; torch toggle where the track supports it; permission-denied / no-camera → the **relocated** photo-capture still-image path (not a dead end). Stream lifecycle in one `open`-keyed effect: stop on close/unmount/tab-hidden with an **async-close guard** (stop the stream if the dialog closed while `getUserMedia` was awaiting), re-acquire on visibility-regained while open; single-decode-in-flight guard reset in `stop()` so an app-switch mid-decode doesn't return to a dead viewfinder.
- **Three consumers**, each supplying its own `onResolve`, with every per-site `handleCapture`/`handleQRScan` decode loop **and** manual-lookup handler deleted (grep-confirmed: 0 `import('jsqr')`/`createImageBitmap`/`capture=` left in the two files):
  - `operator/scan` — resolve a label to a unit **or** vehicle, then show its action panel.
  - `my-deployment` ×2 (`NewDeploymentDialog` kit builder + `MyRigPage` Add-Items) — **item-scoped**: validate the scanned unit matches the slot and is `AVAILABLE` (found-but-wrong → an honest `error` message, not a silent no-op).
- **`AHITS_A6_DEVICE_CHECKLIST.md`** — rows 23–28 (live decode iOS Safari + Android, torch, permission-denied fallback, app-switch resume + no background stream, honest errors); updated the stale iOS `Scan QR` watch-item.
- **Component test** (`tests/components/QrScannerDialog.test.tsx`) — mocked decode, no-camera fallback (not a dead end), photo-path decode, both honest error strings. `test:ui` now **18/18**.

## Notable this session

- **Consulted the advisor before building** (large component). Baked in its 5 points: a mockable decode seam, the A6-only-acceptance caveat, the `getUserMedia` async-close race guard, deleting the per-site handlers, and framing the photo path as *relocated* (item 1 "replace photo-capture" and item 4 "fall back to photo-capture" are the same code moved inside the dialog).
- **Restructured for the react-hooks 7 lint** — the first cut mutated refs during render and had a self-referencing `loop` useCallback (both hard errors). Moved the whole camera/decode lifecycle into one `open`-keyed effect with local functions (hoisted `tick` self-references cleanly) + a post-commit ref-sync effect.
- **Self-review bug fixed:** a tab hidden mid-decode left the `decoding` guard stuck `true`, so app-switch-resume returned a dead viewfinder — reset it in `stop()`.

## Merge mechanics + honest smoke gap

PR #186 merged via `gh pr merge --admin --squash` (self-approval block — sixth consecutive packet this way; Max authorized each). **Smoke was unauthenticated only** (health 200/DB up, login renders): the live scanner is behind operator auth, the staging session had expired, and there's no camera in the sandbox. **The core CC-25 acceptance is A6-device-gated and NOT CI-verifiable** — green CI ≠ acceptance met. It rests on the A6 real-device pass (rows 23–28) + the 18 CI component tests.

## Resume points

1. **Next packet: CC-12 (Batch 6b/perf)**, then CC-14 (Today) → CC-26 (daily-check viewer, before the pilot fortnight) → pilot fortnight (CC-27 filler) → CC-15/16/17/18. Per `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`.
2. **CC-14 owns the deferred glossary cluster** (Fulfill/Pick-up/Check-out/Claim) with its `Rig.requestId` model fix — see D9.
3. **A6 device pass** — now also gates CC-25's live-camera acceptance (rows 23–28). Still not started; run in parallel.
4. **CC-22 live acceptance pass** (Max) — real-DSN Sentry, cron heartbeat/silence. Secrets provisioned.
5. **CC-23 / CC-24 real-device visual re-check** (Max) — the list is in STATUS §3.
6. **D5/D6/D7 open PENDING decisions** before the pilot fortnight.

## New in the repo this session

- `src/lib/qr-scan.ts` (decode) + `src/components/shared/QrScannerDialog.tsx` (the one live scanner) — **reuse QrScannerDialog for any new QR capture**; supply an `onResolve` returning the union. Never hand-roll a `getUserMedia`/jsQR loop again.
- The decode seam is deliberately mockable — component-test QR-consuming UI by mocking `@/lib/qr-scan`, not a camera.
