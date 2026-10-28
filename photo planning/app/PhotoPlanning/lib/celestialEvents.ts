import type { CelestialEvent } from "./types";
import { DEVICE_TIME_ZONE, zonedParts, zonedTimeToDate } from "./timeZone";

// Hardcoded from NASA's eclipse decade tables (eclipse.gsfc.nasa.gov) --
// there is no free queryable eclipse API. Dates/regions are approximate;
// verify exact local contact times via the linked source. This list will
// need refreshing after ~2028.
const ECLIPSES: { date: string; title: string; detail: string }[] = [
  { date: "2026-02-17", title: "Annular Solar Eclipse", detail: "Visible from Antarctica, southern South America, South Africa" },
  { date: "2026-03-03", title: "Total Lunar Eclipse", detail: "Visible from the Pacific, Americas, and eastern Asia" },
  { date: "2026-08-12", title: "Total Solar Eclipse", detail: "Visible from Greenland, Iceland, and Spain" },
  { date: "2026-08-28", title: "Partial Lunar Eclipse", detail: "Visible from the Americas, Europe, and Africa" },
  { date: "2027-02-06", title: "Annular Solar Eclipse", detail: "Visible from South America and Antarctica" },
  { date: "2027-08-02", title: "Total Solar Eclipse", detail: "Visible from Morocco, Spain, Egypt, and Saudi Arabia" },
  { date: "2028-01-26", title: "Annular Solar Eclipse", detail: "Visible from South America, the Atlantic, and Africa" },
  { date: "2028-07-22", title: "Total Solar Eclipse", detail: "Visible from Australia and New Zealand" },
];
const ECLIPSE_SOURCE_URL = "https://eclipse.gsfc.nasa.gov/eclipse.html";

// Annual peaks recur on nearly the same calendar date every year -- confirmed
// against AMS/IMO, no API needed. Source: https://www.amsmeteors.org/calendar/
const METEOR_SHOWERS: { name: string; month: number; day: number }[] = [
  { name: "Quadrantids", month: 1, day: 3 },
  { name: "Lyrids", month: 4, day: 22 },
  { name: "Eta Aquariids", month: 5, day: 5 },
  { name: "Southern Delta Aquariids", month: 7, day: 30 },
  { name: "Perseids", month: 8, day: 12 },
  { name: "Orionids", month: 10, day: 21 },
  { name: "Southern Taurids", month: 11, day: 5 },
  { name: "Northern Taurids", month: 11, day: 12 },
  { name: "Leonids", month: 11, day: 17 },
  { name: "Geminids", month: 12, day: 13 },
  { name: "Ursids", month: 12, day: 22 },
];
const METEOR_SOURCE_URL = "https://www.amsmeteors.org/calendar/";

// No free or paid API answers "what comets are naked-eye visible right now"
// (checked JPL Horizons, JPL SBDB, theskylive.com, in-the-sky.org,
// astronomyapi.com, ipgeolocation.io). Rather than guess, say so plainly.
const COMET_NOTE: CelestialEvent = {
  category: "Comet",
  title: "Not available",
  detail:
    "No reliable live source for current naked-eye comet visibility exists. Check manually.",
  date: null,
  sourceUrl: "https://theskylive.com/comets",
};

// Noon on the peak date, in the location's zone.
function nextOccurrence(month: number, day: number, now: Date, timeZone: string): Date {
  const year = zonedParts(now, timeZone).year;
  let candidate = zonedTimeToDate({ year, month, day, hour: 12, minute: 0 }, timeZone);
  if (candidate < now) {
    candidate = zonedTimeToDate({ year: year + 1, month, day, hour: 12, minute: 0 }, timeZone);
  }
  return candidate;
}

/**
 * Eclipses and meteor shower peaks falling within [now, windowEnd], plus a
 * standing "not available" note for comets (see COMET_NOTE above for why).
 */
export function getUpcomingCelestialEvents(
  windowEnd: Date,
  now: Date = new Date(),
  timeZone: string = DEVICE_TIME_ZONE
): CelestialEvent[] {
  const events: CelestialEvent[] = [];

  for (const eclipse of ECLIPSES) {
    const date = new Date(`${eclipse.date}T12:00:00Z`);
    if (date >= now && date <= windowEnd) {
      events.push({
        category: "Eclipse",
        title: eclipse.title,
        detail: `${eclipse.detail}. Check source for exact local contact times.`,
        date,
        sourceUrl: ECLIPSE_SOURCE_URL,
      });
    }
  }

  for (const shower of METEOR_SHOWERS) {
    const date = nextOccurrence(shower.month, shower.day, now, timeZone);
    if (date >= now && date <= windowEnd) {
      events.push({
        category: "Meteor Shower",
        title: `${shower.name} peak`,
        detail: "Best viewed after midnight, away from light pollution.",
        date,
        sourceUrl: METEOR_SOURCE_URL,
      });
    }
  }

  events.push(COMET_NOTE);

  return events.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.getTime() - b.date.getTime();
  });
}
