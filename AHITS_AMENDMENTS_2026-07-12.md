# AHITS — Amendments to Existing Docs (2026-07-12 reflection increment)
### Precise, minimal old→new edits. Apply exactly; don't restyle surrounding text. · 2026-07-12

*Each block gives the file, the exact OLD text to find, and the NEW text to replace it with (or to insert). Where it says INSERT, add without removing anything. These fold the reflection findings into the living docs. Packet text itself lives in the merged canonical `AHITS_CLAUDE_CODE_INSTRUCTIONS.md` — the packet-level edits are already baked in there, not listed here.*

---

## 1. `STATUS.md` (in `ahits-current/STATUS.md`)

### 1a. Add SESSION CLOSE step 7 — code-grep verification of every claimed merge

**OLD (heading):**
```
## SESSION CLOSE — do all 6 (≈5 min). This is the durability contract.
```
**NEW:**
```
## SESSION CLOSE — do all 7 (≈6 min). This is the durability contract.
```

**INSERT** a new step 7 immediately after step 6 ("**Sanity:** `git status` clean…"), before the end of the section:
```
7. **Verify every merge you claimed (60 seconds).** For each packet you marked merged in §1/§2, grep the code for ONE acceptance string that only exists if that packet landed. Canonical anchors for the new packets: CC-22 → `CRON_SILENT` · CC-23 → the tokens.ts import in the theme · CC-24 → `Mark handled` · CC-25 → `QrScannerDialog` · CC-26 → the daily-check viewer route path · CC-27 → an MUI import in FulfillmentChecklist. If the string is absent, the claim is wrong — CORRECT §1/§2 before closing, do not close on an unverified claim. Velocity without this check is how STATUS went self-inconsistent within a day of its own contract.
```

### 1b. Fix the §1-vs-§2 self-inconsistency rule

**INSERT** a one-line rule at the top of the SESSION CLOSE section (right under the heading), so §1 and §2 can't drift:
```
> **§1 ≡ §2 invariant:** the merged set named in §1 (one-paragraph state) MUST match the merged set listed in §2 (environments). If they disagree, §2's code-grounded list wins — reconcile §1 to it before closing.
```

---

## 2. Packet-level edits (CC-14 / CC-12 / CC-20)

— applied directly in the merged canonical `AHITS_CLAUDE_CODE_INSTRUCTIONS.md`. The dated `_2026-07-10` and `_2026-07-12` packet docs are superseded by it (see their stubs); do not patch them.

---

## 3. `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`

### 3a. Replace the "then the big work" tail with the new order

**OLD:**
```
**Then the big work in workplan order:** CC-12 (Batch 6b/perf) → CC-14 (Today view) → CC-15 (Map) → CC-16 (QR) → CC-17 (Time/Invoicing) → CC-18 (Week board). CC-13/CC-19/CC-20 (doc + consistency + dead-code) land whenever convenient. CC-21 is a design spike (no build).
```
**NEW:**
```
**Then the reflection increment + the big work, in this order:**
CC-10 merge → CC-11 → **CC-22** (pilot ops rider) → **CC-23** (tokens + quick fixes + first 3 primitives) → **CC-24** (subtraction + glossary) → **CC-25** (live-camera QR) → CC-12 (Batch 6b/perf) → CC-14 (Today view) → **CC-26** (daily-check viewer — MUST land before the pilot fortnight) → **pilot fortnight** (with **CC-27** FulfillmentChecklist rebuild as scheduled filler) → CC-15 (Map) → CC-16 (QR no-app) → CC-17 (Time/Invoicing) → CC-18 (Week board). *(The pilot slot assumes D5 = Option A; if Max initials Option B, insert the Today-lite bridge packet — CC-28, number reserved — after CC-26.)*
CC-13/CC-19/CC-20 (doc + consistency + dead-code remainder) land whenever convenient. CC-21 is a design spike (no build).
```

### 3b. Add smoke lines for each new packet

