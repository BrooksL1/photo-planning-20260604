// Input is a private JSON file: {activities:[get_activities entries, with optional details]}.
// Run from repository root. Never put source exports or credentials in Git/public assets.
const fs=require('node:fs');
require('../photo-planning/tests/tsLoader.cjs');
const {validActivities}=require('../training plan/src/garmin.ts');
async function main() {
 const [inputFile,envFile]=process.argv.slice(2);
 if(!inputFile || !envFile) throw new Error('Usage: node scripts/import-garmin.cjs PRIVATE_INPUT_JSON PRIVATE_ENV_FILE');
 process.loadEnvFile(envFile);
 const {get,put}=await import('@vercel/blob');
 const input=JSON.parse(fs.readFileSync(inputFile,'utf8'));
 if(!Array.isArray(input.activities)) throw new Error('Expected activities array');
 const now=new Date().toISOString();
 const incoming=input.activities.filter(a=>!a.is_parent).map(a=>{
   const d=a.details??{}, f=d.fit_metrics?.session??{};
   const start=a.start_time_local??d.start_time_local??a.start_time_utc??d.start_time_utc;
   const date=a.date??d.date??(start?new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(start)):undefined);
   const hr=a.avg_hr??d.avg_hr_bpm??f.avg_heart_rate, max=a.max_hr??d.max_hr_bpm??f.max_heart_rate;
   return {id:String(a.activity_id),date,startTime:start,type:a.activity_type??d.activity_type??'OTHER',name:(a.activity_name??d.activity_name??'Garmin activity').slice(0,200),minutes:(a.duration_s??d.duration_s??f.total_timer_time??0)/60,miles:(a.distance_km??d.distance_km??(f.total_distance??0)/1000)/1.609344,device:a.device??d.data_source??'Garmin',...(hr!==undefined?{avgHr:hr}:{}),...(max!==undefined?{maxHr:max}:{}),...(d.fit_metrics?.subjective?.rpe!==undefined?{rpe:d.fit_metrics.subjective.rpe}:{}),importedAt:now};
 });
 if(!validActivities(incoming)) throw new Error('Invalid Garmin data; existing imports were not changed');
 const old=await get('training/garmin.json',{access:'private',useCache:false});
 const previous=old?.stream?await new Response(old.stream).json():{activities:[]};
 if(!validActivities(previous.activities))throw new Error('Existing import needs review');
 const activities=[...new Map([...previous.activities,...incoming].map(a=>[a.id,a])).values()];
 await put('training/garmin.json',JSON.stringify({version:1,syncedAt:now,activities}),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!!old,...(old?{ifMatch:old.blob.etag}:{}),cacheControlMaxAge:60});
 console.log(JSON.stringify({imported:incoming.length,total:activities.length,syncedAt:now}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
