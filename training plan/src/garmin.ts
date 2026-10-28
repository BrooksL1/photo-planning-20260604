import { isDate, sessionFor, type GarminActivity, type Workout, type Trip, type Settings } from "./plan";
export function validActivities(value: unknown): value is GarminActivity[] {
  return Array.isArray(value) && value.length <= 10000 && value.every(a => a && typeof a.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(a.id) && isDate(a.date) && typeof a.startTime === "string" && Number.isFinite(Date.parse(a.startTime)) && typeof a.type === "string" && typeof a.name === "string" && a.name.length <= 200 && typeof a.device === "string" && typeof a.importedAt === "string" && ["minutes","miles"].every(k=>typeof a[k] === "number" && Number.isFinite(a[k]) && a[k]>=0) && ["avgHr","maxHr","rpe"].every(k=>a[k] === undefined || (typeof a[k] === "number" && Number.isFinite(a[k]) && a[k]>=0 && a[k]<=(k==="rpe"?10:250))));
}
export function activityKind(a: GarminActivity): Workout["kind"] {
  return /RUN/i.test(a.type) ? "run" : /STRENGTH|FITNESS_EQUIPMENT|TRAINING|CALISTHENICS/i.test(a.type) ? "strength" : "recovery";
}
// Stable activity IDs make replaying overlapping import windows idempotent.
// Manual values win; new source values remain visible for explicit review.
export function mergeGarmin(logs: Workout[], activities: GarminActivity[], trips: Trip[], settings: Settings): Workout[] {
  const result = logs.map(l=>({...l}));
  for (const a of activities) {
    const kind = activityKind(a);
    let index = result.findIndex(l=>l.garminIds?.includes(a.id));
    if (index < 0) {
      const candidates = result.map((l,i)=>({l,i})).filter(({l})=>l.date===a.date && l.kind===kind && !l.garminIds?.length && l.status!=="skipped");
      if (candidates.length===1) index=candidates[0].i;
    }
    if(index>=0) {
      const old=result[index];
      const measured = old.id === `garmin-${a.id}` && !old.updatedAt ? a : old;
      result[index]={...old, garminIds:[...new Set([...(old.garminIds??[]),a.id])],garmin:[...(old.garmin??[]).filter(g=>g.id!==a.id),a],
        minutes:measured.minutes,miles:measured.miles,avgHr:measured.avgHr??a.avgHr,maxHr:measured.maxHr??a.maxHr,rpe:measured.rpe??a.rpe??0,
        runMinutes:old.runMinutes||(kind==="run"?a.minutes:0), strengthMinutes:old.strengthMinutes||(kind==="strength"?a.minutes:0)};
    } else {
      const planned=sessionFor(a.date,trips,settings);
      result.push({id:`garmin-${a.id}`,date:a.date,title:a.name,kind,status:"modified",minutes:a.minutes,miles:a.miles,pullups:0,pushups:0,squats:0,vest:0,strictMax:0,weight:0,rpe:a.rpe??0,scaled:true,partition:"unpartitioned",avgHr:a.avgHr,maxHr:a.maxHr,runMinutes:kind==="run"?a.minutes:0,strengthMinutes:kind==="strength"?a.minutes:0,garminIds:[a.id],garmin:[a],notes:`Imported from Garmin. Review against: ${planned.title}. Completion, strength reps, vest, and RX status are not inferred.`});
    }
  }
  return result;
}
