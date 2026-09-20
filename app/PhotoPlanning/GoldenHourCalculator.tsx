"use client";

import { useState, useEffect } from "react";
import SunCalc from "suncalc";

type SunTimes = {
  goldenHourMorningStart: Date;
  goldenHourMorningEnd: Date;
  blueHourMorningStart: Date;
  blueHourMorningEnd: Date;
  sunrise: Date;
  solarNoon: Date;
  sunset: Date;
  goldenHourEveningStart: Date;
  goldenHourEveningEnd: Date;
  blueHourEveningStart: Date;
  blueHourEveningEnd: Date;
};

type TwilightCloud = {
  label: "Dawn" | "Dusk";
  date: Date;
  low: number;
  mid: number;
  high: number;
};

function fmt(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtRange(start: Date, end: Date): string {
  return `${fmt(start)} – ${fmt(end)}`;
}

function fmtDayTime(date: Date): string {
  return date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function calcTimes(lat: number, lng: number, date: Date): SunTimes {
  const t = SunCalc.getTimes(date, lat, lng);
  return {
    blueHourMorningStart: t.nauticalDawn,
    blueHourMorningEnd: t.dawn,
    goldenHourMorningStart: t.dawn,
    goldenHourMorningEnd: t.goldenHourEnd,
    sunrise: t.sunrise,
    solarNoon: t.solarNoon,
    sunset: t.sunset,
    goldenHourEveningStart: t.goldenHour,
    goldenHourEveningEnd: t.dusk,
    blueHourEveningStart: t.dusk,
    blueHourEveningEnd: t.nauticalDusk,
  };
}

// Finds the next 4 dawn/dusk moments starting from now, within the next 48
// hours, then looks up the nearest-hour low/mid/high cloud cover for each
// from Open-Meteo (same free, no-key API used in the Atlanta-Golden-Hour-
// Clouds project, matched to the nearest hourly timestamp).
async function fetchTwilightCloudCover(lat: number, lng: number): Promise<TwilightCloud[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const candidates: { label: "Dawn" | "Dusk"; date: Date }[] = [];
  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const base = new Date(now);
    base.setDate(base.getDate() + dayOffset);
    base.setHours(12, 0, 0, 0);
    const t = SunCalc.getTimes(base, lat, lng);
    if (t.dawn instanceof Date && !isNaN(t.dawn.getTime())) {
      candidates.push({ label: "Dawn", date: t.dawn });
    }
    if (t.dusk instanceof Date && !isNaN(t.dusk.getTime())) {
      candidates.push({ label: "Dusk", date: t.dusk });
    }
  }

  const upcoming = candidates
    .filter((c) => c.date > now && c.date <= windowEnd)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 4);

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high" +
    "&forecast_days=3&timezone=auto";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Could not load cloud cover forecast.");
  }
  const data = await res.json();
  const hourlyTimes: Date[] = data.hourly.time.map((t: string) => new Date(t));
  const low: number[] = data.hourly.cloud_cover_low;
  const mid: number[] = data.hourly.cloud_cover_mid;
  const high: number[] = data.hourly.cloud_cover_high;

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

  return upcoming.map((c) => {
    const idx = nearestIndex(c.date);
    return { label: c.label, date: c.date, low: low[idx], mid: mid[idx], high: high[idx] };
  });
}

async function fetchCityState(lat: number, lng: number): Promise<string | null> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const city = data.city || data.locality || "";
  let region = data.principalSubdivision || "";
  if (data.countryCode === "US" && typeof data.principalSubdivisionCode === "string") {
    const parts = data.principalSubdivisionCode.split("-");
    if (parts[1]) region = parts[1];
  }
  const label = [city, region].filter(Boolean).join(", ");
  return label || null;
}

type TimeRowProps = { label: string; value: string; color: string; note?: string };

function TimeRow({ label, value, color, note }: TimeRowProps) {
  return (
    <div className={`flex items-center justify-between py-3 px-4 rounded-lg ${color}`}>
      <div>
        <span className="font-medium text-white">{label}</span>
        {note && <span className="ml-2 text-xs text-white/60">{note}</span>}
      </div>
      <span className="text-white font-mono text-sm">{value}</span>
    </div>
  );
}

