# AHITS — A6 Real-Device Offline Pass (sign-off checklist)

> **⚠️ PILOT GATE IS A6-LITE, NOT THIS FULL MATRIX — see `DECISIONS.md` D13 (2026-07-20).** The pilot gate is **rows 2, 5, 6, 19, 23 on Android only** (data-safety keystones + live scan). The **full matrix below (now 29 rows × 5 targets, incl. all iOS columns) is PARKED** and its trigger is **BEFORE the Time/Invoicing capstone (CC-17) ships** — offline money-writes must not go live on an unverified offline base. Run A6-Lite for the pilot; run the whole thing before CC-17.
>
> **AMENDMENT — `DECISIONS.md` D14 (2026-07-21):** CC-15 adds **row 29 to A6-Lite** (location grant AND deny at the daily check). If CC-15 merges pre-pilot, the **iOS A6-Lite is now rows 2 / 5 / 6 / 19 / 23 / 29** and must re-run on the post-CC-15-merge build (target Fri 2026-07-24); Android (green 07-20) needs a quick re-verify of rows **2 / 19 / 29** only.
>
> **✅ A6-LITE SIGN-OFF (Android) — Maxwell Slater · 2026-07-20.** Rows **2, 5, 6, 19, 23 all PASS on Android.**
> **☐ A6-LITE (iOS installed PWA) — REQUIRED before the 2026-07-27 start (D13 amended 2026-07-20 — cohort now includes iOS operators; D14 added row 29 with CC-15).** Rows **2 / 5 / 6 / 19 / 23 / 29** on one iOS device (installed PWA); **this is the one outstanding pre-start gate** (target Fri 2026-07-24). **Android re-verify:** rows **2 / 19 / 29** only (GPS capture touched the check flow the 07-20 Android pass verified). << Max to run + sign >>.
> The rest of the full matrix (edge rows 20–22 + the all-column ceremony) remains unrun and PARKED — trigger = pre-CC-17.

_~~The pilot gate.~~ (A6-Lite is the pilot gate — see D13 banner above.) Run on the five targets below; tick each cell. Every fix this pass depends on is merged to `development` (offline-auth, G1 data-loss, UR-006 launch, UR-008 ergonomics, durable-queue flows). Staging URL: `https://ahits-web-app-staging-vdz5yvke2a-uc.a.run.app`._

