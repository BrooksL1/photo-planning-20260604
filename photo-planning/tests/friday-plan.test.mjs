import { strict as assert } from "node:assert";
import { test } from "node:test";
import load from "./tsLoader.cjs";
const { sessionFor, addDays, dayDiff, CHALLENGE_START, TAPER_START, REATTEMPT_DATES } = load("../../training plan/src/plan.ts");
const { movementBlocks } = load("../../training plan/src/fridayPlan.ts");

const accepted = [
  ["2026-11-20",50,8,5], ["2026-11-27",50,8,10],
  ["2026-12-04",60,8,10], ["2026-12-11",60,10,10],
  ["2026-12-18",60,10,15], ["2026-12-25",60,10,20],
  ["2027-01-01",60,12,20], ["2027-01-08",70,12,20],
  ["2027-01-15",70,12,25], ["2027-01-22",70,14,25],
  ["2027-01-29",70,14,30], ["2027-02-05",70,14,35],
  ["2027-02-19",80,16,50], ["2027-02-26",80,16,60],
  ["2027-03-05",80,18,60], ["2027-03-12",80,18,70],
  ["2027-03-19",80,18,80], ["2027-03-26",80,20,80],
  ["2027-04-02",100,20,100], ["2027-04-09",50,20,50],
];

test("public sessions match the accepted spreadsheet ladder, not the superseded rounds plan",()=>{
  for(const [date,volume,vest,block] of accepted) {
    const s=sessionFor(date), t=s.murphTargets;
    assert.equal(s.kind,"murph",date);
    assert.equal(s.miles,2,date);
    assert.deepEqual([t.pullups,t.pushups,t.squats,t.vest],[volume,volume*2,volume*3,vest],date);
    assert.equal(t.blocks.reduce((sum,n)=>sum+n,0),volume,date);
    assert.equal(Math.max(...t.blocks),block,date);
    assert.match(s.detail,/regular kipping pull-ups/,date);
    assert.match(s.detail,/small sets and rests are allowed/,date);
    assert.match(s.detail,/Planned quantities never certify completion or RX/,date);
  }
});

test("partial final blocks preserve exact totals and expose clear working sets",()=>{
  assert.deepEqual(movementBlocks(70,25),[25,25,20]);
  assert.deepEqual(movementBlocks(70,30),[30,30,10]);
  assert.deepEqual(movementBlocks(80,60),[60,20]);
  assert.deepEqual(movementBlocks(80,70),[70,10]);
  const s=sessionFor("2027-02-26");
  assert.match(s.detail,/1 × \(60 pull-ups \/ 120 push-ups \/ 180 squats\) \+ 1 × \(20 pull-ups \/ 40 push-ups \/ 60 squats\)/);
  assert.match(s.detail,/20 × 3 = 60 regular kipping pull-ups/);
  assert.match(s.detail,/6 × 3 \+ 1 × 2 = 20 regular kipping pull-ups/);
  assert.throws(()=>movementBlocks(80,0));
  assert.throws(()=>movementBlocks(80,-1));
});

test("full and half rehearsals use the new attempt date and preserve the explicit running prescription",()=>{
  assert.equal(CHALLENGE_START,"2027-04-18");
  assert.equal(TAPER_START,"2027-04-04");
  assert.deepEqual(REATTEMPT_DATES,["2027-05-09"]);
  assert.equal(dayDiff(CHALLENGE_START,"2027-04-02"),16);
  assert.equal(dayDiff(CHALLENGE_START,"2027-04-09"),9);
  const full=sessionFor("2027-04-02"),half=sessionFor("2027-04-09");
  assert.deepEqual(full.murphTargets.blocks,[100]);
  assert.deepEqual(half.murphTargets.blocks,[50]);
  assert.match(full.detail,/finish ALL pull-ups before ANY push-ups/);
  assert.match(half.detail,/20 lb vest throughout both miles and all calisthenics/);
  assert.match(half.detail,/Run 1 easy mile/);
  assert.match(half.detail,/50 regular kipping pull-ups, 100 clean push-ups and 150 air squats/);
  assert.match(half.detail,/do not chase a finish time/);
  assert.equal(sessionFor("2027-04-16").murphTargets,undefined);
  assert.equal(sessionFor("2027-04-16").murphMinutes,0);
});

test("trip handling preserves an equipped target with fallback while skiing cannot acquire vested work",()=>{
  const trip={id:"travel",title:"Away",start:"2026-12-18",end:"2026-12-18",kind:"travel",tentative:false};
  const s=sessionFor(trip.start,[trip]);
  assert.equal(s.murphTargets.pullups,60);
  assert.equal(s.murphTargets.vest,10);
  assert.match(s.detail,/If unavailable, use 8 × 10 unvested clean push-ups and 8 × 15 air squats/);
  const ski=sessionFor(trip.start,[{...trip,kind:"ski"}]);
  assert.equal(ski.murphMinutes,0);
  assert.equal(ski.miles,0);
  assert.equal(ski.murphTargets,undefined);
  assert.equal(sessionFor("2027-02-12").kind,"recovery");
  for(let date="2027-04-19";date<"2027-05-09";date=addDays(date,1)) {
    assert.ok((sessionFor(date).murphMinutes??0)<=10,date);
  }
});
