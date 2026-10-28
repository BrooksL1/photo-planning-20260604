import type { SourceReading } from "./types";

export async function fetchAviationReadings(
  lat: number,
  lng: number,
  targets: Date[]
): Promise<SourceReading[]> {
  const targetsParam = targets.map((t) => t.toISOString()).join(",");
  const res = await fetch(
    `/api/aviation-weather?lat=${lat}&lng=${lng}&targets=${encodeURIComponent(targetsParam)}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Aviation weather request failed (${res.status})`);
  }
  const data = await res.json();
  return data.readings as SourceReading[];
}
