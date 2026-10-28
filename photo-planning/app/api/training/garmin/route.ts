import { authorized, readPrivate, privateHeaders } from "../../../lib/server/training";
export async function GET() {
  if(!await authorized()) return new Response(null,{status:401,headers:privateHeaders});
  try { const {value}=await readPrivate("training/garmin.json"); return Response.json(value??{activities:[],syncedAt:null},{headers:privateHeaders}); }
  catch { return Response.json({error:"Garmin imports are temporarily unavailable."},{status:503,headers:privateHeaders}); }
}
