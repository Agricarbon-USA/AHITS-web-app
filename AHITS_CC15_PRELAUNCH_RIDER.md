# CC-15 Pre-Launch Rider — Map capstone pulled ahead of the pilot

> STATUS: current · UPDATED: 2026-07-21
> READ-WITH: `AHITS_CLAUDE_CODE_INSTRUCTIONS.md` (CC-15) · `AHITS_PILOT_CHARTER.md` · `DECISIONS.md`
> **Decision (owner, 2026-07-21):** full CC-15 (steps 1–6) lands before pilot launch Monday 2026-07-27, under the freeze rules below. Step 7 (NS-4 weather stamps) is explicitly OUT — post-launch.

## Why now
Route history is only as good as its data: every daily check submitted before GPS capture ships is a permanently blank spot in the trail. Landing capture before day 1 means the pilot's own checks build the map from the start.

## The rules (non-negotiable)

1. **Hard freeze: Thursday 2026-07-23 EOD.** Everything merged and smoked by then. Anything not merged by the freeze **parks to pilot week 2** — the pilot does not wait for CC-15, and CC-15 must never become a launch gate. (Same class of rule as D1: nothing new gates the pilot.)
2. **Two PRs even at full scope.** PR-1 = steps 1–2 (additive migration + GPS capture at check-in) — target Wednesday, merge early per the packet. PR-2 = steps 3–6 (Mapbox secret mount, admin map, route-history trail, crew map). If only PR-1 makes the freeze, that is a good outcome: capture runs from day 1 and the maps ship in week 2 against real data.
3. **Secret ceremony, in order:** Max creates `AHITS_MAPBOX_TOKEN` in Secret Manager via the Cloud Console UI (ENABLED version, deploy service account granted Secret Manager Secret Accessor — same steps as the CC-22 secrets) **before** the deploy that mounts it. CC adds the `--set-secrets` Makefile mapping in the same change as first use. Server-side only, never `NEXT_PUBLIC_`. If the secret isn't ENABLED yet, PR-2's deploy waits — never mount a missing secret.
4. **Permission prompt is resolve-or-skip.** Denied, dismissed, or timed-out geolocation → the check submits with no coords. The check can NEVER fail or block on location. Show a one-line explainer before the browser prompt: *"Location is saved once per daily check so the team can see where rigs have been — never live tracking."* (This is the D2 trust framing; keep it.)
5. **FND-35 precondition:** confirm the late-response answer-wipe fix is in `buildPayload()`'s file before touching it; if absent, fix it as PR-1's first commit.

## Smoke (merge gates)
**PR-1:** submit a daily check with location granted (coords land in the row); submit with location denied (check still succeeds, nulls); airplane-mode check queues and syncs with coords intact.
**PR-2:** admin map shows one pin per active deployment at latest-check coords with recency colors (green <24h / amber 24–48h / red >48h, businessDate-aware); tooltip deep-links to the deployment drawer; a rig with ≥2 GPS-bearing checks renders a route trail (point sequence, historical only); operator crew map shows other operators' last-known positions with the coordination framing; nothing anywhere implies live position.

## A6 amendment
A6-Lite gains **row 29**: *location-permission grant AND deny paths at the daily check — check submits either way.*
- After the last pre-launch merge: **iOS full A6-Lite** (rows 2 / 5 / 6 / 19 / 23 / 29) on the final build — Friday 2026-07-24.
- Android (passed 07-20, pre-CC-15): quick re-verify of rows 2 / 19 / 29 only.

## Session close
Record **D14** in `DECISIONS.md`: CC-15 pulled ahead of the pilot; Thursday 07-23 EOD freeze with park-to-week-2 fallback; weather stamps deferred; A6-Lite row 29 added; A6-Lite re-run required on the post-merge build. Update `STATUS.md` and the A6 checklist per the standard 7-step close.

---

## PASTE TO CLAUDE CODE

```
Execute CC-15 from AHITS_CLAUDE_CODE_INSTRUCTIONS.md with this rider. Read the CC-15 packet, DECISIONS.md D2, workplan §7A, and Master Roadmap §7.2A first. Review seats: Fable (D2 scope guard), Antagonist, SRE, Operator-lens.

AMENDMENTS FOR THIS RUN:
- Pilot launches Monday 2026-07-27. HARD FREEZE Thursday 2026-07-23 EOD: anything not merged and smoked by then parks to pilot week 2. CC-15 must never gate the launch — if we slip, we park, we do not push the pilot.
- Structure as TWO PRs. PR-1 = steps 1-2 only (additive migration DailyCheck.gpsLat/gpsLng/gpsAccuracy Float? + getCurrentPosition in buildPayload, resolve-or-skip before enqueue). Target Wednesday. Confirm FND-35 is fixed in that file first; if not, fix it as the first commit. PR-2 = steps 3-6 (secret mount, admin map, route history, crew map). Step 7 (weather stamps) is OUT — do not build it.
- Location capture NEVER blocks or fails a check: denied/dismissed/timeout → submit with null coords. Add a one-line pre-prompt explainer: "Location is saved once per daily check so the team can see where rigs have been — never live tracking."
- Offline path: coords are captured at buildPayload time on-device and ride the queued payload through useOfflineQueue unchanged.
- AHITS_MAPBOX_TOKEN: Max creates it in Secret Manager (Cloud Console, ENABLED, accessor granted) BEFORE PR-2's deploy. Add the --set-secrets Makefile mapping in the same change. Server-side only, never NEXT_PUBLIC_. If the secret is not ENABLED, hold PR-2's deploy and tell Max exactly what to create — do not deploy first.
- Anti-goal guard (D2): positions come only from daily-check attestations; no polling, no watchPosition, no background location, no "current location" language anywhere. Route history is "where has this rig been," never "where is it now."
- Tests: capture-with-permission, capture-denied-still-submits, queued-offline-check-carries-coords, recency-color businessDate boundaries, route-trail ordering.
- Merge gates: I will smoke each PR on staging before authorizing merge (PR-1: granted/denied/airplane-mode checks; PR-2: pins+recency+deep-link, route trail with 2+ GPS checks, crew map last-known). Do not merge without my explicit go, and never waive a smoke.
- Session close: standard 7 steps + record D14 in DECISIONS.md (CC-15 pulled pre-pilot, Thursday freeze, weather stamps deferred, A6-Lite row 29: location grant AND deny paths at daily check) + add row 29 to AHITS_A6_DEVICE_CHECKLIST.md.
```
