import { addDays, type Session, type Workout } from "./plan";
export function sunday(date: string) {
  return addDays(date, -new Date(date + "T12:00:00Z").getUTCDay());
}
export function weeklyMiles(sessions: Session[], logs: Workout[]) {
  const dates = new Set(sessions.map(s => s.date));
  return {
    planned: sessions.reduce((sum, s) => sum + s.miles, 0),
    logged: logs.filter(l => dates.has(l.date) && l.status !== "skipped").reduce((sum, l) => sum + l.miles, 0),
  };
}
export type MorningForecast = { date: string; time: string; tempF: number | null; rain: number | null };
export type ForecastResponse = {
  timezone: string;
  hourly: { time: string[]; temperature_2m: (number | null)[]; precipitation_probability: (number | null)[] };
};
// Compare wall-clock times in the forecast location, including across DST.
export function nextMorningForecasts(data: ForecastResponse, morning: string, now = new Date()): MorningForecast[] {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:data.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const today = part("year") + "-" + part("month") + "-" + part("day");
  const first = part("hour") + ":" + part("minute") <= morning ? today : addDays(today, 1);
  const minutes = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3,5));
  return [first, addDays(first,1)].map(date => {
    let best = -1, gap = Infinity;
    data.hourly.time.forEach((time,i) => {
      const diff = Math.abs(minutes(time.slice(11,16))-minutes(morning));
      if(time.slice(0,10)===date && diff<gap) {best=i;gap=diff;}
    });
    const temp = best>=0 && gap<=60 ? data.hourly.temperature_2m[best] : null;
    const rain = best>=0 && gap<=60 ? data.hourly.precipitation_probability[best] : null;
    return {date,time:morning,tempF:typeof temp==="number" && Number.isFinite(temp)?temp:null,rain:typeof rain==="number" && rain>=0 && rain<=100?rain:null};
  });
}
