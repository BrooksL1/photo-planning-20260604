// Gathers the inputs for scoreSkyQuality from Open-Meteo: a cloud transect
// along the sun azimuth, the pin's visibility/humidity, aerosol optical depth
// (CAMS), and the previous 24 h of rain plus the 3 h pressure trend. Only the
// transect is required; every extra is best-effort and degrades to null.

import { destinationPoint } from "./geo";
import { fetchHourlyAtPoints } from "./openMeteoHourly";
import { scoreSkyQuality, type SkyQuality, type SkyQualityInputs } from "./skyQuality";

export const TRANSECT_MILES = [20, 60, 120, 200];

const MILES_PER_METER = 1 / 1609.34;
const HOUR_MS = 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type HourlySeries = { time: number[]; [variable: string]: (number | null)[] };

// Hourly series for one location across the day before the target through
// its own day (GMT, unix seconds -- no time zone ambiguity).
async function fetchSeries(base: string, lat: number, lng: number, variables: string[], target: Date): Promise<HourlySeries | null> {
  const start = new Date(target.getTime() - 24 * HOUR_MS);
  const url =
    `${base}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&hourly=${variables.join(",")}` +
    `&start_date=${isoDate(start)}&end_date=${isoDate(target)}&timezone=GMT&timeformat=unixtime`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.hourly?.time) return null;
    return json.hourly as HourlySeries;
  } catch {
    return null;
  }
}

function indexAtOrBefore(times: number[], targetMs: number): number {
  let best = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i] * 1000 <= targetMs + 30 * 60 * 1000) best = i;
  }
  return best;
}

export async function fetchSkyQualityInputs(lat: number, lng: number, bearingDeg: number, target: Date): Promise<SkyQualityInputs | null> {
  const points = TRANSECT_MILES.map((d) => ({ d, ...destinationPoint(lat, lng, bearingDeg, d) }));
  const rows = await fetchHourlyAtPoints(
    [
      ...points.map((p) => ({ lat: p.lat, lng: p.lng, target })),
      { lat, lng, target },
    ],
    ["cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "visibility", "relative_humidity_2m", "precipitation_probability", "relative_humidity_300hPa"],
    ""
  );
  const pinRow = rows[points.length];
  const transect = points.map((p, i) => ({
    distanceMiles: p.d,
    cloudLow: rows[i]?.cloud_cover_low ?? null,
    cloudMid: rows[i]?.cloud_cover_mid ?? null,
    cloudHigh: rows[i]?.cloud_cover_high ?? null,
  }));
  if (!transect.some((p) => p.cloudLow != null)) return null;

  const [history, air] = await Promise.all([
    fetchSeries("https://api.open-meteo.com/v1/forecast", lat, lng, ["precipitation", "pressure_msl"], target),
    fetchSeries("https://air-quality-api.open-meteo.com/v1/air-quality", lat, lng, ["aerosol_optical_depth"], target),
  ]);

  let precip24hMm: number | null = null;
  let pressureTrend3h: number | null = null;
  if (history) {
    const t = target.getTime();
    const rain = history.time.map((s, i) => ({ ms: s * 1000, mm: history.precipitation?.[i] }));
    const window = rain.filter((r) => r.ms > t - 24 * HOUR_MS && r.ms <= t && r.mm != null);
    if (window.length > 0) precip24hMm = window.reduce((a, r) => a + (r.mm as number), 0);
    const now = indexAtOrBefore(history.time, t);
    const before = indexAtOrBefore(history.time, t - 3 * HOUR_MS);
    const pNow = history.pressure_msl?.[now];
    const pBefore = history.pressure_msl?.[before];
    if (now >= 0 && before >= 0 && before < now && pNow != null && pBefore != null) pressureTrend3h = pNow - pBefore;
  }

  let aod: number | null = null;
  if (air) {
    const i = indexAtOrBefore(air.time, target.getTime());
    aod = i >= 0 ? (air.aerosol_optical_depth?.[i] ?? null) : null;
  }

  return {
    transect,
    visibilityMiles: pinRow?.visibility != null ? pinRow.visibility * MILES_PER_METER : null,
    relativeHumidity: pinRow?.relative_humidity_2m ?? null,
    precipProbability: pinRow?.precipitation_probability ?? null,
    aod,
    precip24hMm,
    pressureTrend3h,
    rh300: pinRow?.relative_humidity_300hPa ?? null,
  };
}

export async function fetchSkyQuality(lat: number, lng: number, bearingDeg: number, target: Date): Promise<SkyQuality | null> {
  const inputs = await fetchSkyQualityInputs(lat, lng, bearingDeg, target);
  return inputs ? scoreSkyQuality(inputs) : null;
}
