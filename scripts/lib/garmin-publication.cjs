const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { mergeBy } = require('./garmin-personal.cjs');
function validDate(value) { return typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value; }
function validActivities(records) {
  return Array.isArray(records) && records.length <= 10000 && records.every(a => a && /^[a-zA-Z0-9_-]{1,100}$/.test(a.id) && validDate(a.date) && typeof a.startTime === 'string' && Number.isFinite(Date.parse(a.startTime)) && typeof a.type === 'string' && typeof a.name === 'string' && a.name.length <= 200 && typeof a.device === 'string' && typeof a.importedAt === 'string' && ['minutes', 'miles'].every(k => Number.isFinite(a[k]) && a[k] >= 0) && ['avgHr', 'maxHr', 'rpe'].every(k => a[k] === undefined || (Number.isFinite(a[k]) && a[k] >= 0 && a[k] <= (k === 'rpe' ? 10 : 250))));
}
function validWeights(records) {
  return Array.isArray(records) && records.length <= 20000 && records.every(w => w && typeof w.id === 'string' && validDate(w.date) && typeof w.measuredAt === 'string' && Number.isFinite(Date.parse(w.measuredAt)) && Number.isFinite(w.pounds) && w.pounds > 0 && w.pounds < 1500);
}
function preparePublication(previous, input, now = new Date().toISOString()) {
  if (!Array.isArray(input.activities) || !validActivities(previous.activities) || !validWeights(previous.weights ?? [])) throw new Error('Invalid Garmin history; existing data was not changed');
  const incoming = input.activities.filter(a => !a.is_parent).map(a => ({
    id: String(a.activity_id), date: a.date, startTime: a.start_time_utc, type: a.activity_type, name: a.activity_name.slice(0, 200),
    minutes: a.duration_s / 60, miles: a.distance_km / 1.609344, device: a.device ?? 'Garmin', importedAt: now,
    ...(a.avg_hr !== undefined ? { avgHr: a.avg_hr } : {}), ...(a.max_hr !== undefined ? { maxHr: a.max_hr } : {}),
  }));
  const weights = input.bodyMeasurements === undefined ? [] : input.bodyMeasurements.map(w => {
    const measuredAt = new Date(w.measurement_time_utc).toISOString();
    if (w.stable_id !== undefined && (typeof w.stable_id !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(w.stable_id))) throw new Error('Invalid Garmin weight identity');
    return { id: w.stable_id ?? measuredAt, date: w.date, measuredAt, pounds: w.weight_kg / 0.45359237 };
  });
  if (!validActivities(incoming) || !validWeights(weights)) throw new Error('Invalid incoming Garmin measurements; existing data was not changed');
  const oldById = new Map(previous.activities.map(a => [a.id, a]));
  const enriched = incoming.map(a => ({ ...oldById.get(a.id), ...a, device: a.device === 'Garmin' ? oldById.get(a.id)?.device ?? a.device : a.device }));
  const activities = mergeBy(previous.activities, enriched, a => a.id);
  const mergedWeights = mergeBy(previous.weights ?? [], weights, w => w.id).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (!validActivities(activities) || !validWeights(mergedWeights)) throw new Error('Merged Garmin history exceeds validation limits');
  return { value: { version: 1, syncedAt: now, activities, weights: mergedWeights, weightSyncedAt: input.bodyMeasurements === undefined ? previous.weightSyncedAt ?? null : now }, counts: { imported: incoming.length, total: activities.length, weightsImported: weights.length, weightsTotal: mergedWeights.length, syncedAt: now } };
}
async function publish(input) {
  const home = path.join(os.homedir(), 'Library/Application Support/BrooksL/Garmin');
  process.loadEnvFile(path.join(home, 'production.env'));
  const runtimeRequire = createRequire(path.join(home, 'runtime/package.json'));
  const { get, put } = await import(pathToFileURL(runtimeRequire.resolve('@vercel/blob')).href);
  for (let attempt = 0; attempt < 2; attempt++) {
    const old = await get('training/garmin.json', { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } });
    if (old && !old.stream) throw new Error('Unable to read existing Garmin history');
    const previous = old ? await new Response(old.stream).json() : { activities: [], weights: [] };
    const next = preparePublication(previous, input);
    try {
      await put('training/garmin.json', JSON.stringify(next.value), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: !!old, ...(old ? { ifMatch: old.blob.etag } : {}), cacheControlMaxAge: 60 });
      return next.counts;
    } catch (error) {
      const conflict = /precondition|etag|condition.*match/i.test(`${error.name} ${error.message}`);
      if (attempt === 0 && conflict) continue;
      throw new Error(conflict ? 'Garmin history changed concurrently; retry later' : 'Garmin history publication failed; existing data was preserved');
    }
  }
}
module.exports = { preparePublication, publish };
