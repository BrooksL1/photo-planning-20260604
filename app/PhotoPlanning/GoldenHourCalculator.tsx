"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import SunCalc from "suncalc";
import type { SolarEvent, MoonEvent, CelestialEvent } from "./lib/types";
import { getUpcomingSolarEvents } from "./lib/solarEvents";
import { getUpcomingMoonEvents, horizonCrossing } from "./lib/moonEvents";
import { getUpcomingCelestialEvents } from "./lib/celestialEvents";
import { fetchFogAssessments, type FogAssessment, type FogLikelihood } from "./lib/fogPredictor";
import { searchPlaces, type PlaceSuggestion } from "./lib/geocode";
import { destinationPoint, toCompassBearing } from "./lib/geo";
import { fetchPointWeather, type PointReading } from "./lib/pointWeather";
import { isWithinForecastRange, FORECAST_FUTURE_LIMIT_DAYS } from "./lib/openMeteoHourly";
import SkyScene from "./SkyScene";
import {
  DEVICE_TIME_ZONE,
  fetchTimeZone,
  zonedParts,
  wallTimeStringToDate,
  dateToWallTimeString,
  timeZoneAbbreviation,
} from "./lib/timeZone";

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
  // For the sky illustration: lit fraction (0-1) and the clockwise rotation
  // that points the bright limb where it really is, as seen from the pin.
  moonPhase?: { fraction: number; rotationDeg: number };
  celestialLink?: { url: string; label: string };
  bearingDeg?: number;
};

type PointWeatherPair = { pin: PointReading; tip: PointReading };

type PotentialLabel = "Too Much Cloud Cover" | "Low Potential" | "Some Potential" | "High Potential" | "Very Promising!";

