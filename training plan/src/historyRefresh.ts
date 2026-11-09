import type { Workout } from "./plan";

// Local manual edits win; automatically imported entries follow the newest
// server import, including Garmin corrections to an existing activity ID.
export function mergePublicHistory(local: Workout[], remote: Workout[]) {
  const records = new Map(local.map(log => [log.id, log]));
  for (const log of remote) {
    const previous = records.get(log.id);
    if (!previous?.updatedAt || (log.updatedAt ?? "") >= previous.updatedAt) records.set(log.id, log);
  }
  return [...records.values()];
}
export function importAdvanced(current: unknown, baseline: unknown) {
  return typeof current === "string" && Number.isFinite(Date.parse(current)) &&
    (typeof baseline !== "string" || Date.parse(current) > Date.parse(baseline));
}
