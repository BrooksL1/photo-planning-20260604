// Single-source (Open-Meteo) reading at one specific lat/lng + time, used by
// the map: pin location shows temp/precip/visibility, the arrow tip shows
// cloud cover. Distinct from the 3-source cross-check table -- this is a
// simple directional readout, not an audit.

const METERS_PER_MILE = 1609.34;

export type PointReading = {
  tempF: number | null;
  precipProbability: number | null;
  visibilityMiles: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
};

export async function fetchPointWeather(lat: number, lng: number, target: Date): Promise<PointReading> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&hourly=temperature_2m,precipitation_probability,visibility,cloud_cover_low,cloud_cover_mid,cloud_cover_high" +
    "&temperature_unit=fahrenheit&forecast_days=3&timezone=auto";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Point weather request failed (${res.status})`);
  }
  const data = await res.json();

  const hourlyTimes: Date[] = data.hourly.time.map((t: string) => new Date(t));
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < hourlyTimes.length; i++) {
    const diff = Math.abs(hourlyTimes[i].getTime() - target.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  const visibility = data.hourly.visibility[bestIdx];
  return {
    tempF: data.hourly.temperature_2m[bestIdx] ?? null,
    precipProbability: data.hourly.precipitation_probability[bestIdx] ?? null,
    visibilityMiles: visibility != null ? visibility / METERS_PER_MILE : null,
    cloudLow: data.hourly.cloud_cover_low[bestIdx] ?? null,
    cloudMid: data.hourly.cloud_cover_mid[bestIdx] ?? null,
    cloudHigh: data.hourly.cloud_cover_high[bestIdx] ?? null,
  };
}
