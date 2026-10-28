import { authorized, readPrivate, writePrivate, sameOrigin, privateHeaders } from "../../../lib/server/training";
import { validateLogs, validateTrips } from "../../../../../training plan/src/plan";
export async function GET() {
  if(!await authorized()) return new Response(null,{status:401,headers:privateHeaders});
  try {return Response.json(await readPrivate("training/journal.json"),{headers:privateHeaders});}
  catch {return Response.json({error:"Journal unavailable."},{status:503,headers:privateHeaders});}
}
export async function PUT(request:Request) {
  if(!sameOrigin(request) || !await authorized()) return new Response(null,{status:403,headers:privateHeaders});
  const text=await request.text(); if(text.length>2_000_000)return new Response(null,{status:413});
  let body; try {body=JSON.parse(text);} catch {return new Response(null,{status:400});}
  const d=body.value;
  if(!d || d.version!==1 || !validateLogs(d.logs) || !validateTrips(d.trips) || !d.settings || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.settings.morning) || !["unpartitioned","partitioned"].includes(d.settings.partition) || typeof d.settings.vestReady!=="boolean" || typeof d.settings.includeTentative!=="boolean" || !(body.etag===null || typeof body.etag==="string"))return new Response(null,{status:400});
  try {const result=await writePrivate("training/journal.json",d,body.etag);return Response.json({etag:result.etag},{headers:privateHeaders});}
  catch {return Response.json({error:"Cloud save failed or the journal changed on another device. Your local copy is kept. Refresh and review before saving again."},{status:409,headers:privateHeaders});}
}
