# The road to 45

The training workspace supplies the `/training` dashboard in the shared Next.js site. Run the site and its checks from the repository root.

The original program starts October 27, 2026. The owner-approved revision applies from November 7; earlier dates retain their original prescriptions. The updated reported baseline is 192.5 lb, a 25-minute 5K, seven strict pull-ups, twelve regular kipping pull-ups, and thirty-five clean push-ups. Full weeks build toward 32 running miles: 10 Sunday, 4.5 Monday/Wednesday, 5.5 Tuesday/Thursday, and 2 Friday. Monday/Wednesday upper body begins at 5:30 before the easy run; Tuesday is intervals, Thursday threshold, Friday sequential Murph work, Saturday rest. Combined mornings exceed 50 minutes. `src/revisedPlan.ts` holds the accepted phase progression, exact sets/reps, conditional 20 lb vest work, workload reductions, taper, and recovery. Private calendar overrides continue to apply without publishing calendar titles or locations. Targets are budgets and ceilings, not automatic readiness or completion claims.

The challenge has three primary Tuesday attempts: April 13 (5K), April 20 (10K), and May 4 (Murph), before the May 11, 2027 birthday. April 27 defaults to an easy run, with an optional retry of one running goal only when recovered. This replaces the former six-attempt rotation. Dates live in `src/challenge.ts`. Goals are 7:00/mile for 5K (about 21:45), 45:00 for 10K, and 57:00 for unpartitioned Murph with a 20 lb vest. Checkpoints determine whether an attempt should be a goal effort or a scaled rehearsal. The plan does not automatically infer readiness from elapsed weeks.

Full running weeks stay at 30–32 miles through March 29, with 8-mile Sundays after the largest rehearsals, and a 32-mile March 22–28 block. March 26 retains a controlled partial vested rehearsal rather than prematurely tapering. The first taper begins March 30: 25 miles March 30–April 5 and 19 miles April 6–12, retaining short controlled intensity while reducing calisthenics. These Tuesday–Monday blocks cross the calendar's Sunday–Saturday rows; row totals always sum their actual dates. April 11 and April 18 are short Sundays before running attempts. April 23 is a conditional 50/100/150 vested rehearsal, 11 days before Murph; replace it with light technique if recovery is incomplete or a running retry is planned. Substantial calisthenics end before the final 7–10 days. Three recovery mornings follow Murph, with later runs conditional on normal recovery. Travel/re-entry adjustments remain in force; no missed volume is made up.

Murph completion requires a self-reported unpartitioned, unscaled log with both miles, all 100/200/300 reps, and at least 20 lb. Logs of partitioned practice remain in the journal. Weight targets are the owner's requested tracking goals.

Program rationale and references are in **The plan** tab. `src/plan.ts` contains deterministic scheduling and validation. The host's `tests/training.test.mjs` exercises the planning and goal rules. `src/TrainingDashboard.tsx` handles local persistence, journal entries, private travel imports, JSON backups, and `.ics` export.

Travel import format (last day inclusive):

```json
{
  "reviewedAt": "2026-10-27",
  "trips": [
    {
      "id": "away-1",
      "title": "Away",
      "start": "2026-12-01",
      "end": "2026-12-03",
      "kind": "travel",
      "tentative": false
    }
  ]
}
```

Use `kind: "ski"` for days when skiing replaces leg training. Imported data is a snapshot, not a live integration. Keep personal files in ignored `private/`, never in the host's `public/` folder.

## Public history and personal editing

The continuous calendar opens at the current Sunday–Saturday week, with past weeks available by scrolling upward. Each row ends with planned and logged mileage; Garmin-linked records show a watch icon. The next two upcoming mornings show temperature in Fahrenheit and precipitation probability at the configured workout start, using Open-Meteo and the shared device/saved location. Missing forecast values remain unavailable. Click a day for workout details and a logging form. Effort cues use the owner's reported HR/RPE anchors, not measured physiological zones. All running paces are per mile.

Workout statistics are publicly readable at `/api/training/history`. Travel, notes, credentials, and GPS tracks are excluded. The journal and normalized Garmin source remain in private Vercel Blob storage. A personal editing link exchanges its URL fragment for a secure, HttpOnly, SameSite cookie. Production requires `TRAINING_ACCESS_HASH` and `BLOB_READ_WRITE_TOKEN`. Conditional ETags reject concurrent stale saves; local backups remain available.

Nightly imports run through the connected Garmin tool in T3's scheduler, then `node scripts/import-garmin.cjs PRIVATE_INPUT_JSON PRIVATE_ENV_FILE`. Both files belong in ignored `training plan/private/`. The importer normalizes distance to miles and duration to minutes and deduplicates stable Garmin IDs across overlapping seven-day windows. Unedited imports update measured values; manual corrections remain authoritative. A unique same-date, same-kind manual record may be matched; ambiguous activities remain separate. Imported sessions require completion review; strength repetitions, vest use, RX status, and missing RPE are never inferred. Garmin import status appears on the dashboard. This automation depends on T3 and its Garmin/Vercel connections being available.

Weekly weight targets start at 196 lb for the week ending October 31, 2026, then decrease 1 lb each week as requested. Garmin body-composition measurements are converted from kilograms to pounds and deduplicated by measurement timestamp. Each Sunday–Saturday average uses only available measurements and displays its weigh-in count; missing days are not filled in. The importer accepts optional `bodyMeasurements` alongside `activities`, preserving previous weights when omitted. Only date, timestamp, and weight are retained; other body-composition fields are discarded. Weight figures are public with the workout history.

Each calendar day displays every imported Garmin weigh-in for that date in pounds, including rest days. Multiple readings are listed separately in measurement order; opening the day shows their measurement times in Eastern Time. Dates without a measurement have no daily weight value. The eighth cell remains alongside all seven days on desktop and mobile. It shows running miles, Murph minutes, and average/target weight as logged / target; future rows show targets only. Results are retained from October 25 onward; the current week excludes future-dated entries. Zero logged work does not certify that a workout was missed. Garmin Cardio counts as Murph/strength time by the owner's instruction, but never infers repetitions, vest use, or RX completion. An explicit manual time split, including zero, wins over imported duration. Planned Murph budgets include preparation and rests in the calisthenics block, separate from normal running time; a full Murph attempt uses its 57-minute timed-event target.