const POTENTIAL_BADGE_COLORS: Record<PotentialLabel, string> = {
  "Too Much Cloud Cover": "bg-gray-100 text-gray-500",
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
  if (totalCloud > 80) {
    // Layers are summed, so this can top 100% -- it just means the sky is stacked with cloud.
    tier = "Too Much Cloud Cover";
    reason = `Too much cloud cover: low ${Math.round(cloudLow)}% + mid ${Math.round(cloudMid)}% + high ${Math.round(cloudHigh)}% totals ${Math.round(totalCloud)}% toward the event, leaving little room for color.`;
  } else if (cloudLow > 40 || precipAtPin > 80) {
    tier = "Low Potential";
    if (precipAtPin > 80) {
      reason = `Poor: a ${Math.round(precipAtPin)}% chance of precipitation makes clear skies unlikely.`;
    } else {
      reason = `Poor: low clouds cover ${Math.round(cloudLow)}% toward the event, likely blocking the horizon.`;
    }
  } else if (cloudLow > 20 || precipAtPin > 40) {
    tier = "Some Potential";
    reason =
      cloudLow > 20
        ? `Middling: low clouds cover ${Math.round(cloudLow)}% toward the event, enough to partly obscure the horizon.`
        : `Middling: a ${Math.round(precipAtPin)}% chance of precipitation adds real uncertainty.`;
  } else {
    // Low cloud is already <= 20% here. Mid and high clouds are what catch sunrise/sunset
    // color, so judge how much of that canvas there is and whether the layers are usable.
    const mid = Math.round(cloudMid);
    const high = Math.round(cloudHigh);
    const midInRange = cloudMid >= 20 && cloudMid <= 80;
    const highInRange = cloudHigh >= 20 && cloudHigh <= 80;
    if (midInRange && highInRange) {
      if (fog?.likelihood === "Highly Favorable") {
        tier = "Very Promising!";
        reason = `Optimal: clear horizon with well-layered mid/high clouds to catch color, plus favorable fog for extra atmosphere.`;
      } else {
        tier = "High Potential";
        reason = `Optimal: clear horizon (${Math.round(cloudLow)}% low cloud) with well-layered mid/high clouds (${mid}%/${high}%) to catch color.`;
      }
    } else if (midInRange || highInRange) {
      // One good layer is enough to light up, even without the other.
      tier = "Some Potential";
      reason = midInRange
        ? `Decent: ${mid}% mid cloud can catch color on its own, though with ${high}% high cloud there's little layering for depth.`
        : `Decent: ${high}% high cloud can streak with color, though with ${mid}% mid cloud there's little layering for depth.`;
    } else if (cloudMid + cloudHigh < 15) {
      // Almost nothing to catch the light.
      if (fog?.likelihood === "Highly Favorable") {
        tier = "Some Potential";
        reason = `Boring sky (${mid}% mid / ${high}% high) with little to catch color, but favorable fog could still add atmosphere.`;
      } else {
        tier = "Low Potential";
        reason = `Boring: almost no mid or high cloud (${mid}% / ${high}%), so nothing to catch the color -- expect a plain, clear-sky gradient.`;
      }
    } else {
      tier = "Some Potential";
      reason = `Sparse: only ${mid}% mid / ${high}% high cloud, just a few wisps, so color will be limited.`;
    }
  }

  const visibilityMiles = pointWeather.pin.visibilityMiles;
  if (visibilityMiles != null && tier !== "Too Much Cloud Cover") {
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

// Moon shots want the opposite of a sunrise: the moon is the subject, not a
// light source for the clouds, so any cloud on the line of sight is a cost and
// clear, clean air matters most. Visibility is judged for long telephoto
// shots (a subject miles away), where haze swallows the moon's detail and
// the foreground's edges long before the sky looks "hazy" to the eye.
function computeMoonPotential(pointWeather: PointWeatherPair | null): PotentialResult | null {
  if (!pointWeather) return null;
  const { cloudLow, cloudMid, cloudHigh } = pointWeather.tip;
  const precipAtPin = pointWeather.pin.precipProbability;
  if (cloudLow == null || cloudMid == null || cloudHigh == null || precipAtPin == null) return null;

  // Layers are summed (can exceed 100%) -- deliberately conservative, since
  // cloud at any altitude along the line toward the moon can cover it.
  const total = cloudLow + cloudMid + cloudHigh;
  const layers = `low ${Math.round(cloudLow)}% / mid ${Math.round(cloudMid)}% / high ${Math.round(cloudHigh)}%`;
  const visibilityMiles = pointWeather.pin.visibilityMiles;
  const vis = visibilityMiles != null ? `${Math.round(visibilityMiles)}mi` : null;

  if (precipAtPin > 40) {
    return { label: "Low Potential", reason: `Poor: a ${Math.round(precipAtPin)}% chance of precipitation makes a clear view of the moon unlikely.` };
  }
  if (cloudLow > 20) {
    return { label: "Low Potential", reason: `Poor: ${Math.round(cloudLow)}% low cloud toward the moon will likely hide it right at the horizon.` };
  }
  if (total > 50) {
    return { label: "Too Much Cloud Cover", reason: `Too cloudy: ${layers} toward the moon (${Math.round(total)}% total) -- expect it to be covered for much of the window.` };
  }
  if (visibilityMiles != null && visibilityMiles < 10) {
    return { label: "Low Potential", reason: `Poor: visibility is only ${visibilityMiles.toFixed(1)}mi, so haze will wash out a distant moon and skyline.` };
  }
  if (total > 20) {
    return { label: "Some Potential", reason: `Mixed: ${layers} toward the moon (${Math.round(total)}% total). It may slip between clouds, but expect interruptions.` };
  }
  // Clear line of sight (<= 20% total cloud) -- now it comes down to air clarity.
  if (visibilityMiles != null && visibilityMiles < 20) {
    return { label: "Some Potential", reason: `Clear sky (${Math.round(total)}% total cloud), but ${vis} visibility means haze will soften a long-distance shot.` };
  }
  if (visibilityMiles != null && visibilityMiles >= 25 && total <= 10) {
    return { label: "Very Promising!", reason: `Excellent: nearly cloudless toward the moon (${Math.round(total)}% total) with ${vis} visibility -- clean air for a crisp long-lens shot.` };
  }
  return {
    label: "High Potential",
    reason: `Good: clear line of sight (${Math.round(total)}% total cloud)${vis ? ` and ${vis} visibility` : ""}.`,
  };
}

// All displayed times are in the location's zone, not the device's.
function fmt(date: Date, timeZone: string): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone });
}