**INSERT** into the "Per-packet smoke checklist" section, after the existing CC-11 smoke line:
```
**CC-22 (pilot ops rider):** stop the staging dispatch cron for >30 min (or fake lastRunAt) → a CRON_SILENT alert appears on the admin dashboard, and the next successful run RESOLVES it; the heartbeat ping hits the healthchecks.io URL on a successful run (and no-ops with the env var absent); with no DSN set nothing hits Sentry; with a dummy DSN, a forced server error and a forced client error both capture with the x-request-id attached (the client event passes CSP).

**CC-23 (tokens/design):** at 390px the 5 detail drawers use DetailDrawer and don't clip; the daily-check Yes/No toggles and the photo-remove button are ≥44px with ≥16px actionable text; dashboard StatCard icons show their color tint (not transparent); the amber secondary/warning text is readable; the s/[token] page pulls palette/type from tokens.ts; the ESLint no-hex rule fails a deliberately-added stray hex outside the allowlist.

**CC-24 (subtraction):** the dashboard shows ONE scan card (not two); the /operator/checkout redirect still works UNLESS the PR proved zero inbound references; Dismiss/Revoke reads as one verb everywhere; deployment launch submits with NO typed note (or a one-tap preset) — server accepts it too; the two remove-gear flows are one, and a single-item remove is ≤2 taps; MATERIAL-request says "Mark handled" while reservation/hub "Fulfilled" is untouched.

**CC-25 (live QR):** on a phone (include iOS Safari), a code decodes live from the viewfinder with no shutter tap in operator/scan and both my-deployment scanners; deny camera → falls back to photo capture (not a blank screen); offline shows "can't verify right now" and a bad code shows "not found" — never "Failed to process image"; the camera stream stops on close and resumes after switching apps and back.

**CC-26 (daily-check viewer):** from a failed-check alert, one click opens THAT check with answers + odometer + site + photos; a missed-check alert lands on the vehicle's check history; the vehicle AND deployment drawers reach the viewer; nothing on the viewer is editable.

**CC-27 (FulfillmentChecklist):** BEFORE merge: hub-flow staging smoke — fulfill a request end-to-end through the rebuilt checklist. After: controls in admin/requests are themed MUI (no raw system-font buttons next to MUI ones); every action produces the same result as before (behavior parity).
```

---

## 4. `DECISIONS.md`

### 4a. Append D5, D6, D7 as PENDING (Max)

**INSERT** after the D4 block (before the closing `---` / "To add a decision" footer):
```
### D5 · Pilot must not launch onto the static menu — hold for Today, or ship a Today-lite bridge
- **Date:** 2026-07-12 · **Owner:** Max · **Status:** PENDING (Max to decide — see `AHITS_PILOT_CHARTER.md` §5)
- **Options:** (A) HOLD the pilot fortnight until Today (CC-14) ships [RECOMMENDED — cleanest]; (B) ship a Today-lite bridge (check-done chip + transfers-waiting row + Awaiting-Pickup cards on the existing dashboard) as packet CC-28 (number reserved), inserted after CC-26, and start on that.
- **Recommendation:** A. Launching onto the verified static 4-card menu is competing with texting using a directory; the adoption metric is at risk from day 1.

### D6 · Email sandbox flip — global flip on charter start date, after the two-part audit
- **Date:** 2026-07-12 · **Owner:** Max · **Status:** PENDING (Max to run the audit and flip)
- **Recommendation:** `EMAIL_SANDBOX` is one global env var — a per-hub flip is impossible. On the charter start date, flip global EMAIL_SANDBOX off, AFTER (a) verifying only pilot hubs have contact addresses, (b) auditing all non-hub recipient paths (shop emails, invites, invoice sends) for real addresses in staging data.

### D7 · Name a second human as pilot-hours contact
- **Date:** 2026-07-12 · **Owner:** Max · **Status:** PENDING (Max to name)
- **Recommendation:** name one non-owner reachable during pilot hours to run the "operator can't sync" triage card (`AHITS_PILOT_CHARTER.md`). A one-human pilot is a single point of failure; the first 6am sync failure has no owner today.
```

### 4b. Add the CC-20 remainder to the Parked / Deferred registry

**OLD (registry table — last row):**
```
> | Sentry error tracking | BLOCKED | Max provides a DSN | — |
```
**NEW (append one row after it):**
```
> | Sentry error tracking | BLOCKED | Max provides a DSN | — |
> | CC-20 remainder (record-reader legibility #2–#6) | PARKED | first pilot dispute needing history a surface can't show | CC-20 |
```