function CloudTable({ entries }: { entries: TwilightCloud[] }) {
  return (
    <table className="w-full text-sm border-separate border-spacing-y-1.5">
      <thead>
        <tr className="text-gray-500 text-xs uppercase tracking-wide">
          <th className="text-left font-normal pb-1 px-3">Event</th>
          <th className="text-right font-normal pb-1 px-3">Low</th>
          <th className="text-right font-normal pb-1 px-3">Mid</th>
          <th className="text-right font-normal pb-1 px-3">High</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => (
          <tr key={`${entry.label}-${entry.date.toISOString()}-${i}`} className="bg-gray-800">
            <td className="py-3 px-3 rounded-l-lg">
              <span className="font-medium text-white">{entry.label}</span>
              <span className="ml-2 text-xs text-white/60">{fmtDayTime(entry.date)}</span>
            </td>
            <td className="py-3 px-3 text-right font-mono text-white">{Math.round(entry.low)}%</td>
            <td className="py-3 px-3 text-right font-mono text-white">{Math.round(entry.mid)}%</td>
            <td className="py-3 px-3 text-right font-mono text-white rounded-r-lg">
              {Math.round(entry.high)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function GoldenHourCalculator() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [cityState, setCityState] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [times, setTimes] = useState<SunTimes | null>(null);
  const [cloudForecast, setCloudForecast] = useState<TwilightCloud[] | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  function detectLocation() {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported by this browser.");
      return;
    }
    setLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocationLabel(
          `${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°`
        );
        setLoading(false);
      },
      () => {
        setGeoError("Location access denied. Enter coordinates manually below.");
        setLoading(false);
      }
    );
  }

  // Ask for the user's location as soon as the app loads, rather than
  // waiting for a button click.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial geolocation prompt on mount
    detectLocation();
  }, []);

  useEffect(() => {
    if (lat !== null && lng !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deriving sun times from lat/lng/date
      setTimes(calcTimes(lat, lng, new Date(date + "T12:00:00")));
    }
  }, [lat, lng, date]);

  useEffect(() => {
    if (lat === null || lng === null) return;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale label while a new lookup is in flight
    setCityState(null);
    fetchCityState(lat, lng).then((label) => {
      if (!cancelled) setCityState(label);
    });

    setCloudLoading(true);
    setCloudError(null);
    fetchTwilightCloudCover(lat, lng)
      .then((entries) => {
        if (cancelled) return;
        setCloudForecast(entries);
        setCloudLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setCloudError(err instanceof Error ? err.message : "Could not load cloud cover.");
        setCloudLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  function applyManual() {
    const la = parseFloat(manualLat);
    const lo = parseFloat(manualLng);
    if (isNaN(la) || isNaN(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
      setGeoError("Enter valid coordinates (lat: -90 to 90, lng: -180 to 180).");
      return;
    }
    setGeoError(null);
    setLat(la);
    setLng(lo);
    setLocationLabel(`${la.toFixed(4)}°, ${lo.toFixed(4)}°`);
  }

  return (
    <div className="max-w-md w-full mx-auto space-y-6">
      {/* Date */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Location */}
      <div className="space-y-3">
        <label className="block text-sm text-gray-400">Location</label>
        <button
          onClick={detectLocation}
          disabled={loading}
          className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-white transition-colors disabled:opacity-50"
        >
          {loading ? "Detecting…" : "Use My Current Location"}
        </button>

        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Latitude"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-amber-500 text-sm"
          />
          <input
            type="number"
            placeholder="Longitude"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-amber-500 text-sm"
          />
          <button
            onClick={applyManual}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-sm transition-colors"
          >
            Go
          </button>
        </div>

        {geoError && <p className="text-red-400 text-sm">{geoError}</p>}
        {(cityState || locationLabel) && (
          <p className="text-gray-500 text-xs">
            Location: {cityState ? cityState : locationLabel}
          </p>
        )}
      </div>

      {/* Results */}
      {times && (
        <div className="space-y-2">
          <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3">Morning</h2>
          <TimeRow
            label="Blue Hour"
            value={fmtRange(times.blueHourMorningStart, times.blueHourMorningEnd)}
            color="bg-blue-900/60"
            note="pre-dawn"
          />
          <TimeRow
            label="Golden Hour"
            value={fmtRange(times.goldenHourMorningStart, times.goldenHourMorningEnd)}
            color="bg-amber-800/60"
          />
          <TimeRow
            label="Sunrise"
            value={fmt(times.sunrise)}
            color="bg-orange-900/40"
          />

          <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3 mt-5">Midday</h2>
          <TimeRow
            label="Solar Noon"
            value={fmt(times.solarNoon)}
            color="bg-gray-800"
            note="harsh light"
          />

          <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3 mt-5">Evening</h2>
          <TimeRow
            label="Sunset"
            value={fmt(times.sunset)}
            color="bg-orange-900/40"
          />
          <TimeRow
            label="Golden Hour"
            value={fmtRange(times.goldenHourEveningStart, times.goldenHourEveningEnd)}
            color="bg-amber-800/60"
          />
          <TimeRow
            label="Blue Hour"
            value={fmtRange(times.blueHourEveningStart, times.blueHourEveningEnd)}
            color="bg-blue-900/60"
            note="post-sunset"
          />
        </div>
      )}

      {!times && !loading && (
        <p className="text-gray-600 text-sm text-center pt-4">
          Set a location above to see your golden hour times.
        </p>
      )}

      {/* Cloud cover for upcoming dawn/dusk */}
      {(lat !== null && lng !== null) && (
        <div className="space-y-2">
          <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3 mt-5">
            Cloud Cover — Next 48 Hours
          </h2>
          {cloudLoading && <p className="text-gray-600 text-sm">Loading forecast…</p>}
          {cloudError && <p className="text-red-400 text-sm">{cloudError}</p>}
          {cloudForecast && <CloudTable entries={cloudForecast} />}
        </div>
      )}
    </div>
  );
}