function fmtDateTime(d: Date, timeZone: string): string {
  const sameYear = zonedParts(d, timeZone).year === zonedParts(new Date(), timeZone).year;
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function fmtPercent(v: number | null): string {
  return v == null ? "Not available" : `${Math.round(v)}%`;
}

function fmtMiles(v: number | null): string {
  if (v == null) return "Not available";
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} mi`;
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
  celestialEvents: CelestialEvent[],
  timeZone: string
): UnifiedEvent[] {
  const events: UnifiedEvent[] = [];

  solarEvents.forEach((e, i) => {
    const bearingDeg = toCompassBearing(SunCalc.getPosition(e.at, lat, lng).azimuth);
    events.push({
      id: `solar-${i}`,
      kind: e.kind,
      primaryTime: e.at,
      headerLabel: `${e.kind} · ${fmt(e.at, timeZone)}`,
      timePoints: e.boundaryTimes,
      bearingDeg,
    });
  });

  moonEvents.forEach((e, i) => {
    const primaryTime = horizonCrossing(e);
    const illum = SunCalc.getMoonIllumination(primaryTime);
    const illumination = Math.round(illum.fraction * 100);
    if (illumination <= 1) return;
    const position = SunCalc.getMoonPosition(primaryTime, lat, lng);
    const bearingDeg = toCompassBearing(position.azimuth);
    // angle - parallacticAngle is the bright limb's angle from the zenith,
    // measured counterclockwise on the sky; SVG rotates clockwise, hence the negation.
    const brightLimbDeg = ((illum.angle - position.parallacticAngle) * 180) / Math.PI;
    events.push({
      id: `moon-${i}`,
      kind: e.kind,
      primaryTime,
      headerLabel: `${e.kind} · ${fmt(primaryTime, timeZone)}`,
      timePoints: e.times,
      moonIlluminationPercent: illumination,
      moonPhase: { fraction: illum.fraction, rotationDeg: -brightLimbDeg },
      bearingDeg,
    });
  });

  celestialEvents.forEach((e, i) => {
    if (e.category === "Comet" || !e.date) return;
    events.push({
      id: `celestial-${i}`,
      kind: e.category === "Eclipse" ? "Eclipse" : "Meteor Shower",
      primaryTime: e.date,
      headerLabel: `${e.title} · ${fmt(e.date, timeZone)}`,
      detail: e.detail,
      celestialLink: { url: e.sourceUrl, label: "Verify source" },
    });
  });

  return events.sort((a, b) => a.primaryTime.getTime() - b.primaryTime.getTime());
}

function dayKey(d: Date, timeZone: string): string {
  const p = zonedParts(d, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function dayLabel(d: Date, timeZone: string): string {
  const sameYear = zonedParts(d, timeZone).year === zonedParts(new Date(), timeZone).year;
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone,
  });
}

type IndexedEvent = { event: UnifiedEvent; index: number };

function groupByDay(events: UnifiedEvent[], timeZone: string): { key: string; label: string; items: IndexedEvent[] }[] {
  const map = new Map<string, IndexedEvent[]>();
  events.forEach((event, index) => {
    const key = dayKey(event.primaryTime, timeZone);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ event, index });
  });
  return Array.from(map.entries())
    .map(([key, items]) => ({ key, label: dayLabel(items[0].event.primaryTime, timeZone), items }))
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

// Tooltip that opens on click/tap (hover doesn't exist on phones) and floats over the content
// around it. Closes on a second tap, a tap anywhere else, or Escape.
function ClickTip({
  trigger,
  triggerClassName,
  panelClassName,
  children,
}: {
  trigger: React.ReactNode;
  triggerClassName: string;
  panelClassName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={triggerClassName}>
        {trigger}
        <span aria-hidden className="ml-1.5 opacity-50">ⓘ</span>
      </button>
      {open && (
        <div
          role="tooltip"
          className={`absolute z-30 rounded-lg bg-gray-900 text-white text-xs leading-relaxed shadow-xl max-w-[calc(100vw-2rem)] ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function FogBadge({ fog }: { fog: FogAssessment | null }) {
  if (!fog) {
    return (
      <span className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap bg-gray-50 text-gray-400">
        Fog · Not available
      </span>
    );
  }

  const rows = [
    {
      label: "Temp–dew point spread",
      hint: "<2° favorable, <4° necessary",
      value: fog.inputs.spreadF != null ? `${fog.inputs.spreadF.toFixed(1)}°F` : "Not available",
      points: fog.spreadPoints,
    },
    {
      label: "Relative humidity",
      hint: ">95% favorable, >90% necessary",
      value: fog.inputs.relativeHumidity != null ? `${Math.round(fog.inputs.relativeHumidity)}%` : "Not available",
      points: fog.humidityPoints,
    },
    {
      label: "Wind speed",
      hint: "<5mph favorable, <10mph necessary",
      value: fog.inputs.windSpeedMph != null ? `${Math.round(fog.inputs.windSpeedMph)} mph` : "Not available",
      points: fog.windPoints,
    },
    {
      label: "Cloud cover",
      hint: "<20% favorable, <50% necessary",
      value: fog.inputs.cloudCoverPercent != null ? `${Math.round(fog.inputs.cloudCoverPercent)}%` : "Not available",
      points: fog.cloudPoints,
    },
  ];

  return (
    <ClickTip
      trigger={<>Fog · {fog.likelihood}</>}
      triggerClassName={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap cursor-pointer ${FOG_BADGE_COLORS[fog.likelihood]}`}
      panelClassName="left-0 top-full mt-1.5 w-72 p-3"
    >
      <p>{fog.reason}</p>
      <div className="mt-2 pt-2 border-t border-gray-700 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <span>
              {r.label}
              <span className="block text-gray-400 text-[10px]">{r.hint}</span>
            </span>
            <span className="font-semibold text-right whitespace-nowrap">
              {r.value}
              <span className="block text-gray-400 font-medium text-[10px]">{fogPointLabel(r.points)}</span>
            </span>
          </div>
        ))}
      </div>
    </ClickTip>
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

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
  weatherLoading,
  referenceTime,
  timeZone,
  onPinMove,
}: {
  event: UnifiedEvent;
  fog: FogAssessment | null;
  pinLat: number;
  pinLng: number;
  pointWeather: PointWeatherPair | null;
  weatherLoading: boolean;
  referenceTime: Date;
  timeZone: string;
  onPinMove: (lat: number, lng: number) => void;
}) {
  const hasMap = event.bearingDeg != null;
  const minutesAgo = Math.floor((referenceTime.getTime() - event.primaryTime.getTime()) / 60000);
  const justPassed = minutesAgo >= 0;
  const isSun = event.kind === "Sunrise" || event.kind === "Sunset";
  const isMoon = event.kind === "Moonrise" || event.kind === "Moonset";
  const potential = isMoon ? computeMoonPotential(pointWeather) : computePotential(pointWeather, fog);

  return (
    <div className={`border-t-[3px] ${justPassed ? "border-gray-300" : "border-indigo-500"} pt-4 h-full flex flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <EventIcon kind={event.kind} />
          <div className={`${SERIF} text-lg font-semibold text-gray-900 whitespace-nowrap`}>{event.headerLabel}</div>
          {event.moonIlluminationPercent != null && (
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
              {event.moonIlluminationPercent}% illum.
            </span>
          )}
        </div>
        {justPassed && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap bg-gray-900 text-white">
            Just passed · {minutesAgo < 1 ? "now" : `${minutesAgo} min ago`}
          </span>
        )}
      </div>
      {/* Fixed-height badge row (fog left, potential right) so every tile's
          content below starts at the same height, loaded or not. */}
      <div className="flex items-center justify-between gap-2 h-7 mt-2">
        <FogBadge fog={fog} />
        {potential ? (
          <ClickTip
            trigger={potential.label}
            triggerClassName={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap cursor-pointer ${POTENTIAL_BADGE_COLORS[potential.label]}`}
            panelClassName="right-0 top-full mt-1.5 w-56 p-2.5"
          >
            {potential.reason}
          </ClickTip>
        ) : (
          weatherLoading && <span className="text-xs text-gray-300 whitespace-nowrap">Potential…</span>
        )}
      </div>
      {(isSun || isMoon) && (
        <SkyScene
          body={isSun ? "sun" : "moon"}
          rising={event.kind === "Sunrise" || event.kind === "Moonrise"}
          moon={event.moonPhase}
          clouds={
            pointWeather
              ? { low: pointWeather.tip.cloudLow, mid: pointWeather.tip.cloudMid, high: pointWeather.tip.cloudHigh }
              : null
          }
          cloudsLoading={weatherLoading}
          bearingDeg={event.bearingDeg}
        />
      )}
      {event.timePoints && (
        <div className={`my-2 grid ${event.timePoints.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {event.timePoints.map((t, i) => (
            <div key={i} className="text-center px-1 min-w-0">
              <div className={`${SERIF} text-lg font-bold text-gray-900 tracking-tight truncate`}>{fmt(t.date, timeZone)}</div>
              <div className="text-[11px] leading-tight text-gray-400 mt-0.5 whitespace-nowrap">{t.label}</div>
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
      <div className="mt-auto pt-1 space-y-2">
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
          <div className="relative z-0 rounded-lg overflow-hidden">
            <EventMap pinLat={pinLat} pinLng={pinLng} bearingDeg={event.bearingDeg!} onPinMove={onPinMove} />
            <div className="absolute bottom-2 left-2 right-2 text-[10px] text-gray-500 bg-white/90 px-2 py-0.5 rounded-full whitespace-nowrap overflow-hidden text-ellipsis">
              Pin · arrow toward {eventDirectionLabel(event.kind)}, 20mi
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
  weatherLoading,
  referenceTime,
  timeZone,
  pinLat,
  pinLng,
  onPinMove,
  showDivider,
}: {
  label: string;
  items: IndexedEvent[];
  fogAssessments: (FogAssessment | null)[];
  pointWeatherByEvent: (PointWeatherPair | null)[];
  weatherLoading: boolean;
  referenceTime: Date;
  timeZone: string;
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
      weatherLoading={weatherLoading}
      referenceTime={referenceTime}
      timeZone={timeZone}
      onPinMove={onPinMove}
    />
  );

  return (
    <div className={`space-y-4 ${showDivider ? "pt-8 border-t border-gray-200" : ""}`}>
      <h3
        className={`${SERIF} text-2xl sm:text-3xl font-extrabold text-gray-900 text-center text-balance flex items-center gap-4 before:content-[''] before:flex-1 before:h-px before:bg-gray-200 after:content-[''] after:flex-1 after:h-px after:bg-gray-200`}
      >
        <span>{label}</span>
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

  // IANA zone of the pin; every time on the page is shown in it.
  const [timeZone, setTimeZone] = useState<string>(DEVICE_TIME_ZONE);
  // null = "now" (the default). Otherwise a wall-clock time ("YYYY-MM-DDTHH:mm")
  // read in the location's zone -- so "Oct 4, 6:00 AM" means 6 AM wherever the
  // pin is, even if the pin moves after it's set.
  const [customTime, setCustomTime] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeDraft, setTimeDraft] = useState("");
  const timePopoverRef = useRef<HTMLDivElement>(null);
  // The moment the current tiles were computed for ("just passed" is measured against it).
  const [referenceTime, setReferenceTime] = useState<Date>(() => new Date());

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

  function openTimePicker() {
    setTimeDraft(customTime ?? dateToWallTimeString(new Date(), timeZone));
    setTimeOpen((v) => !v);
  }

  function applyTimeDraft() {
    if (!wallTimeStringToDate(timeDraft, timeZone)) return;
    setCustomTime(timeDraft);
    setTimeOpen(false);
  }

  function resetToNow() {
    setCustomTime(null);
    setTimeOpen(false);
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
    if (!timeOpen) return;
    function handleClick(e: MouseEvent) {
      if (timePopoverRef.current && !timePopoverRef.current.contains(e.target as Node)) {
        setTimeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [timeOpen]);

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

    function loadEvents(lat: number, lng: number, tz: string) {
      setTimeZone(tz);
      // Window spans the next 4 sunrises + 4 sunsets after the reference time
      // (plus anything that crossed the horizon in the hour before it);
      // moon/celestial events are pulled in up through that same end point.
      const now = (customTime && wallTimeStringToDate(customTime, tz)) || new Date();
      setReferenceTime(now);
      const solar = getUpcomingSolarEvents(lat, lng, now);
      const windowEnd =
        solar.length > 0 ? solar[solar.length - 1].at : new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const moon = getUpcomingMoonEvents(lat, lng, windowEnd, now);
      const celestial = getUpcomingCelestialEvents(windowEnd, now, tz);

      setCometNote(celestial.find((e) => e.category === "Comet") ?? null);

      const combined = buildUnifiedEvents(lat, lng, solar, moon, celestial, tz);
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
    }

    // The zone is needed before anything else: it decides what instant a
    // custom wall-clock time means and which calendar day each event lands on.
    fetchTimeZone(lat, lng).then((tz) => {
      if (!cancelled) loadEvents(lat, lng, tz);
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, customTime]);

  const days = groupByDay(unifiedEvents, timeZone);
  const customDate = customTime ? wallTimeStringToDate(customTime, timeZone) : null;
  const zoneLabel = timeZoneAbbreviation(customDate ?? referenceTime, timeZone);
  const beyondForecast = unifiedEvents.some((e) => !isWithinForecastRange(e.primaryTime));

  return (
    <div className="max-w-[1040px] w-full mx-auto">
      <div className="flex flex-col items-center gap-2 border-b border-gray-200 pb-3.5 mb-8">
        <div className="flex items-center gap-2.5">
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
              <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-2.5 z-30">
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

          <div className="relative" ref={timePopoverRef}>
            <button
              onClick={openTimePicker}
              className={`flex items-center gap-1.5 border rounded-full pl-3 pr-2.5 py-1.5 text-sm font-medium ${
                customTime ? "border-amber-300 bg-amber-50 text-amber-800" : "border-indigo-200 bg-indigo-50 text-indigo-700"
              }`}
            >
              <ClockIcon className={`w-3.5 h-3.5 ${customTime ? "text-amber-600" : "text-indigo-500"}`} />
              {customDate ? fmtDateTime(customDate, timeZone) : "Now"}
              <ChevronDownIcon className={`w-2.5 h-2.5 ${customTime ? "text-amber-400" : "text-indigo-300"}`} />
            </button>

            {timeOpen && (
              <div className="absolute right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 top-[calc(100%+8px)] w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-2.5 z-30">
                <button
                  onClick={resetToNow}
                  className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-3 py-2 text-xs font-semibold mb-2"
                >
                  <ClockIcon className="w-3.5 h-3.5" />
                  Use now
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyTimeDraft();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="datetime-local"
                    value={timeDraft}
                    onChange={(e) => setTimeDraft(e.target.value)}
                    className="flex-1 min-w-0 border-2 border-indigo-500 rounded-lg px-2 py-1.5 text-xs text-gray-900 outline-none shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
                  />
                  <button
                    type="submit"
                    disabled={!timeDraft}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    Go
                  </button>
                </form>
                <p className="text-[10px] text-gray-400 mt-1.5 px-0.5 leading-snug">
                  Shows events from this moment on. Times are local to the location ({zoneLabel}).
                </p>
              </div>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400">
          {customDate
            ? `Photo planning, 4 sunrises & sunsets after ${fmtDateTime(customDate, timeZone)}`
            : "Photo planning, next 4 sunrises & sunsets"}
          {lat !== null && ` · times in ${zoneLabel}`}
        </span>
      </div>

      {lat === null && lng === null && !loading && (
        <p className="text-gray-400 text-sm text-center pt-4">Set a location above to see upcoming events.</p>
      )}

      {lat !== null && lng !== null && (
        <div className="space-y-0">
          {weatherLoading && <p className="text-gray-400 text-sm mb-8">Loading forecasts…</p>}
          {beyondForecast && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-8 text-center">
              Forecasts only reach about {FORECAST_FUTURE_LIMIT_DAYS} days ahead (and ~3 months back), so weather,
              fog, and cloud cover show as not available for some of these dates. Sun and moon times are still exact.
            </p>
          )}
          {days.map((day, i) => (
            <DayRow
              key={day.key}
              label={day.label}
              items={day.items}
              fogAssessments={fogAssessments}
              pointWeatherByEvent={pointWeatherByEvent}
              weatherLoading={weatherLoading}
              referenceTime={referenceTime}
              timeZone={timeZone}
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
