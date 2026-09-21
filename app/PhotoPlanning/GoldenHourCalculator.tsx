"use client";

import { useState, useEffect } from "react";
import type { SolarEvent, MoonEvent, CelestialEvent, SourceReading, SourceName } from "./lib/types";
import { getUpcomingSolarEvents } from "./lib/solarEvents";
import { getUpcomingMoonEvents } from "./lib/moonEvents";
import { getUpcomingCelestialEvents } from "./lib/celestialEvents";
import { fetchOpenMeteoReadings } from "./lib/openMeteoSource";
import { fetchNwsReadings } from "./lib/nwsSource";
import { fetchAviationReadings } from "./lib/aviationSource";
import { fetchFogAssessments, type FogAssessment, type FogLikelihood } from "./lib/fogPredictor";

type EventReading = { source: SourceName; reading: SourceReading };

type UnifiedEventKind = "Sunrise" | "Sunset" | "Moonrise" | "Moonset" | "Eclipse" | "Meteor Shower";

type UnifiedEvent = {
  id: string;
  kind: UnifiedEventKind;
  primaryTime: Date;
  headerLabel: string;
  detailLine: string;
  celestialLink?: { url: string; label: string };
};

function fmt(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtPercent(v: number | null): string {
  return v == null ? "Not available" : `${Math.round(v)}%`;
}

function fmtMiles(v: number | null): string {
  if (v == null) return "Not available";
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} mi`;
}

function todayLocalISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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

// Merges sun/moon/celestial events into one common shape so they can all be
// laid out the same way: grouped by calendar day, one tile per event, each
// tile carrying the same 3-source weather + fog data. Comets are excluded
// (no specific date/time -- see the standing disclaimer rendered separately).
function buildUnifiedEvents(
  solarEvents: SolarEvent[],
  moonEvents: MoonEvent[],
  celestialEvents: CelestialEvent[]
): UnifiedEvent[] {
  const events: UnifiedEvent[] = [];

  solarEvents.forEach((e, i) => {
    events.push({
      id: `solar-${i}`,
      kind: e.kind,
      primaryTime: e.at,
      headerLabel: `${e.kind} – ${fmt(e.at)}`,
      detailLine: e.boundaryTimes.map((b) => `${b.label} ${fmt(b.date)}`).join(" · "),
    });
  });

  moonEvents.forEach((e, i) => {
    const primaryTime = e.kind === "Moonrise" ? e.times[0].date : e.times[1].date;
    events.push({
      id: `moon-${i}`,
      kind: e.kind,
      primaryTime,
      headerLabel: `${e.kind} – ${fmt(primaryTime)}`,
      detailLine: e.times.map((t) => `${t.label} ${fmt(t.date)}`).join(" · "),
    });
  });

  celestialEvents.forEach((e, i) => {
    if (e.category === "Comet" || !e.date) return;
    events.push({
      id: `celestial-${i}`,
      kind: e.category === "Eclipse" ? "Eclipse" : "Meteor Shower",
      primaryTime: e.date,
      headerLabel: `${e.title} – ${fmt(e.date)}`,
      detailLine: e.detail,
      celestialLink: { url: e.sourceUrl, label: "Verify source" },
    });
  });

  return events.sort((a, b) => a.primaryTime.getTime() - b.primaryTime.getTime());
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

type IndexedEvent = { event: UnifiedEvent; index: number };

function groupByDay(events: UnifiedEvent[]): { key: string; label: string; items: IndexedEvent[] }[] {
  const map = new Map<string, IndexedEvent[]>();
  events.forEach((event, index) => {
    const key = dayKey(event.primaryTime);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ event, index });
  });
  return Array.from(map.entries())
    .map(([key, items]) => ({ key, label: dayLabel(items[0].event.primaryTime), items }))
    .sort((a, b) => a.items[0].event.primaryTime.getTime() - b.items[0].event.primaryTime.getTime());
}

const FOG_BADGE_COLORS: Record<FogLikelihood, string> = {
  "Highly Favorable": "bg-sky-900/60 text-sky-200 border-sky-700",
  Possible: "bg-amber-900/50 text-amber-200 border-amber-700",
  Unlikely: "bg-gray-800 text-gray-400 border-gray-700",
};

function FogBadge({ fog }: { fog: FogAssessment | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!fog) {
    return <span className="text-xs text-gray-600">Fog: Not available</span>;
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`text-xs px-2 py-1 rounded-full border transition-colors ${FOG_BADGE_COLORS[fog.likelihood]}`}
      >
        Fog: {fog.likelihood} {expanded ? "▾" : "▸"}
      </button>
      {expanded && (
        <div className="mt-2 text-xs text-gray-400 space-y-2 bg-gray-950/60 rounded-lg p-3">
          <div className="flex justify-between gap-4">
            <span>
              Temp–dew point spread
              <span className="block text-gray-600">&lt;2° highly favorable, &lt;4° necessary</span>
            </span>
            <span className="font-mono text-gray-200 text-right whitespace-nowrap">
              {fog.inputs.spreadF != null ? `${fog.inputs.spreadF.toFixed(1)}°F` : "Not available"}
              <br />
              {fog.spreadPoints} pt
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>
              Relative humidity
              <span className="block text-gray-600">&gt;95% highly favorable, &gt;90% necessary</span>
            </span>
            <span className="font-mono text-gray-200 text-right whitespace-nowrap">
              {fog.inputs.relativeHumidity != null ? `${Math.round(fog.inputs.relativeHumidity)}%` : "Not available"}
              <br />
              {fog.humidityPoints} pt
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>
              Wind speed
              <span className="block text-gray-600">&lt;5mph highly favorable, &lt;10mph necessary</span>
            </span>
            <span className="font-mono text-gray-200 text-right whitespace-nowrap">
              {fog.inputs.windSpeedMph != null ? `${Math.round(fog.inputs.windSpeedMph)} mph` : "Not available"}
              <br />
              {fog.windPoints} pt
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-800 font-medium text-gray-300">
            <span>Total</span>
            <span className="font-mono">{fog.points} / 6</span>
          </div>
        </div>
      )}
    </div>
  );
}

function EventTile({
  event,
  readings,
  fog,
}: {
  event: UnifiedEvent;
  readings: EventReading[];
  fog: FogAssessment | null;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex-1 min-w-[320px]">
      <div className="px-4 py-3 bg-gray-800/60">
        <div className="text-lg font-bold text-white">{event.headerLabel}</div>
        <div className="text-xs text-gray-400 mt-1">{event.detailLine}</div>
        {event.celestialLink && (
          <a
            href={event.celestialLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 text-xs mt-1 inline-block"
          >
            {event.celestialLink.label}
          </a>
        )}
        {readings.length > 0 && <FogBadge fog={fog} />}
      </div>
      {readings.length > 0 && (
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
              {readings.map(({ source, reading }) => {
                // NWS structurally never splits cloud cover by altitude --
                // "--" (not applicable) rather than "Not available" (which
                // implies a gap in an otherwise-expected data point).
                const cloudsApplicable = source !== "NOAA/NWS";
                return (
                  <tr key={source} className="border-t border-gray-800">
                    <td className="py-2 px-3 text-white align-top">
                      {source}
                      {reading.note && <div className="text-xs text-gray-500 mt-0.5">{reading.note}</div>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200 align-top">
                      {cloudsApplicable ? fmtPercent(reading.cloudLow) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200 align-top">
                      {cloudsApplicable ? fmtPercent(reading.cloudMid) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-200 align-top">
                      {cloudsApplicable ? fmtPercent(reading.cloudHigh) : "—"}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function GoldenHourCalculator() {
  const [date, setDate] = useState(() => todayLocalISO());
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [cityState, setCityState] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [unifiedEvents, setUnifiedEvents] = useState<UnifiedEvent[]>([]);
  const [eventReadings, setEventReadings] = useState<EventReading[][]>([]);
  const [fogAssessments, setFogAssessments] = useState<(FogAssessment | null)[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [cometNote, setCometNote] = useState<CelestialEvent | null>(null);

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

    const solar = getUpcomingSolarEvents(lat, lng);
    const moon = getUpcomingMoonEvents(lat, lng);
    const celestial = getUpcomingCelestialEvents();

    // eslint-disable-next-line react-hooks/set-state-in-effect -- pure computation, no fetch involved
    setCometNote(celestial.find((e) => e.category === "Comet") ?? null);

    const combined = buildUnifiedEvents(solar, moon, celestial);
    setUnifiedEvents(combined);
    setEventReadings(combined.map(() => []));
    setFogAssessments(combined.map(() => null));

    if (combined.length === 0) return;
    const targets = combined.map((e) => e.primaryTime);

    setWeatherLoading(true);
    Promise.allSettled([
      fetchOpenMeteoReadings(lat, lng, targets),
      fetchNwsReadings(lat, lng, targets),
      fetchAviationReadings(lat, lng, targets),
      fetchFogAssessments(lat, lng, targets),
    ]).then(([omResult, nwsResult, avResult, fogResult]) => {
      if (cancelled) return;
      const openMeteo =
        omResult.status === "fulfilled" ? omResult.value : fallbackReadings(targets.length, describeFailure(omResult));
      const nws =
        nwsResult.status === "fulfilled" ? nwsResult.value : fallbackReadings(targets.length, describeFailure(nwsResult));
      const aviation =
        avResult.status === "fulfilled" ? avResult.value : fallbackReadings(targets.length, describeFailure(avResult));

      setEventReadings(
        combined.map((_, i) => [
          { source: "Open-Meteo" as SourceName, reading: openMeteo[i] },
          { source: "NOAA/NWS" as SourceName, reading: nws[i] },
          { source: "Aviation METAR/TAF" as SourceName, reading: aviation[i] },
        ])
      );
      setFogAssessments(fogResult.status === "fulfilled" ? fogResult.value : targets.map(() => null));
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

  const days = groupByDay(unifiedEvents);

  return (
    <div className="max-w-6xl w-full mx-auto space-y-8">
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

        {!lat && !lng && !loading && (
          <p className="text-gray-600 text-sm text-center pt-4">
            Set a location above to see upcoming events.
          </p>
        )}
      </div>

      {lat !== null && lng !== null && (
        <div className="space-y-6">
          <div>
            <h2 className="text-gray-400 text-sm uppercase tracking-widest">Next 48 Hours</h2>
            <p className="text-xs text-gray-600 mt-1">
              Each event is cross-checked from 3 independent weather sources. &quot;Not
              available&quot; means that source doesn&apos;t provide that data point --
              never guessed.
            </p>
          </div>
          {weatherLoading && <p className="text-gray-600 text-sm">Loading forecasts from 3 sources…</p>}
          {days.map((day) => (
            <div key={day.key} className="space-y-3">
              <h3 className="text-white font-semibold text-lg">{day.label}</h3>
              <div className="flex flex-wrap gap-4">
                {day.items.map(({ event, index }) => (
                  <EventTile
                    key={event.id}
                    event={event}
                    readings={eventReadings[index] ?? []}
                    fog={fogAssessments[index] ?? null}
                  />
                ))}
              </div>
            </div>
          ))}
          {cometNote && (
            <div className="py-3 px-4 rounded-lg bg-gray-900 border border-gray-800">
              <span className="font-medium text-gray-400">Comets: {cometNote.title}</span>
              <p className="text-xs text-gray-500 mt-1">{cometNote.detail}</p>
              <a
                href={cometNote.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 text-xs"
              >
                Check manually
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