> **✅ Step 3 (offline navigation) — FIXED & MERGED (UR-038, PR #127 / `3767f3a`).** The SW now serves RSC navigations + prefetches routes online; authed pages are no longer precached. **Test procedure for step 3 (still required):** on each device **fully drop the old service worker** (uninstall+reinstall the PWA, or DevTools → Unregister + Clear storage) — but note this wipes the queue, so **do it BEFORE, never mid-pass** — open the app **online and wait ~10 s** (so routes prefetch), **then** go offline. If it still fails, note which screen + which platforms + whether you did the online-warm step.

## Targets & how to install
- **Desktop** (Chrome/Edge) — control. No install needed.
- **iOS web** — open the URL in **Safari** (browser tab, not installed).
- **Android web** — open the URL in **Chrome** (browser tab, not installed).
- **iOS PWA** — Safari → Share → **Add to Home Screen** → open from the icon.
- **Android PWA** — Chrome → ⋮ → **Install app** → open from the icon.

Log in as a real **operator** on each (PIN). Use a throwaway test rig/vehicle so nothing real is disturbed; clean up after.

## How to go offline
- **Phones:** turn on **Airplane mode** (or toggle Wi-Fi+cellular off). Don't just close the lid.
- **Desktop:** DevTools → Network → **Offline**.
- "Reconnect" = turn the radios back on and wait ~10s.

---

## Scenario matrix (tick per platform)

Legend: ✅ pass · ❌ fail (note it) · — n/a

| # | Scenario (do it, then check the result) | Desktop | iOS web | Android web | iOS PWA | Android PWA |
|---|---|:--:|:--:|:--:|:--:|:--:|
| 1 | **Install/launch** — app opens to the operator dashboard | — | ☐ | ☐ | ☐ | ☐ |
| 2 | **Cold offline launch** — go offline, fully close the app, reopen → lands on a **usable screen, NOT the login page** (offline-auth keystone) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | **Stay logged in offline** — while offline, tap between tabs (Dashboard → Daily Check → My Deployment → Scan) and into a Browse/admin page → **no logout**, identity still shown | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | **Daily check offline (pass)** — complete an all-pass check offline → shows queued; reconnect → syncs once, appears in history | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | **Daily check offline (fail)** — mark an item "No" + note → queues; reconnect → a **failed-check alert** appears for admins | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | **Launch a deployment offline** — build a rig (vehicle + a serialized item with a unit picked + a consumable with a source hub) → **Launch is enabled** and queues; reconnect → exactly one deployment created | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | **Launch gating** — try to advance the New-Deployment wizard with a serialized item but **no unit** picked → **Next is blocked** with an inline reason (not a dead Launch button) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | **End/return with destination (G1)** — end a deployment; the **"Final destination (hub)"** selector is required; return a consumable → after reconnect, that hub's stock went **up by the returned qty** (nothing "disappeared") | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | **Damage requires a photo** — on a return/end, set an item to **Mark Inoperable** → submit is **blocked until a photo is added** ("Add a damage photo") | ☐ | ☐ | ☐ | ☐ | ☐ |
| 10 | **Photo capture offline** — attach a photo to an offline write → shows "saved on device"; reconnect → it uploads and renders | — | ☐ | ☐ | ☐ | ☐ |
| 11 | **QR → daily check** — scan a vehicle's QR → tap **Start Daily Check** → the **correct vehicle is preselected** (try one **not** on your rig too — it should still load by name, not "—") | — | ☐ | ☐ | ☐ | ☐ |
| 12 | **Rental add** — online: add a rental to a rig → **succeeds**. Offline: → shows **"needs an internet connection"** (no silent failure) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 13 | **Reconnect sync** — after any offline batch, reconnecting **auto-replays** the queue once and the queued count returns to 0 | ☐ | ☐ | ☐ | ☐ | ☐ |
| 14 | **Safe-area (UR-008)** — installed PWA only: the top bar (title/hamburger) is **not clipped by the notch/Dynamic Island**, and content/bottom-nav clear the **home indicator** | — | — | — | ☐ | ☐ |
| 15 | **Bottom tab bar (UR-008)** — mobile: the bottom tabs (Home/Check/Deploy/Scan) are thumb-reachable and highlight the active screen | — | ☐ | ☐ | ☐ | ☐ |
| 16 | **Update prompt (UR-008)** — after a new staging deploy lands while the app is open → a **"new version available — Reload"** snackbar appears (no silent swap mid-form) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 17 | **PIN-reset gate (UR-004)** — have an admin reset this operator's PIN → on next use the operator is **forced to the change-PIN screen** and can't perform other actions until they set a new PIN | ☐ | ☐ | ☐ | ☐ | ☐ |
| 18 | **Private photos (UR-005b)** — desktop: copy a raw Supabase `…/object/public/photos/…` URL, open in an **incognito** window → **403/denied** (while in-app photos still load) | ☐ | — | — | — | — |
| 19 | **Offline queued state (C1)** — after row 6 offline launch, stay on the My Deployment tab → shows **"Deployment Queued"** (not the empty "Start Deployment" screen); the **Start Deployment button is absent** (can't double-launch); reconnect → **My Deployment view** appears with Add Vehicles / Add Items available | ☐ | ☐ | ☐ | ☐ | ☐ |
| 20 | **IDB write-failure banner** — open a **Safari Private Browsing** tab, log in, go offline, attempt any offline action (e.g. daily check) → the banner shows **"This device can't save offline actions"** and the action returns an error ("Couldn't save…"), NOT a "saved offline" confirmation | — | ☐ | — | ☐ | — |
| 21 | **Quota-pressure warning** — on a device with near-full storage (or simulated via DevTools → Application → Storage → "Simulate" quota), go offline and try an action → the **"Device storage is nearly full"** warning banner appears **before** writes start failing | ☐ | ☐ | ☐ | ☐ | ☐ |
| 22 | **Eviction-detection banner** — on iOS Safari, queue ≥1 offline action, note the app shows a pending count, then force-quit the app and wait 7+ days (or manually clear IDB via DevTools while preserving localStorage) → on next open the banner shows **"Your device may have deleted queued offline actions"** | — | ☐ | — | ☐ | — |
| 23 | **Live QR decode — operator/scan (CC-25)** — open **Scan** → the viewfinder decodes a unit/vehicle label **live, with no shutter tap** → the record's action panel appears. **Verify on iOS Safari** (no BarcodeDetector there — this exercises the jsQR path that is iOS's real path) | — | ☐ | ☐ | ☐ | ☐ |
| 24 | **Live QR decode — my-deployment (CC-25)** — in the New-Deployment kit builder **and** Add-Items, tap **Scan QR** on a serialized slot → the viewfinder decodes the unit **live**; scanning a wrong or unavailable unit shows a clear message (e.g. "belongs to a different item" / "already checked out"), not a silent no-op | — | ☐ | ☐ | ☐ | ☐ |
| 25 | **Torch toggle (CC-25)** — where the track supports it (typically Android): a **torch button** appears in the viewfinder and toggles the light. On **iOS Safari** torch is unsupported → the button is correctly **absent** (no dead control) | — | ☐ | ☐ | ☐ | ☐ |
| 26 | **Permission-denied / no-camera fallback (CC-25)** — deny camera permission (or use a device with no camera) when opening a scanner → it **falls back to "take a photo" + manual entry**, NOT a blank/black screen or a dead end | — | ☐ | ☐ | ☐ | ☐ |
| 27 | **App-switch resume + no background stream (CC-25)** — start a scan, switch to another app, then return → the **viewfinder is live again** (not frozen/black). While away, the camera is **stopped** (no OS camera-in-use indicator); closing the scanner also stops it | — | ☐ | ☐ | ☐ | ☐ |
| 28 | **Honest scan failures (CC-25)** — scan or type an **unregistered** code → **"not found"**; go **offline** and scan a real code → **"can't verify right now"**. Never the old **"failed to process image"** lie | ☐ | ☐ | ☐ | ☐ | ☐ |
| 29 | **Location grant AND deny at the daily check (CC-15 — A6-Lite keystone, D14)** — submit a daily check with location **granted** (the review step shows the "saved once per check… never live tracking" line; the check submits) **and**, on a second check, with location **denied/dismissed** → **the check still submits either way** — location NEVER blocks or fails a check. (Offline variant: an airplane-mode check still submits and later syncs.) **iOS field note:** run the **DENY leg first** — the prompt fires once, then sticks; verify the check submits with null coords — **then** flip Settings → [app] → Location → **Allow** for the grant leg. **Never reinstall mid-pass** (it wipes the SW + queue and invalidates rows 2/19). Row 23 runs in the PWA context (expect a fresh camera prompt; the photo-capture fallback must engage if the viewfinder is refused). | ☐ | ☐ | ☐ | ☐ | ☐ |

## iOS-specific watch-items (note if seen)
- ☐ Installed PWA keeps you **logged in across an app close/reopen** (cookie-jar check).
- ☐ Queued writes + local photos **survive an overnight gap** (storage-eviction check).
- ☐ `Scan QR` opens a **live rear-camera viewfinder** (not the photo library) and decodes **without a shutter tap** (CC-25).

## Sign-off
- Devices/OS/browser versions tested: ________________________________
- Date / tester: ________________________________
- All scenarios pass (or every ❌ has a filed UR-#): ☐
- **A6 PASS → pilot line reached.** Any failure → file a UR-# and re-run that row after the fix.
