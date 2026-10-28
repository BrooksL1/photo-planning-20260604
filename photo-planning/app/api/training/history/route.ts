import { readPrivate } from "../../../lib/server/training";
import { DEFAULT_SETTINGS, type Workout } from "../../../../../training plan/src/plan";
import { mergeGarmin } from "../../../../../training plan/src/garmin";
// Public by owner request. Do not expose travel, private notes, keys, or location traces.
export async function GET() {
  try {
    const [journal,garmin]=await Promise.all([readPrivate("training/journal.json"),readPrivate("training/garmin.json")]);
    const logs=mergeGarmin(journal.value?.logs??[],garmin.value?.activities??[],[],DEFAULT_SETTINGS).map((l:Workout)=>({
      id:l.id,date:l.date,title:l.title,kind:l.kind,status:l.status,minutes:l.minutes,miles:l.miles,pullups:l.pullups,pushups:l.pushups,squats:l.squats,vest:l.vest,strictMax:l.strictMax,weight:0,rpe:l.rpe,scaled:l.scaled,partition:l.partition,avgHr:l.avgHr,maxHr:l.maxHr,runMinutes:l.runMinutes,strengthMinutes:l.strengthMinutes,updatedAt:l.updatedAt,notes:"",garminIds:l.garminIds,garmin:l.garmin,
    }));
    return Response.json({logs,weights:garmin.value?.weights??[],weightSyncedAt:garmin.value?.weightSyncedAt??null,syncedAt:garmin.value?.syncedAt??null},{headers:{"Cache-Control":"no-store"}});
  } catch {return Response.json({error:"Workout history is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});}
}
