"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import SunCalc from "suncalc";
import type { SolarEvent, MoonEvent, CelestialEvent, SourceReading, SourceName } from "./lib/types";
import { getUpcomingSolarEvents } from "./lib/solarEvents";
import { getUpcomingMoonEvents } from "./lib/moonEvents";
import { getUpcomingCelestialEvents } from "./lib/celestialEvents";
import { fetchOpenMeteoReadings } from "./lib/openMeteoSource";
import { fetchHrrrReadings } from "./lib/hrrrSource";
import { fetchAviationReadings } from "./lib/aviationSource";
import { fetchFogAssessments, type FogAssessment, type FogLikelihood } from "./lib/fogPredictor";
import { searchPlaces, type PlaceSuggestion } from "./lib/geocode";
import { destinationPoint, toCompassBearing } from "./lib/geo";
import { fetchPointWeather, type PointReading } from "./lib/pointWeather";

// Leaflet touches `window` at import time -- must load client-only.
const EventMap = dynamic(() => import("./EventMap"), {
  ssr: false,
  loading: () => <div className="h-[220px] bg-gray-800 rounded-lg animate-pulse" />,
});

type EventReading = { source: SourceName; reading: SourceReading };

type UnifiedEventKind = "Sunrise" | "Sunset" | "Moonrise" | "Moonset" | "Eclipse" | "Meteor Shower";

type UnifiedEvent = {
  id: string;
  kind: UnifiedEventKind;
  primaryTime: Date;
  headerLabel: string;
  detailLine: string;
  moonIlluminationPercent?: number;
  celestialLink?: { url: string; label: string };
  // Compass bearing (degrees from north) toward the sun/moon at primaryTime
  // -- only defined for Sunrise/Sunset/Moonrise/Moonset, which have a
  // well-defined direction. Drives the map's arrow.
  bearingDeg?: number;
};

