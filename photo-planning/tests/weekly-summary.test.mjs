import { strict as assert } from "node:assert";
import { test } from "node:test";
import load from "./tsLoader.cjs";
const {sessionFor,addDays,DEFAULT_SETTINGS,goalResults}=load("../../training plan/src/plan.ts");
const {mergeGarmin}=load("../../training plan/src/garmin.ts");
const {weeklySummary,murphMinutes}=load("../../training plan/src/weeklySummary.ts");
const week = start => Array.from({length:7},(_,i)=>sessionFor(addDays(start,i)));
const activity = {id:"cardio1",date:"2026-11-04",startTime:"2026-11-04T06:00:00-05:00",type:"CARDIO",name:"Cardio",minutes:24.05,miles:0,device:"fenix 7 Pro",importedAt:"2026-11-07T17:29:00Z"};
const cardio = () => mergeGarmin([],[activity],[],DEFAULT_SETTINGS)[0];

test("approved full week totals 32 miles with two quality runs and upper-body-first mornings",()=>{
 const sessions=week("2027-01-31");
 assert.deepEqual(sessions.map(s=>s.miles),[10,4.5,5.5,4.5,5.5,2,0]);
 assert.equal(sessions.reduce((sum,s)=>sum+s.miles,0),32);
 assert.match(sessions[1].detail,/5:30–6:00/);
 assert.equal(sessions[1].startTime,"05:30");
 assert.match(sessions[1].detail,/6 × 3 = 18 strict/);
 assert.match(sessions[3].detail,/6 × 4 = 24 regular kipping/);
 assert.match(sessions[2].title,/intervals/);
 assert.match(sessions[4].title,/threshold/);
 assert.equal(sessions[5].kind,"murph");
 assert.equal(sessions[6].kind,"rest");
 assert.equal(weeklySummary(sessions,[],[],"2027-01-31").plannedMurphMinutes,105);
});

test("rehearsal sets, recovery, taper and challenge replace ordinary load",()=>{
 const rehearsal=sessionFor("2027-03-19");
 assert.match(rehearsal.detail,/16 × 5 = 80 with 20 lb vest/);
 assert.match(rehearsal.detail,/32 × 5 = 160 with 20 lb vest/);
 assert.match(rehearsal.detail,/16 × 15 = 240 with 20 lb vest/);
 assert.equal(rehearsal.murphMinutes,60);
 assert.match(rehearsal.rpe,/5–6 initially, later 6–7/);
 assert.match(rehearsal.heartRate,/No HR target for calisthenics/);
 assert.equal(sessionFor("2027-03-21").miles,8);
 assert.equal(sessionFor("2027-02-12").murphMinutes,0);
 assert.equal(sessionFor("2027-03-29").murphMinutes,30);
 assert.equal(sessionFor("2027-03-29").miles,4.5);
 assert.equal(sessionFor("2027-04-12").murphMinutes,0);
 assert.equal(sessionFor("2027-04-12").miles,2.5);
 assert.equal(sessionFor("2027-05-04").murphMinutes,57);
 for(const date of ["2027-05-05","2027-05-06","2027-05-07"]) {
  assert.equal(sessionFor(date).kind,"recovery");
  assert.equal(sessionFor(date).murphMinutes,0);
 }
 assert.equal(sessionFor("2027-05-11").miles,0);
});

test("full pre-taper weeks retain 30–32 miles and taper blocks reduce volume on the new dates",()=>{
 for (const [start,miles] of [["2027-02-28",32],["2027-03-07",32],["2027-03-14",30],["2027-03-21",30],["2027-03-22",32]]) {
  const sessions=week(start);
  assert.equal(sessions.reduce((sum,s)=>sum+s.miles,0),miles,start);
  assert.equal(sessions.filter(s=>/Tuesday intervals|Thursday threshold/.test(s.title)).length,2,start);
  assert.ok(sessions.every(s=>s.tag!=="Taper"),start);
 }
 assert.equal(sessionFor("2027-03-26").murphMinutes,50);
 assert.match(sessionFor("2027-03-26").detail,/13 × 5 = 65 with 20 lb vest/);
 for (const [start,miles,murph] of [["2027-03-30",25,50],["2027-04-06",19,25]]) {
  const sessions=week(start);
  assert.equal(sessions.reduce((sum,s)=>sum+s.miles,0),miles,start);
  assert.equal(sessions.reduce((sum,s)=>sum+(s.murphMinutes??0),0),murph,start);
  assert.equal(sessions[0].attempt,undefined);
  assert.match(sessions[0].detail,/4 × 1 minute at RPE 7/);
 }
 // Calendar rows retain Sunday–Saturday totals even though taper blocks start Tuesday.
 assert.equal(weeklySummary(week("2027-03-28"),[],[],"2026-11-07").plannedMiles,29);
 assert.equal(weeklySummary(week("2027-04-04"),[],[],"2026-11-07").plannedMiles,23);
});

