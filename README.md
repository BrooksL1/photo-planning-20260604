# brooksL tools

One domain, one Next.js host, separate tool source folders:

- `photo-planning/` hosts `/` (the toolbox), `/PhotoPlanning`, weather APIs, and shared location controls.
- `training plan/` is the `@brooksl/training-plan` workspace, mounted by the host at `/training`.
- `lightroom/` is retired and is not linked or built.

From this directory, run `npm install`, then `npm run dev`. Checks: `npm test`, `npm run typecheck`, and `npm run build`. `npm start` serves a successful production build.

Deploy the repository as an npm workspace. The Next.js project directory is `photo-planning`; include source files outside that directory so the sibling training workspace is available. Install dependencies from the repository root with `npm ci`. Do not upload the private calendar import file. Vercel uses Root Directory `photo-planning`, includes source files outside the root, and runs `cd .. && npm ci` as its install command. Keep these settings when reconnecting the project.

The root lockfile is authoritative for the workspace installation. The older app-local lockfile is retained from the folder move; use the root commands above rather than a separate installation inside the app.

Next.js guidance is installed in `photo-planning/node_modules/next/dist/docs/`. Read the relevant local guides before changing framework code.

## Location

A one-year preference cookie uses `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS, with `Domain=brooksl.com` on that domain and its subdomains. Coordinates are stored in browser local storage, never in the cookie. A manually chosen place works without device permission. Device coordinates refresh automatically only while browser permission is already granted; a prompt is requested only after a user clicks a location button. Browser permissions are origin-specific and cannot be granted or made permanent by a cookie.

## Training data

Workout logs, settings, and imported travel dates are kept in the current browser. There is no server database, account system, live calendar sync, or cross-device synchronization. The UI exports JSON backups and merges imports by record ID; current entries win conflicts. Calendar export produces floating local-time `.ics` events and does not write to Google Calendar.

`training plan/private/` is ignored. The private calendar snapshot prepared for this session can be imported using **Travel & settings → Import private calendar file**. It stays out of source control, public assets, and client bundles. Other browsers need their own import or a training backup. Review tentative trips and new travel manually.
