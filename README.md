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

A one-year preference cookie uses `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS, with `Domain=brooksl.com` on that domain and its subdomains. Coordinates are stored in browser local storage, never in the cookie. A manually chosen place works without device permission. The shared root layout requests device location once on arrival, including a browser prompt when needed, and reuses browser permission when available. Explicit off and manually saved place preferences are respected. All tools on www.brooksl.com share the coordinate cache and location update event; the apex redirects to that hostname. Browser permissions are origin-specific and cannot be granted or made permanent by a cookie.

## Training data

Workout logs, settings, and imported travel dates are kept in the current browser. There is no server database, account system, live calendar sync, or cross-device synchronization. The UI exports JSON backups and merges imports by record ID; current entries win conflicts. Calendar export produces floating local-time `.ics` events and does not write to Google Calendar.

`training plan/private/` is ignored. The private calendar snapshot prepared for this session can be imported using **Travel & settings → Import private calendar file**. It stays out of source control, public assets, and client bundles. Other browsers need their own import or a training backup. Review tentative trips and new travel manually.

## Rank & Rate Photos

`/rank-photos` is the browser version of Photo Similarity Helper's Rank & Rate workflow. It accepts 2–100,000 browser-readable still images (RAW files need JPEG exports), prepares metadata-free JPEG previews locally, and combines overlapping GPT-6.1 Terra comparisons with a Bradley–Terry fit. Scores from 1 to 10,000 are relative to the current set. Best-N, percentage, star bands, reference thresholds and rank-only policies reuse saved evidence; manual stars take precedence. Conflicting reference order and tied cutoffs are left for review. Whole-frame color similarity provides conservative near-repeat variety, not semantic slideshow coverage.

Sessions, preview blobs, the queue and observations are stored in IndexedDB on the current browser/origin. The review grid virtualizes rows while retaining one continuous scroll; clicking an image opens full-screen review. Browsers have different storage limits, particularly on mobile. The tab must remain open during comparisons. No server-side background worker or cross-device account sync is provided. Clearing browser data removes reviews. Export a ratings CSV and/or a JSON review backup (with previews); JSON backup imports are limited to 300 MB.

Visitors provide their own OpenAI API key, held only in tab memory. `/api/rank-photos/compare` validates same-origin requests and bounded JPEG data, constructs a fixed Terra-only Responses request with `store:false`, and returns validated anonymous rankings and usage. It has no owner API key and does not persist photos, credentials or provider responses. File names, original metadata and existing stars are excluded from the model prompt. Vercel processes the transient request and OpenAI processes the previews. No paid requests are made until the visitor presses Start / Resume Terra.

Web Locks serialize ranking across tabs and guard edits. Durable intent and conservative cost reservations precede HTTP. Unknown outcomes are never automatically retried; explicit retry keeps the earlier reservation. Token-cost estimates use undiscounted input $1/M and output $5/M, including reasoning tokens; these are estimates rather than an OpenAI billing cap. Stop saves responses already in flight. An interrupted photo import is marked incomplete; corrupt/unreadable files are listed and excluded with explicit acknowledgement before paid work.

This web tool does not read Lightroom selections or write Lightroom catalogs. CSV ratings are proposals for external use; it does not modify source images. The native Lightroom plugin remains the catalog-connected workflow.

Checks: `npm test`, `npm run typecheck`, `npm run build`. Browser QA uses synthetic images and simulated responses without consuming API credits. `.vercelignore` excludes retired Lightroom code, private data, environment files, and repair artifacts from deployments. Deploy the existing linked Vercel project from the repository root with `vercel deploy --prod`.


### Lightroom-connected mode (default)

The default `/rank-photos` workspace controls Photo Similarity Helper on this Mac. The plugin's existing Rank & Rate menu opens a paired URL and snapshots the current selected still photos. A saved set opens only through **Resume latest saved ranking**. **Load / Refresh Lightroom selection** recollects the currently selected photos and current rendered previews. Exact unchanged comparisons remain eligible for reuse in the local engine.

The build-98 plugin starts a paired HTTP companion on `127.0.0.1:8766`. A random browser capability arrives in the URL fragment, is removed from the address bar, and is retained only in session storage. The companion accepts only the exact brooksl.com origins and that capability; Lightroom uses a separate local token. The listener is loopback-only, expires after eight hours, and exits when Lightroom stops heartbeating. New connections rotate credentials. There is no tunnel or public photo endpoint. Chrome's local / loopback network permission must be allowed from the Connect button. A page opened by its regular URL has no catalog access until paired by the plugin.

Lightroom handles all selection reads, cached previews, comparison scheduling, encrypted API-key retrieval, direct OpenAI requests, durable results and ratings. No OpenAI key, source image, or catalog database is uploaded to brooksl.com in this mode. Cached image previews travel only over loopback to the browser. API previews still go directly from Lightroom to OpenAI on an explicit paid Start action. Closing the web tab leaves active comparisons running in Lightroom; use Stop to stop new dispatches. Native Lightroom confirmation and current-render/star validation guard Apply and Restore. The local broker never reads or writes catalog SQL. Commands are idempotent and are not replayed after lost replies; Stop remains available while the worker is busy.

The independent browser-file workflow remains available under **Browser files**, or `/rank-photos?source=files`.