type PointWeatherPair = { pin: PointReading; tip: PointReading };

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
// tile carrying the same weather + fog data. Comets are excluded (no
// specific date/time -- see the standing disclaimer rendered separately).
// Moon events under 1% illumination are dropped (not meaningfully visible).
function buildUnifiedEvents(
  lat: number,
  lng: number,
  solarEvents: SolarEvent[],
  moonEvents: MoonEvent[],
  celestialEvents: CelestialEvent[]
): UnifiedEvent[] {
  const events: UnifiedEvent[] = [];

  solarEvents.forEach((e, i) => {
    const bearingDeg = toCompassBearing(SunCalc.getPosition(e.at, lat, lng).azimuth);
    events.push({
      id: `solar-${i}`,
      kind: e.kind,
      primaryTime: e.at,
      headerLabel: `${e.kind} – ${fmt(e.at)}`,
      detailLine: e.boundaryTimes.map((b) => `${b.label} ${fmt(b.date)}`).join(" · "),
      bearingDeg,
    });
  });

  moonEvents.forEach((e, i) => {
    const primaryTime = e.kind === "Moonrise" ? e.times[0].date : e.times[1].date;
    const illumination = Math.round(SunCalc.getMoonIllumination(primaryTime).fraction * 100);
    if (illumination <= 1) return;
    const bearingDeg = toCompassBearing(SunCalc.getMoonPosition(primaryTime, lat, lng).azimuth);
    events.push({
      id: `moon-${i}`,
      kind: e.kind,
      primaryTime,
      headerLabel: `${e.kind} – ${fmt(primaryTime)}`,
      detailLine: e.times.map((t) => `${t.label} ${fmt(t.date)}`).join(" · "),
      moonIlluminationPercent: illumination,
      bearingDeg,
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

function SunGlyph() {
  return <circle cx="9" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />;
}
function MoonGlyph() {
  return (
    <path
      d="M13 7a5 5 0 1 0 4 8 6 6 0 0 1-4-8Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  );
}
function UpArrow() {
  return (
    <path
      d="M19 17V6M15.5 9.5 19 6l3.5 3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
function DownArrow() {
  return (
    <path
      d="M19 7v11M15.5 14.5 19 18l3.5-3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function EventIcon({ kind }: { kind: UnifiedEventKind }) {
  const className = "w-5 h-5 flex-shrink-0 text-amber-400";
  switch (kind) {
    case "Sunrise":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <SunGlyph />
          <UpArrow />
        </svg>
      );
    case "Sunset":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <SunGlyph />
          <DownArrow />
        </svg>
      );
    case "Moonrise":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <MoonGlyph />
          <UpArrow />
        </svg>
      );
    case "Moonset":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <MoonGlyph />
          <DownArrow />
        </svg>
      );
    case "Eclipse":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <circle cx="9" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="14" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
        </svg>
      );
    case "Meteor Shower":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M4 20 18 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 6h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function EventTile({
  event,
  readings,
  fog,
  pinLat,
  pinLng,
  pointWeather,
  onPinMove,
}: {
  event: UnifiedEvent;
  readings: EventReading[];
  fog: FogAssessment | null;
  pinLat: number;
  pinLng: number;
  pointWeather: PointWeatherPair | null;
  onPinMove: (lat: number, lng: number) => void;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden h-full">
      <div className="px-4 py-3 bg-gray-800/60">
        <div className="flex items-center gap-2">
          <EventIcon kind={event.kind} />
          <div className="text-lg font-bold text-white">{event.headerLabel}</div>
          {event.moonIlluminationPercent != null && (
            <span className="text-sm text-gray-400">({event.moonIlluminationPercent}% illuminated)</span>
          )}
        </div>
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
      {event.bearingDeg != null && (
        <div className="border-t border-gray-800">
          <EventMap pinLat={pinLat} pinLng={pinLng} bearingDeg={event.bearingDeg} onPinMove={onPinMove} />
          <div className="px-4 py-2 text-xs text-gray-400 space-y-0.5 bg-gray-950/40">
            <div>
              <span className="text-gray-500">At your location:</span>{" "}
              {pointWeather
                ? `${pointWeather.pin.tempF != null ? Math.round(pointWeather.pin.tempF) + "°F" : "Not available"} · ${fmtPercent(pointWeather.pin.precipProbability)} precip · ${fmtMiles(pointWeather.pin.visibilityMiles)} visibility`
                : "Loading…"}
            </div>
            <div>
              <span className="text-gray-500">Toward the event (20mi):</span>{" "}
              {pointWeather
                ? `Low ${fmtPercent(pointWeather.tip.cloudLow)} / Mid ${fmtPercent(pointWeather.tip.cloudMid)} / High ${fmtPercent(pointWeather.tip.cloudHigh)}`
                : "Loading…"}
            </div>
            <div className="text-gray-600">Drag the pin to change location.</div>
          </div>
        </div>
      )}
      {readings.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0 min-w-[520px]">
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
      )}
    </div>
  );
}

function DayRow({
  label,
  items,
  eventReadings,
  fogAssessments,
  pointWeatherByEvent,
  pinLat,
  pinLng,
  onPinMove,
}: {
  label: string;
  items: IndexedEvent[];
  eventReadings: EventReading[][];
  fogAssessments: (FogAssessment | null)[];
  pointWeatherByEvent: (PointWeatherPair | null)[];
  pinLat: number;
  pinLng: number;
  onPinMove: (lat: number, lng: number) => void;
}) {
  const useSlider = items.length > 3;

  const tile = ({ event, index }: IndexedEvent) => (
    <EventTile
      key={event.id}
      event={event}
      readings={eventReadings[index] ?? []}
      fog={fogAssessments[index] ?? null}
      pinLat={pinLat}
      pinLng={pinLng}
      pointWeather={pointWeatherByEvent[index] ?? null}
      onPinMove={onPinMove}
    />
  );

  return (
    <div className="space-y-3">
      <h3 className="text-white font-semibold text-lg">{label}</h3>
      {useSlider ? (
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2">
          {items.map((item) => (
            <div key={item.event.id} className="flex-none w-[min(90vw,420px)] xl:w-[calc(33.333%-1rem)] snap-start">
              {tile(item)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
          {items.map((item) => tile(item))}
        </div>
      )}
    </div>
  );
}

export default function GoldenHourCalculator() {
  const [date, setDate] = useState(() => todayLocalISO());
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [cityState, setCityState] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const [unifiedEvents, setUnifiedEvents] = useState<UnifiedEvent[]>([]);
  const [eventReadings, setEventReadings] = useState<EventReading[][]>([]);
  const [fogAssessments, setFogAssessments] = useState<(FogAssessment | null)[]>([]);
  const [pointWeatherByEvent, setPointWeatherByEvent] = useState<(PointWeatherPair | null)[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [cometNote, setCometNote] = useState<CelestialEvent | null>(null);

  function movePin(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
  }

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
        setLoading(false);
      },
      () => {
        setGeoError("Location access denied. Search for a location below.");
        setLoading(false);
      }
    );
  }

  function selectSuggestion(s: PlaceSuggestion) {
    setLat(s.lat);
    setLng(s.lng);
    setCityState(s.label);
    setLocationQuery(s.label);
    setSuggestions([]);
    setGeoError(null);
  }

  // Ask for the user's location as soon as the app loads, rather than
  // waiting for a button click.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial geolocation prompt on mount
    detectLocation();
  }, []);

  useEffect(() => {
    if (locationQuery.trim().length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale suggestions when query is too short
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      searchPlaces(locationQuery)
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [locationQuery]);

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

    const combined = buildUnifiedEvents(lat, lng, solar, moon, celestial);
    setUnifiedEvents(combined);
    setEventReadings(combined.map(() => []));
    setFogAssessments(combined.map(() => null));
    setPointWeatherByEvent(combined.map(() => null));

    if (combined.length === 0) return;
    const targets = combined.map((e) => e.primaryTime);

    const mapEvents = combined
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.bearingDeg != null);
    Promise.allSettled(
      mapEvents.map(({ e }) => {
        const tip = destinationPoint(lat, lng, e.bearingDeg!, 20);
        return Promise.all([fetchPointWeather(lat, lng, e.primaryTime), fetchPointWeather(tip.lat, tip.lng, e.primaryTime)]);
      })
    ).then((results) => {
      if (cancelled) return;
      const next: (PointWeatherPair | null)[] = combined.map(() => null);
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          const [pin, tip] = r.value;
          next[mapEvents[idx].i] = { pin, tip };
        }
      });
      setPointWeatherByEvent(next);
    });

    setWeatherLoading(true);
    Promise.allSettled([
      fetchOpenMeteoReadings(lat, lng, targets),
      fetchHrrrReadings(lat, lng, targets),
      fetchAviationReadings(lat, lng, targets),
      fetchFogAssessments(lat, lng, targets),
    ]).then(([omResult, hrrrResult, avResult, fogResult]) => {
      if (cancelled) return;
      const openMeteo =
        omResult.status === "fulfilled" ? omResult.value : fallbackReadings(targets.length, describeFailure(omResult));
      const hrrr =
        hrrrResult.status === "fulfilled" ? hrrrResult.value : fallbackReadings(targets.length, describeFailure(hrrrResult));
      const aviation =
        avResult.status === "fulfilled" ? avResult.value : fallbackReadings(targets.length, describeFailure(avResult));

      setEventReadings(
        combined.map((_, i) => [
          { source: "Open-Meteo" as SourceName, reading: openMeteo[i] },
          { source: "HRRR (NOAA)" as SourceName, reading: hrrr[i] },
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

  const days = groupByDay(unifiedEvents);

  return (
    <div className="max-w-[1600px] w-full mx-auto">
      <div className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800 py-4 mb-8">
        <div className="max-w-md mx-auto w-full space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-gray-400">Location</label>
            <button
              onClick={detectLocation}
              disabled={loading}
              className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-white transition-colors disabled:opacity-50"
            >
              {loading ? "Detecting…" : "Use Device Location"}
            </button>

            <p className="text-xs text-gray-500 text-center">or enter a camera location</p>

            <div className="relative">
              <input
                type="text"
                placeholder="City, state, zip, or address"
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-amber-500 text-sm"
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">…</span>
              )}
              {suggestions.length > 0 && (
                <ul className="absolute z-30 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg max-h-64 overflow-y-auto shadow-xl">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        onClick={() => selectSuggestion(s)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-gray-200"
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {geoError && <p className="text-red-400 text-sm">{geoError}</p>}
            {cityState && <p className="text-gray-500 text-xs">Location: {cityState}</p>}
          </div>
        </div>
      </div>

      {lat === null && lng === null && !loading && (
        <p className="text-gray-600 text-sm text-center pt-4">
          Set a location above to see upcoming events.
        </p>
      )}

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
            <DayRow
              key={day.key}
              label={day.label}
              items={day.items}
              eventReadings={eventReadings}
              fogAssessments={fogAssessments}
              pointWeatherByEvent={pointWeatherByEvent}
              pinLat={lat}
              pinLng={lng}
              onPinMove={movePin}
            />
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
