# Packet · Eastern time everywhere · rev 3 · 2026-10-28

> **OPEN for the owner:** none. You answered all six questions on 2026-10-26 (Round 6). §0 lists the answers.

> **REV 3 (2026-10-28), after the practice build** (`p12/stack/STACK_ES.md`: this PR, then the Security packet's S1–S4, on base + #273 + #272). This PR built clean: DB 79 / 673 → 82 / 697, UI 76 / 625 → 78 / 636, tsc 0, eslint 0 errors and 49 warnings, build 0, every §5 and bundle grep passed. What changed:
> - **Decision numbers (SX-2):** the post-merge docs commit (§7.5) writes D-E1, and the Security packet's S1 build starts only after it is merged. S1 numbers its decisions after D-E1.
> - **Base counts (EX-1):** #272 and #273 add no tests. The base counts are 79 / 673 (DB) and 76 / 625 (UI).

> **REV 2 (2026-10-26), after review E** (`p12/rev-E/REVIEW_E.md`: 0 High, 2 Medium, 11 Low, 5 Info). Each ID's outcome is in `p12/rev-E/REV2_CHANGES.md`. Anything not applied as written is in §9. What changed:
> - **Cutoff (owner):** **19:00 Eastern**, the same moment as today's 18:00 Central. Rev 1 kept 18:00, which in Eastern is an hour earlier. New code default `DEFAULT_DAILY_CHECK_CUTOFF = '19:00'`, used by Settings and by a new settings row (ET.7). The owner moves the saved value once (§6 E2, with an undo). A rollback moves it back (ET.6).
> - **Medium:** `.env.example` says Eastern, and the guard test and §5 check it (RE-1). §0 and the PR body say plainly that report totals for the same dates change (RE-2).
> - **Reports:** a rental day is a whole Eastern day (RE-3). The CSV is named for the To day (RE-4).
> - **Old phones:** crews close and reopen the app once after the deploy. The reason in §7 and the rollback note are corrected (RE-5).
> - **Guard and screens:** the guard also catches `timeZone: 'UTC'`, `Etc/…` and `EST5EDT` (RE-6). Pilot check times carry the zone's short name (RE-12).
> - **§6** is in order, with a deadline: E1, E1-fix and E2 before 00:00 Eastern on the merge night (RE-9). E1 prints one exact undo line per hold (RE-8).
> - **§7 and §8:** stop rules (RE-11); named files, no PIN or password, and merge only on the owner's go, in both prompts; merge by 23:00 Eastern at the latest; D-E1 numbering (RE-17). Acceptance row 2 can be run (RE-10). §0 is in plain words (RE-13). New ET.0b rows and Parked lines (RE-7, RE-16, RE-18).
> - **Re-run** on a scratch clone (base + rev 1 diff + review fixes + this rev, `p12/rev-E/tree2`): DB 82 / 697, UI 78 / 636, tsc 0, eslint 0 errors and 49 warnings, build 0 with the §5 bundle greps. §6's SQL re-run on Postgres 16.

> STATUS: runnable packet, rev 3. One PR, one Claude Code session. · WROTE: 2026-10-26, from a code map of the dry-run base `3dbaea8` (development + P1-1a–e) and a full dry-run build of rev 1 on that base (both suites, the build, the client bundle, and §6's SQL on a UTC Postgres 16). Rev 2's changes were re-run on a scratch clone. Rev 2 was then practice-built in full on base + #273 + #272 (2026-10-28, `p12/stack/STACK_ES.md`, tag `stack-E`); rev 3 folds in what it found. · READ-WITH: `CLAUDE.md`, `STATUS.md`, `DECISIONS.md` (D16, D26, D31, D48 with its 2026-10-26 amendment, and P1-1's reservations decision, D50 at `3dbaea8`), `AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md` (its override line, §5 base gate and §7 apply here), `AHITS_PACKET_P1-1de_RESERVATIONS_2026-10-25.md` (§0-q, e.6, and the "For the Eastern-time PR" line in §7).
> WHY: the fleet works out of Piedmont, SC (Eastern), but the app's business day is Central. Work between midnight and 1 am Eastern is filed under yesterday. Extended holds end at 1 am. The Today date line and check times follow the device, while the server's "Already checked … at …" says Central (B6-5). Report days are UTC days.
> SLOT: after P1-1e merges, and after #270, #272 and #273 (already on development: Next 16.4.3; #270's three UI test files are already in `3dbaea8`'s counts, and #272 and #273 add none), before the P1-2 packets. The P1-2 Security packet's S1 waits for this PR's docs commit (§7.5). **No migration.** Line numbers are at `3dbaea8`; re-grep every anchor on the real base. D21: my-deployment is not touched.

**The P1-1 override line applies:** no handoff file unless the session ends mid-work (one `CHANGELOG.md` line plus the STATUS lines in §7 instead), and stage named files only, never `git add -A`. The packet file sits untracked in the repo root: commit it on this PR's branch.

---

## 0 · Owner decisions (final, 2026-10-26: apply them, don't re-ask)

| # | Decision | Becomes |
|---|---|---|
| a | **The app's day is Eastern everywhere:** the daily-check day and its cutoff, when a missed check is flagged, hold end dates, the days shown on screens, bells and emails, and report days. | D-E1 |
| b | **One setting.** The app's built-in zone, the deploy setting and the sample settings file all say Eastern (America/New_York). A test and the deploy check fail if they ever differ. No other app code names a zone. | D-E1 |
| c | **The daily-check cutoff is 19:00 Eastern.** That is the same moment as today's 18:00 Central, so missed-check alerts come at the same real time as now. (18:00 Eastern would be an hour earlier.) The app's built-in default becomes 19:00. You move the saved setting from 18:00 to 19:00 once, right after the deploy (§6 E2). | D-E1 |
| d | **Holds an admin extended before the switch** are fixed once by SQL after the deploy, with an undo (§6 E1-fix). Expect few or none. | D-E1 |
| e | **Past daily checks stay as filed.** A check sent between midnight and 1 am Eastern before the switch keeps the day before. | D-E1 |
| f | **Which clock.** Business-day screens show Eastern: the Today date, "Checked by … at …", the pilot page's check times (now marked EDT or EST), and report days. Other clock times (lists, "Data as of", the greeting, the sign-in lock) stay in the viewer's own zone. | D-E1 |
| g | **Reports use Eastern days, and the To day counts.** **Totals for the same From and To will differ from before the switch**, and won't match reports or CSV files saved earlier. Two reasons: To's own day now counts (up to now), and each day now starts at midnight Eastern, not at midnight UTC (8 pm Eastern the evening before, 7 pm in winter). You accepted this. | D-E1 |
| h | **D48's merge window** is restated in Eastern at the same moment: after 21:00 Eastern (20:00 Central). | D48 note |
| i | **The background job** (every 10 minutes) is unchanged. | — |

D-E1 gets the next free D number when it is first written into `DECISIONS.md` (§7).

---

## ET · The app's day is Eastern (config + server + UI, no migration)

**Goal.** §0 a–g. Closes S5-17 (holds extended under Central) and the check-time and hold-day parts of B6-5.

### ET.0 · The map at `3dbaea8` (what sets or assumes a zone)

**Where the zone is set.**
- `src/lib/business-date.ts:11-13`: `appTimezone()` returns `process.env.APP_TIMEZONE || 'America/Chicago'`. **The browser never gets APP_TIMEZONE**, so this default *is* the client's zone. `next.config.ts:34-50` has no `env` block, the `Dockerfile` passes none at build, and the dry-run client bundle reads `env.APP_TIMEZONE||"America/New_York"`, so only the fallback counts. The comment at `:1-9` says so too.
- `Makefile:201`: `--set-env-vars="NODE_ENV=production,APP_TIMEZONE=America/Chicago,…"`. Staging and prod both deploy through `cloud-run-deploy`.
- `.env.example:51-54`: `APP_TIMEZONE="America/Chicago"` ("Default: America/Chicago"). Only a local server built from it reads it, but then it runs Central against an Eastern client.
- `.github/workflows/deploy.yml:150-197` (env-drift) checks EMAIL_SANDBOX, EMAIL_SANDBOX_TO and minScale, **not** APP_TIMEZONE.
- `verify.yml`, `ci.yml`, `pr-staging-deploy.yml`, `docker-compose.test.yml`: no APP_TIMEZONE and no TZ. Tests run on the code default; CI's Postgres runs in UTC.
- Tests that set a zone: `tests/fnd7-business-date.test.ts:10` (`TZ = 'America/Chicago'`, always passed explicitly) and `:51` (sets APP_TIMEZONE to New York, A6-15f); `tests/components/p1-1b-screens.test.tsx:413` (device TZ Chicago, a "US zone behind UTC").

**Where the cutoff hour is set.**
- The live value is the saved setting `notification_config."dailyCheckCutoff"` (Settings → Notifications). The cron reads it (`api/cron/dispatch/route.ts:120-121`) and compares it with the APP_TIMEZONE wall clock in `evalContext` (`alert-evaluators.ts:72-76`). It is `18:00` unless an admin changed it (E0 shows it). The row always exists: `getNotificationConfig` creates it on first read (`notification-config.ts:18-35`), and every successful cron run upserts it (`:57-63`, called at `cron/dispatch/route.ts:460`).
- Every default is `'18:00'`: the column default (`prisma/schema.prisma:897`; migration `20260623210000_notification_config/migration.sql:5`), which a new row takes because both INSERTs (`notification-config.ts:21`, `:59-60`) leave the column out; the fallback when the read fails (`:11`); and the Settings page's starting value and fallback (`settings/page.tsx:61,87`), which a Save writes back if the load failed.
- Docs: no decision states the hour. D26 is about late-check dates and D48 about merge hours (checked `DECISIONS.md` at `ac1410a` and `3dbaea8`). STATUS, README and the A6 checklists don't state it either. Only history does: `AHITS_PHASE3_WORKPLAN_v2.md:99` ("6 pm cutoff", a dated record) and the PRD's first default (`AHITS_PRD_v2.md:426,687`, 9:00am). Leave both. Tests pass `'18:00'` themselves (`pr4-evaluators.test.ts:14-16,73`; a mocked payload at `uxp6-checklist-editor.test.tsx:49`).

**Hard-coded zones in `src`.** Only `business-date.ts:12` and a comment at `src/lib/alert-evaluators.ts:66` (`Business day (America/Chicago)`). There is no "Central", CT, CST or CDT in anything a user reads; "Central" appears only in code comments (`business-date.ts:3-4,9`; `api/dashboard/route.ts:13`, which is history). **No fixed UTC hour encodes Central:** there is no `T15:00Z`-style cutoff. One UTC-day boundary exists, and the switch doesn't move it: date-only due and expiry dates (ET.0b).

**Already follows the switch (no edit).** Server: `rig-daily-checks.ts:96-98` (the 409's check time), `copy/admin-actions.ts:20`, `pilot-metrics.ts:77-85,105,173,237-240`, `deployment-requests.ts:183,955,1272`, `api/deployment-requests/[id]/route.ts:72`, `api/daily-check/route.ts:110-111`, `operator-today.ts:48`, `api/dashboard/route.ts:15`, `api/dashboard/feeds/route.ts:33`, `deployment-map-queries.ts:45,127`, `alert-evaluators.ts:231,310`, `notifications.ts:57,132` (bells and emails print the server's day). Client, through the default: `operator/daily-check/page.tsx:129,151,291,445,498,581,613`, `TodayCheckSummary.tsx:58`, `admin/vehicles/page.tsx:130`.

**Business-day screens that follow the device instead (fixed in ET.4–ET.5).** `components/operator/today/VehicleChecks.tsx:29-31` (`checkTime`), `operator/dashboard/page.tsx:68` (Today's date line), `admin/pilot/page.tsx:33-37` (`fmtTime`). Reports use **UTC** days: `admin/reports/page.tsx:47,61-63`, `api/reports/equipment/route.ts:143-145`, the rental edges in `rentalCostInWindow` (`:89-94`) and the CSV file name (`:266`).

**Viewer's zone, kept (§0-f).** `utils.ts:4-12` (`formatDate`/`formatDateTime`), `FreshnessIndicator.tsx:18`, `login/page.tsx:26`, `operator/dashboard/page.tsx:174` (greeting), `AwaitingPickupCard.tsx:93` (old-payload fallback only).

**Cron.** One Cloud Scheduler job, `ahits-dispatch`, every 10 minutes (`docs/archive/AHITS_SESSION5_RECORD.md:30`). `api/cron/dispatch/route.ts:79-123` has no hour-of-day logic besides `evalContext`; its other windows (48 h, 72 h, 14 days) are instants. Optional, read-only: Cloud Scheduler → `ahits-dispatch` → Frequency reads `*/10 * * * *`; its time-zone field then doesn't matter.

**D48** ("after 20:00 Central") is written in `DECISIONS.md` D48 (`:344-349` at `3dbaea8`; with the 2026-10-26 amendment at `ac1410a`), `STATUS.md` §4 merge checklist step 3 (`:180` at `3dbaea8`, `:192` at `ac1410a`), the P1-1 packet §7 step 2 (`AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md:746`) and the three P1-2 packets' §7. No code, workflow, Makefile target or script encodes it. "After 20:00 Central" stays correct in those packets (same moment as 21:00 Eastern).

### ET.0b · Stored data that carries a Central or UTC day

Prisma `DateTime` columns are `timestamp(3)` with no zone, holding UTC; §6's SQL reads them `AT TIME ZONE 'UTC'` first.

| Data | Written by | Does the switch change its meaning? | Handling |
|---|---|---|---|
| `deployment_requests."holdExpiresAt"` set by **Extend** | `deployment-requests.ts:954-959` (`endOfBusinessDay`, Central) | **Yes** (S5-17): the end of Central day D reads as D+1 and ends at 1 am Eastern. A re-Extend to the same day isn't SAME_DAY, so it would bell again. | Re-express once: §6 E1 → E1-fix → undo |
| `holdExpiresAt` set by Stage, the P1-1d migration, or the 168 h fallback | `:1107` (now + 168 h); `migrations/20261026023852_p1_1d_staged_ready/migration.sql:32`; `HOLD_ENDS_AT` `:592` | No: these are instants | None |
| `daily_checks."date"` (`@db.Date`, `schema.prisma:578`) | `api/daily-check/route.ts:110-119`, from the client's `businessDate()` | Only for checks sent 00:00–01:00 Eastern, which carry the day before | Leave as filed (§0-e); E0 counts them |
| `notification_config."dailyCheckCutoff"` | Settings | Yes: the same clock time would come one hour earlier in real time | Move 18:00 → 19:00 once (§0-c, §6 E2); E0 reads it |
| Open alerts' day metadata: DAILY_CHECK_MISSED `date`, RESERVATION_HOLD_EXPIRED `holdUntil` | `alert-evaluators.ts:231,310` | The day string refreshes on the next RAISE (`alerts.ts:52`). `activeKey` has no day (`alerts.ts:36`) | None; E0 counts them |
| Sent bells and emails ("held until Oct 28") | — | History | None |
| Phone drafts keyed by (vehicle, business day) | `daily-check/page.tsx:581,613` | Only a draft started 23:00–24:00 Central around the switch | None |
| Date-only values shown as a day (insurance and registration expiry, rental and project dates, `dateDelivered`, `neededBy`) | date inputs, stored at UTC midnight | No: not Central; P1-1b's `toDay`/`formatDay` read the stored day | None |
| Rental start and end dates inside a report window | `api/reports/equipment/route.ts:89-94` | Yes: against Eastern window edges a rental gains or loses 4–5 hours of a day | ET.5 reads them as whole Eastern days (RE-3) |
| Date-only due and expiry dates compared with now (a task's `nextDue` from the date input, insurance, registration) | cron step 1 (`cron/dispatch/route.ts:84-97`, `nextDue < now`), `feeds/route.ts:134`, the expiry evaluators (`alert-evaluators.ts:163-181`) | No: they turn at UTC midnight (20:00 EDT / 19:00 EST the evening before), the same moment as under Central | Parked (RE-7) |
| Pilot dashboard history | computed on read (`pilot-metrics.ts`) | Past days are re-read with Eastern boundaries | Accept |

### ET.1 · The switch (`src/lib/business-date.ts`)

Replace `:1-13` with:

```ts
// FND-7 · Eastern-time PR: one authoritative "business date" for daily-check bucketing, the
// missed-check cutoff, hold dates, report days and dashboard "today" counts. The
// business day is defined in APP_TIMEZONE — Eastern, where the fleet works (Piedmont,
// SC) — NOT UTC: otherwise an evening check (e.g. 11pm Eastern = next-day UTC) is
// filed under tomorrow, which both mis-keys the (vehicleId, date, operatorId) unique
// row and trips a false DAILY_CHECK_MISSED alert. The client, the cron, and the feeds
// MUST all agree, so they all call through here. Uses Intl (no date-fns/luxon dep);
// works on both server and client. The client never sees APP_TIMEZONE (only the
// server gets it, from the Makefile), so DEFAULT_TIMEZONE *is* the client's zone and
// must equal the Makefile's value (tests/components/eastern-time-guard.test.ts).
export const DEFAULT_TIMEZONE = 'America/New_York'

export function appTimezone(): string {
  return process.env.APP_TIMEZONE || DEFAULT_TIMEZONE
}
```

After `endOfBusinessDay` (`:55-59`), add the report helper:

```ts
/** Eastern-time PR: the first millisecond of business day `day` (YYYY-MM-DD) in APP_TIMEZONE. */
export function startOfBusinessDay(day: string, tz: string = appTimezone()): Date {
  const [y, m, d] = day.split('-').map(Number)
  const prev = new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString().slice(0, 10)
  return new Date(endOfBusinessDay(prev, tz).getTime() + 1)
}
```

### ET.2 · Server env (`Makefile:201`)

`APP_TIMEZONE=America/Chicago,` → `APP_TIMEZONE=America/New_York,`. Nothing else on the line. (P1-2 S edits `:202`, the `--set-secrets` line, and leaves `:201` alone.)

### ET.3 · env-drift proves it landed (`.github/workflows/deploy.yml`)

- After `:173` (`EMAIL_SANDBOX_TO_ACTUAL=…`):
  ```bash
            # Eastern-time PR: the server's business day; it must equal the code default (the client's zone).
            APP_TIMEZONE_ACTUAL="$(get_env APP_TIMEZONE)"
  ```
- After `:185` (the minScale echo): `echo "  APP_TIMEZONE     = '${APP_TIMEZONE_ACTUAL}'   (expected 'America/New_York')"`
- After `:190` (the minScale check): `[ "$APP_TIMEZONE_ACTUAL" = "America/New_York" ] || drift="${drift} APP_TIMEZONE(got='${APP_TIMEZONE_ACTUAL}',want='America/New_York')"`

### ET.4 · Business-day screens use the business zone (three one-line edits)

Each file imports `import { appTimezone } from '@/lib/business-date'` (client-safe: no Prisma) and adds `timeZone: appTimezone()` as the first option:
- `src/components/operator/today/VehicleChecks.tsx:29-31` `checkTime`, with the comment `// Eastern-time PR (B6-5): the business zone, as the server's "Already checked … at …" uses (formatCheckTime).` Today's "Checked by … at …" and the server's 409 now print the same time on every device.
- `src/app/(operator)/operator/dashboard/page.tsx:68`, Today's date line. It stays behind `mounted`, so there is no hydration change. The greeting at `:174` stays on the device clock.
- `src/app/(admin)/admin/pilot/page.tsx:36` `fmtTime`: the day's check times match the day they are listed under. Also add `timeZoneName: 'short'` as the **last** option, with the comment `// Eastern-time PR: business-zone times, with the zone's short name, so they don't read as local.` It prints "Oct 26, 8:42 AM EDT" (RE-12). Intl supplies the name, so no zone literal is written. Don't put "EDT" in the comment: the guard would flag it.

### ET.5 · Report days are Eastern days

- **`src/app/(admin)/admin/reports/page.tsx`:** import `businessDate`; delete `fmtDate` (`:47`) and the `today` memo (`:61`); then:
  ```tsx
    // Eastern-time PR: the window's days are business days (Eastern), not UTC days.
    const [from, setFrom] = React.useState(() => businessDate(new Date(Date.now() - 180 * 86_400_000)))
    const [to, setTo] = React.useState(() => businessDate())
  ```
- **`src/app/api/reports/equipment/route.ts`:** import `{ businessDate, startOfBusinessDay, endOfBusinessDay }`. After `MS_PER_DAY` (`:26`):
  ```ts
  /** A real calendar day `YYYY-MM-DD`, else null. */
  function asDay(s: string | null): string | null {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
    const t = Date.parse(`${s}T00:00:00Z`)
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null
  }
  ```
  Replace `:143-145` with:
  ```ts
    // Eastern-time PR: a plain YYYY-MM-DD is a business day (Eastern). "from" starts at its first
    // moment; "to" includes its whole day, but never runs past now.
    const toDay = asDay(toParam)
    const fromDay = asDay(fromParam)
    const to = toDay ? new Date(Math.min(endOfBusinessDay(toDay).getTime(), now.getTime())) : toParam ? new Date(toParam) : now
    // Default window: trailing 180 days (≈ the PRD's 6-month repair-spend horizon).
    const from = fromDay ? startOfBusinessDay(fromDay) : fromParam ? new Date(fromParam) : new Date(to.getTime() - 180 * MS_PER_DAY)
  ```
  A full ISO instant still parses as before, and the 400 check at `:146` is unchanged.
- **Rental days (RE-3).** In `rentalCostInWindow`, after `hasDates` (`:89`):
  ```ts
    // Eastern-time PR: rental dates are calendar days stored at UTC midnight; read them as business days.
    const rs = hasDates ? startOfBusinessDay((v.rentalStartDate as Date).toISOString().slice(0, 10)) : null
    const re = hasDates ? startOfBusinessDay((v.rentalEndDate as Date).toISOString().slice(0, 10)) : null
  ```
  Both `overlapDays(...)` calls (`:91`, `:94`) take `rs as Date, re as Date` in place of the two rental dates. A rental day is then a whole Eastern day, as it was a whole UTC day before.
- **CSV name (RE-4).** `:266` `const stamp = to.toISOString().slice(0, 10)` → `const stamp = toDay ?? businessDate(to)`. Without it a past To names the next day. The page sets its own download name, so only direct API links were hit.

### ET.6 · Comments and docs

- `src/lib/alert-evaluators.ts:66`: `Business day (America/Chicago)` → `Business day (APP_TIMEZONE, Eastern)`.
- `.env.example:53-54` (RE-1) →
  ```
  # your field operators work in: Eastern (Piedmont, SC). Must equal DEFAULT_TIMEZONE in src/lib/business-date.ts.
  APP_TIMEZONE="America/New_York"
  ```
- `README.md:43`: `IANA tz of the business day (default \`America/New_York\`; must match the code default in \`src/lib/business-date.ts\`)`.
- `PILOT_ROLLBACK.md:97`: `(APP_TIMEZONE = America/New_York; rows filed before the Eastern-time PR carry the Central day).`
- `PILOT_ROLLBACK.md` §1, after the P1-1e paragraph (`:51`):
  > **Eastern time (no migration).** Rolling back restores the old revision's `APP_TIMEZONE=America/Chicago` and its Central client code together, so server and screens agree again. Holds extended under Eastern still read as the same day under Central. Then set the daily-check cutoff back to 18:00, because the old revision reads 19:00 as 19:00 Central, an hour late: `UPDATE notification_config SET "dailyCheckCutoff" = '18:00', "updatedAt" = now() WHERE id = 'global' AND "dailyCheckCutoff" = '19:00';` (or Settings → Notifications). Phones keep the Eastern code until they reload; until then, checks sent 23:00–24:00 Central are filed under the server's day. Ask crews to close and reopen the app once after a rollback.

### ET.7 · The cutoff default is 19:00 Eastern (§0-c)

- **`src/lib/business-date.ts`**, after `DEFAULT_TIMEZONE` (ET.1). It lives here, client-safe, because a cutoff hour means nothing without its zone:
  ```ts
  // Eastern-time PR (owner): the missed-check cutoff a new install starts with, read in
  // APP_TIMEZONE. 19:00 Eastern is the same moment as the old 18:00 Central. Settings
  // stores the live value (notification_config); this is its default and fallback.
  export const DEFAULT_DAILY_CHECK_CUTOFF = '19:00'
  ```
- **`src/lib/notification-config.ts`:** after `:1` add `import { DEFAULT_DAILY_CHECK_CUTOFF } from '@/lib/business-date'`. `:11` →
  ```ts
  // Eastern-time PR: 19:00 Eastern. A new row gets it from the app, not from the column's
  // older default (18:00 in schema.prisma), so the two INSERTs below name it.
  const DEFAULT_CUTOFF = DEFAULT_DAILY_CHECK_CUTOFF
  ```
  `:21` → `INSERT INTO "notification_config" ("id", "dailyCheckCutoff") VALUES ('global', ${DEFAULT_CUTOFF})`. `:59-60` → `INSERT INTO "notification_config" ("id", "dailyCheckCutoff", "cronLastRunAt")` / `VALUES ('global', ${DEFAULT_CUTOFF}, now())`. Both `ON CONFLICT` clauses stay, so a saved value is never rewritten.
- **`src/app/(admin)/admin/settings/page.tsx`:** after `:18` add `import { DEFAULT_DAILY_CHECK_CUTOFF } from '@/lib/business-date'`. `:61` → `// Eastern-time PR: the shared default (19:00 Eastern), so a failed load never saves 18:00.` / `const [notifCutoff, setNotifCutoff] = React.useState(DEFAULT_DAILY_CHECK_CUTOFF)`. `:87` → `setNotifCutoff(data.dailyCheckCutoff ?? DEFAULT_DAILY_CHECK_CUTOFF)`.
- **Not touched:** `prisma/schema.prisma:897` and its 2026-06-23 migration (no migration; Parked), the PATCH's HH:MM check (`api/admin/notification-config/route.ts:29`), the Settings helper text.
- The saved row is the owner's: §6 E2 moves it once after the deploy.

**Not touched (whole PR):** `rig-daily-checks.ts`, `utils.ts`, `sw.ts`, the offline queue, Prisma (schema and migrations), my-deployment, `verify.yml`.

### Tests

**Pin Central and break: none.** In the dry run, with only the default switched, the DB suite (79 / 673) and the UI suite (76 / 625) both stayed green. These mention Central or pass `'18:00'` and still pass; leave them as they are: `fnd7-business-date.test.ts` (explicit zone), `pr2-populations.test.ts:10,163-192` (CDT comments; the asserts hold under Eastern), `pr4-evaluators.test.ts:14-16,73` (its own `'18:00'` and Chicago comments; 23:30Z and 14:00Z fall on the same side of 18:00 Eastern), `cc15-recency-bucket.test.ts:41` (a comment), `components/p1-1b-screens.test.tsx:13,413` (device TZ), `components/uxp6-checklist-editor.test.tsx:49` (a mocked `'18:00'`).

**Change:** `tests/components/pr5c-today-crew.test.tsx:23` → `const CHECKED_AT = '8:42 AM' // Eastern-time PR: Eastern (EDT) on every device, as the server says it`. It computed the expectation in the device zone, which ET.4 stops using.

**New:**
1. **`tests/components/eastern-time-guard.test.ts`** (pure; runs in both suites):
   ```ts
   // Eastern-time PR: one switch. Only the server gets APP_TIMEZONE (from the
   // Makefile); the client never does, so the code default IS the client's zone. If the
   // two differ, phones and server file the same evening check under different days.
   // Pure: reads repo files, no database. Runs in both suites.
   import { describe, it, expect } from 'vitest'
   import fs from 'node:fs'
   import path from 'node:path'
   import { DEFAULT_TIMEZONE, DEFAULT_DAILY_CHECK_CUTOFF } from '@/lib/business-date'

   const ROOT = path.resolve(__dirname, '..', '..')
   const ZONE = /America\/[A-Z]|US\/[A-Z]|Etc\/|\b[CEMP][SD]T\b|\b[CEMP]ST\d[CEMP]DT\b|timeZone\s*:\s*['"`]/
   const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
   function walk(dir: string): string[] {
     return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
       const p = path.join(dir, e.name)
       return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
     })
   }

   describe('Eastern-time PR · one switch', () => {
     it('the code default is Eastern', () => {
       expect(DEFAULT_TIMEZONE).toBe('America/New_York')
     })
     it('the Makefile deploys the same zone', () => {
       expect(read('Makefile')).toContain(`APP_TIMEZONE=${DEFAULT_TIMEZONE},`)
     })
     it('env-drift expects the same zone', () => {
       expect(read('.github/workflows/deploy.yml')).toContain(`[ "$APP_TIMEZONE_ACTUAL" = "${DEFAULT_TIMEZONE}" ]`)
     })
     it('.env.example states the same zone', () => {
       expect(read('.env.example')).toContain(`APP_TIMEZONE="${DEFAULT_TIMEZONE}"`)
     })
     it('no zone name is written anywhere else in src', () => {
       const own = path.join(ROOT, 'src', 'lib', 'business-date.ts')
       const hits = walk(path.join(ROOT, 'src')).filter((f) => f !== own).flatMap((f) =>
         fs.readFileSync(f, 'utf8').split('\n')
           .map((text, i) => ({ file: path.relative(ROOT, f), line: i + 1, text: text.trim() }))
           .filter((h) => ZONE.test(h.text)))
       expect(hits).toEqual([])
     })
     it('self-test: the detector flags a zone name', () => {
       for (const s of ["'America/Chicago'", '18:30 CDT', 'US/Eastern', "timeZone: 'UTC'", 'Etc/GMT+5', 'EST5EDT']) expect(ZONE.test(s), s).toBe(true)
       expect(ZONE.test('timeZone: appTimezone()')).toBe(false)
     })
     it('the cutoff default is 19:00 Eastern, in one place (owner: the same moment as 18:00 Central)', () => {
       expect(DEFAULT_DAILY_CHECK_CUTOFF).toBe('19:00')
       for (const f of ['src/lib/notification-config.ts', 'src/app/(admin)/admin/settings/page.tsx']) {
         expect(read(f), f).toContain('DEFAULT_DAILY_CHECK_CUTOFF')
       }
       const own = path.join(ROOT, 'src', 'lib', 'business-date.ts')
       const literals = walk(path.join(ROOT, 'src')).filter((f) => f !== own)
         .filter((f) => /['"`]1[89]:00['"`]/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f))
       expect(literals).toEqual([])
     })
     it('the business-day screens format in the business zone', () => {
       for (const f of [
         'src/components/operator/today/VehicleChecks.tsx',
         'src/app/(operator)/operator/dashboard/page.tsx',
         'src/app/(admin)/admin/pilot/page.tsx',
       ]) expect(read(f), f).toContain('timeZone: appTimezone()')
       // The pilot page's Eastern times carry the zone's short name, so they don't read as local.
       expect(read('src/app/(admin)/admin/pilot/page.tsx')).toContain("timeZoneName: 'short'")
     })
   })
   ```
2. **`tests/fnd7-business-date.test.ts`**: rewrite the header comment (Central cases pass the zone explicitly; the last block checks the default), import `appTimezone`, `startOfBusinessDay`, `DEFAULT_DAILY_CHECK_CUTOFF` and `evalContext`, and add `describe('Eastern-time PR · the business day is Eastern by default')`. `beforeEach` deletes APP_TIMEZONE (as on the client); `afterEach` restores it.
   - `appTimezone()` → `'America/New_York'`.
   - `2026-10-27T04:30:00Z` → `businessDate` is `2026-10-27`; with Chicago it is `2026-10-26`.
   - **The default cutoff is 19:00 Eastern** (`evalContext(…, DEFAULT_DAILY_CHECK_CUTOFF)`): `DEFAULT_DAILY_CHECK_CUTOFF` is `'19:00'`; `22:59Z` Oct 27 → not past (18:59 EDT); `23:00Z` → `{ today: '2026-10-27', pastDailyCheckCutoff: true }`; `23:59Z` Nov 3 → not past (18:59 EST); `00:00Z` Nov 4 → `{ today: '2026-11-03', pastDailyCheckCutoff: true }` (UTC is already Nov 4).
   - **The same moment as 18:00 Central:** for every day of 2026 and 2027, at `22:59Z`, `23:00Z`, `23:59Z` and `00:00Z` the next day, `evalContext(now, DEFAULT_DAILY_CHECK_CUTOFF)` and, with APP_TIMEZONE set to `America/Chicago` for that call, `evalContext(now, '18:00')` agree on `today` and `pastDailyCheckCutoff`. Collect the misses and expect `[]`. (With 18:00 Eastern it misses every day.)
   - `endOfBusinessDay('2026-10-30')` → `2026-10-31T03:59:59.999Z`; `'2026-11-02'` → `2026-11-03T04:59:59.999Z`.
   - `startOfBusinessDay`: `2026-10-30` → `T04:00Z`, `2026-11-01` → `T04:00Z`, `2026-11-02` → `T05:00Z`, `2026-03-08` → `T05:00Z`, `2026-03-09` → `T04:00Z`, `2026-03-01` → `T05:00Z`.
3. **`tests/eastern-time-reports.test.ts`** (DB; the `requireAdmin` mock from `pr2-populations.test.ts:25-30`):
   - `?from=2026-10-20&to=2026-10-20` → 200; `summary.from` `2026-10-20T04:00:00.000Z`, `summary.to` `2026-10-21T03:59:59.999Z`, `windowDays` 1.
   - `?from=2025-11-02&to=2025-11-02` (fall-back day) → `2025-11-02T04:00:00.000Z` to `2025-11-03T04:59:59.999Z`.
   - `to=<businessDate()>` → `summary.to` is between the request's start and now.
   - No params → `summary.to` ≈ now and `windowDays` 180.
   - `?from=2026-10-21&to=2026-10-20` → 400.
   - A `createVehicle` rental at $100/day (`rentalCostPeriod: 'DAY'`), Oct 1–20 (`new Date('2026-10-01')`, `new Date('2026-10-20')`), with `?from=2026-10-15&to=2026-10-25` → `totalRentalCost` 500 (RE-3).
   - `?from=2026-10-10&to=2026-10-20&format=csv` → `content-disposition` `attachment; filename="equipment-cost-utilization-2026-10-20.csv"` (RE-4).
4. **`tests/eastern-time-cutoff.test.ts`** (DB, new). `tests/setup.ts` never resets `notification_config`, so `beforeAll` saves the `global` row (`dailyCheckCutoff`, `disabledAlertTypes`, `cronLastRunAt`), `beforeEach` deletes it, and `afterAll` puts the saved row back.
   - A new row made by the first `getNotificationConfig()` → `dailyCheckCutoff` `'19:00'`, in the result and in the row.
   - A new row made by the first `recordCronHeartbeat()` → `'19:00'`.
   - A saved `'18:00'` row is kept by both (the app never rewrites it; E2 does, once).
5. **`tests/components/eastern-time.test.tsx`** (UI; fake `Date` at `2026-10-27T03:30:00Z`, which is Mon Oct 26 23:30 EDT and already Tuesday in UTC; `process.env.TZ = 'UTC'`, restored after):
   - The Today page (empty `/api/operator/today` payload; mocks as in `pr5c-today-crew.test.tsx:13-14`) shows `Monday, October 26` and not `Tuesday, October 27`.
   - With `process.env.TZ = 'America/Los_Angeles'`, `checkTime('2026-10-09T12:42:00.000Z')` → `8:42 AM`.
   - The Reports page in `ToastProvider` fetches `/api/reports/equipment?from=2026-04-29&to=2026-10-26`, and the To field holds `2026-10-26`.

**On the old code** (`3dbaea8` with only these test files, rev 2 scratch run): 18 of the 24 new node and guard tests fail, and so do all 3 new UI tests and both pr5c tests that use `CHECKED_AT`. The six that pass there guard against regressions: the detector self-test, no params, From after To, a saved 18:00 kept, and the rental total and CSV name (right on the old code, wrong on rev 1's route). On rev 1's code instead, the cutoff tests fail (5 with an 18:00 default, 2 with INSERTs that leave the cutoff out), and so do the rental and CSV tests. They pass whatever the machine's zone (rev 1 checked UTC, Los Angeles and Tokyo, the UI ones also New York; rev 2 re-ran the node tests under Los Angeles, Tokyo, New York and Kiritimati).

**Counts (dry run, and the practice build on base + #273 + #272):** DB 79 / 673 → **82 / 697**; UI 76 / 625 → **78 / 636**. #272 and #273 add no tests, so the base counts are 79 / 673 (DB) and 76 / 625 (UI) (EX-1). Re-count both on the real base anyway and state both pairs.

### Acceptance (after the deploy)

1. The deploy run's env-drift step prints `APP_TIMEZONE     = 'America/New_York'` and passes. *(Session.)*
2. Optional *(owner)*: at any time after 20:00 Eastern, on a phone or laptop set to UTC or London, Today's date line shows today's Eastern date, not tomorrow. Unit-tested in `eastern-time.test.tsx`.
3. **Admin → Reports:** To shows today's Eastern date. Set From = To = yesterday → the report loads (before: "Invalid date range"). *(Session.)*
4. **Admin → Pilot:** today's check times read in Eastern and end in EDT (EST from Nov 1). *(Session.)*
5. **Admin → Settings → Notifications:** Daily-check cutoff reads **19:00** (after §6 E2). Look only; don't Save. *(Session.)*
6. §6's merge-night steps were done before 00:00 Eastern. E1 shows 0 rows; if E1-fix ran, that hold's card shows the day the admin picked. *(Owner reports; the session records it.)*
7. Optional *(owner)*, the next evening: no missed-check alert before 19:00 Eastern. Any that is due comes after 19:00 Eastern, as it came after 18:00 Central before.

The two-login "Checked by … at …" vs the 409 text is covered by tests; there is no smoke row for it.

### Behaviour changes (PR body)

- The business day turns over at midnight Eastern (before: 1 am Eastern).
- Missed-check alerts: the cutoff is 19:00 Eastern, **the same moment as 18:00 Central before**. The code default is 19:00 (Settings, a new settings row), and the owner moved the saved value once (§6 E2).
- Extend ends a hold at midnight Eastern. Holds extended earlier are fixed by §6 E1-fix.
- Today's date line, "Checked by … at …" and the pilot dashboard's check times read Eastern on every device. Pilot times end in EDT or EST.
- Reports: From and To are whole Eastern days, and To's own day now counts (up to now). **The same From/To gives different numbers than before**: totals, utilization and the CSV won't match exports made before this PR. From = To works; a future To stops at now. A rental day is a whole Eastern day. The CSV is named for the To day.
- env-drift goes red if the staging service's APP_TIMEZONE isn't `America/New_York`. `.env.example` says Eastern.
- A phone that hasn't reloaded keeps the Central code: work it sends 00:00–01:00 Eastern is filed under the day before, and re-sending it fails with "A check for <date> already exists". Crews close and reopen the app once after the deploy.
- History: checks sent 00:00–01:00 Eastern before the switch keep the day before. Pilot dashboard past days are re-read with Eastern boundaries.

### Interpretations

- "Everywhere" means everything the app treats as the business day. Other timestamps stay in the viewer's zone (§0-f).
- Reports were UTC days, not Central. They move to Eastern because the decision names report days.
- "19:00 Eastern" means the saved setting reads 19:00 and every default is 19:00. The real moment doesn't change. The app never rewrites a saved setting, so the one-time move is the owner's (§6 E2).
- The cutoff's column default (`schema.prisma:897`) stays `18:00`: changing it needs a migration, and a new row now gets the app's default (Parked).
- Rental dates are calendar days. In reports they become whole Eastern days, as they were whole UTC days before.
- The env var stays in the Makefile, so the deploy config states the zone. The guard test and env-drift make the env var and the code default one switch.
- Alerts that carry a day need no SQL: their metadata refreshes on the next RAISE.

### Rollback

Traffic only (`PILOT_ROLLBACK.md` §1, plus ET.6's paragraph), then E2's undo (cutoff back to 18:00), because the old revision reads 19:00 in Central, an hour late. No other SQL. E1-fix's undo is optional: a fixed hold reads the same day under Central. Ask crews to reopen the app once.

---

## 5 · Gate

The P1-1 base gate (`AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md` §5) applies (prisma generate, tsc 0, eslint 0 errors, `test:ui`, build, my-deployment `wc -l` unchanged). Plus:
- **Lint:** 49 warnings at `3dbaea8`, and the same after (rev 2 scratch run). The touched files keep only their three old `set-state-in-effect` warnings (reports page `useEffect(load)`, Today `setMounted`, Settings `useEffect(loadCategories …)`). State the count.
- **No migration:** `git diff --name-only origin/development...HEAD -- prisma` → empty.
- `grep -rn "America/" src` → one line: `src/lib/business-date.ts` `DEFAULT_TIMEZONE`.
- `git grep -n "America/Chicago" -- . ':!*.md' ':!*.pdf' ':!*.zip' ':!tests'` → 0 (RE-1; before the fix it lists `.env.example:53,54`).
- `grep -rn "'1[89]:00'" src` → one line: `src/lib/business-date.ts` `DEFAULT_DAILY_CHECK_CUTOFF = '19:00'`.
- `grep -c "DEFAULT_DAILY_CHECK_CUTOFF" src/lib/notification-config.ts "src/app/(admin)/admin/settings/page.tsx"` → 2 and 3.
- `grep -c "APP_TIMEZONE=America/New_York," Makefile` → 1; `grep -c "America/Chicago" Makefile` → 0.
- `grep -c "APP_TIMEZONE_ACTUAL" .github/workflows/deploy.yml` → 3 (lines).
- `grep -c "timeZone: appTimezone()" src/components/operator/today/VehicleChecks.tsx "src/app/(operator)/operator/dashboard/page.tsx" "src/app/(admin)/admin/pilot/page.tsx"` → 1 each; `grep -c "timeZoneName: 'short'" "src/app/(admin)/admin/pilot/page.tsx"` → 1.
- `grep -n "toISOString().slice(0, 10)" "src/app/(admin)/admin/reports/page.tsx"` → 0.
- **Bundle (after `npm run build`):** `grep -rl "America/New_York" .next/static` → ≥ 1; `grep -rl "America/Chicago" .next/static .next/server` → 0.

PR title `Eastern time · The app's day is Eastern`. Body: what/why, finding IDs (S5-17, B6-5), **Behaviour changes**, **Interpretations**, the owner decisions used (§0), tests changed outside this packet's list, both suites' base and new counts, lint warning count.

## 6 · Owner reads and steps (Supabase SQL Editor)

**Before the merge** (any day; read-only). Tell the session what E0's first line shows and how many rows E1 lists.
```sql
-- E0 · information only. Line 1: the saved cutoff (expect 18:00; E2 moves it to 19:00 after the deploy).
--      Line 2: checks sent between 00:00 and 01:00 Eastern, filed under the day before (they stay that way).
--      Line 3: open alerts carrying a day (they refresh on the next background run, every 10 minutes).
--      Columns are UTC timestamps without a zone, hence AT TIME ZONE 'UTC'.
SELECT "dailyCheckCutoff" FROM notification_config WHERE id = 'global';
SELECT count(*) AS all_checks,
       count(*) FILTER (WHERE (("submittedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago')::date
                          <> (("submittedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date) AS sent_midnight_to_1am_eastern
FROM daily_checks;
SELECT type, count(*) FROM alerts
WHERE resolved = false AND type IN ('DAILY_CHECK_MISSED', 'RESERVATION_HOLD_EXPIRED') GROUP BY 1;

-- E1 · holds an admin extended under Central (they end at a Central midnight) that still hold stock.
--      Run it now for the count, and again after the deploy. Keep the after-deploy output:
--      E1-fix uses its ids, and its last column is that hold's undo line.
SELECT r.id, r.label, r.status, r."holdExpiresAt",
       ((r."holdExpiresAt" + interval '1 millisecond') AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date - 1 AS held_until,
       format('UPDATE deployment_requests SET "holdExpiresAt" = TIMESTAMP %L WHERE id = %L AND "holdExpiresAt" = TIMESTAMP %L - interval ''1 hour'';',
              r."holdExpiresAt", r.id, r."holdExpiresAt") AS undo_line
FROM deployment_requests r
WHERE r."requestType" = 'RESERVATION' AND r.status IN ('STAGED', 'FULFILLED')
  AND ((r."holdExpiresAt" + interval '1 millisecond') AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::time = '00:00'
  AND EXISTS (SELECT 1 FROM deployment_request_lines l
              WHERE l."requestId" = r.id AND l."releasedAt" IS NULL AND l."heldQty" > l."claimedQty")
ORDER BY 4;
```

**On the merge night, as soon as the session says the new version is live.** Do steps 1–3 **before 00:00 Eastern**. Why: a hold extended before the switch for that day would end at 01:00 instead of midnight, and its "Hold ended" bell and email would name tomorrow. A sent bell can't be taken back.
1. Run **E1** again. Keep the output.
2. **If E1 lists rows:** run **E1-fix** once with their ids. Then run E1 once more: it shows 0 rows. (A Stage hold, or a hold extended after the deploy, never matches E1, so running E1-fix twice changes nothing.)
3. Run **E2**. It shows `UPDATE 1` and then `19:00`. If it shows `UPDATE 0` and a time other than 19:00, E0 showed a time other than 18:00: set Settings → Notifications to one hour later than that time instead, and tell the session. (On a daytime merge, run E2 before 18:00 Eastern, or that evening's missed-check alerts come an hour early.)
4. Text the crews: "AHITS was updated tonight. Please close the app completely and open it again once (or tap Reload if it offers a new version)." Until a phone does that, work it sends between midnight and 1 am Eastern is filed under the day before, and sending it again fails with "A check for <date> already exists".
5. Tell the session: E1's row count, whether E1-fix ran, and E2's result.

```sql
-- E1-fix (a write) · end each listed hold at the end of the same day in Eastern.
--   A Central midnight is always exactly one hour after the Eastern one, DST days included.
UPDATE deployment_requests SET "holdExpiresAt" = "holdExpiresAt" - interval '1 hour'
WHERE id IN ('<id>', '<id>')
  AND (("holdExpiresAt" + interval '1 millisecond') AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::time = '00:00';

-- E2 (a write) · the daily-check cutoff becomes 19:00 Eastern: the same moment as today's 18:00 Central.
UPDATE notification_config SET "dailyCheckCutoff" = '19:00', "updatedAt" = now()
WHERE id = 'global' AND "dailyCheckCutoff" = '18:00';
SELECT "dailyCheckCutoff" FROM notification_config WHERE id = 'global';
```

**Undo, only if needed:**
- **E1-fix undo:** run the `undo_line` cells from E1's after-deploy output, one per hold. Each says `UPDATE 1`. `UPDATE 0` means an admin changed that hold since; leave it.
- **E2 undo** (also the step after a rollback):
  ```sql
  UPDATE notification_config SET "dailyCheckCutoff" = '18:00', "updatedAt" = now()
  WHERE id = 'global' AND "dailyCheckCutoff" = '19:00';
  ```

**Tested** on Postgres 16 (UTC; the writes also in a Los Angeles session) with 12 seeded holds. E1 listed exactly the six Central-extended open holds, not a Stage hold, three Eastern-extended ones, a cancelled one or one holding nothing. E1-fix: `UPDATE 6`, each now `endOfBusinessDay(day)` in Eastern; a second run `UPDATE 0`; E1 then 0 rows. The undo lines restored all six exactly; run again, all `UPDATE 0`. After a re-Extend of one fixed hold, its undo line said `UPDATE 0` and left it alone (RE-8). E2 moved `18:00` to `19:00`, a second run `UPDATE 0`; it left an owner's `17:30` alone; its undo restored `18:00`. The open alert, if any, then clears or re-raises on the next background run.

## 7 · Merge and close (on the owner's go)

1. The owner's explicit go in chat; CI green.
2. **When.** Inside D48: after 21:00 Eastern (20:00 Central), or at any time the admin dashboard shows 0 Active Deployments. **And no later than 23:00 Eastern**, so the deploy and the owner's §6 steps finish before 00:00 Eastern. Merge it alone that evening: §6's steps follow it. Read the Active Deployments count and the time just before merging, and state both. If it's past 23:00 Eastern, don't merge; tell the owner. Why the hour matters: until a phone reloads, it keeps the Central code. Work it sends between 00:00 and 01:00 Eastern is filed under the day before, and re-sending it fails with "A check for <date> already exists". This repeats every night until that phone reloads, so the crews reopen the app once (§6 step 4).
3. **Watch the deploy** (`deploy.yml`) through its settings check (env-drift). It must print `APP_TIMEZONE     = 'America/New_York'`. Then `/api/health` 200; note the app version (Cloud Run revision). **If the deploy or the settings check fails, stop and tell the owner. No traffic rollback and no revert without the owner's go.**
4. Tell the owner the new version is live: run §6's merge-night steps now, before 00:00 Eastern, and text the crews. Then check acceptance rows 1, 3, 4 and 5 (row 5 once the owner reports E2) with the tab visible, in the admin session that is already signed in. Look only: no Save, no test data. **Never type a PIN or password.** If a page asks you to sign in, stop and ask the owner. Record the owner's row 6.
5. One docs-only commit (docs-only PRs are outside D48; the owner's go covers it), merged by the session on green. Named files only; no handoff file unless the session ends mid-work.
   - **`CHANGELOG.md`:** `<date> · #<n> · The app's day is Eastern (America/New_York); cutoff 19:00 Eastern · <revision>`.
   - **`STATUS.md`:** one RESUME BOX bullet: PR, merge commit, revision, the Active Deployments count and time, smoke result, E1 rows and whether E1-fix ran, E2 done (cutoff 19:00), crews told to reopen the app, and "Report totals for the same dates differ from before this PR: To's day now counts and days start at midnight Eastern". Also the `_Last updated_` line and the §2 merged list. §4's merge checklist step 3 (`:180` at `3dbaea8`, `:192` at `ac1410a`) reads `after 21:00 Eastern (20:00 Central)`. Keep any other text on that line.
   - **`00_START_HERE.md`:** the row `build Eastern-time → AHITS_PACKET_EASTERN-TIME_2026-10-26.md`.
   - **Decisions** (below). D-E1 takes the next free number at first write (D53 if P1-1 took D50–D52) and is ACTIVE.
   - **This commit goes first.** Merge it before anyone starts the P1-2 Security build (S1). S1 checks that D-E1 is in `DECISIONS.md`, stops if it isn't, and numbers its own decisions after it. So a decision number is never taken twice (SX-2).

**D-E1 text** (house format):
```markdown
### D<nn> · The business day is Eastern (America/New_York); the daily-check cutoff is 19:00 Eastern
- **Date:** decided 2026-10-26 (owner, final), recorded <date> · **Owner:** Max · **Status:** **ACTIVE** (#<n> merged <date> <time> Eastern, squash `<sha>`, revision `<rev>`) · **Amends:** the 2026-06-30 `APP_TIMEZONE = America/Chicago` setting (FND-7, #133) and P1-1's reservations decision §0-q "today Central" (D<r>) · **Read-with:** D26, D48, D<r>, `src/lib/business-date.ts`, `AHITS_PACKET_EASTERN-TIME_2026-10-26.md`
- **Decision:**
  - The app's day is Eastern everywhere: the daily-check day and its cutoff, missed-check timing, hold end dates, days on screens, bells and emails, and report days.
  - One switch: `DEFAULT_TIMEZONE` in `src/lib/business-date.ts`, the Makefile's `APP_TIMEZONE` and `.env.example` all say `America/New_York`; a test and env-drift fail if they differ. No other file in `src` names a zone.
  - The daily-check cutoff is **19:00 Eastern**, the same moment as the old 18:00 Central. Code default `DEFAULT_DAILY_CHECK_CUTOFF = '19:00'`; the saved setting was moved once (packet §6 E2).
  - Holds extended under Central were re-expressed once (§6 E1-fix: <k> rows). Daily checks and other stored days stay as filed.
  - Business-day screens use the business zone (pilot times show the zone's name); other timestamps stay in the viewer's zone.
  - Reports: whole Eastern days, To's day included; totals for the same dates differ from before.
- **Revisit triggers:** a crew working in another time zone (then a zone per hub or per deployment) · the owner wants every timestamp in Eastern.
- **Rationale:** the fleet works out of Piedmont, SC. Under Central, work between midnight and 1 am Eastern was filed under yesterday and extended holds ended at 1 am. The cutoff keeps its real moment.
```
**D<r> qualifier** (appended to P1-1's reservations decision; D<r> is D50 at `3dbaea8`, so use its real number): `- **D<nn> qualifier (<date>):** §0-q's zone is now Eastern. Extend runs a hold to the end of the picked Eastern business day. Holds extended under Central were re-expressed once (Eastern-time packet §6, E1-fix: <k> rows).`

**D48 note** (§0-h): `- **Dated note (<date>, owner; D<nn>):** the app's day is Eastern from <date>. Read D48's "20:00 Central" as **21:00 Eastern**, the same moment: merge after 21:00 Eastern, or at any time Active Deployments reads 0. The 2026-10-26 amendment (merge pace) is unchanged.`

No reverts and no traffic rollback without the owner's go.

**Parked (not in this PR):**
- Every remaining timestamp in Eastern (§0-f).
- A Settings caption naming the zone ("19:00 Eastern"). It would write a zone name into copy; take it with the item above.
- B6-5's other half: one `formatBusinessDay`/`dbDateToBusinessDate` home in `business-date.ts`.
- The cutoff's column default (`schema.prisma:897`, `18:00`). The app now writes its own default for a new row; align the column the next time a migration touches `notification_config`.
- Due and expiry dates turn at UTC midnight (20:00 EDT / 19:00 EST the evening before), as under Central. Take with P1-1b's parked `nextDue`/`dateDelivered` (RE-7).
- The pilot default window is 15 days (`pilot-metrics.ts:240` reads a UTC midnight in APP_TIMEZONE); use `new Date(Date.parse(\`${end}T00:00:00Z\`) - 13 * 86_400_000).toISOString().slice(0, 10)` (RE-16).
- Raw SQL that compares zone-aware bounds with zone-less columns (`pilot-metrics.ts:80-85`) and two P1-1e tests (`p1-1e-expired-holds` 1, 2) need a UTC Postgres session. Supabase and CI (`verify.yml` prints `SHOW timezone`) are UTC; unchanged (RE-18).

## 8 · Paste prompts

Build (after P1-1e merges):
```
Build the Eastern-time PR in AHITS_PACKET_EASTERN-TIME_2026-10-26.md (repo root; rev 3), exactly as written: §0 (final; don't re-ask), the ET section, §5 and §7, plus the override line, §5 base gate and §7 rules of AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md. Follow CLAUDE.md except where the packets override it. First check the base: P1-1e is merged; re-grep every anchor. The packet file is untracked in the repo root: commit it on this branch. Branch feature/<YYYYMMDD>/Agricarbon-USA-eastern-time from current development. Owner reads are done: E0 cutoff <18:00>, E1 <k> rows. Stage named files only, never git add -A. Never type a PIN or password. Open the PR to development titled "Eastern time · The app's day is Eastern" and give me the number when CI is green, with both suites' base and new counts. Do not merge it. No reverts.
```
Merge (after my go):
```
Go on PR #<n>. Follow §7 of AHITS_PACKET_EASTERN-TIME_2026-10-26.md. Merge only inside the D48 window (after 21:00 Eastern = 20:00 Central, or with 0 Active Deployments), alone that evening, and no later than 23:00 Eastern; state the Active Deployments count and the time read. Watch the deploy through env-drift (it must print APP_TIMEZONE = 'America/New_York') and /api/health, then tell me the new version is live so I run §6's merge-night steps (E1, E1-fix if it lists rows, E2) before 00:00 Eastern and text the crews. Smoke acceptance rows 1, 3, 4 and 5 (5 after I report E2) with the tab visible, look only, in the admin session already signed in. Never type a PIN or password; if a page asks to sign in, stop and ask me. Then the one docs-only commit (§7.5), with D-E1 numbered at first write, and merge it on green; the P1-2 S1 build waits for it. Named files only. If it's past 23:00 Eastern, don't merge; tell me. If the deploy or env-drift fails, stop and tell me; no traffic rollback or revert without my go. Report back.
```

## 9 · Findings ledger (rejected, moved, parked; everything else is applied)

| Finding / option | Verdict | Why |
|---|---|---|
| S5-17 (holds extended under Central read as the next day) | Applied | §6 E1 / E1-fix / undo. The fixed value is right under both zones. |
| B6-5 check time in two zones | Applied | ET.4 `checkTime` uses the business zone, as `formatCheckTime` does. |
| B6-5 "Held until" a day late on an Eastern phone | Closed | Screens print the server's `businessDate` (P1-1e e.6), now Eastern; E1-fix covers old holds. |
| Rev 1 open question 1 default ("keep 18:00", i.e. 18:00 Eastern) | Replaced by the owner | 19:00 Eastern, the same moment as 18:00 Central (§0-c): ET.7, §6 E2, acceptance rows 5 and 7, D-E1. |
| Move the cutoff's column default by migration | Rejected | A migration for a value the app no longer uses: the row always exists, and a new row now gets the app's default. Parked. |
| RE-8 as written (the owner types each undo statement from E1's values) | Changed | Same statement and guard, but E1 now prints it per hold (`undo_line`), so nothing is typed. Tested, including the re-Extend case. |
| RE-14 (D packet: "the first hourly run") | No change | Already fixed in the D packet's rev 2 (its header and §9). |
| RE-15 (S packet: `deploy.yml:153-197`, "which doesn't name it") | Moved; done | The S packet's own line, not this packet's. Applied in S rev 4 (3.12, SX-17). |
| EX-1 (rev 3, practice build: "the real base also carries #272's three UI test files") | Applied | #272 and #273 add no tests; the three are #270's, already in `3dbaea8`'s 76. Counts and SLOT lines. |
| SX-2 (rev 3, practice build: D-E1 is written only after merge, and S1 could take its number) | Applied | §7.5 "This commit goes first". The Security packet's S1 checks for D-E1 and stops if it's missing (its §7 and §8). |
| D48's pace amendment in STATUS §4 step 3 | Not here | The owner's docs PR owns it (as the D packet's CD-17). This PR changes only the hour on that line. |
| Drop APP_TIMEZONE from the Makefile (the code default only) | Rejected | The deploy config should state the zone. The guard test and env-drift make the two one switch. |
| Send APP_TIMEZONE to the browser (`next.config` `env` / `NEXT_PUBLIC_`) | Rejected | Inlined at build, and the Docker build has no runtime env (the FND-49 trap, `Makefile:185-187`). |
| Re-date past daily checks | Rejected | §0-e. It would fight the (vehicle, date, operator) key and D26. |
| Every `formatDate`/`formatDateTime` in Eastern | Moved | §0-f; a later PR. |
| Re-word the Central comments in passing tests (`pr2-populations`, `pr4-evaluators`, `cc15`, `p1-1b-screens`) | Rejected | They pass and describe what was true when written. Smallest diff. |
| Change the Cloud Scheduler job | Rejected | Interval job; nothing runs at an hour of day (§0-i). |
| Edit D48 or STATUS in the code PR | Moved | Docs commit only (§7.5). |
