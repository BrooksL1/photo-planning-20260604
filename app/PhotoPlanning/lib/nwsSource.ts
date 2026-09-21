import type { SourceReading } from "./types";

const METERS_PER_MILE = 1609.34;

type GridSeriesEntry = { validTime: string; value: number | null };

// Minimal ISO8601 duration parser (P#DT#H#M#S) -- sufficient for the short
// durations (PT1H, PT3H, etc.) NWS gridpoint data actually uses.
function parseDurationMs(iso: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    (Number(days) || 0) * 86400000 +
    (Number(hours) || 0) * 3600000 +
    (Number(minutes) || 0) * 60000 +
    (Number(seconds) || 0) * 1000
  );
}

function parseValidTime(validTime: string): { start: Date; end: Date } {
  const [startStr, durationStr] = validTime.split("/");
  const start = new Date(startStr);
  const end = new Date(start.getTime() + parseDurationMs(durationStr));
  return { start, end };
}

function valueAt(series: GridSeriesEntry[] | undefined, target: Date): number | null {
  if (!series) return null;
  for (const entry of series) {
    const { start, end } = parseValidTime(entry.validTime);
    if (target >= start && target < end) {
      return entry.value;
    }
  }
  return null;
}

export async function fetchNwsReadings(
  lat: number,
  lng: number,
  targets: Date[]
): Promise<SourceReading[]> {
  const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`);
  if (!pointsRes.ok) {
    throw new Error(`NWS points lookup failed (${pointsRes.status}) -- likely outside the US`);
  }
  const pointsData = await pointsRes.json();
  const { gridId, gridX, gridY } = pointsData.properties;

  const gridRes = await fetch(`https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}`);
  if (!gridRes.ok) {
    throw new Error(`NWS gridpoint request failed (${gridRes.status})`);
  }
  const gridData = await gridRes.json();

  const skyCover: GridSeriesEntry[] | undefined = gridData.properties.skyCover?.values;
  const visibility: GridSeriesEntry[] | undefined = gridData.properties.visibility?.values;
  const precipProbability: GridSeriesEntry[] | undefined =
    gridData.properties.probabilityOfPrecipitation?.values;

  const sourceUrl = `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lng}`;

  return targets.map((target) => {
    const totalSky = valueAt(skyCover, target);
    const vis = valueAt(visibility, target);
    const precip = valueAt(precipProbability, target);
    return {
      // NWS only reports total sky cover, not a low/mid/high breakdown.
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      visibilityMiles: vis != null ? vis / METERS_PER_MILE : null,
      precipProbability: precip,
      sourceUrl,
      note:
        totalSky != null
          ? `Total sky cover ${Math.round(totalSky)}% (NWS doesn't split by altitude)`
          : undefined,
    };
  });
}
