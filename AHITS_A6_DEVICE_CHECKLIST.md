# AHITS — A6 Real-Device Offline Pass (sign-off checklist)

_The pilot gate. Run on the five targets below; tick each cell. Every fix this pass depends on is merged to `development` (offline-auth, G1 data-loss, UR-006 launch, UR-008 ergonomics, durable-queue flows). Staging URL: `https://ahits-web-app-staging-vdz5yvke2a-uc.a.run.app`._

> **⚠️ Known issue on step 3 (offline navigation) — fix in flight (UR-038).** The first run showed offline tab-switching reverting to `/login` (Android) / freezing on the offline page (iOS) on all platforms. Root-caused and fixed on branch `feature/20260629/max-slater-offline-rsc-nav` (SW now caches RSC navigations + prefetches routes online; authed pages no longer precached). **Before re-running step 3:** deploy that fix, then on each device **fully drop the old service worker** (uninstall+reinstall the PWA, or DevTools → Unregister + Clear storage), open the app **online and wait ~10 s** (so routes prefetch), **then** go offline. If it still fails, note which screen + which platforms + whether you did the online-warm step.

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

## iOS-specific watch-items (note if seen)
- ☐ Installed PWA keeps you **logged in across an app close/reopen** (cookie-jar check).
- ☐ Queued writes + local photos **survive an overnight gap** (storage-eviction check).
- ☐ `Scan QR` opens the **rear camera** (not the photo library).

## Sign-off
- Devices/OS/browser versions tested: ________________________________
- Date / tester: ________________________________
- All scenarios pass (or every ❌ has a filed UR-#): ☐
- **A6 PASS → pilot line reached.** Any failure → file a UR-# and re-run that row after the fix.
