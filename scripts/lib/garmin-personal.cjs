// Direct Garmin Personal API. No browser cookies, account password, or third-party connector.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const BASE = 'https://personal.connectapi.garmin.com';
const TIMEZONE = 'America/New_York';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
    await fs.chmod(file, 0o600);
  } finally { await fs.rm(temp, { force: true }); }
}
async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function activityId(activity) {
  const id = String(activity.activityId);
  if (!/^\d{1,20}$/.test(id)) throw new Error('Invalid Garmin activity ID');
  return id;
}
function normalizeActivity(a) {
  activityId(a);
  if (a.isParent || a.parent) return null;
  const start = a.startTimeGMT?.replace(' ', 'T');
  if (!start || !Number.isFinite(Date.parse(`${start}Z`)) || !/^\d{4}-\d\d-\d\d/.test(a.startTimeLocal ?? '')) throw new Error('Invalid Garmin activity timestamp');
  if (!Number.isFinite(a.duration) || a.duration < 0 || (a.distance != null && (!Number.isFinite(a.distance) || a.distance < 0))) throw new Error('Invalid Garmin activity measurements');
  return {
    activity_id: activityId(a), date: a.startTimeLocal.slice(0, 10), start_time_utc: `${start}Z`,
    activity_name: a.activityName ?? 'Garmin activity', activity_type: a.activityType?.typeKey?.toUpperCase() ?? 'OTHER',
    duration_s: a.duration, distance_km: (a.distance ?? 0) / 1000, device: 'Garmin',
    ...(a.averageHR != null ? { avg_hr: a.averageHR } : {}), ...(a.maxHR != null ? { max_hr: a.maxHR } : {}),
  };
}
function normalizeWeight(w) {
  // Live Personal API DateWeightDTO uses grams and epoch milliseconds (verified
  // against seven previously imported measurements on 2026-11-17). Its initial
  // Swagger incorrectly labels weight as kilograms. Fail closed on unit changes.
  // Never substitute a profile's configured weight or a daily aggregate.
  if (!Number.isFinite(w.weight) || w.weight < 10000 || w.weight > 680000 || !Number.isFinite(w.timestampGMT) || w.timestampGMT <= 0 || !/^\d{4}-\d\d-\d\d$/.test(w.calendarDate ?? '') || Math.abs(Date.parse(`${w.calendarDate}T00:00:00Z`) - w.timestampGMT) > 36 * 60 * 60 * 1000) throw new Error('Invalid Garmin weight measurement');
  return { date: w.calendarDate, measurement_time_utc: new Date(w.timestampGMT).toISOString(), weight_kg: w.weight / 1000 };
}
function weightRecordId(w) {
  if (Number.isFinite(w.timestampGMT) && w.timestampGMT > 0) return `timestamp:${w.timestampGMT}`;
  return `raw:${createHash('sha256').update(JSON.stringify(w, Object.keys(w).sort())).digest('hex')}`;
}
function weightIdentityMap(raw, previous, existing = {}) {
  const mapping = { ...existing };
  for (const old of previous) {
    if (Object.values(mapping).includes(old.id)) continue;
    const exact = raw.find(w => normalizeWeight(w).measurement_time_utc === old.measuredAt);
    if (exact) { mapping[normalizeWeight(exact).measurement_time_utc] = old.id; continue; }
    const day = raw.filter(w => w.calendarDate === old.date);
    if (!day.length) continue;
    const matches = day.filter(w => Math.abs(normalizeWeight(w).weight_kg / 0.45359237 - old.pounds) < 0.01);
    // The connector used midnight as the timestamp for some daily weigh-ins.
    // Preserve that existing ID while publishing Garmin's actual recorded time.
    // Never guess which record a legacy entry represents when matches are ambiguous.
    const selected = matches.length === 1 ? matches[0] : day.length === 1 ? day[0] : null;
    if (!selected) throw new Error('An older weight entry has ambiguous Garmin matches; existing website weights were preserved');
    const canonical = normalizeWeight(selected).measurement_time_utc;
    if (mapping[canonical] && mapping[canonical] !== old.id) throw new Error('Garmin weight identity conflict');
    mapping[canonical] = old.id;
  }
  return mapping;
}
function mergeBy(previous, incoming, key) {
  return [...new Map([...previous, ...incoming].map(item => [key(item), item])).values()];
}
class GarminPersonal {
  constructor(key, { fetcher = fetch, sleep = pause, interval = 1000 } = {}) {
    if (typeof key !== 'string' || key.length < 10 || /[\r\n]/.test(key)) throw new Error('A Garmin Personal API key is required');
    this.key = key; this.fetcher = fetcher; this.sleep = sleep; this.interval = interval; this.token = null;
  }
  async request(resource, { binary = false, token = false, retry = 0 } = {}) {
    if (!token && !this.token) await this.authenticate();
    await this.sleep(this.interval);
    let response;
    try {
      response = await this.fetcher(`${BASE}${resource}`, {
        method: token ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { Authorization: token ? `ApiKey ${this.key}` : `Bearer ${this.token}`, Accept: token ? '*/*' : binary ? 'application/x-zip-compressed' : 'application/json' },
      });
    } catch {
      if (retry < 2) { await this.sleep(1000 * 2 ** retry); return this.request(resource, { binary, token, retry: retry + 1 }); }
      throw new Error('Garmin network request failed; existing records were preserved');
    }
    if (response.status === 401 && !token && retry === 0) {
      this.token = null; await this.authenticate(); return this.request(resource, { binary, retry: 1 });
    }
    if ((response.status === 429 || response.status >= 500) && retry < 2) {
      const seconds = Number(response.headers.get('retry-after'));
      await this.sleep(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60000) : 5000 * 2 ** retry);
      return this.request(resource, { binary, token, retry: retry + 1 });
    }
    if (!response.ok) {
      const error = new Error(`Garmin returned HTTP ${response.status}${response.status === 401 ? '; the Personal API key may have expired' : ''}`);
      error.status = response.status; throw error;
    }
    if (binary) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Garmin did not return an original-file ZIP');
      return bytes;
    }
    if (token && response.headers.get('content-type')?.includes('text/plain')) return (await response.text()).trim();
    return response.json();
  }
  async authenticate() {
    const data = await this.request('/personalapitoken-service/personal-api/personal-api-key/token', { token: true });
    this.token = typeof data === 'string' ? data : data.access_token ?? data.accessToken;
    if (typeof this.token !== 'string' || !this.token) throw new Error('Garmin returned an unexpected token response');
  }
  async activities({ from, to, onPage = async () => {} } = {}) {
    const all = [], seen = new Set();
    for (let start = 0; start < 1000000;) {
      const q = new URLSearchParams({ start, limit: 100, excludeChildren: false, sortBy: 'startLocal', sortOrder: 'desc' });
      if (from) q.set('startDate', from);
      if (to) q.set('endDate', to);
      const page = await this.request(`/activitylist-service/activities/search/activities?${q}`);
      if (!Array.isArray(page)) throw new Error('Garmin activity response was not an array');
      if (!page.length) return all;
      let added = 0;
      for (const activity of page) {
        const id = activityId(activity);
        if (!seen.has(id)) { seen.add(id); all.push(activity); added++; }
      }
      if (!added) throw new Error('Garmin repeated an activity page; the import was stopped');
      await onPage(page);
      start += page.length; // Continue until empty even if Garmin caps the page size below 100.
    }
    throw new Error('Garmin activity pagination exceeded the safety limit');
  }
  async weights(from, to, onChunk = async () => {}) {
    const all = [];
    for (let start = from; start <= to;) {
      const end = [addDays(start, 363), to].sort()[0];
      const page = await this.request(`/weight-service/weight/all/${start}/${end}`);
      if (!Array.isArray(page)) throw new Error('Garmin weight response was not an array');
      if (page.some(w => !w || typeof w !== 'object' || Array.isArray(w))) throw new Error('Invalid Garmin weight response');
      all.push(...page); await onChunk(page);
      start = addDays(end, 1);
    }
    return mergeBy([], all, weightRecordId);
  }
}
module.exports = { GarminPersonal, localDate, addDays, normalizeActivity, normalizeWeight, weightRecordId, weightIdentityMap, mergeBy, atomicWrite, readJSON, activityId };
