# The road to 45

The training workspace supplies the `/training` dashboard in the shared Next.js site. Run the site and its checks from the repository root.

The program starts October 27, 2026, from the supplied baseline: 201 lb, a 25-minute 5K, 25 running miles per week, and six strict pull-ups. Equipment: pull-up bar and vest; no weights. No injuries were reported. Build weeks schedule five runs, one quality run, and three differentiated strength exposures: Monday easy + strength, Tuesday quality, Wednesday Murph preparation, Thursday easy, Friday easy + strength, Saturday rest, Sunday long. Regular weekdays fit 50 minutes; baseline running is redistributed to approximately 22 miles. Sunday is longer. The 10K and Murph challenge mornings explicitly require more than 50 minutes including warm-up and cooldown. Travel, ski days, re-entry, tapering, and post-Murph recovery replace the base sessions.

The challenge is six Tuesday attempts: March 30 (5K), April 6 (10K), April 13 (Murph), April 20 (5K), April 27 (10K), and May 4 (Murph), before the May 11, 2027 birthday. Goals are 7:00/mile for 5K (about 21:45), 45:00 for 10K, and 57:00 for unpartitioned Murph with a 20 lb vest. Checkpoints determine whether an attempt should be a goal effort or a scaled rehearsal. The plan does not automatically infer readiness from elapsed weeks.

Murph completion requires a self-reported unpartitioned, unscaled log with both miles, all 100/200/300 reps, and at least 20 lb. Logs of partitioned practice remain in the journal. No target body weight is prescribed.

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

The seven-column monthly calendar opens workout details and a logging form. Effort cues use the owner's reported HR/RPE anchors, not measured physiological zones. All running paces are per mile.

Workout statistics are publicly readable at `/api/training/history`. Travel, notes, credentials, and GPS tracks are excluded. The journal and normalized Garmin source remain in private Vercel Blob storage. A personal editing link exchanges its URL fragment for a secure, HttpOnly, SameSite cookie. Production requires `TRAINING_ACCESS_HASH` and `BLOB_READ_WRITE_TOKEN`. Conditional ETags reject concurrent stale saves; local backups remain available.

Nightly imports run through the connected Garmin tool in T3's scheduler, then `node scripts/import-garmin.cjs PRIVATE_INPUT_JSON PRIVATE_ENV_FILE`. Both files belong in ignored `training plan/private/`. The importer normalizes distance to miles and duration to minutes and deduplicates stable Garmin IDs across overlapping seven-day windows. Unedited imports update measured values; manual corrections remain authoritative. A unique same-date, same-kind manual record may be matched; ambiguous activities remain separate. Imported sessions require completion review; strength repetitions, vest use, RX status, and missing RPE are never inferred. Garmin import status appears on the dashboard. This automation depends on T3 and its Garmin/Vercel connections being available.
