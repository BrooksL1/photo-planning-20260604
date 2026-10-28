import type { SourceReading } from "./types";

const METERS_PER_MILE = 1609.34;

export async function fetchOpenMeteoReadings(
  lat: number,
  lng: number,
  targets: Date[]
): Promise<SourceReading[]> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation_probability" +
    "&forecast_days=3&timezone=auto";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed (${res.status})`);
  }
  const data = await res.json();

  const hourlyTimes: Date[] = data.hourly.time.map((t: string) => new Date(t));
  const cloudLow: number[] = data.hourly.cloud_cover_low;
  const cloudMid: number[] = data.hourly.cloud_cover_mid;
  const cloudHigh: number[] = data.hourly.cloud_cover_high;
  const visibility: number[] = data.hourly.visibility;
  const precipProbability: number[] = data.hourly.precipitation_probability;

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
    return {
      cloudLow: cloudLow[idx] ?? null,
      cloudMid: cloudMid[idx] ?? null,
      cloudHigh: cloudHigh[idx] ?? null,
      visibilityMiles: visibility[idx] != null ? visibility[idx] / METERS_PER_MILE : null,
      precipProbability: precipProbability[idx] ?? null,
      sourceUrl: url,
    };
  });
}
