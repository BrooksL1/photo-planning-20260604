// Time-zone helpers so every time on the page is shown in the *location's*
// zone, not the device's -- planning a trip from another zone should still
// read "sunrise 6:53 AM" in local terms.

export const DEVICE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const cache = new Map<string, Promise<string>>();

// IANA zone for a lat/lng via Open-Meteo's timezone=auto (a metadata-only
// request -- no variables asked for). Falls back to the device zone.
export function fetchTimeZone(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&timezone=auto&forecast_days=1`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (typeof data?.timezone === "string" ? data.timezone : DEVICE_TIME_ZONE))
      .catch(() => DEVICE_TIME_ZONE);
    cache.set(key, pending);
  }
  return pending;
}

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

export function zonedParts(date: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// Offset (ms) of the zone from UTC at a given instant.
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

// The instant at which the zone's wall clock reads the given time. Two
// passes handle a DST change between the first guess and the answer.
export function zonedTimeToDate(w: WallClock, timeZone: string): Date {
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  let result = naive - offsetMs(new Date(naive), timeZone);
  result = naive - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

// "YYYY-MM-DDTHH:mm" (the <input type="datetime-local"> format) <-> instants.
export function wallTimeStringToDate(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  return zonedTimeToDate({ year, month, day, hour, minute }, timeZone);
}

export function dateToWallTimeString(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// Short zone label for display, e.g. "MDT" or "GMT+9".
export function timeZoneAbbreviation(date: Date, timeZone: string): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? timeZone
  );
}
