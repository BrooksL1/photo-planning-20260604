import { cookies } from "next/headers";
import { authorized, validKey, sameOrigin, privateHeaders } from "../../../lib/server/training";
export async function GET() { return Response.json({authenticated:await authorized(),configured:!!process.env.TRAINING_ACCESS_HASH},{headers:privateHeaders}); }
export async function POST(request:Request) {
  if(!sameOrigin(request)) return new Response(null,{status:403});
  const body=await request.text();
  if(body.length>1024) return new Response(null,{status:413});
  let key:unknown; try {key=JSON.parse(body).key;} catch {return new Response(null,{status:400});}
  if(typeof key!=="string" || !validKey(key)) return Response.json({error:"Invalid personal access link."},{status:401,headers:privateHeaders});
  (await cookies()).set("brooksl_training",key,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/training",maxAge:31536000});
  return Response.json({ok:true},{headers:privateHeaders});
}
export async function DELETE(request:Request) {
  if(!sameOrigin(request)) return new Response(null,{status:403});
  (await cookies()).set("brooksl_training","",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/training",maxAge:0});
  return Response.json({ok:true},{headers:privateHeaders});
}
