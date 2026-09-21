import SunCalc from "suncalc";
import type { MoonEvent } from "./types";

const WINDOW_HOURS = 48;
const SAMPLE_STEP_MS = 5 * 60 * 1000;

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

type Crossing = { angle: 0 | 3; direction: "up" | "down"; date: Date };

// SunCalc has no "time at arbitrary angle" function for the moon, so this
// samples altitude every 5 minutes and linearly interpolates the precise
// crossing time whenever it crosses 0° or 3°.
function findCrossings(lat: number, lng: number, start: Date, end: Date): Crossing[] {
  const crossings: Crossing[] = [];
  let prevTime = start;
  let prevAlt = (SunCalc.getMoonPosition(prevTime, lat, lng).altitude * 180) / Math.PI;

  for (let t = start.getTime() + SAMPLE_STEP_MS; t <= end.getTime(); t += SAMPLE_STEP_MS) {
    const curTime = new Date(t);
    const curAlt = (SunCalc.getMoonPosition(curTime, lat, lng).altitude * 180) / Math.PI;

    for (const angle of [0, 3] as const) {
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

// Pairs a rising 0deg->3deg crossing into "Moonrise", and a falling
// 3deg->0deg crossing into "Moonset".
function pairCrossings(crossings: Crossing[]): MoonEvent[] {
  const events: MoonEvent[] = [];
  const used = new Set<number>();

  crossings.forEach((c, i) => {
    if (used.has(i)) return;
    if (c.angle === 0 && c.direction === "up") {
      const partner = crossings.findIndex(
        (c2, j) => j > i && !used.has(j) && c2.angle === 3 && c2.direction === "up"
      );
      if (partner !== -1) {
        used.add(i);
        used.add(partner);
        events.push({
          kind: "Moonrise",
          times: [
            { label: "Moonrise (0°)", date: c.date },
            { label: "Clear of horizon (3°)", date: crossings[partner].date },
          ],
        });
      }
    } else if (c.angle === 3 && c.direction === "down") {
      const partner = crossings.findIndex(
        (c2, j) => j > i && !used.has(j) && c2.angle === 0 && c2.direction === "down"
      );
      if (partner !== -1) {
        used.add(i);
        used.add(partner);
        events.push({
          kind: "Moonset",
          times: [
            { label: "Approaching horizon (3°)", date: c.date },
            { label: "Moonset (0°)", date: crossings[partner].date },
          ],
        });
      }
    }
  });

  return events;
}

/**
 * Moonrise/moonset events (each with 0deg and 3deg times) restricted to
 * nighttime -- between evening golden-hour-begin and the *next* morning's
 * golden-hour-end -- and within the next 48 hours. Daytime moon events are
 * intentionally excluded since they're not photographable.
 */
export function getUpcomingMoonEvents(lat: number, lng: number, now: Date = new Date()): MoonEvent[] {
  const windowEnd = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);
  const events: MoonEvent[] = [];

  for (let dayOffset = -1; dayOffset <= 2; dayOffset++) {
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

    const sampleStart = new Date(Math.max(nightStart.getTime(), now.getTime()));
    const sampleEnd = new Date(Math.min(nightEnd.getTime(), windowEnd.getTime()));
    if (sampleStart >= sampleEnd) continue;

    const crossings = findCrossings(lat, lng, sampleStart, sampleEnd);
    events.push(...pairCrossings(crossings));
  }

  return events.sort((a, b) => a.times[0].date.getTime() - b.times[0].date.getTime());
}
