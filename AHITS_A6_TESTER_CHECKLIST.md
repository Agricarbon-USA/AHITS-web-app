# AHITS — A6 Offline Device Test · Tester Checklist

_A hand-to-a-tester version of `AHITS_A6_DEVICE_CHECKLIST.md`. Follow it top-to-bottom on each device. No engineering background needed. Plan ~45–60 min per device._

**This is the pilot gate:** when every device passes the CRITICAL items, the app is cleared for a real-operator pilot.

---

## Before you start (read once)

**What you're testing:** the app must keep working with **no internet** — an operator in a field with no signal has to be able to log in, do a daily check, start/end a deployment, and have it all sync up later when signal returns. Nothing they do offline may silently disappear.

**Prerequisite (ask the dev):** confirm the latest staging build includes the offline-queue fixes (FND-7 + FND-14, Batches 2–4). Run this **only** against a staging deploy that has them — otherwise you'll be testing old behavior.

**App URL:** `https://ahits-web-app-staging-vdz5yvke2a-uc.a.run.app`
**Log in as an operator** (PIN). Use a **throwaway test vehicle/rig** so nothing real is disturbed — and clean it up when you're done.

**The 5 devices to test** (do them one at a time):
1. **Desktop** (Chrome or Edge) — the control
2. **iOS in Safari** (just the browser tab, not installed)
3. **Android in Chrome** (browser tab, not installed)
4. **iOS installed** (Safari → Share → **Add to Home Screen** → open from the icon)
5. **Android installed** (Chrome → ⋮ → **Install app** → open from the icon)

