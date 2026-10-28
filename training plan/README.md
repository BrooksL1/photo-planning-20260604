# The road to 45

The training workspace supplies the `/training` dashboard in the shared Next.js site. Run the site and its checks from the repository root.

The program starts October 27, 2026, from the supplied baseline: 201 lb, a 25-minute 5K, 25 running miles per week, and six strict pull-ups. Equipment: pull-up bar and vest; no weights. No injuries were reported. Build weeks schedule four runs and two bodyweight strength mornings, with Saturday off and a longer Sunday session. Travel, ski days, re-entry, tapering, and post-Murph recovery replace the base sessions.

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
