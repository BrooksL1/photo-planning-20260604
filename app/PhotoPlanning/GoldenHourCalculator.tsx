"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import SunCalc from "suncalc";
import type { SolarEvent, MoonEvent, CelestialEvent } from "./lib/types";
import { getUpcomingSolarEvents } from "./lib/solarEvents";
import { getUpcomingMoonEvents } from "./lib/moonEvents";
import { getUpcomingCelestialEvents } from "./lib/celestialEvents";
import { fetchFogAssessments, type FogAssessment, type FogLikelihood } from "./lib/fogPredictor";
import { searchPlaces, type PlaceSuggestion } from "./lib/geocode";
import { destinationPoint, toCompassBearing } from "./lib/geo";
import { fetchPointWeather, type PointReading } from "./lib/pointWeather";

// Leaflet touches `window` at import time -- must load client-only.
const EventMap = dynamic(() => import("./EventMap"), {
  ssr: false,
  loading: () => <div className="h-[150px] bg-gray-100 rounded-lg animate-pulse" />,
});

const SERIF = "font-[family-name:var(--font-fraunces)]";

type UnifiedEventKind = "Sunrise" | "Sunset" | "Moonrise" | "Moonset" | "Eclipse" | "Meteor Shower";

type UnifiedEvent = {
  id: string;
  kind: UnifiedEventKind;
  primaryTime: Date;
  headerLabel: string;
  // 2-3 chronological time points for the tile's window (e.g. Begin Blue
  // Hour -> Sunrise -> End Golden Hour). Rendered as two rows: bold times,
  // smaller labels below. Sun/moon events only.
  timePoints?: { label: string; date: Date }[];
  // Plain-text description for events with no time window (celestial).
  detail?: string;
  moonIlluminationPercent?: number;
  celestialLink?: { url: string; label: string };
  bearingDeg?: number;
};

type PointWeatherPair = { pin: PointReading; tip: PointReading };

type PotentialLabel = "Low Potential" | "Some Potential" | "High Potential" | "Very Promising!";

const POTENTIAL_BADGE_COLORS: Record<PotentialLabel, string> = {
  "Low Potential": "bg-gray-100 text-gray-500",
  "Some Potential": "bg-amber-50 text-amber-700",
  "High Potential": "bg-emerald-50 text-emerald-700",
  "Very Promising!": "bg-indigo-600 text-white",
};

type PotentialResult = { label: PotentialLabel; reason: string };

// Cloud cover toward the event (tip) plus precip chance at the pin, folded
// into one quick-glance label. Evaluated in order -- first match wins.
// Visibility at the pin is applied last as a ceiling: haze/murk can flatten
// an otherwise-great sky even when cloud layers look ideal.
function computePotential(pointWeather: PointWeatherPair | null, fog: FogAssessment | null): PotentialResult | null {
  if (!pointWeather) return null;
  const { cloudLow, cloudMid, cloudHigh } = pointWeather.tip;
  const precipAtPin = pointWeather.pin.precipProbability;
  if (cloudLow == null || cloudMid == null || cloudHigh == null || precipAtPin == null) return null;

  let tier: PotentialLabel;
  let reason: string;
  const totalCloud = cloudLow + cloudMid + cloudHigh;
  if (totalCloud > 80 || cloudLow > 40 || precipAtPin > 80) {
    tier = "Low Potential";
    if (precipAtPin > 80) {
      reason = `Poor: a ${Math.round(precipAtPin)}% chance of precipitation makes clear skies unlikely.`;
    } else if (cloudLow > 40) {
      reason = `Poor: low clouds cover ${Math.round(cloudLow)}% toward the event, likely blocking the horizon.`;
    } else {
      reason = `Poor: the sky is ${Math.round(totalCloud)}% covered toward the event, leaving little room for color.`;
    }
  } else if (cloudLow > 20 || precipAtPin > 40) {
    tier = "Some Potential";
    reason =
      cloudLow > 20
        ? `Middling: low clouds cover ${Math.round(cloudLow)}% toward the event, enough to partly obscure the horizon.`
        : `Middling: a ${Math.round(precipAtPin)}% chance of precipitation adds real uncertainty.`;
  } else {
    const clearLow = cloudLow >= 0 && cloudLow <= 20;
    const midInRange = cloudMid >= 20 && cloudMid <= 80;
    const highInRange = cloudHigh >= 20 && cloudHigh <= 80;
    if (clearLow && midInRange && highInRange) {
      if (fog?.likelihood === "Highly Favorable") {
        tier = "Very Promising!";
        reason = `Optimal: clear horizon with well-layered mid/high clouds to catch color, plus favorable fog for extra atmosphere.`;
      } else {
        tier = "High Potential";
        reason = `Optimal: clear horizon (${Math.round(cloudLow)}% low cloud) with well-layered mid/high clouds (${Math.round(cloudMid)}%/${Math.round(cloudHigh)}%) to catch color.`;
      }
    } else {
      tier = "Some Potential";
      reason = `Middling: cloud layering is mixed -- not quite the clear-low, textured-high combination that makes for the best light.`;
    }
  }

  const visibilityMiles = pointWeather.pin.visibilityMiles;
  if (visibilityMiles != null) {
    if (visibilityMiles < 5) {
      // Heavy haze/murk washes out color and contrast regardless of cloud shape.
      tier = "Low Potential";
      reason = `Poor: visibility is only ${visibilityMiles.toFixed(1)}mi, so haze or murk will likely wash out color and contrast.`;
    } else if (visibilityMiles < 8 && (tier === "High Potential" || tier === "Very Promising!")) {
      tier = "Some Potential";
      reason = `Middling: cloud layering looks great, but ${visibilityMiles.toFixed(1)}mi visibility means haze may flatten the color.`;
    }
  }

  return { label: tier, reason };
}

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
      headerLabel: `${e.kind} · ${fmt(e.at)}`,
      timePoints: e.boundaryTimes,
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
      headerLabel: `${e.kind} · ${fmt(primaryTime)}`,
      timePoints: e.times,
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
      headerLabel: `${e.title} · ${fmt(e.date)}`,
      detail: e.detail,
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
  "Highly Favorable": "bg-emerald-50 text-emerald-700",
  Possible: "bg-amber-50 text-amber-700",
  Unlikely: "bg-gray-100 text-gray-500",
};

