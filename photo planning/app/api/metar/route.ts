import { normalizeMetars, type RawMetar } from "../../PhotoPlanning/lib/metar";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const lat = latParam?.trim() ? Number(latParam) : NaN;
  const lng = lngParam?.trim() ? Number(lngParam) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "Valid lat and lng are required" }, { status: 400 });
  }
  // One bounded query supplies recent reports for both Now and recent events.
  const latRadius = 0.75;
  const lngRadius = Math.min(180, latRadius / Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  const bbox = `${Math.max(-90, lat - latRadius)},${Math.max(-180, lng - lngRadius)},${Math.min(90, lat + latRadius)},${Math.min(180, lng + lngRadius)}`;
  try {
    const query = new URLSearchParams({ bbox, format: "json", hours: "3" });
    const res = await fetch(`https://aviationweather.gov/api/data/metar?${query}`, {
      cache: "no-store",
      headers: { "User-Agent": "brooksl-photo-planner/0.1" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Aviation Weather Center returned ${res.status}`);
    const rows: RawMetar[] = res.status === 204 ? [] : await res.json();
    if (!Array.isArray(rows)) throw new Error("Invalid METAR response");
    return Response.json({ observations: normalizeMetars(rows, lat, lng) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Nearby METAR observations are temporarily unavailable" }, { status: 502 });
  }
}
