import SunCalc from "suncalc";
import type { SolarEvent } from "./types";

// Enough candidate days to always have 8 future events (4 sunrise + 4
// sunset) available after filtering, with margin.
const CANDIDATE_DAYS = 6;

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * The next 4 Sunrise and next 4 Sunset occurrences (8 total, chronological),
 * each carrying its 3 chronological boundary times (Blue Hour Begins /
 * Sunrise / Golden Hour Ends, reversed for Sunset) for display context only
 * -- the actual weather lookup happens at the Sunrise/Sunset instant itself.
 * Sunrise/sunset strictly alternate, so the next 8 chronological events are
 * always exactly 4 of each.
 */
export function getUpcomingSolarEvents(lat: number, lng: number, now: Date = new Date()): SolarEvent[] {
  const candidates: SolarEvent[] = [];

  for (let dayOffset = 0; dayOffset <= CANDIDATE_DAYS; dayOffset++) {
    const base = new Date(now);
    base.setDate(base.getDate() + dayOffset);
    base.setHours(12, 0, 0, 0);
    const t = SunCalc.getTimes(base, lat, lng);

    if (isValidDate(t.sunrise) && isValidDate(t.dawn) && isValidDate(t.goldenHourEnd)) {
      candidates.push({
        kind: "Sunrise",
        at: t.sunrise,
        boundaryTimes: [
          { label: "Blue Hour Begins (-6°)", date: t.dawn },
          { label: "Sunrise", date: t.sunrise },
          { label: "Golden Hour Ends (+6°)", date: t.goldenHourEnd },
        ],
      });
    }

    if (isValidDate(t.sunset) && isValidDate(t.goldenHour) && isValidDate(t.dusk)) {
      candidates.push({
        kind: "Sunset",
        at: t.sunset,
        boundaryTimes: [
          { label: "Golden Hour Begins (+6°)", date: t.goldenHour },
          { label: "Sunset", date: t.sunset },
          { label: "Blue Hour Ends (-6°)", date: t.dusk },
        ],
      });
    }
  }

  return candidates
    .filter((c) => c.at > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 8);
}
