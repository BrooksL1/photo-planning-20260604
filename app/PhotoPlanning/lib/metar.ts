// METAR observations stay separate from modeled cloud percentages. A missing
// layer is unknown; CLR only describes the automated sensor's altitude range.
export const RECENT_OBSERVATION_MS = 60 * 60 * 1000;

export type MetarObservation = {
  stationId: string;
  stationName: string;
  distanceMiles: number;
  observedAt: string;
  clouds: { cover: string; baseFeet: number | null }[];
  rawReport: string;
  sourceUrl: string;
};

export type RawMetar = {
  icaoId?: string;
  name?: string;
  lat?: number;
  lon?: number;
  obsTime?: number;
  rawOb?: string;
  cover?: string;
  clouds?: { cover?: string; base?: number | null }[];
};

export function distanceMiles(lat: number, lng: number, otherLat: number, otherLng: number): number {
  const radians = Math.PI / 180;
  const a = Math.sin((otherLat - lat) * radians / 2) ** 2 +
    Math.cos(lat * radians) * Math.cos(otherLat * radians) * Math.sin((otherLng - lng) * radians / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function normalizeMetars(rows: RawMetar[], lat: number, lng: number, now = new Date()): MetarObservation[] {
  return rows.flatMap((row) => {
    if (!row.icaoId || typeof row.lat !== "number" || typeof row.lon !== "number" ||
        typeof row.obsTime !== "number" || !Number.isFinite(row.obsTime)) return [];
    const observedAt = new Date(row.obsTime * 1000);
    if (!Number.isFinite(observedAt.getTime()) || observedAt > now) return [];
    const distance = distanceMiles(lat, lng, row.lat, row.lon);
    if (!Number.isFinite(distance) || distance > 50) return [];
    const clouds = (row.clouds ?? []).flatMap((layer) => layer.cover ? [{
      cover: layer.cover,
      baseFeet: typeof layer.base === "number" && Number.isFinite(layer.base) ? layer.base : null,
    }] : []);
    if (!clouds.length && row.cover) clouds.push({ cover: row.cover, baseFeet: null });
    return [{
      stationId: row.icaoId,
      stationName: row.name ?? row.icaoId,
      distanceMiles: distance,
      observedAt: observedAt.toISOString(),
      clouds,
      rawReport: row.rawOb ?? "",
      sourceUrl: `https://aviationweather.gov/data/metar/?ids=${encodeURIComponent(row.icaoId)}`,
    }];
  });
}

export function isRecentEvent(target: Date, now: Date): boolean {
  const age = now.getTime() - target.getTime();
  return age >= 0 && age <= RECENT_OBSERVATION_MS;
}

// Choose the nearest airport with a report at or before the event, no more
// than an hour old at that instant. Never attach a later report to an event.
export function observationForEvent(reports: MetarObservation[], target: Date, now: Date): MetarObservation | null {
  if (!isRecentEvent(target, now)) return null;
  return reports.filter((report) => {
    const age = target.getTime() - Date.parse(report.observedAt);
    return age >= 0 && age <= RECENT_OBSERVATION_MS;
  }).sort((a, b) => a.distanceMiles - b.distanceMiles || Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] ?? null;
}

export function describeCloudLayer(layer: MetarObservation["clouds"][number]): string {
  const labels: Record<string, string> = {
    FEW: "Few clouds", SCT: "Scattered clouds", BKN: "Broken clouds", OVC: "Overcast",
    CLR: "No clouds detected below 12,000 ft", SKC: "Sky clear", NSC: "No significant clouds",
    VV: "Vertical visibility",
  };
  const label = labels[layer.cover] ?? layer.cover;
  if (layer.baseFeet == null || ["CLR", "SKC", "NSC"].includes(layer.cover)) return label;
  return `${label} · ${layer.baseFeet.toLocaleString("en-US")} ft above ground`;
}

export async function fetchNearbyMetars(lat: number, lng: number, signal?: AbortSignal): Promise<MetarObservation[]> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const res = await fetch(`/api/metar?${params}`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`METAR request failed (${res.status})`);
  return (await res.json()).observations;
}
