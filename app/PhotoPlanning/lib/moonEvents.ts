import SunCalc from "suncalc";
import type { MoonEvent } from "./types";
import { RECENT_WINDOW_MS } from "./solarEvents";

const SAMPLE_STEP_MS = 5 * 60 * 1000;

// Standard moonrise/moonset is NOT at 0deg geocentric altitude. Unlike the
// sun, the moon is close enough that parallax matters: an observer on
// Earth's surface sees it sitting lower than a hypothetical observer at
// Earth's center would, by close to the moon's horizontal parallax (~57')
// near the horizon. Net threshold = parallax(57') - refraction(34') -
// semidiameter(15.5') =~ +7.5' =~ +0.13deg geocentric altitude, not 0.
// Checking a literal 0deg crossing (as this file used to) misses that
// correction and produces meaningfully wrong times.
const MOON_STANDARD_ALTITUDE_DEG = 0.13;
const MOON_CLEARANCE_ALTITUDE_DEG = 3;

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

type Crossing = { angle: number; direction: "up" | "down"; date: Date };

// SunCalc has no "time at arbitrary angle" function for the moon, so this
// samples altitude every 5 minutes and linearly interpolates the precise
// crossing time whenever it crosses the standard or clearance angle.
function findCrossings(lat: number, lng: number, start: Date, end: Date): Crossing[] {
  const crossings: Crossing[] = [];
  let prevTime = start;
  let prevAlt = (SunCalc.getMoonPosition(prevTime, lat, lng).altitude * 180) / Math.PI;

  for (let t = start.getTime() + SAMPLE_STEP_MS; t <= end.getTime(); t += SAMPLE_STEP_MS) {
    const curTime = new Date(t);
    const curAlt = (SunCalc.getMoonPosition(curTime, lat, lng).altitude * 180) / Math.PI;

    for (const angle of [MOON_STANDARD_ALTITUDE_DEG, MOON_CLEARANCE_ALTITUDE_DEG]) {
      const prevDiff = prevAlt - angle;
      const curDiff = curAlt - angle;
      if (prevDiff === 0) continue;
      if ((prevDiff < 0 && curDiff >= 0) || (prevDiff > 0 && curDiff <= 0)) {
        const frac = prevDiff / (prevDiff - curDiff);
        const crossingMs = prevTime.getTime() + frac * (curTime.getTime() - prevTime.getTime());
        crossings.push({ angle, direction: curDiff > prevDiff ? "up" : "down", date: new Date(crossingMs) });
      }
    }

    prevTime = curTime;
    prevAlt = curAlt;
  }

  return crossings.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Pairs a rising standard->clearance crossing into "Moonrise", and a
// falling clearance->standard crossing into "Moonset".
function pairCrossings(crossings: Crossing[]): MoonEvent[] {
  const events: MoonEvent[] = [];
  const used = new Set<number>();

  crossings.forEach((c, i) => {
    if (used.has(i)) return;
    if (c.angle === MOON_STANDARD_ALTITUDE_DEG && c.direction === "up") {
      const partner = crossings.findIndex(
        (c2, j) => j > i && !used.has(j) && c2.angle === MOON_CLEARANCE_ALTITUDE_DEG && c2.direction === "up"
      );
      if (partner !== -1) {
        used.add(i);
        used.add(partner);
        events.push({
          kind: "Moonrise",
          times: [
            { label: "Moonrise", date: c.date },
            { label: "Clear of horizon (3°)", date: crossings[partner].date },
          ],
        });
      }
    } else if (c.angle === MOON_CLEARANCE_ALTITUDE_DEG && c.direction === "down") {
      const partner = crossings.findIndex(
        (c2, j) => j > i && !used.has(j) && c2.angle === MOON_STANDARD_ALTITUDE_DEG && c2.direction === "down"
      );
      if (partner !== -1) {
        used.add(i);
        used.add(partner);
        events.push({
          kind: "Moonset",
          times: [
            { label: "Approaching horizon (3°)", date: c.date },
            { label: "Moonset", date: crossings[partner].date },
          ],
        });
      }
    }
  });

  return events;
}

// The standard-altitude (true rise/set) time -- first for Moonrise, last for Moonset.
export function horizonCrossing(e: MoonEvent): Date {
  return e.kind === "Moonrise" ? e.times[0].date : e.times[1].date;
}

/**
 * Moonrise/moonset events (standard threshold + a 3deg "clear of horizon
 * clutter" marker) restricted to nighttime -- between evening
 * golden-hour-begin and the *next* morning's golden-hour-end -- and within
 * [now - 1h, windowEnd] (by horizon-crossing time, so a moonrise/moonset
 * that just happened still shows). Daytime moon events are intentionally excluded since
 * they're not photographable.
 */
export function getUpcomingMoonEvents(
  lat: number,
  lng: number,
  windowEnd: Date,
  now: Date = new Date()
): MoonEvent[] {
  const events: MoonEvent[] = [];
  const recentCutoff = now.getTime() - RECENT_WINDOW_MS;
  // Sample from further back than the cutoff so a moonset whose 3deg marker
  // precedes the cutoff still pairs up with its horizon crossing.
  const sampleFloor = recentCutoff - 2 * RECENT_WINDOW_MS;
  const spanDays = Math.ceil((windowEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  for (let dayOffset = -1; dayOffset <= spanDays; dayOffset++) {
    const eveningBase = new Date(now);
    eveningBase.setDate(eveningBase.getDate() + dayOffset);
    eveningBase.setHours(12, 0, 0, 0);
    const eveningTimes = SunCalc.getTimes(eveningBase, lat, lng);

    const morningBase = new Date(eveningBase);
    morningBase.setDate(morningBase.getDate() + 1);
    const morningTimes = SunCalc.getTimes(morningBase, lat, lng);

    const nightStart = eveningTimes.goldenHour;
    const nightEnd = morningTimes.goldenHourEnd;
    if (!isValidDate(nightStart) || !isValidDate(nightEnd)) continue;

    const sampleStart = new Date(Math.max(nightStart.getTime(), sampleFloor));
    const sampleEnd = new Date(Math.min(nightEnd.getTime(), windowEnd.getTime()));
    if (sampleStart >= sampleEnd) continue;

    const crossings = findCrossings(lat, lng, sampleStart, sampleEnd);
    events.push(...pairCrossings(crossings));
  }

  return events
    .filter((e) => horizonCrossing(e).getTime() > recentCutoff)
    .sort((a, b) => a.times[0].date.getTime() - b.times[0].date.getTime());
}
