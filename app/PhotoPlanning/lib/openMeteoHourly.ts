// Shared Open-Meteo hourly fetch, scoped to the dates the targets actually
// fall on (so a user-chosen date in the future or past works, not just
// "the next few days"). Each target gets the nearest hourly sample, or null
// if no sample lies within MAX_GAP_MS -- a target outside the returned data
// must read "Not available" rather than silently borrowing the edge hour.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GAP_MS = 90 * 60 * 1000;

// Open-Meteo's forecast endpoint only serves roughly [today - 92d, today + 16d]
// (confirmed live: out-of-range start_date returns HTTP 400). Stay a day
// inside each edge.
const PAST_LIMIT_DAYS = 91;
const FUTURE_LIMIT_DAYS = 15;

export const FORECAST_FUTURE_LIMIT_DAYS = FUTURE_LIMIT_DAYS;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWithinForecastRange(target: Date, now: Date = new Date()): boolean {
  const t = target.getTime();
  return t >= now.getTime() - PAST_LIMIT_DAYS * DAY_MS && t <= now.getTime() + FUTURE_LIMIT_DAYS * DAY_MS;
}

export type HourlyRow = Record<string, number | null>;

export type HourlyQuery = { lat: number; lng: number; target: Date };

// One request for any number of (location, time) queries: Open-Meteo takes
// comma-separated coordinates and returns one series per location, in order.
// Batching matters -- a request per tile (~30 at once) trips Open-Meteo's
// rate limit (HTTP 429) and leaves tiles without weather.
export async function fetchHourlyAtPoints(
  queries: HourlyQuery[],
  variables: string[],
  extraParams = ""
): Promise<(HourlyRow | null)[]> {
  const inRange = queries.filter((q) => isWithinForecastRange(q.target));
  if (inRange.length === 0) return queries.map(() => null);

  const locationKey = (q: HourlyQuery) => `${q.lat.toFixed(4)},${q.lng.toFixed(4)}`;
  const locations: HourlyQuery[] = [];
  const locationIndex = new Map<string, number>();
  for (const q of inRange) {
    if (!locationIndex.has(locationKey(q))) {
      locationIndex.set(locationKey(q), locations.length);
      locations.push(q);
    }
  }

  // Dates are UTC (timezone=GMT) and times are unix seconds, so parsing never
  // depends on the browser's or the location's time zone.
  const minMs = Math.min(...inRange.map((q) => q.target.getTime()));
  const maxMs = Math.max(...inRange.map((q) => q.target.getTime()));
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${locations.map((l) => l.lat.toFixed(4)).join(",")}` +
    `&longitude=${locations.map((l) => l.lng.toFixed(4)).join(",")}` +
    `&hourly=${variables.join(",")}` +
    extraParams +
    `&start_date=${isoDate(new Date(minMs))}&end_date=${isoDate(new Date(maxMs))}` +
    "&timezone=GMT&timeformat=unixtime";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed (${res.status})`);
  }
  const json = await res.json();
  // A single location comes back as an object, several as an array.
  const series: { hourly: Record<string, (number | null)[]> }[] = Array.isArray(json) ? json : [json];

  return queries.map((q) => {
    const idx = locationIndex.get(locationKey(q));
    if (idx == null || !isWithinForecastRange(q.target)) return null;
    const hourly = series[idx].hourly;
    const times = (hourly.time as number[]).map((sec) => sec * 1000);
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(times[i] - q.target.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    if (bestIdx === -1 || bestDiff > MAX_GAP_MS) return null;
    const row: HourlyRow = {};
    for (const v of variables) row[v] = hourly[v]?.[bestIdx] ?? null;
    return row;
  });
}

// Single-location convenience wrapper over fetchHourlyAtPoints.
export function fetchHourlyAt(
  lat: number,
  lng: number,
  variables: string[],
  targets: Date[],
  extraParams = ""
): Promise<(HourlyRow | null)[]> {
  return fetchHourlyAtPoints(
    targets.map((target) => ({ lat, lng, target })),
    variables,
    extraParams
  );
}
