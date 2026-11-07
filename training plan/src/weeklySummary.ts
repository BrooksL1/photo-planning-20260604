import { addDays, type Session, type Workout } from "./plan";
import { sunday } from "./calendar";
import { weeklyWeight, type WeightMeasurement } from "./weight";

// Keep completed summaries from the week before this feature was requested.
export const WEEK_RESULTS_START = "2026-10-25";

export function murphMinutes(log: Workout) {
  if (log.status === "skipped") return 0;
  const automatic = log.id.startsWith("garmin-") && !log.updatedAt;
  // An explicit manual split, including zero, takes precedence over source duration.
  if (!automatic && log.strengthMinutes !== undefined) return log.strengthMinutes;
  if (log.kind === "strength" || log.kind === "murph") return Math.max(0, log.minutes - (log.runMinutes ?? 0));
  const cardio = [...new Map((log.garmin ?? []).filter(a=>/CARDIO|STRENGTH|CALISTHENICS/i.test(a.type)).map(a=>[a.id,a])).values()];
  return cardio.reduce((sum,a)=>sum+a.minutes,0);
}

export function weeklySummary(sessions: Session[], logs: Workout[], weights: WeightMeasurement[], today: string) {
  const start = sessions[0].date, end = addDays(start,6), through = end < today ? end : today;
  const showResults = start >= WEEK_RESULTS_START && start <= sunday(today);
  const recorded = logs.filter(l=>l.date>=start && l.date<=through && l.status!=="skipped");
  const weight = weeklyWeight(start,weights.filter(w=>w.date<=through));
  return {
    start,end,showResults,
    status:start>sunday(today)?"Upcoming":end<today?"Week ended":"So far",
    plannedMiles:sessions.reduce((sum,s)=>sum+s.miles,0),
    plannedMurphMinutes:sessions.reduce((sum,s)=>sum+(s.murphMinutes??0),0),
    loggedMiles:recorded.filter(l=>l.kind==="run"||l.kind==="murph").reduce((sum,l)=>sum+l.miles,0),
    loggedMurphMinutes:recorded.reduce((sum,l)=>sum+murphMinutes(l),0),
    weightTarget:weight.target,weightAverage:weight.average,weighIns:weight.count,
  };
}
