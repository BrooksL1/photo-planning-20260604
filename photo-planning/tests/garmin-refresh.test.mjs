import { strict as assert } from "node:assert";
import { test } from "node:test";
import load from "./tsLoader.cjs";
const {requestGarminRefresh} = load("../app/lib/server/garminRefresh.ts");
const {mergePublicHistory,importAdvanced} = load("../../training plan/src/historyRefresh.ts");
const {sessionFor} = load("../../training plan/src/plan.ts");

function fixture() {
  let record = null, etag = null, calls = 0;
  const deps = {
    read: async path => path.endsWith("garmin.json") ? {value:{syncedAt:"2026-11-09T04:00:00Z",weightSyncedAt:"2026-11-09T04:00:00Z"},etag:"garmin"} : {value:record,etag},
    write: async (_path,value,match) => {if (match !== etag) throw new Error("Conflict");record=value;etag=String(Number(etag??0)+1);return {etag};},
    dispatch: async () => {calls++;}, now:()=>Date.parse("2026-11-09T13:00:00Z"), id:()=>"request-id",
  };
  return {deps, calls:()=>calls};
}
test("refresh claims persist before dispatch and concurrent requests queue one import",async()=>{
  const f=fixture();
  const results=await Promise.all([requestGarminRefresh("https://example.test/secret",f.deps),requestGarminRefresh("https://example.test/secret",f.deps)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);
  assert.equal(f.calls(),1);
  const repeated=await requestGarminRefresh("https://example.test/secret",f.deps);
  assert.equal(repeated.status,202);assert.equal(repeated.body.alreadyQueued,true);assert.equal(f.calls(),1);
  assert.ok(!JSON.stringify(repeated).includes("secret"));
});
test("unconfigured and offline imports report failure without changing Garmin data; offline can retry",async()=>{
  const f=fixture();
  assert.equal((await requestGarminRefresh(undefined,f.deps)).status,503);
  assert.equal(f.calls(),0);
  f.deps.dispatch=async()=>{throw new Error("URL includes private token");};
  const failed=await requestGarminRefresh("https://example.test",f.deps);
  assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes("private token"));
  f.deps.dispatch=async()=>{};
  assert.equal((await requestGarminRefresh("https://example.test",f.deps)).status,202);
});
test("a corrected import replaces stale automatic stats but keeps newer manual edits",()=>{
  const local=[{id:"garmin-1",minutes:20},{id:"manual",minutes:30,updatedAt:"2026-11-09T12:00:00Z"}];
  const remote=[{id:"garmin-1",minutes:21},{id:"manual",minutes:10,updatedAt:"2026-11-08T12:00:00Z"}];
  const merged=mergePublicHistory(local,remote);
  assert.equal(merged.length,2);assert.equal(merged[0].minutes,21);assert.equal(merged[1].minutes,30);
  assert.equal(importAdvanced("2026-11-09T13:00:00Z","2026-11-09T04:00:00Z"),true);
  assert.equal(importAdvanced("2026-11-09T04:00:00Z","2026-11-09T04:00:00Z"),false);
  assert.equal(importAdvanced(null,null),false);
});
test("new working sets reflect repeatability rather than failure totals; Friday preserves squat time",()=>{
  const monday=sessionFor("2026-11-16"),wednesday=sessionFor("2026-11-11"),friday=sessionFor("2026-11-20");
  assert.match(monday.detail,/5 × 3 = 15 strict pull-ups before 5 × 10 = 50 clean push-ups/);
  assert.match(monday.detail,/Rest 120–150 seconds/);assert.match(monday.detail,/90–120 seconds between push-up/);
  assert.match(wednesday.detail,/4 × 3 = 12 regular kipping pull-ups before 4 × 10 = 40 clean push-ups/);
  assert.match(friday.detail,/6 × 3 = 18 without vest/);assert.match(friday.detail,/5 × 10 = 50 without vest/);
  assert.match(friday.detail,/preserve time for squats/);assert.match(friday.detail,/Never transfer an unvested readiness result to vested work/);
  assert.equal(monday.miles,4.5);assert.equal(wednesday.miles,4.5);
  assert.match(sessionFor("2027-02-01").detail,/earned only after two comfortable exposures/);
});
