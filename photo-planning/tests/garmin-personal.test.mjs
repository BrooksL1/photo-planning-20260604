import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { GarminPersonal, localDate, addDays, normalizeActivity, normalizeWeight, weightRecordId, weightIdentityMap, atomicWrite, mergeBy } = require('../../scripts/lib/garmin-personal.cjs');
const { preparePublication } = require('../../scripts/lib/garmin-publication.cjs');
const activity = { activityId: 123, startTimeGMT: '2026-11-17 01:30:00', startTimeLocal: '2026-11-16 20:30:00', activityType: { typeKey: 'running' }, duration: 1800, distance: 5000, averageHR: 140, maxHR: 155 };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
test('Eastern local windows remain calendar dates across DST', () => {
  assert.equal(localDate(new Date('2026-11-17T03:00:00Z')), '2026-11-16');
  assert.equal(addDays('2026-11-02', -6), '2026-10-27');
});
test('activity conversion preserves Garmin ID and local day without inventing workout details', () => {
  const a = normalizeActivity(activity);
  assert.equal(a.activity_id, '123'); assert.equal(a.date, '2026-11-16');
  assert.equal(a.start_time_utc, '2026-11-17T01:30:00Z');
  assert.equal(a.distance_km, 5); assert.equal(a.duration_s, 1800);
  assert.equal(a.avg_hr, 140); assert.equal(a.rpe, undefined); assert.equal(a.vest, undefined);
  assert.equal(normalizeActivity({ ...activity, isParent: true }), null);
  assert.throws(() => normalizeActivity({ ...activity, duration: NaN }));
});
test('live gram measurements are converted explicitly; replaying a correction keeps its ID', () => {
  const raw = { calendarDate: '2026-11-16', timestampGMT: 1794837600000, weight: 87300 };
  const a = normalizeWeight(raw), b = normalizeWeight({ ...raw, weight: 87100 });
  const merged = mergeBy([a], [b], w => w.measurement_time_utc);
  assert.equal(merged.length, 1); assert.equal(merged[0].weight_kg, 87.1);
  assert.throws(() => normalizeWeight({ ...raw, weight: 87.3 }));
  assert.throws(() => normalizeWeight({ ...raw, timestampGMT: undefined }));
});
test('old connector weight IDs survive migration to actual Garmin timestamps without duplicating weigh-ins', () => {
  const raw = [{ calendarDate: '2026-11-16', timestampGMT: 1794837600000, weight: 87300 }];
  const old = [{ id: '2026-11-16T05:00:00.000Z', date: '2026-11-16', pounds: 87.3 / 0.45359237 }];
  const map = weightIdentityMap(raw, old);
  assert.equal(map[new Date(raw[0].timestampGMT).toISOString()], old[0].id);
  assert.throws(() => weightIdentityMap([...raw, { ...raw[0], timestampGMT: 1794837601000 }], old), /ambiguous/);
});
test('activity pagination continues through short pages and includes multisport child legs', async () => {
  const urls = [];
  const api = new GarminPersonal('private-test-key', { interval: 0, sleep: async () => {}, fetcher: async (url, options) => {
    assert.equal(new URL(url).origin, 'https://personal.connectapi.garmin.com'); urls.push(url);
    if (url.includes('personal-api-key/token')) { assert.equal(options.headers.Authorization, 'ApiKey private-test-key'); return json({ access_token: 'token' }); }
    assert.equal(options.headers.Authorization, 'Bearer token');
    const q = new URL(url).searchParams; assert.equal(q.get('excludeChildren'), 'false');
    return json(q.get('start') === '0' ? [activity] : q.get('start') === '1' ? [{ ...activity, activityId: 124 }] : []);
  } });
  assert.equal((await api.activities()).length, 2); assert.equal(urls.length, 4);
});
test('a repeated page terminates with an error rather than looping or publishing incomplete data', async () => {
  const api = new GarminPersonal('private-test-key', { interval: 0, sleep: async () => {}, fetcher: async url => json(url.includes('/token') ? { accessToken: 'token' } : [activity]) });
  await assert.rejects(api.activities(), /repeated an activity page/);
});
test('weight history is fetched in nonoverlapping inclusive windows of at most 364 days', async () => {
  const urls = [];
  const api = new GarminPersonal('private-test-key', { interval: 0, sleep: async () => {}, fetcher: async url => {
    if (url.includes('/token')) return json({ accessToken: 'token' });
    urls.push(url); return json([]);
  } });
  await api.weights('2025-01-01', '2026-01-01');
  assert.deepEqual(urls.map(u => u.split('/weight/all/')[1]), ['2025-01-01/2025-12-30', '2025-12-31/2026-01-01']);
});
test('historical weight records without a usable timestamp remain distinct raw records and are never fabricated', () => {
  const a = { calendarDate: '2010-01-01', weight: 90000, timestampGMT: null };
  const b = { ...a, calendarDate: '2010-01-02' };
  assert.notEqual(weightRecordId(a), weightRecordId(b));
  assert.throws(() => normalizeWeight(a));
});
test('expired access token is replaced once; no expired token is stored on disk', async () => {
  let tokens = 0, requests = 0;
  const api = new GarminPersonal('private-test-key', { interval: 0, sleep: async () => {}, fetcher: async url => {
    if (url.includes('/token')) return json({ accessToken: `token${++tokens}` });
    return ++requests === 1 ? json({}, 401) : json([]);
  } });
  assert.deepEqual(await api.activities(), []); assert.equal(tokens, 2);
});
test('live Garmin token endpoint returns plain text and rejects an application/json Accept header', async () => {
  const api = new GarminPersonal('private-test-key', { interval: 0, sleep: async () => {}, fetcher: async (_url, options) => {
    assert.equal(options.headers.Accept, '*/*');
    return new Response('private-access-token', { headers: { 'Content-Type': 'text/plain' } });
  } });
  await api.authenticate(); assert.equal(api.token, 'private-access-token');
});
test('authentication errors contain neither keys nor Garmin response bodies', async () => {
  const api = new GarminPersonal('private-test-key', { interval: 0, sleep: async () => {}, fetcher: async () => json({ secret: 'sensitive response' }, 401) });
  await assert.rejects(api.authenticate(), e => e.message.includes('HTTP 401') && !e.message.includes('private-test-key') && !e.message.includes('sensitive'));
});
test('rate-limit retry is bounded and original-file downloads reject JSON masquerading as a ZIP', async () => {
  let requests = 0;
  const api = new GarminPersonal('private-test-key', { interval: 0, sleep: async () => {}, fetcher: async url => {
    if (url.includes('/token')) return json({ accessToken: 'token' });
    requests++; return json({}, 429, { 'Retry-After': '1' });
  } });
  await assert.rejects(api.activities(), /HTTP 429/); assert.equal(requests, 3);
  api.fetcher = async () => json({ error: 'no file' });
  await assert.rejects(api.request('/download-service/files/activity/123', { binary: true }), /original-file ZIP/);
});
test('private source files are replaced atomically with restrictive permissions', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'brooksl-garmin-'));
  try {
    const file = path.join(dir, 'nested', 'data.json');
    await atomicWrite(file, { version: 1 }); await atomicWrite(file, { version: 2 });
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 2);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('publication preserves prior IDs, actual device names, and corrected weight timestamps', () => {
  const now = '2026-11-17T15:00:00.000Z';
  const original = preparePublication({ activities: [] }, { activities: [normalizeActivity(activity)], bodyMeasurements: [{ date: '2026-11-16', measurement_time_utc: '2026-11-16T05:00:00.000Z', weight_kg: 87.3 }] }, now).value;
  original.activities[0].device = 'fenix 7 Pro';
  const next = preparePublication(original, { activities: [normalizeActivity({ ...activity, distance: 5100 })], bodyMeasurements: [{ date: '2026-11-16', measurement_time_utc: '2026-11-16T11:00:00.000Z', stable_id: original.weights[0].id, weight_kg: 87.1 }] }, now).value;
  assert.equal(next.activities.length, 1); assert.equal(next.activities[0].device, 'fenix 7 Pro');
  assert.equal(next.weights.length, 1); assert.equal(next.weights[0].id, original.weights[0].id);
  assert.equal(next.weights[0].measuredAt, '2026-11-16T11:00:00.000Z');
  assert.equal(next.activities[0].rpe, undefined);
});
test('failed body composition fetch leaves weights and their timestamp untouched', () => {
  const original = { activities: [], weights: [{ id: 'weight', date: '2026-11-16', measuredAt: '2026-11-16T11:00:00.000Z', pounds: 192 }], weightSyncedAt: 'previous' };
  const next = preparePublication(original, { activities: [] }).value;
  assert.deepEqual(next.weights, original.weights); assert.equal(next.weightSyncedAt, 'previous');
});
test('malformed publication cannot replace existing history', () => {
  assert.throws(() => preparePublication({ activities: [] }, { activities: [{ ...normalizeActivity(activity), duration_s: NaN }] }));
  assert.throws(() => preparePublication({ activities: [] }, { activities: [], bodyMeasurements: [{ date: '2026-11-16', measurement_time_utc: '2026-11-16T11:00:00.000Z', stable_id: 'unsafe-id', weight_kg: 87 }] }));
});
