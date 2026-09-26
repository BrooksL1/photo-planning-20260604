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

export async function fetchHourlyAt(
  lat: number,
  lng: number,
  variables: string[],
  targets: Date[],
  extraParams = ""
): Promise<(HourlyRow | null)[]> {
  const inRange = targets.filter((t) => isWithinForecastRange(t));
  if (inRange.length === 0) return targets.map(() => null);

  // Dates are UTC (timezone=GMT) and times are unix seconds, so parsing never
  // depends on the browser's or the location's time zone.
  const minMs = Math.min(...inRange.map((t) => t.getTime()));
  const maxMs = Math.max(...inRange.map((t) => t.getTime()));
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=${variables.join(",")}` +
    extraParams +
    `&start_date=${isoDate(new Date(minMs))}&end_date=${isoDate(new Date(maxMs))}` +
    "&timezone=GMT&timeformat=unixtime";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed (${res.status})`);
  }
  const data = await res.json();
  const times: number[] = data.hourly.time.map((s: number) => s * 1000);

  return targets.map((target) => {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(times[i] - target.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    if (bestIdx === -1 || bestDiff > MAX_GAP_MS) return null;
    const row: HourlyRow = {};
    for (const v of variables) row[v] = data.hourly[v]?.[bestIdx] ?? null;
    return row;
  });
}
