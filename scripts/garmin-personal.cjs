#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { GarminPersonal, localDate, addDays, normalizeActivity, normalizeWeight, weightRecordId, weightIdentityMap, mergeBy, atomicWrite, readJSON, activityId } = require('./lib/garmin-personal.cjs');
const ROOT = path.resolve(__dirname, '..');
const HOME = path.join(os.homedir(), 'Library', 'Application Support', 'BrooksL', 'Garmin');
function child(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
    proc.on('error', reject); proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`Command failed with exit ${code}`)));
  });
}
async function publish(file) {
  const { publish: publishHistory } = require('./lib/garmin-publication.cjs');
  console.log(JSON.stringify(await publishHistory(await readJSON(file))));
}
async function sync({ all = false, publishToSite = false, maxFiles = 100 } = {}) {
  await fs.mkdir(HOME, { recursive: true, mode: 0o700 });
  const lockFile = path.join(HOME, 'sync.lock');
  let lock;
  try { lock = await fs.open(lockFile, 'wx', 0o600); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const saved = await readJSON(lockFile, {});
    if (saved.pid) { try { process.kill(saved.pid, 0); throw new Error('Another Garmin import is already running'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    // Only reclaim the exact abandoned lock inspected above. Live jobs keep their lock.
    const current = await readJSON(lockFile, {});
    if (current.pid !== saved.pid || current.startedAt !== saved.startedAt) throw new Error('Garmin import lock changed; retry later');
    await fs.rm(lockFile);
    lock = await fs.open(lockFile, 'wx', 0o600);
  }
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  try {
    const config = await readJSON(path.join(HOME, 'credentials.json'), {});
    const api = new GarminPersonal(config.apiKey);
    const today = localDate(), from = all ? undefined : addDays(today, -6);
    const indexFile = path.join(HOME, 'activities.json');
    let archived = await readJSON(indexFile, []);
    const incoming = await api.activities({ from, to: today, onPage: async page => {
      archived = mergeBy(archived, page, activityId);
      await atomicWrite(indexFile, archived);
    } });
    const weightFile = path.join(HOME, 'weights.json');
    let weights = await readJSON(weightFile, []), weightError;
    try {
      await api.weights(all ? '1970-01-01' : addDays(today, -29), today, async page => {
        weights = mergeBy(weights, page, weightRecordId);
        await atomicWrite(weightFile, weights);
      });
    } catch (e) { weightError = e.message; }
    let downloaded = 0;
    const failures = [];
    const normalized = archived.map(normalizeActivity).filter(Boolean);
    const publishableWeights = [], incompleteWeights = [];
    for (const w of weights) {
      try { normalizeWeight(w); publishableWeights.push(w); }
      catch { incompleteWeights.push(w); }
    }
    await atomicWrite(path.join(HOME, 'weights-needing-review.json'), incompleteWeights);
    const datedWeights = incompleteWeights.filter(w => /^\d{4}-\d\d-\d\d$/.test(w.calendarDate ?? '') && Number.isFinite(w.weight) && w.weight >= 10000 && w.weight <= 680000 && !Number.isFinite(w.timestampGMT)).map(w => ({ id: weightRecordId(w), date: w.calendarDate, weight_kg: w.weight / 1000, measurement_time_utc: null }));
    let bodyMeasurements;
    if (!weightError) {
      const response = await fetch('https://www.brooksl.com/api/training/history', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('Unable to check existing weight identities; no website data was changed');
      const previous = await response.json();
      const mappingFile = path.join(HOME, 'weight-id-map.json');
      const mapping = weightIdentityMap(publishableWeights, previous.weights ?? [], await readJSON(mappingFile, {}));
      await atomicWrite(mappingFile, mapping);
      bodyMeasurements = publishableWeights.map(w => { const normalized = normalizeWeight(w); return { ...normalized, ...(mapping[normalized.measurement_time_utc] ? { stable_id: mapping[normalized.measurement_time_utc] } : {}) }; });
    }
    const input = { activities: incoming.map(normalizeActivity).filter(Boolean), ...(weightError ? {} : { bodyMeasurements }) };
    const inputFile = path.join(HOME, 'latest-import.json');
    await atomicWrite(inputFile, input);
    // Ready for local Claude/Codex or manual JSON upload; original GPS files remain private.
    await atomicWrite(path.join(HOME, 'workout-history.json'), { source: 'Garmin', exportedAt: new Date().toISOString(), activities: normalized, bodyMeasurements: publishableWeights.map(normalizeWeight), datedWeights, weightsNeedingReview: incompleteWeights.length - datedWeights.length });
    if (publishToSite) await publish(inputFile);
    for (const a of archived.sort((a, b) => String(b.startTimeLocal).localeCompare(String(a.startTimeLocal)))) {
      if (downloaded >= maxFiles) break;
      const id = activityId(a), folder = path.join(HOME, 'activities', id);
      const meta = await readJSON(path.join(folder, 'status.json'), {});
      const sourceHash = createHash('sha256').update(JSON.stringify(a)).digest('hex');
      if (meta.complete && meta.sourceHash === sourceHash) continue;
      downloaded++;
      if (downloaded === 1 || downloaded % 10 === 0) await atomicWrite(path.join(HOME, 'progress.json'), { running: true, updatedAt: new Date().toISOString(), activitiesArchived: archived.length, filesAttemptedThisRun: downloaded, failures: failures.length });
      try {
        const detail = await api.request(`/activity-service/activity/${id}`);
        await atomicWrite(path.join(folder, 'details.json'), detail);
        const workouts = await api.request(`/activity-service/activity/${id}/workouts`);
        await atomicWrite(path.join(folder, 'workouts.json'), workouts);
        let noOriginal = false;
        try { await atomicWrite(path.join(folder, 'original.zip'), await api.request(`/download-service/files/activity/${id}`, { binary: true })); }
        catch (e) { if (e.status === 404 || (e.status === 400 && detail.metadataDTO?.manualActivity)) noOriginal = true; else throw e; }
        await atomicWrite(path.join(folder, 'status.json'), { complete: true, noOriginal, sourceHash, retrievedAt: new Date().toISOString() });
      } catch (e) { failures.push({ activityId: id, error: e.message }); }
    }
    let detailedFilesPending = 0;
    for (const a of archived) {
      const meta = await readJSON(path.join(HOME, 'activities', activityId(a), 'status.json'), {});
      const sourceHash = createHash('sha256').update(JSON.stringify(a)).digest('hex');
      if (!meta.complete || meta.sourceHash !== sourceHash) detailedFilesPending++;
    }
    const status = { authenticated: true, lastRunAt: new Date().toISOString(), activityWindow: { from: from ?? 'all', to: today }, activitiesFetched: incoming.length, activitiesArchived: archived.length, weightsArchived: weights.length, weightsReadyForPublication: publishableWeights.length, weightsWithDateOnly: datedWeights.length, weightsNeedingReview: incompleteWeights.length - datedWeights.length, detailedFilesAttempted: downloaded, detailedFilesPending, failures, ...(weightError ? { weightError } : {}), publishedToSite: publishToSite };
    await atomicWrite(path.join(HOME, 'status.json'), status);
    await atomicWrite(path.join(HOME, 'progress.json'), { running: false, updatedAt: status.lastRunAt, detailedFilesPending, failures: failures.length });
    console.log(JSON.stringify(status));
    if (failures.length || weightError) process.exitCode = 1;
  } finally { await lock.close(); await fs.rm(lockFile, { force: true }); }
}
async function install() {
  const credential = await readJSON(path.join(HOME, 'credentials.json'), {});
  const status = await readJSON(path.join(HOME, 'status.json'), {});
  if (!credential.apiKey || !status.authenticated) throw new Error('Configure the Garmin Personal API key and run a successful sync before enabling the daily job');
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const label = 'com.brooksl.garmin-import';
  // Run from actual local files, independently of OneDrive placeholder hydration.
  const runner = path.join(HOME, 'runner/scripts');
  await fs.mkdir(path.join(runner, 'lib'), { recursive: true, mode: 0o700 });
  for (const relative of ['garmin-personal.cjs', 'lib/garmin-personal.cjs', 'lib/garmin-publication.cjs']) {
    if (path.join(__dirname, relative) !== path.join(runner, relative)) await fs.copyFile(path.join(__dirname, relative), path.join(runner, relative));
  }
  const args = [process.execPath, path.join(runner, 'garmin-personal.cjs'), 'sync', '--publish'];
  const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(a => `<string>${escape(a)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${escape(HOME)}</string><key>StartCalendarInterval</key><dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>5</integer></dict><key>RunAtLoad</key><true/><key>StandardOutPath</key><string>${escape(path.join(HOME, 'daily.log'))}</string><key>StandardErrorPath</key><string>${escape(path.join(HOME, 'daily-error.log'))}</string><key>ProcessType</key><string>Background</string></dict></plist>`;
  const file = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, plist, { mode: 0o600 });
  await child('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, file]);
  console.log('Installed daily Garmin import at 23:05 in the Mac system timezone; also runs at login and after a missed sleep-time trigger.');
}
async function importArchive(source, storageHome = HOME) {
  if (!source) throw new Error('Provide the path to the Garmin account-export ZIP');
  const absolute = path.resolve(source);
  const info = await fs.stat(absolute);
  if (!info.isFile()) throw new Error('The account export must be a ZIP file');
  // Keep the complete account export intact; do not extract untrusted ZIP paths.
  const { createReadStream } = require('node:fs');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolute)) hash.update(chunk);
  const digest = hash.digest('hex');
  const destination = path.join(storageHome, 'account-exports', `${digest}.zip`);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  try { await fs.access(destination); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const temp = `${destination}.${process.pid}.tmp`;
    try { await fs.copyFile(absolute, temp, require('node:fs').constants.COPYFILE_EXCL); await fs.chmod(temp, 0o600); await fs.rename(temp, destination); }
    finally { await fs.rm(temp, { force: true }); }
  }
  await fs.chmod(destination, 0o600);
  // zipfile reads the central directory only. No traversal, symlink extraction,
  // or execution of anything supplied in the archive takes place.
  const manifest = path.join(storageHome, 'account-exports', `${digest}.manifest.json`);
  const code = `import zipfile,json,sys,os\nos.umask(0o077)\np=sys.argv[1]\nwith zipfile.ZipFile(p) as z:\n entries=[{'name':i.filename,'bytes':i.file_size,'compressedBytes':i.compress_size} for i in z.infolist()]\nwith open(sys.argv[2],'w') as f: json.dump({'source':'Garmin account export','files':entries},f)\nos.chmod(sys.argv[2],0o600)\nprint(json.dumps({'accountExportSaved':True,'files':len(entries),'bytes':os.path.getsize(p)}))`;
  await child('python3', ['-c', code, destination, manifest]);
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'sync') return sync({ all: args.includes('--all'), publishToSite: args.includes('--publish'), maxFiles: args.includes('--all-files') ? Infinity : 100 });
  if (command === 'install-daily') return install();
  if (command === 'import-archive') return importArchive(args[0]);
  if (command === 'status') { console.log(JSON.stringify(await readJSON(path.join(HOME, 'status.json'), { configured: false }))); return; }
  throw new Error('Usage: node scripts/garmin-personal.cjs sync [--all] [--all-files] [--publish] | import-archive FILE.zip | install-daily | status');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { sync, importArchive, HOME };
