import SunCalc from "suncalc";
import type { SolarEvent } from "./types";

// How far back a horizon crossing still counts as "just happened" and gets a tile.
export const RECENT_WINDOW_MS = 60 * 60 * 1000;

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
 * always exactly 4 of each. Any event whose horizon crossing fell within
 * the last hour (RECENT_WINDOW_MS) is prepended on top of those 8.
 */
export function getUpcomingSolarEvents(lat: number, lng: number, now: Date = new Date()): SolarEvent[] {
  const candidates: SolarEvent[] = [];

  for (let dayOffset = -1; dayOffset <= CANDIDATE_DAYS; dayOffset++) {
    const base = new Date(now);
    base.setDate(base.getDate() + dayOffset);
    base.setHours(12, 0, 0, 0);
    const t = SunCalc.getTimes(base, lat, lng);

    if (isValidDate(t.sunrise) && isValidDate(t.dawn) && isValidDate(t.goldenHourEnd)) {
      candidates.push({
        kind: "Sunrise",
        at: t.sunrise,
        boundaryTimes: [
          { label: "Begin Blue −6°", date: t.dawn },
          { label: "Sunrise", date: t.sunrise },
          { label: "End Golden +6°", date: t.goldenHourEnd },
        ],
      });
    }

    if (isValidDate(t.sunset) && isValidDate(t.goldenHour) && isValidDate(t.dusk)) {
      candidates.push({
        kind: "Sunset",
        at: t.sunset,
        boundaryTimes: [
          { label: "Begin Golden +6°", date: t.goldenHour },
          { label: "Sunset", date: t.sunset },
          { label: "End Blue −6°", date: t.dusk },
        ],
      });
    }
  }

  const sorted = candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  const recent = sorted.filter((c) => c.at <= now && c.at.getTime() > now.getTime() - RECENT_WINDOW_MS);
  const upcoming = sorted.filter((c) => c.at > now).slice(0, 8);
  return [...recent, ...upcoming];
}