function fogPointLabel(points: number): string {
  return points === 2 ? "Favorable" : points === 1 ? "Possible" : "Limiting";
}

function FogBadge({ fog }: { fog: FogAssessment | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!fog) {
    return <span className="text-xs text-gray-400">Fog: Not available</span>;
  }

  return (
    <div className="mb-3">
      <div className="relative inline-block group">
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap transition-colors ${FOG_BADGE_COLORS[fog.likelihood]}`}
        >
          Fog · {fog.likelihood} {expanded ? "▾" : "▸"}
        </button>
        {!expanded && (
          <div className="pointer-events-none absolute left-0 top-full mt-1.5 w-56 rounded-lg bg-gray-900 text-white text-xs leading-relaxed p-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg">
            {fog.reason}
          </div>
        )}
      </div>
      {expanded && (
        <div className="mt-2 text-xs text-gray-500 space-y-1.5 bg-gray-50 border border-gray-100 rounded-lg p-3">
          <div className="flex justify-between gap-4">
            <span>
              Temp–dew point spread
              <span className="block text-gray-400 text-[10px]">&lt;2° favorable, &lt;4° necessary</span>
            </span>
            <span className="text-gray-900 font-semibold text-right whitespace-nowrap">
              {fog.inputs.spreadF != null ? `${fog.inputs.spreadF.toFixed(1)}°F` : "Not available"}
              <span className="block text-gray-400 font-medium text-[10px]">{fogPointLabel(fog.spreadPoints)}</span>
            </span>
          </div>
          <div className="flex justify-between gap-4 pt-1.5 border-t border-gray-100">
            <span>
              Relative humidity
              <span className="block text-gray-400 text-[10px]">&gt;95% favorable, &gt;90% necessary</span>
            </span>
            <span className="text-gray-900 font-semibold text-right whitespace-nowrap">
              {fog.inputs.relativeHumidity != null ? `${Math.round(fog.inputs.relativeHumidity)}%` : "Not available"}
              <span className="block text-gray-400 font-medium text-[10px]">{fogPointLabel(fog.humidityPoints)}</span>
            </span>
          </div>
          <div className="flex justify-between gap-4 pt-1.5 border-t border-gray-100">
            <span>
              Wind speed
              <span className="block text-gray-400 text-[10px]">&lt;5mph favorable, &lt;10mph necessary</span>
            </span>
            <span className="text-gray-900 font-semibold text-right whitespace-nowrap">
              {fog.inputs.windSpeedMph != null ? `${Math.round(fog.inputs.windSpeedMph)} mph` : "Not available"}
              <span className="block text-gray-400 font-medium text-[10px]">{fogPointLabel(fog.windPoints)}</span>
            </span>
          </div>
          <div className="flex justify-between gap-4 pt-1.5 border-t border-gray-100">
            <span>
              Cloud cover
              <span className="block text-gray-400 text-[10px]">&lt;20% favorable, &lt;50% necessary</span>
            </span>
            <span className="text-gray-900 font-semibold text-right whitespace-nowrap">
              {fog.inputs.cloudCoverPercent != null ? `${Math.round(fog.inputs.cloudCoverPercent)}%` : "Not available"}
              <span className="block text-gray-400 font-medium text-[10px]">{fogPointLabel(fog.cloudPoints)}</span>
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-200 font-bold text-gray-700">
            <span>Total</span>
            <span>{fog.points} / 8</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Horizon + rays/crescent scenes for the event icons -- a horizon line, the
// sun (sitting on it, flat edge down, with a few rays) or moon (a crescent
// floating just above it), and a small directional arrow indicating rise vs.
// set. Kept as separate pieces so EventIcon can compose them per kind.
function HorizonLine() {
  return <path d="M2 18h20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />;
}
function SunOnHorizon() {
  return (
    <>
      <path d="M6 18a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M2.8 18h1.2M17 18h1.2M4.9 14.3l.9.75M15.2 15.05l.9-.75"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.7"
      />
    </>
  );
}
function MoonAboveHorizon() {
  return (
    <path
      d="M15.5 13.4a4.5 4.5 0 1 1-4.9-4.9 3.5 3.5 0 0 0 4.9 4.9Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  );
}
function UpArrow() {
  return (
    <path
      d="M20 10V3.5M17 6.5 20 3.5l3 3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
function DownArrow() {
  return (
    <path
      d="M20 3.5V10M17 7l3 3 3-3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function ApertureIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 7.5 15 12l-3 4.5M9 7.5 6 12l3 4.5M7.5 9h9M7.5 15h9"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeviceLocationIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function EventIcon({ kind }: { kind: UnifiedEventKind }) {
  const className = "w-6 h-6 flex-shrink-0 text-indigo-500";
  switch (kind) {
    case "Sunrise":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <HorizonLine />
          <SunOnHorizon />
          <UpArrow />
        </svg>
      );
    case "Sunset":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <HorizonLine />
          <SunOnHorizon />
          <DownArrow />
        </svg>
      );
    case "Moonrise":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <HorizonLine />
          <MoonAboveHorizon />
          <UpArrow />
        </svg>
      );
    case "Moonset":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <HorizonLine />
          <MoonAboveHorizon />
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

function eventDirectionLabel(kind: UnifiedEventKind): string {
  switch (kind) {
    case "Sunrise":
      return "sunrise";
    case "Sunset":
      return "sunset";
    case "Moonrise":
      return "moonrise";
    case "Moonset":
      return "moonset";
    default:
      return "event";
  }
}

function EventTile({
  event,
  fog,
  pinLat,
  pinLng,
  pointWeather,
  onPinMove,
}: {
  event: UnifiedEvent;
  fog: FogAssessment | null;
  pinLat: number;
  pinLng: number;
  pointWeather: PointWeatherPair | null;
  onPinMove: (lat: number, lng: number) => void;
}) {
  const hasMap = event.bearingDeg != null;
  const potential = computePotential(pointWeather, fog);

  return (
    <div className="border-t-[3px] border-indigo-500 pt-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <EventIcon kind={event.kind} />
          <div className={`${SERIF} text-lg font-semibold text-gray-900 truncate`}>{event.headerLabel}</div>
          {event.moonIlluminationPercent != null && (
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
              {event.moonIlluminationPercent}% illum.
            </span>
          )}
        </div>
        {potential && (
          <div className="relative shrink-0 group">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap cursor-default ${POTENTIAL_BADGE_COLORS[potential.label]}`}
            >
              {potential.label}
            </span>
            <div className="pointer-events-none absolute right-0 top-full mt-1.5 w-56 rounded-lg bg-gray-900 text-white text-xs leading-relaxed p-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg">
              {potential.reason}
            </div>
          </div>
        )}
      </div>
      {event.timePoints && (
        <div className={`my-2 grid ${event.timePoints.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {event.timePoints.map((t, i) => (
            <div key={i} className="text-center px-1 min-w-0">
              <div className={`${SERIF} text-lg font-bold text-gray-900 tracking-tight truncate`}>{fmt(t.date)}</div>
              <div className="text-xs text-gray-400 mt-0.5 truncate">{t.label}</div>
            </div>
          ))}
        </div>
      )}
      {event.detail && (
        <div className="text-sm text-gray-500 leading-relaxed my-1.5">{event.detail}</div>
      )}
      {event.celestialLink && (
        <a
          href={event.celestialLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-700 text-xs font-semibold mb-3 inline-block"
        >
          {event.celestialLink.label}
        </a>
      )}
      <FogBadge fog={fog} />

      {hasMap && (
        <div className="relative z-0 rounded-lg overflow-hidden mb-3">
          <EventMap pinLat={pinLat} pinLng={pinLng} bearingDeg={event.bearingDeg!} onPinMove={onPinMove} />
          <div className="absolute bottom-2 left-2 right-2 text-[10px] text-gray-500 bg-white/90 px-2 py-0.5 rounded-full whitespace-nowrap overflow-hidden text-ellipsis">
            Pin · arrow toward {eventDirectionLabel(event.kind)}, 20mi
          </div>
        </div>
      )}

      <div className="space-y-2.5 mt-auto">
        <div className="min-w-0">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap">
            At your location
          </div>
          <div className="text-sm text-gray-800 font-semibold truncate">
            {pointWeather
              ? `${pointWeather.pin.tempF != null ? Math.round(pointWeather.pin.tempF) + "°F" : "Not available"} · ${fmtPercent(pointWeather.pin.precipProbability)} precip · ${fmtMiles(pointWeather.pin.visibilityMiles)} visibility`
              : "Loading…"}
          </div>
        </div>
        {hasMap && (
          <div className="min-w-0">
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap">
              Toward the event (20mi)
            </div>
            <div className="text-sm text-gray-800 font-semibold truncate">
              {pointWeather
                ? `Low ${fmtPercent(pointWeather.tip.cloudLow)} / Mid ${fmtPercent(pointWeather.tip.cloudMid)} / High ${fmtPercent(pointWeather.tip.cloudHigh)}`
                : "Loading…"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DayRow({
  label,
  items,
  fogAssessments,
  pointWeatherByEvent,
  pinLat,
  pinLng,
  onPinMove,
  showDivider,
}: {
  label: string;
  items: IndexedEvent[];
  fogAssessments: (FogAssessment | null)[];
  pointWeatherByEvent: (PointWeatherPair | null)[];
  pinLat: number;
  pinLng: number;
  onPinMove: (lat: number, lng: number) => void;
  showDivider: boolean;
}) {
  const useSlider = items.length > 3;

  const tile = ({ event, index }: IndexedEvent) => (
    <EventTile
      key={event.id}
      event={event}
      fog={fogAssessments[index] ?? null}
      pinLat={pinLat}
      pinLng={pinLng}
      pointWeather={pointWeatherByEvent[index] ?? null}
      onPinMove={onPinMove}
    />
  );

  return (
    <div className={`space-y-4 ${showDivider ? "pt-8 border-t border-gray-200" : ""}`}>
      <h3 className={`${SERIF} text-xl font-semibold text-gray-900 flex items-baseline gap-3`}>
        {label}
        <span className="flex-1 h-px bg-gray-200" />
      </h3>
      {useSlider ? (
        <div className="flex gap-7 overflow-x-auto snap-x snap-mandatory pb-2">
          {items.map((item) => (
            <div key={item.event.id} className="flex-none w-[min(90vw,380px)] xl:w-[calc(33.333%-1.2rem)] snap-start">
              {tile(item)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7 items-stretch">
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
  const [locationOpen, setLocationOpen] = useState(false);
  const locationPopoverRef = useRef<HTMLDivElement>(null);

  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const [unifiedEvents, setUnifiedEvents] = useState<UnifiedEvent[]>([]);
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
        setLocationOpen(false);
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
    setLocationQuery("");
    setSuggestions([]);
    setGeoError(null);
    setLocationOpen(false);
  }

  // Ask for the user's location as soon as the app loads, rather than
  // waiting for a button click.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial geolocation prompt on mount
    detectLocation();
  }, []);

  // Close the location popover on outside click.
  useEffect(() => {
    if (!locationOpen) return;
    function handleClick(e: MouseEvent) {
      if (locationPopoverRef.current && !locationPopoverRef.current.contains(e.target as Node)) {
        setLocationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [locationOpen]);

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

    // Window spans the next 4 sunrises + 4 sunsets; moon/celestial events
    // are pulled in up through that same end point.
    const solar = getUpcomingSolarEvents(lat, lng);
    const windowEnd =
      solar.length > 0 ? solar[solar.length - 1].at : new Date(Date.now() + 48 * 60 * 60 * 1000);
    const moon = getUpcomingMoonEvents(lat, lng, windowEnd);
    const celestial = getUpcomingCelestialEvents(windowEnd);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- pure computation, no fetch involved
    setCometNote(celestial.find((e) => e.category === "Comet") ?? null);

    const combined = buildUnifiedEvents(lat, lng, solar, moon, celestial);
    setUnifiedEvents(combined);
    setFogAssessments(combined.map(() => null));
    setPointWeatherByEvent(combined.map(() => null));

    if (combined.length === 0) return;
    const targets = combined.map((e) => e.primaryTime);

    setWeatherLoading(true);
    Promise.allSettled(
      combined.map((e) => {
        const pinPromise = fetchPointWeather(lat, lng, e.primaryTime);
        if (e.bearingDeg == null) {
          return pinPromise.then((pin) => ({ pin, tip: pin }));
        }
        const tip = destinationPoint(lat, lng, e.bearingDeg, 20);
        return Promise.all([pinPromise, fetchPointWeather(tip.lat, tip.lng, e.primaryTime)]).then(
          ([pin, tipReading]) => ({ pin, tip: tipReading })
        );
      })
    ).then((results) => {
      if (cancelled) return;
      setPointWeatherByEvent(results.map((r) => (r.status === "fulfilled" ? r.value : null)));
      setWeatherLoading(false);
    });

    fetchFogAssessments(lat, lng, targets)
      .then((fog) => {
        if (!cancelled) setFogAssessments(fog);
      })
      .catch(() => {
        if (!cancelled) setFogAssessments(targets.map(() => null));
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const days = groupByDay(unifiedEvents);

  return (
    <div className="max-w-[1040px] w-full mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-gray-200 pb-3.5 mb-8">
        <div className="flex items-center gap-2">
          <ApertureIcon className="w-5 h-5 text-indigo-500" />
          <span className={`${SERIF} font-semibold text-lg text-gray-900`}>Brooksl</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-400">Photo planning, next 4 sunrises & sunsets</span>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-1.5 border border-gray-200 rounded-full pl-3.5 pr-3 py-1.5 text-sm font-medium text-gray-700">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent outline-none w-[108px] [color-scheme:light]"
            />
          </label>

          <div className="w-px h-5 bg-gray-200" />

          <div className="relative" ref={locationPopoverRef}>
            <button
              onClick={() => setLocationOpen((v) => !v)}
              className="flex items-center gap-1.5 border border-indigo-200 bg-indigo-50 rounded-full pl-3 pr-2.5 py-1.5 text-sm font-medium text-indigo-700"
            >
              <PinIcon className="w-3.5 h-3.5 text-indigo-500" />
              {loading ? "Detecting…" : (cityState ?? "Set location")}
              <ChevronDownIcon className="w-2.5 h-2.5 text-indigo-300" />
            </button>

            {locationOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-2.5 z-30">
                <button
                  onClick={detectLocation}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-3 py-2 text-xs font-semibold mb-2 disabled:opacity-50"
                >
                  <DeviceLocationIcon className="w-3.5 h-3.5" />
                  {loading ? "Detecting…" : "Use device location"}
                </button>

                <div className="flex items-center gap-2 border-2 border-indigo-500 rounded-lg px-2.5 py-2 shadow-[0_0_0_3px_rgba(99,102,241,0.12)] mb-1.5">
                  <SearchIcon className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="City, state, zip, or address"
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    className="flex-1 text-xs outline-none text-gray-900"
                  />
                  {searching && <span className="text-[10px] text-gray-400">…</span>}
                </div>

                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-indigo-50 text-xs text-gray-600 flex items-center gap-1.5"
                  >
                    <PinIcon className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    {s.label}
                  </button>
                ))}

                {geoError && <p className="text-red-600 text-xs mt-1.5 px-1">{geoError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {lat === null && lng === null && !loading && (
        <p className="text-gray-400 text-sm text-center pt-4">Set a location above to see upcoming events.</p>
      )}

      {lat !== null && lng !== null && (
        <div className="space-y-0">
          {weatherLoading && <p className="text-gray-400 text-sm mb-8">Loading forecasts…</p>}
          {days.map((day, i) => (
            <DayRow
              key={day.key}
              label={day.label}
              items={day.items}
              fogAssessments={fogAssessments}
              pointWeatherByEvent={pointWeatherByEvent}
              pinLat={lat}
              pinLng={lng}
              onPinMove={movePin}
              showDivider={i > 0}
            />
          ))}
          {cometNote && (
            <div className="py-3 px-4 rounded-lg bg-gray-50 border border-gray-100">
              <span className="font-semibold text-gray-600 text-sm">Comets: {cometNote.title}</span>
              <p className="text-xs text-gray-400 mt-1">{cometNote.detail}</p>
              <a
                href={cometNote.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-700 text-xs font-semibold"
              >
                Check manually
              </a>
            </div>
          )}
          <p className="text-[10px] text-gray-300 text-center pt-8">Weather source: Open-Meteo</p>
        </div>
      )}
    </div>
  );
}
