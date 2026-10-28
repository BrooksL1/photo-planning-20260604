import { NextResponse } from "next/server";

// aviationweather.gov does not send CORS headers, so this route exists purely
// as a same-origin proxy: find the nearest TAF-capable station, fetch its
// METAR/TAF, and return normalized readings for the requested target times.

type Station = {
  id: string;
  icaoId: string;
  lat: number;
  lon: number;
  siteType?: string[];
};

type CloudLayer = { cover: string; base: number };

type TafPeriod = {
  timeFrom: number;
  timeTo: number;
  fcstChange: string | null;
  probability: number | null;
  visib?: string | number;
  wxString?: string | null;
  clouds?: CloudLayer[];
};

const COVER_PERCENT: Record<string, number> = {
  SKC: 0,
  CLR: 0,
  NSC: 0,
  CAVOK: 0,
  FEW: 20,
  SCT: 40,
  BKN: 70,
  OVC: 100,
  VV: 100,
};

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function findNearestTafStation(lat: number, lng: number): Promise<Station | null> {
  for (const radius of [0.5, 1.5, 3]) {
    const bbox = `${lat - radius},${lng - radius},${lat + radius},${lng + radius}`;
    const res = await fetch(
      `https://aviationweather.gov/api/data/stationinfo?bbox=${bbox}&format=json`
    );
    if (!res.ok) continue;
    const stations: Station[] = await res.json();
    const tafStations = stations.filter((s) => s.siteType?.includes("TAF"));
    if (tafStations.length === 0) continue;

    let nearest = tafStations[0];
    let nearestDist = haversineMiles(lat, lng, nearest.lat, nearest.lon);
    for (const s of tafStations.slice(1)) {
      const d = haversineMiles(lat, lng, s.lat, s.lon);
      if (d < nearestDist) {
        nearest = s;
        nearestDist = d;
      }
    }
    return nearest;
  }
  return null;
}

function parseVisibilityMiles(visib: string | number | undefined): number | null {
  if (visib == null) return null;
  if (typeof visib === "number") return visib;
  let s = visib.trim();
  if (s.startsWith("M")) s = s.slice(1); // "M1/4" -> "1/4" ("less than" -- use the bound)
  s = s.replace("+", "");
  if (s.includes("/")) {
    const [num, den] = s.split("/").map(Number);
    if (!den) return null;
    return num / den;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bucketClouds(clouds: CloudLayer[] | undefined): {
  low: number;
  mid: number;
  high: number;
} {
  const buckets = { low: 0, mid: 0, high: 0 };
  for (const layer of clouds ?? []) {
    const pct = COVER_PERCENT[layer.cover] ?? 0;
    if (layer.base < 10000) buckets.low = Math.max(buckets.low, pct);
    else if (layer.base < 26000) buckets.mid = Math.max(buckets.mid, pct);
    else buckets.high = Math.max(buckets.high, pct);
  }
  return buckets;
}

function findPeriodFor(periods: TafPeriod[], targetSec: number): TafPeriod | null {
  let applicable: TafPeriod | null = null;
  for (const p of periods) {
    if (targetSec >= p.timeFrom && targetSec < p.timeTo) {
      applicable = p; // last match wins -- later entries refine earlier ones
    }
  }
  return applicable;
}

function findProbFor(periods: TafPeriod[], targetSec: number): TafPeriod | null {
  for (const p of periods) {
    if (p.fcstChange === "PROB" && targetSec >= p.timeFrom && targetSec < p.timeTo) {
      return p;
    }
  }
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const targetsParam = searchParams.get("targets");

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !targetsParam) {
    return NextResponse.json({ error: "lat, lng, and targets are required" }, { status: 400 });
  }
  const targets = targetsParam.split(",").map((t) => new Date(t));

  try {
    const station = await findNearestTafStation(lat, lng);
    if (!station) {
      return NextResponse.json({ error: "No TAF-capable station found nearby" }, { status: 404 });
    }

    const tafRes = await fetch(
      `https://aviationweather.gov/api/data/taf?ids=${station.icaoId}&format=json`
    );
    if (!tafRes.ok) {
      return NextResponse.json({ error: "TAF request failed" }, { status: 502 });
    }
    const tafData = await tafRes.json();
    const taf = Array.isArray(tafData) ? tafData[0] : tafData;
    const periods: TafPeriod[] = taf?.fcsts ?? [];

    const sourceUrl = `https://aviationweather.gov/data/metar/?ids=${station.icaoId}`;

    const readings = targets.map((target) => {
      const targetSec = Math.floor(target.getTime() / 1000);
      const period = findPeriodFor(periods, targetSec);
      if (!period) {
        return {
          cloudLow: null,
          cloudMid: null,
          cloudHigh: null,
          visibilityMiles: null,
          precipProbability: null,
          sourceUrl,
          note: `Outside ${station.icaoId}'s TAF forecast window`,
        };
      }
      const { low, mid, high } = bucketClouds(period.clouds);
      const probPeriod = findProbFor(periods, targetSec);
      return {
        cloudLow: low,
        cloudMid: mid,
        cloudHigh: high,
        visibilityMiles: parseVisibilityMiles(period.visib),
        precipProbability: probPeriod?.probability ?? null,
        sourceUrl,
        note: `${station.icaoId} TAF, cloud % approximated from layer codes`,
      };
    });

    return NextResponse.json({ readings, stationId: station.icaoId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
