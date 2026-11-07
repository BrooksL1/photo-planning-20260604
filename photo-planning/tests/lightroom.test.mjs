import { test } from "node:test";
import { strict as assert } from "node:assert";
import load from "./tsLoader.cjs";
const { pairing, forgetPairing, localFetch, LOCAL_ENDPOINT } = load("../app/rank-photos/lib/lightroom.ts");
test("Lightroom pairing is removed from the URL and retained only for this tab", () => {
  const values = new Map(), token = "a".repeat(43); let cleaned = "";
  globalThis.location = {hash:"#lr="+token+"&port=8766",pathname:"/rank-photos",search:""};
  globalThis.history = {replaceState:(_a,_b,url)=>{cleaned=url}};
  globalThis.sessionStorage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  assert.equal(pairing(),token); assert.equal(cleaned,"/rank-photos");
  location.hash=""; assert.equal(pairing(),token); forgetPairing(); assert.equal(pairing(),"");
});
test("the website only contacts the fixed loopback endpoint with a bearer header", async () => {
  const original=globalThis.fetch, calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({ok:true})};
  try {
    await localFetch("b".repeat(43),"/status");
    assert.equal(calls[0].url,LOCAL_ENDPOINT+"/status");
    assert.equal(calls[0].options.targetAddressSpace,"loopback");
    assert.equal(calls[0].options.credentials,"omit");
    assert.equal(calls[0].options.headers.Authorization,"Bearer "+"b".repeat(43));
    assert.ok(!calls[0].url.includes("b".repeat(43)));
    await assert.rejects(localFetch("invalid","/commands",{}),/pair/);
    assert.equal(calls.length,1);
  } finally {globalThis.fetch=original}
});
test("a failed local command is never automatically retried", async () => {
  const original=globalThis.fetch;let count=0;
  globalThis.fetch=async()=>{count++;throw new Error("offline")};
  try {await assert.rejects(localFetch("c".repeat(43),"/commands",{operation:"apply"}),/Cannot reach Lightroom/);assert.equal(count,1)} finally {globalThis.fetch=original}
});
