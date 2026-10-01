import { useId } from "react";
import SunCalc from "suncalc";
import { moonLitPath } from "./SkyScene";
import { toCompassBearing } from "./lib/geo";

// Small "right now" weather icon: the sun (or moon, at its true phase) drawn
// where it actually is in the sky -- left = east, right = west, height =
// altitude -- with a weather glyph (cloud, rain, snow, fog, lightning) over it.

const W = 120;
const H = 72;
const HORIZON_Y = 60;
const BODY_R = 9;

type Glyph = "none" | "few" | "partly" | "overcast" | "fog" | "rain" | "snow" | "storm";

function glyphFor(code: number | null): Glyph {
  if (code == null || code === 0) return "none";
  if (code === 1) return "few";
  if (code === 2) return "partly";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "rain";
}

// Sky position as seen facing south: due east (90deg) at the left edge, due
// west (270deg) at the right, altitude 0-90deg mapped horizon-to-top. Bearings
// outside that half (a northeast summer sunrise) pin to the nearest edge.
function skyPosition(azimuthRad: number, altitudeRad: number): { x: number; y: number } {
  const bearing = toCompassBearing(azimuthRad);
  const frac = Math.max(0, Math.min(1, (bearing - 90) / 180));
  const altDeg = Math.max(0, (altitudeRad * 180) / Math.PI);
  return {
    x: 14 + frac * (W - 28),
    y: HORIZON_Y - BODY_R - (altDeg / 90) * (HORIZON_Y - 2 * BODY_R - 4),
  };
}

function Cloud({ x, y, scale, fill }: { x: number; y: number; scale: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={fill}>
      <circle cx={-7} cy={2} r={6} />
      <circle cx={1} cy={-3} r={8} />
      <circle cx={9} cy={2} r={6} />
      <rect x={-13} y={2} width={28} height={6} rx={3} />
    </g>
  );
}

export default function NowSky({
  lat,
  lng,
  at,
  weatherCode,
}: {
  lat: number;
  lng: number;
  at: Date;
  weatherCode: number | null;
}) {
  const uid = useId().replace(/:/g, "");
  const sun = SunCalc.getPosition(at, lat, lng);
  const sunAltDeg = (sun.altitude * 180) / Math.PI;
  const moonPos = SunCalc.getMoonPosition(at, lat, lng);
  const illum = SunCalc.getMoonIllumination(at);

  // Daytime shows the sun; otherwise the moon if it's up; otherwise just stars.
  const showSun = sun.altitude > 0;
  const showMoon = !showSun && moonPos.altitude > 0;
  const body = showSun ? skyPosition(sun.azimuth, sun.altitude) : showMoon ? skyPosition(moonPos.azimuth, moonPos.altitude) : null;
  const moonRotation = -(((illum.angle - moonPos.parallacticAngle) * 180) / Math.PI);

  const sky =
    sunAltDeg > 8
      ? ["#6fa3e0", "#a9cbef"]
      : sunAltDeg > -6
        ? ["#7a86c2", "#f2b183"]
        : ["#0c1330", "#2a3866"];
  const dark = sunAltDeg <= -6;
  const glyph = glyphFor(weatherCode);
  const cloudFill = dark
    ? "#8c95bd"
    : glyph === "storm"
      ? "#9aa1b2"
      : glyph === "rain" || glyph === "overcast"
        ? "#d6dae4"
        : "#ffffff";
  // Glyph sits over the body's lower right, but always high enough that rain,
  // snow, or lightning below the cloud clears the horizon.
  const gx = body ? Math.min(Math.max(body.x + 10, 26), W - 24) : W / 2;
  const gy = body ? Math.min(body.y + 6, HORIZON_Y - 28) : 30;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" aria-hidden>
      <defs>
        <linearGradient id={`now-sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
        <radialGradient id={`now-sun-${uid}`} cx="0.45" cy="0.4">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.6" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#ff9f43" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#now-sky-${uid})`} />
      {dark &&
        [
          [12, 10],
          [34, 22],
          [58, 8],
          [86, 18],
          [108, 9],
          [100, 36],
        ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.7} fill="#ffffff" opacity={0.7} />)}

      {showSun && body && (
        <g>
          <circle cx={body.x} cy={body.y} r={BODY_R + 7} fill="#fff3c4" opacity={0.35} />
          <circle cx={body.x} cy={body.y} r={BODY_R} fill={`url(#now-sun-${uid})`} />
        </g>
      )}
      {showMoon && body && (
        <g>
          <circle cx={body.x} cy={body.y} r={BODY_R} fill="#232c4f" stroke="#ffffff" strokeOpacity={0.2} strokeWidth={0.6} />
          <g transform={`translate(${body.x} ${body.y}) rotate(${moonRotation})`}>
            <path d={moonLitPath(illum.fraction, BODY_R)} fill="#f4f1e4" />
          </g>
        </g>
      )}

      {glyph === "few" && <Cloud x={gx + 4} y={gy + 2} scale={0.55} fill={cloudFill} />}
      {glyph === "partly" && <Cloud x={gx} y={gy} scale={0.8} fill={cloudFill} />}
      {(glyph === "overcast" || glyph === "rain" || glyph === "snow" || glyph === "storm") && (
        <>
          <Cloud x={gx - 12} y={gy - 4} scale={0.8} fill={cloudFill} />
          <Cloud x={gx + 6} y={gy} scale={1} fill={cloudFill} />
        </>
      )}
      {glyph === "rain" &&
        [-6, 2, 10].map((dx) => (
          <path key={dx} d={`M ${gx + dx} ${gy + 12} l -2 6`} stroke="#5b8bd6" strokeWidth={1.6} strokeLinecap="round" />
        ))}
      {glyph === "snow" &&
        [-6, 2, 10].map((dx) => <circle key={dx} cx={gx + dx} cy={gy + 15} r={1.6} fill="#ffffff" stroke="#7d93c4" strokeWidth={0.6} />)}
      {glyph === "storm" && (
        <path
          d={`M ${gx + 4} ${gy + 9} l -6 9 h 4 l -3 8 l 8 -11 h -4 l 3 -6 Z`}
          fill="#facc15"
          stroke="#854d0e"
          strokeWidth={0.7}
          strokeLinejoin="round"
        />
      )}
      {glyph === "fog" &&
        [30, 38, 46].map((y) => (
          <path key={y} d={`M 10 ${y} H ${W - 10}`} stroke={dark ? "#8c95bd" : "#ffffff"} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
        ))}

      <rect y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill={dark ? "#0a0e20" : "#3a3f55"} />
      <text x={4} y={H - 3} fontSize={7} fill="#ffffff" opacity={0.6}>E</text>
      <text x={W - 9} y={H - 3} fontSize={7} fill="#ffffff" opacity={0.6}>W</text>
    </svg>
  );
}
