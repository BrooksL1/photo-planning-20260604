import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { get, put } from "@vercel/blob";
export const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export function validKey(key: string) {
  const expected=process.env.TRAINING_ACCESS_HASH;
  if(!expected || !/^[a-f0-9]{64}$/.test(expected) || key.length>512) return false;
  return timingSafeEqual(createHash("sha256").update(key).digest(),Buffer.from(expected,"hex"));
}
export async function authorized() { return validKey((await cookies()).get("brooksl_training")?.value??""); }
export function sameOrigin(request: Request) {
  const origin=request.headers.get("origin");
  return origin === new URL(request.url).origin;
}
export async function readPrivate(path: string) {
  const result=await get(path,{access:"private",useCache:false});
  if(!result) return {value:null,etag:null};
  if(!result.stream) throw new Error("Missing blob content");
  return {value:await new Response(result.stream).json(),etag:result.blob.etag};
}
export async function writePrivate(path:string,value:unknown,etag:string|null) {
  return put(path,JSON.stringify(value),{access:"private",contentType:"application/json",addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),cacheControlMaxAge:60});
}
