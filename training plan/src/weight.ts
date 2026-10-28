import { addDays, dayDiff, isDate } from "./plan";
import { sunday } from "./calendar";
export type WeightMeasurement = { id: string; date: string; measuredAt: string; pounds: number };
export function validWeights(value: unknown): value is WeightMeasurement[] {
  return Array.isArray(value) && value.length<=20000 && value.every(w=>w && typeof w.id==="string" && isDate(w.date) && typeof w.measuredAt==="string" && Number.isFinite(Date.parse(w.measuredAt)) && typeof w.pounds==="number" && Number.isFinite(w.pounds) && w.pounds>0 && w.pounds<1500);
}
export function normalizeWeights(raw: unknown): WeightMeasurement[] {
  if(!Array.isArray(raw)) throw new Error("Expected Garmin body measurements array");
  return raw.filter(w=>w.weight_kg!==null && w.weight_kg!==undefined).map(w=>{
    if(!isDate(w.date) || typeof w.weight_kg!=="number" || !Number.isFinite(w.weight_kg) || w.weight_kg<=0 || typeof w.measurement_time_utc!=="string" || !Number.isFinite(Date.parse(w.measurement_time_utc))) throw new Error("Invalid Garmin weight measurement");
    const measuredAt=new Date(w.measurement_time_utc).toISOString();
    return {id:measuredAt,date:w.date,measuredAt,pounds:w.weight_kg/0.45359237};
  });
}
export function mergeWeights(previous: WeightMeasurement[], incoming: WeightMeasurement[]) {
  return [...new Map([...previous,...incoming].map(w=>[w.id,w])).values()].sort((a,b)=>a.measuredAt.localeCompare(b.measuredAt));
}
export function weeklyWeight(date: string, measurements: WeightMeasurement[]) {
  const start=sunday(date),end=addDays(start,6);
  const weeks=dayDiff(start,"2026-10-25")/7;
  const entries=measurements.filter(w=>w.date>=start && w.date<=end);
  return {target:weeks>=0?196-weeks:null,average:entries.length?entries.reduce((sum,w)=>sum+w.pounds,0)/entries.length:null,count:entries.length,end};
}