test("flex week is not a mandatory fourth attempt and the final Murph taper removes substantial calisthenics",()=>{
 assert.equal(sessionFor("2027-04-13").attempt,"5K");
 assert.equal(sessionFor("2027-04-20").attempt,"10K");
 const flex=sessionFor("2027-04-27");
 assert.equal(flex.attempt,undefined);
 assert.equal(flex.miles,3);
 assert.match(flex.detail,/retry of ONE missed running goal/);
 assert.match(sessionFor("2027-04-28").detail,/replace this run with 20–30 minutes walking/);
 assert.equal(sessionFor("2027-04-11").miles,4);
 assert.equal(sessionFor("2027-04-18").miles,3);
 assert.equal(sessionFor("2027-05-02").miles,3);
 assert.equal(sessionFor("2027-04-23").murphMinutes,40);
 assert.match(sessionFor("2027-04-23").detail,/ALL 50 regular kipping pull-ups \(10 × 5\)/);
 for (let d="2027-04-25";d<"2027-05-04";d=addDays(d,1)) {
  const s=sessionFor(d);
  assert.ok((s.murphMinutes??0)<=10,d);
  assert.equal(s.attempt,undefined,d);
 }
});

test("Garmin Cardio counts measured minutes without claiming reps or RX; replay updates time once",()=>{
 const first=cardio();
 assert.equal(first.kind,"strength");
 assert.equal(murphMinutes(first),24.05);
 assert.equal(first.pullups,0);
 assert.equal(first.vest,0);
 assert.equal(first.status,"modified");
 assert.equal(goalResults([first]).murph,undefined);
 const old={...first,kind:"recovery",strengthMinutes:0};
 const updated=mergeGarmin([old],[{...activity,minutes:25}],[],DEFAULT_SETTINGS);
 assert.equal(updated.length,1);
 assert.equal(updated[0].kind,"strength");
 assert.equal(murphMinutes(updated[0]),25);
 const manual={...updated[0],updatedAt:"2026-11-07T18:00:00Z",strengthMinutes:12};
 const corrected=mergeGarmin([manual],[activity],[],DEFAULT_SETTINGS)[0];
 assert.equal(murphMinutes(corrected),12);
 assert.equal(murphMinutes({...corrected,strengthMinutes:0}),0);
});

test("weekly results count running and Murph once, exclude skipped/future records and use measured weight only",()=>{
 const c=cardio();
 const run={...c,id:"manual-run",kind:"run",garmin:[],garminIds:[],date:"2026-11-02",minutes:50,miles:4.5,strengthMinutes:10,runMinutes:40};
 const logs=[c,run,{...run,id:"future",date:"2026-11-06",miles:100,strengthMinutes:100},{...run,id:"skipped",date:"2026-11-03",miles:100,status:"skipped"},{...c,id:"cycling",kind:"recovery",garmin:[],miles:50,strengthMinutes:0}];
 const weights=[{id:"w1",date:"2026-11-03",measuredAt:"2026-11-03T05:00:00Z",pounds:197},{id:"w2",date:"2026-11-06",measuredAt:"2026-11-06T05:00:00Z",pounds:193}];
 const result=weeklySummary(week("2026-11-01"),logs,weights,"2026-11-04");
 assert.equal(result.status,"So far");
 assert.equal(result.showResults,true);
 assert.equal(result.loggedMiles,4.5);
 assert.equal(result.loggedMurphMinutes,34.05);
 assert.equal(result.weightAverage,197);
 assert.equal(result.weighIns,1);
 assert.equal(result.weightTarget,195);
 assert.equal(result.plannedMiles,22);
 assert.equal(weeklySummary(week("2026-10-25"),[],[],"2026-11-07").status,"Week ended");
 assert.equal(weeklySummary(week("2026-10-25"),[],[],"2026-11-07").showResults,true);
 assert.equal(weeklySummary(week("2026-10-18"),[],[],"2026-11-07").showResults,false);
 const future=weeklySummary(week("2026-11-08"),[],[],"2026-11-07");
 assert.equal(future.showResults,false);
 assert.equal(future.status,"Upcoming");
 assert.equal(future.weightAverage,null);
});