**How to go offline:**
- **Phones:** turn on **Airplane Mode** (don't just close the app or lock the screen).
- **Desktop:** open DevTools (F12) → **Network** tab → set throttling to **Offline**.
- **"Reconnect"** = turn the radios back on and wait ~10 seconds.

**⚠️ The one ritual that matters — do this before any offline test on each device:**
1. Fully remove the app first: if installed, **delete the PWA icon and reinstall it**; in a browser tab, open DevTools → Application → **Unregister service worker** + **Clear storage**.
2. Open the app **online** and **wait ~10 seconds** (this lets it pre-load the screens for offline use).
3. **Now** go offline and start testing.
_Skipping this is the #1 cause of false failures._

**Marking results:** for each step write **P** (pass), **F** (fail — describe what you saw), **—** (not applicable), or **S** (skipped). If something fails, note **which screen** and **what happened**.

---

## SESSION 1 — The offline keystone (CRITICAL — stop if these fail)
_If these three don't pass, don't bother continuing on that device — flag it to the dev._

**1.1 Stay signed in when you reopen offline** · all devices
- **Do:** log in online → do the offline ritual above → go offline → fully close the app → reopen it.
- **Pass if:** it opens to a **usable operator screen**, NOT the login page.
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**1.2 Move around offline without getting logged out** · all devices
- **Do:** while offline, tap between Dashboard → Daily Check → My Deployment → Scan, and into a Browse page.
- **Pass if:** no logout, your name still shows, every screen loads (no "you're offline" dead-end).
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**1.3 Install & launch** · installed apps only
- **Do:** install the PWA (steps above) and open it from the home-screen icon.
- **Pass if:** it opens straight to the operator dashboard.
- Result: iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

---

## SESSION 2 — Offline field work (CRITICAL)
_The core job: do these offline, then Session 4 confirms they synced._

**2.1 Daily check — all pass** · all devices
- **Do:** offline, complete a daily check with every item "Yes" and submit.
- **Pass if:** it shows as **queued/saved** (not an error).
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**2.2 Daily check — a failure** · all devices
- **Do:** offline, mark one item **"No"**, add a note, submit.
- **Pass if:** it **won't submit until you add the note**, then queues.
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**2.3 Start a deployment offline** · all devices
- **Do:** offline, build a rig — add a vehicle, a serialized item (pick a unit), and a consumable (pick a source hub) — and tap **Launch**.
- **Pass if:** Launch is **enabled** and the deployment **queues**.
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**2.4 Launch is blocked when something's missing** · all devices
- **Do:** try to advance the New-Deployment steps with a serialized item but **no unit picked**.
- **Pass if:** **Next is blocked with a clear reason** (not a dead button, not a crash).
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**2.5 End a deployment & return equipment** · all devices
- **Do:** end a deployment; you must pick a **"Final destination (hub)"**; return a consumable.
- **Pass if:** the hub selector is **required**, and after reconnect (Session 4) that hub's stock went **up** by what you returned — nothing vanished.
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**2.6 Damage requires a photo** · phones
- **Do:** on a return/end, set an item to **Mark Inoperable** and try to submit.
- **Pass if:** submit is **blocked until you add a damage photo**.
- Result: iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**2.7 Photo saved offline** · phones
- **Do:** attach a photo to an offline action.
- **Pass if:** it shows **"saved on device"**; after reconnect it uploads and appears.
- Result: iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

---

## SESSION 3 — Everyday flows

**3.1 Scan a QR → daily check** · phones · CRITICAL
- **Do:** scan a vehicle's QR code → tap **Start Daily Check**. Try one vehicle **not** on your rig too.
- **Pass if:** the **correct vehicle is preselected** (shows its name, not a blank "—"). Also confirm the **rear camera** opens (not the photo library).
- Result: iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**3.2 Rental add — online vs offline** · all devices
- **Do:** online, add a rental vehicle to a rig (should succeed). Offline, try again.
- **Pass if:** online works; offline shows **"needs an internet connection"** (a clear message, not a silent nothing).
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**3.3 Forced PIN reset** · one device is enough · CRITICAL
- **Do:** have an admin reset this operator's PIN, then have the operator use the app.
- **Pass if:** the operator is **forced to the change-PIN screen** and can't do anything else until they set a new PIN.
- Result: one device ⬚ — Notes: ______

---

## SESSION 4 — Reconnect & sync integrity (CRITICAL — the whole point)

**4.1 Everything syncs on reconnect** · all devices
- **Do:** after doing the offline actions above, **reconnect** and wait ~10s.
- **Pass if:** the queued items **replay automatically, once**, the pending count returns to **0**, and your daily check(s) + deployment appear in history. A failing check raises an **admin alert**. Exactly **one** deployment was created (not two).
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**4.2 Queued-deployment state (no double-launch)** · all devices
- **Do:** right after the offline launch (2.3), stay on the **My Deployment** tab.
- **Pass if:** it shows **"Deployment Queued"** (not the empty "Start Deployment" screen), and the **Start button is gone** (so you can't launch twice). After reconnect, the normal **My Deployment** view appears with Add Vehicles / Add Items.
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

---

## SESSION 5 — Mobile look & feel · installed apps / phones

**5.1 Nothing clipped by the notch** · installed apps
- **Pass if:** the top bar (title/menu) isn't hidden behind the notch/Dynamic Island, and content + bottom tabs clear the home-indicator bar.
- Result: iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**5.2 Bottom tabs work** · phones
- **Pass if:** the bottom tabs (Home / Check / Deploy / Scan) are thumb-reachable and highlight the screen you're on.
- Result: iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**5.3 Update prompt (no surprise reloads)** · all devices
- **Do:** while the app is open, have the dev push a new staging build.
- **Pass if:** a **"new version available — Reload"** message appears (it does **not** silently swap while you're mid-form).
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

---

## SESSION 6 — Storage safety (edge cases — do if time allows)

**6.1 Can't-save warning in private mode** · iOS Safari Private / a private tab
- **Do:** open a **Private Browsing** tab, log in, go offline, try a daily check.
- **Pass if:** you get a banner like **"This device can't save offline actions"** and the action returns an error — **not** a fake "saved offline" confirmation.
- Result: iOS-web(Private) ⬚ · iOS-PWA ⬚ — Notes: ______

**6.2 Storage-almost-full warning** · any device
- **Do:** on a device with nearly-full storage (or Desktop DevTools → Application → Storage → simulate a small quota), go offline and try an action.
- **Pass if:** a **"Device storage is nearly full"** warning shows **before** saves start failing.
- Result: Desktop ⬚ · iOS-web ⬚ · Android-web ⬚ · iOS-PWA ⬚ · Android-PWA ⬚ — Notes: ______

**6.3 "We may have lost your queued actions" warning** · iOS · watch-item
- **Do (proxy):** queue an offline action (note the pending count), then either wait 7+ days, or clear the app's IndexedDB via DevTools **while keeping** its localStorage.
- **Pass if:** next open shows **"Your device may have deleted queued offline actions."**
- Result: iOS-web ⬚ · iOS-PWA ⬚ — Notes: ______

**6.4 Private photos stay private** · Desktop
- **Do:** copy a raw photo URL (a `…/object/public/photos/…` link) and open it in an **incognito** window.
- **Pass if:** it's **denied (403)** — while the same photo still shows inside the app.
- Result: Desktop ⬚ — Notes: ______

---

## Sign-off

| Device | OS + browser version | Tester | Date | CRITICAL all pass? | Any ❌ filed? |
|---|---|---|---|---|---|
| Desktop | | | | ⬚ | |
| iOS web (Safari) | | | | ⬚ | |
| Android web (Chrome) | | | | ⬚ | |
| iOS installed (PWA) | | | | ⬚ | |
| Android installed (PWA) | | | | ⬚ | |

**iOS extra watch-items (note if seen):**
- ⬚ Installed app keeps you logged in across a close/reopen.
- ⬚ Queued actions + local photos survive an **overnight** gap (leave it offline overnight, reopen, confirm nothing was lost).

**Result:** **A6 PASSES → pilot line reached** when every CRITICAL item is P across all 5 devices. Any ❌ → send the dev the row + device + what you saw, and re-test that row after the fix.

---

_CRITICAL items (must pass for pilot): 1.1, 1.2, 1.3, 2.1–2.5, 3.1, 3.3, 4.1, 4.2. Everything else is important but not pilot-blocking. Full technical/traceability version: `AHITS_A6_DEVICE_CHECKLIST.md`._
