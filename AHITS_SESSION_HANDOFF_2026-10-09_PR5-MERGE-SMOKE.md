# Session handoff · 2026-10-09 · PR-5 merged, deployed, smoked — the fix program is done

> Read with `STATUS.md` §3 (the PR-5 row has both smoke tables, the deploy trail and the incident) and the build handoff `AHITS_SESSION_HANDOFF_2026-10-09_PR5-SCREENS.md`.
> - **No new decision.** D16 held: every change reached staging through a reviewed merge, with the owner's go in chat for each code PR.
> - **No reverts.**

## What shipped (in merge order)
| PR | What | Squash | Deploy |
|---|---|---|---|
| #258 | PR-5a · useMutation / useInvalidation / queue drain / conversions / `/mine` | `122c979` | Run 37990826045 failed ×3 on the Docker Hub rate limit (`postgres:16` service), before any test ran; shipped by #260's deploy |
| #260 | CI: test Postgres from `public.ecr.aws/docker/library/postgres:16` | `e3d4b96` | Run 37993732803: Build & Deploy failed once (`node:24-alpine` pull, `auth.docker.io` 504); a re-run of the failed job went green → `-00441-xzk` |
| #261 | fix: picker `categoryName` is always a string | `5d74748` | Run 37998533216 → `-00442-zs5` |
| #259 | PR-5b · dead ends, copy module, point fixes (rebased onto development first) | `e7037c1` | Run 38001479524 → `-00443-xqd` |

Each deploy passed env-drift, and `/api/health` was ok after each one. No migrations.

## The incident (fixed by #261)
- **What happened:** the smoke setup created a throwaway item through the API with no category. Picker options then carried `categoryName` as an object, and My Deployment crashed for every operator from 22:07:59 to 22:10:13 UTC.
- **Cause:** a latent PR-1b (#246) line in `src/app/api/inventory/route.ts`.
- **Fix:** live, by giving the item a category; in code, by #261.
- **Lesson:** create smoke data through the UI, or send every field the UI form sends. The API skips the form's validation.
- **Still open:** Cloud Run logs were not checked for operator page loads in that window.

## Smoke
- **Result:** all ten rows passed with the tab visible. #258: 3 rows; #259: 7 rows. The details are in STATUS §3.
- **Owner's check:** the offline → online check is the owner's, on the phone.
- **Cleanup:** complete. Rig ended, units received, hold released, repairs closed, alert resolved, throwaway vans and items deleted. Open alerts are back to the pre-smoke 4.

## Resume points
1. **Owner: the offline → online phone check.** Do an action offline (e.g. End deployment), go online, and the screen should update by itself. That is the last unverified PR-5 behaviour (FND-32).
2. **Owner question, still open:** should Today show a SECONDARY-only operator's crew rig? See #258 interpretation 1; the packet is "secondary-operator Today".
3. **Parked (STATUS §6):**
   - Give the Dockerfile's `node:24-alpine` the same `public.ecr.aws` mirror, as its own PR on a quiet day.
   - The timing-dependent UI tests stay parked.
4. **Seen in passing, not filed:**
   - A transfer posted with `quantity: 1` on a ×2 consumable line showed ×2.
   - A failed hub Receive leaves the stale row until refresh.
5. **The fix program (`AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md`) is complete.** PRs 1a, 1b, 2, 3a, 3b, 3c, 4 and 5 are all merged and smoked.
