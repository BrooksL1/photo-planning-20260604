# Direct Garmin archive and daily import

This personal tool calls Garmin's official Personal API. It does not use Fitness
AI Connector, T3, a Garmin account password, or copied browser cookies.

## Account setup

In Garmin Connect Web, open Settings → Personal API Key. Review Garmin's
Supplemental Terms, create a key, and choose its expiration. The key must remain
private and be used only by applications you develop or operate for yourself.

The tool reads `credentials.json` from
`~/Library/Application Support/BrooksL/Garmin/`. This file contains an `apiKey`
property. Keep the directory permission at 700 and the file permission at 600.
Do not put it in Git, OneDrive, public assets, a URL, or a chat message. Access
tokens are obtained from Garmin when needed and are kept only in process memory.

Garmin setup: https://connect.garmin.com/app/settings/personalApiToken

## Commands

Run commands from the repository root:

```sh
# Backfill every available activity summary and all recorded weights since 1970.
# Download details, associated workouts, and original ZIPs for 100 activities.
node scripts/garmin-personal.cjs sync --all

# Continue/resume downloading original files for every archived activity.
node scripts/garmin-personal.cjs sync --all-files

# Fetch seven local calendar days of activities and 30 days of weigh-ins,
# and merge the results into the existing BrooksL calendar.
node scripts/garmin-personal.cjs sync --publish

# After a successful authenticated sync, install the Mac's daily job.
node scripts/garmin-personal.cjs install-daily

# Show counts and errors without printing workout history or credentials.
node scripts/garmin-personal.cjs status

# Preserve the complete account export once Garmin has made it downloadable.
node scripts/garmin-personal.cjs import-archive '/path/to/Garmin-export.zip'
```

The daily LaunchAgent runs at 23:05 in the Mac's system timezone and at login.
macOS delivers a missed calendar trigger after waking from sleep. The Mac must
be logged in and able to reach Garmin and Vercel; this is not an always-on cloud
service. The importer runs with T3 closed. The existing website's refresh button
still uses its existing webhook; this tool does not change that button or deploy
the website. The old T3 connector nightly schedule was disabled after the new
job completed a successful live run. Its on-demand refresh webhook now runs this
direct importer; that button still needs T3 available to dispatch its request.

The installed job uses a local copy under the Garmin storage directory's
`runner/` folder and an independently installed `@vercel/blob@2.8.2` runtime.
It does not need OneDrive to hydrate repository source files or packages.
The production environment is fetched with the existing authenticated Vercel
CLI into the same private directory as `production.env` (permission 600).
Some sensitive Vercel variables cannot be pulled; the importer only needs the
Blob token, whose presence and actual read/write access must be verified.

The daily job also resumes up to 100 pending original-file downloads. A large
history may need several runs, or `--all-files` to finish in one run. Requests
are paced one second apart, with bounded retries for rate limits and transient
errors. `status.json` reports any remaining downloads and failures. Manual
activities may have no original file; those are explicitly recorded.

## Where the data goes

All source data is private under
`~/Library/Application Support/BrooksL/Garmin/`:

- `activities.json`: actual Garmin activity-list objects, including multisport
  parents and child legs. Parents are excluded when producing calendar imports.
- `weights.json`: actual recorded weight measurements, never profile settings.
- `activities/<Garmin ID>/details.json`, `workouts.json`, and `original.zip`:
  full API detail and the original recording, usually a FIT file within a ZIP.
- `workout-history.json`: readable normalized activity and weight records for
  local AI tools or a deliberate manual upload to an assistant.
- `account-exports/`: intact complete-account ZIPs and file manifests. These
  include data categories outside the workout importer. They are not published.
- `latest-import.json`: the fresh input passed to BrooksL's existing importer.
- `status.json`, `daily.log`, `daily-error.log`: import results and errors.
- `progress.json`: progress during original-file downloads.
- `weights-needing-review.json`: original historical entries lacking usable
  measurement fields; these are retained privately and not converted into
  invented weigh-ins.

Original files may contain precise GPS and other sensitive records. They remain
private. `--publish` sends only normalized workout statistics and recorded
weights through an independently validated publisher and private Vercel Blob storage;
the existing public history endpoint displays them with editing protected.
No completion, exercise reps, vest use, RX status, or RPE is inferred.

Activity IDs and weight timestamps remain stable across overlapping runs and
corrected measurements. `weight-id-map.json` preserves the previous connector's
weight IDs when its midnight placeholders can be matched unambiguously to real
Garmin measurements. Actual recorded timestamps are retained. Ambiguous matches
stop publication for review. Source objects are retained even if a later run omits
them. Deleting an activity in Garmin does not delete its local archive. Failed
weight requests omit the weight payload, preserving existing published weights.
An activity-list failure prevents publication. Malformed measurements fail
validation instead of silently guessing units or inventing timestamps.

Live API checks on November 17, 2026 established two differences from the initial
Swagger: token responses use `text/plain` and require an unrestricted Accept
header; raw weight values use grams. The gram conversion was checked against
seven existing weigh-ins. The importer explicitly converts grams and fails
closed on values outside that expected range.

Garmin prepares full-account exports asynchronously; requesting an export is not
the same as downloading it. Once available, preserve that ZIP with
`import-archive`. FIT files contain only what the original device recorded; API
details preserve Connect-side information separately.

API reference: https://developer.garmin.com/gc-developer-program/personal/swagger-docs/

API terms/setup: https://developer.garmin.com/gc-developer-program/personal/personal-faq/
