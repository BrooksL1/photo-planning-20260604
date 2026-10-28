import type { SourceReading } from "./types";

const METERS_PER_MILE = 1609.34;

// Rough NOAA HRRR / CONUS coverage bounding box. Requesting this model
// outside CONUS returns an HTTP 400 from Open-Meteo (confirmed live), so we
// check first and fail fast with a clear reason rather than firing a
// request we already know will error.
const HRRR_BOUNDS = { minLat: 21, maxLat: 53, minLng: -134, maxLng: -60 };

function isWithinHrrrCoverage(lat: number, lng: number): boolean {
  return (
    lat >= HRRR_BOUNDS.minLat &&
    lat <= HRRR_BOUNDS.maxLat &&
    lng >= HRRR_BOUNDS.minLng &&
    lng <= HRRR_BOUNDS.maxLng
  );
}

// NOAA's HRRR (High-Resolution Rapid Refresh, 3km CONUS) via Open-Meteo's
// `models=ncep_hrrr_conus` -- the actual short-range gold-standard model,
// not just Open-Meteo's default blended forecast. Its usable horizon is
// run-cycle-dependent (~18h off-cycle, up to 48h on 00/06/12/18Z runs) --
// Open-Meteo returns null for hours beyond whatever the current run covers,
// which naturally renders as "Not available" downstream.
export async function fetchHrrrReadings(
  lat: number,
  lng: number,
  targets: Date[]
): Promise<SourceReading[]> {
  if (!isWithinHrrrCoverage(lat, lng)) {
    throw new Error("Outside HRRR (CONUS) coverage area");
  }

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation_probability" +
    "&models=ncep_hrrr_conus" +
    "&forecast_days=3&timezone=auto";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HRRR request failed (${res.status})`);
  }
  const data = await res.json();

  const hourlyTimes: Date[] = data.hourly.time.map((t: string) => new Date(t));
  const cloudLow: (number | null)[] = data.hourly.cloud_cover_low;
  const cloudMid: (number | null)[] = data.hourly.cloud_cover_mid;
  const cloudHigh: (number | null)[] = data.hourly.cloud_cover_high;
  const visibility: (number | null)[] = data.hourly.visibility;
  const precipProbability: (number | null)[] = data.hourly.precipitation_probability;

  function nearestIndex(target: Date): number {
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < hourlyTimes.length; i++) {
      const diff = Math.abs(hourlyTimes[i].getTime() - target.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  return targets.map((target) => {
    const idx = nearestIndex(target);
    const vis = visibility[idx];
    return {
      cloudLow: cloudLow[idx] ?? null,
      cloudMid: cloudMid[idx] ?? null,
      cloudHigh: cloudHigh[idx] ?? null,
      visibilityMiles: vis != null ? vis / METERS_PER_MILE : null,
      precipProbability: precipProbability[idx] ?? null,
      sourceUrl: url,
      note: "NOAA HRRR, 3km CONUS -- short-range only (~18-48h depending on run cycle)",
    };
  });
}
