import SunCalc from "suncalc";
import type { SkyKind } from "../SkyScene";

// What the "right now" sky image should show: the sun if it's up, else the
// moon if it's up, else nothing -- plus how far through its trip across the
// sky it is (0 = just rose, 1 = about to set) and a matching sky palette.

export type SkyNow = {
  body: "sun" | "moon" | "none";
  arc?: number;
  sky: SkyKind;
  moon?: { fraction: number; rotationDeg: number };
};

const STEP_MS = 5 * 60 * 1000;
const SEARCH_MS = 30 * 60 * 60 * 1000;
// Same standard moonrise/moonset altitude as moonEvents.ts (parallax-corrected).
const MOON_HORIZON_DEG = 0.13;

function moonAltDeg(t: number, lat: number, lng: number): number {
  return (SunCalc.getMoonPosition(new Date(t), lat, lng).altitude * 180) / Math.PI;
}

// Walk outward from now in 5-minute steps to the moon's last rise and next set.
function moonUpWindow(now: Date, lat: number, lng: number): { rise: number; set: number } | null {
  const t0 = now.getTime();
  let rise: number | null = null;
  for (let t = t0; t > t0 - SEARCH_MS; t -= STEP_MS) {
    if (moonAltDeg(t - STEP_MS, lat, lng) < MOON_HORIZON_DEG) {
      rise = t - STEP_MS / 2;
      break;
    }
  }
  let set: number | null = null;
  for (let t = t0; t < t0 + SEARCH_MS; t += STEP_MS) {
    if (moonAltDeg(t + STEP_MS, lat, lng) < MOON_HORIZON_DEG) {
      set = t + STEP_MS / 2;
      break;
    }
  }
  return rise != null && set != null ? { rise, set } : null;
}

export function skyNow(lat: number, lng: number, now: Date = new Date()): SkyNow {
  const t = now.getTime();
  const times = SunCalc.getTimes(now, lat, lng);
  const rise = times.sunrise.getTime();
  const set = times.sunset.getTime();

  if (!isNaN(rise) && !isNaN(set) && t >= rise && t <= set) {
    const arc = (t - rise) / (set - rise);
    return { body: "sun", arc, sky: arc < 0.08 ? "sunrise" : arc > 0.92 ? "sunset" : "day" };
  }

  // Sun is down: twilight colors within 6 deg of the horizon (west = evening).
  const sunPos = SunCalc.getPosition(now, lat, lng);
  const sunAltDeg = (sunPos.altitude * 180) / Math.PI;
  const sky: SkyKind = sunAltDeg > -6 ? (sunPos.azimuth > 0 ? "sunset" : "sunrise") : "night";

  if (moonAltDeg(t, lat, lng) > MOON_HORIZON_DEG) {
    const window = moonUpWindow(now, lat, lng);
    const illum = SunCalc.getMoonIllumination(now);
    const position = SunCalc.getMoonPosition(now, lat, lng);
    const brightLimbDeg = ((illum.angle - position.parallacticAngle) * 180) / Math.PI;
    return {
      body: "moon",
      arc: window ? (t - window.rise) / (window.set - window.rise) : 0.5,
      sky,
      moon: { fraction: illum.fraction, rotationDeg: -brightLimbDeg },
    };
  }

  return { body: "none", sky };
}
