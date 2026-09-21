"use client";

import { useState, useEffect } from "react";
import SunCalc from "suncalc";
import type { SolarEvent, MoonEvent, CelestialEvent, SourceReading, SourceName } from "./lib/types";
import { getUpcomingSolarEvents } from "./lib/solarEvents";
import { getUpcomingMoonEvents } from "./lib/moonEvents";
import { getUpcomingCelestialEvents } from "./lib/celestialEvents";
import { fetchOpenMeteoReadings } from "./lib/openMeteoSource";
import { fetchNwsReadings } from "./lib/nwsSource";
import { fetchAviationReadings } from "./lib/aviationSource";

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

type EventReading = { source: SourceName; reading: SourceReading };
type SolarEventWithReadings = { event: SolarEvent; readings: EventReading[] };

function fmt(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtRange(start: Date, end: Date): string {
  return `${fmt(start)} – ${fmt(end)}`;
}

function fmtDayTime(date: Date): string {
  return date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtPercent(v: number | null): string {
  return v == null ? "Not available" : `${Math.round(v)}%`;
}

function fmtMiles(v: number | null): string {
  if (v == null) return "Not available";
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} mi`;
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

function fallbackReadings(count: number, reason: string): SourceReading[] {
  return Array.from({ length: count }, () => ({
    cloudLow: null,
    cloudMid: null,
    cloudHigh: null,
    visibilityMiles: null,
    precipProbability: null,
    sourceUrl: "",
    note: reason,
  }));
}

function describeFailure(result: PromiseSettledResult<SourceReading[]>): string {
  return result.status === "rejected"
    ? result.reason instanceof Error
      ? result.reason.message
      : String(result.reason)
    : "Unavailable";
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

function WeatherAuditTable({ items }: { items: SolarEventWithReadings[] }) {
  return (
    <div className="space-y-4">
      {items.map(({ event, readings }, i) => (
        <div
          key={`${event.kind}-${event.at.toISOString()}-${i}`}
          className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
        >
          <div className="px-4 py-3 bg-gray-800/60">
            <span className="font-semibold text-white">{event.kind}</span>
            <div className="text-xs text-gray-400 mt-0.5">
              {event.boundaryTimes.map((b, j) => (
                <span key={b.label}>
                  {j > 0 && " · "}
                  {b.label} {fmt(b.date)}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0 min-w-[560px]">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-normal py-2 px-3">Source</th>
                  <th className="text-right font-normal py-2 px-3">Low</th>
                  <th className="text-right font-normal py-2 px-3">Mid</th>
                  <th className="text-right font-normal py-2 px-3">High</th>
                  <th className="text-right font-normal py-2 px-3">Visibility</th>
                  <th className="text-right font-normal py-2 px-3">Precip</th>
                  <th className="text-right font-normal py-2 px-3">Verify</th>
                </tr>
              </thead>
              <tbody>
                {readings.map(({ source, reading }) => (
                  <tr key={source} className="border-t border-gray-800">
                    <td className="py-2 px-3 text-white align-top">
                      {source}
                      {reading.note && <div className="text-xs text-gray-500 mt-0.5">{reading.note}</div>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200 align-top">
                      {fmtPercent(reading.cloudLow)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200 align-top">
                      {fmtPercent(reading.cloudMid)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200 align-top">
                      {fmtPercent(reading.cloudHigh)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200 align-top">
                      {fmtMiles(reading.visibilityMiles)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200 align-top">
                      {fmtPercent(reading.precipProbability)}
                    </td>
                    <td className="py-2 px-3 text-right align-top">
                      {reading.sourceUrl ? (
                        <a
                          href={reading.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:text-amber-300 text-xs"
                        >
                          Link
                        </a>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function MoonSection({ events }: { events: MoonEvent[] }) {
  if (events.length === 0) {
    return <p className="text-gray-600 text-sm">No nighttime moonrise/moonset in this window.</p>;
  }
  return (
    <div className="space-y-2">
      {events.map((event, i) => (
        <div
          key={`${event.kind}-${i}`}
          className="flex items-center justify-between py-3 px-4 rounded-lg bg-gray-800"
        >
          <span className="font-medium text-white">{event.kind}</span>
          <span className="text-white font-mono text-sm">
            {event.times.map((t, j) => (
              <span key={t.label}>
                {j > 0 && " · "}
                {t.label} {fmt(t.date)}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function CelestialSection({ events }: { events: CelestialEvent[] }) {
  const notable = events.filter((e) => e.category !== "Comet");
  const comet = events.find((e) => e.category === "Comet");
  return (
    <div className="space-y-2">
      {notable.length === 0 && <p className="text-gray-600 text-sm">None expected.</p>}
      {notable.map((event, i) => (
        <div key={`${event.title}-${i}`} className="py-3 px-4 rounded-lg bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="font-medium text-white">{event.title}</span>
            {event.date && <span className="text-white font-mono text-sm">{fmtDayTime(event.date)}</span>}
          </div>
          <p className="text-xs text-gray-400 mt-1">{event.detail}</p>
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 text-xs"
          >
            Verify source
          </a>
        </div>
      ))}
      {comet && (
        <div className="py-3 px-4 rounded-lg bg-gray-900 border border-gray-800">
          <span className="font-medium text-gray-400">Comets: {comet.title}</span>
          <p className="text-xs text-gray-500 mt-1">{comet.detail}</p>
          <a
            href={comet.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 text-xs"
          >
            Check manually
          </a>
        </div>
      )}
    </div>
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

  const [solarEventReadings, setSolarEventReadings] = useState<SolarEventWithReadings[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [moonEvents, setMoonEvents] = useState<MoonEvent[]>([]);
  const [celestialEvents, setCelestialEvents] = useState<CelestialEvent[]>([]);

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

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(() => {
    if (lat === null || lng === null) return;
    let cancelled = false;

    const events = getUpcomingSolarEvents(lat, lng);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed rows before weather data arrives
    setSolarEventReadings(events.map((event) => ({ event, readings: [] })));
    setMoonEvents(getUpcomingMoonEvents(lat, lng));
    setCelestialEvents(getUpcomingCelestialEvents());

    if (events.length === 0) return;
    const targets = events.map((e) => e.at);

    setWeatherLoading(true);
    Promise.allSettled([
      fetchOpenMeteoReadings(lat, lng, targets),
      fetchNwsReadings(lat, lng, targets),
      fetchAviationReadings(lat, lng, targets),
    ]).then(([omResult, nwsResult, avResult]) => {
      if (cancelled) return;
      const openMeteo =
        omResult.status === "fulfilled" ? omResult.value : fallbackReadings(targets.length, describeFailure(omResult));
      const nws =
        nwsResult.status === "fulfilled" ? nwsResult.value : fallbackReadings(targets.length, describeFailure(nwsResult));
      const aviation =
        avResult.status === "fulfilled" ? avResult.value : fallbackReadings(targets.length, describeFailure(avResult));

      setSolarEventReadings(
        events.map((event, i) => ({
          event,
          readings: [
            { source: "Open-Meteo" as SourceName, reading: openMeteo[i] },
            { source: "NOAA/NWS" as SourceName, reading: nws[i] },
            { source: "Aviation METAR/TAF" as SourceName, reading: aviation[i] },
          ],
        }))
      );
      setWeatherLoading(false);
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
    <div className="max-w-3xl w-full mx-auto space-y-8">
      <div className="max-w-md mx-auto w-full space-y-6">
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
            <TimeRow label="Sunrise" value={fmt(times.sunrise)} color="bg-orange-900/40" />

            <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3 mt-5">Midday</h2>
            <TimeRow
              label="Solar Noon"
              value={fmt(times.solarNoon)}
              color="bg-gray-800"
              note="harsh light"
            />

            <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3 mt-5">Evening</h2>
            <TimeRow label="Sunset" value={fmt(times.sunset)} color="bg-orange-900/40" />
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
      </div>

      {lat !== null && lng !== null && (
        <div className="space-y-3">
          <h2 className="text-gray-400 text-sm uppercase tracking-widest">
            Weather Audit — Next 48 Hours (Sunrise/Sunset)
          </h2>
          <p className="text-xs text-gray-600">
            Cross-checked from 3 independent sources. &quot;Not available&quot; means that
            source doesn&apos;t provide that data point -- never guessed.
          </p>
          {weatherLoading && <p className="text-gray-600 text-sm">Loading forecasts from 3 sources…</p>}
          <WeatherAuditTable items={solarEventReadings} />
        </div>
      )}

      {lat !== null && lng !== null && (
        <div className="space-y-3">
          <h2 className="text-gray-400 text-sm uppercase tracking-widest">
            Moonrise & Moonset — Next 48 Hours (Nighttime)
          </h2>
          <MoonSection events={moonEvents} />
        </div>
      )}

      {lat !== null && lng !== null && (
        <div className="space-y-3">
          <h2 className="text-gray-400 text-sm uppercase tracking-widest">
            Celestial Events — Next 48 Hours
          </h2>
          <CelestialSection events={celestialEvents} />
        </div>
      )}
    </div>
  );
}
