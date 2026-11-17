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
 assert.match(sessions[3].detail,/5 × 4 = 20 regular kipping/);
 assert.match(sessions[2].title,/intervals/);
 assert.match(sessions[4].title,/threshold/);
 assert.equal(sessions[5].kind,"murph");
 assert.equal(sessions[6].kind,"rest");
 assert.equal(weeklySummary(sessions,[],[],"2027-01-31").plannedMurphMinutes,105);
});

test("agreed rehearsal and half Murph survive the taper with truthful weekly targets",()=>{
 const full=sessionFor("2027-04-02"),half=sessionFor("2027-04-09");
 assert.deepEqual(full.murphTargets,{pullups:100,pushups:200,squats:300,vest:20,blocks:[100]});
 assert.deepEqual(half.murphTargets,{pullups:50,pushups:100,squats:150,vest:20,blocks:[50]});
 assert.equal(full.murphMinutes,55);
 assert.equal(half.murphMinutes,30);
 assert.match(full.rpe,/7–8/);
 assert.match(half.rpe,/6–7/);
 assert.match(half.detail,/20 lb vest throughout both miles and all calisthenics/);
 assert.equal(sessionFor("2027-02-12").murphMinutes,0);
 assert.equal(sessionFor("2027-04-16").murphMinutes,0);
 assert.match(sessionFor("2027-04-16").detail,/No calisthenics or vest/);
 assert.equal(sessionFor("2027-04-18").murphMinutes,57);
 assert.equal(sessionFor("2027-05-10").kind,"recovery");
 assert.equal(sessionFor("2027-05-11").miles,0);
});

test("normal weeks preserve running volume through April 3 and taper for the April 18 attempt",()=>{
 for(const [start,miles] of [["2027-03-07",32],["2027-03-14",32],["2027-03-21",30],["2027-03-28",32]]) {
  const sessions=week(start);
  assert.equal(sessions.reduce((sum,s)=>sum+s.miles,0),miles,start);
  assert.equal(sessions.filter(s=>/Tuesday intervals|Thursday threshold/.test(s.title)).length,2,start);
  assert.ok(sessions.every(s=>s.tag!=="Taper"),start);
 }
 for(const [start,miles,murph] of [["2027-04-04",25,60],["2027-04-11",19,30]]) {
  const sessions=week(start);
  assert.equal(weeklySummary(sessions,[],[],"2026-11-17").plannedMiles,miles,start);
  assert.equal(sessions.reduce((sum,s)=>sum+(s.murphMinutes??0),0),murph,start);
  assert.equal(sessions[0].attempt,undefined);
  assert.match(sessions[2].detail,/4 × 1 minute at RPE 7/);
 }
});

test("April 18, April 25, May 2 are the only attempts and May 9 is the sole flexible retry",()=>{
 assert.equal(sessionFor("2027-04-18").attempt,"Murph");
 assert.equal(sessionFor("2027-04-25").attempt,"5K");
 assert.equal(sessionFor("2027-05-02").attempt,"10K");
 const retry=sessionFor("2027-05-09");
 assert.equal(retry.attempt,undefined);
 assert.equal(retry.miles,5);
 assert.match(retry.detail,/open reattempt day for whichever goal is still unmet/);
 assert.doesNotMatch(retry.detail,/other reattempt day remains/);
 for(const d of ["2027-04-19","2027-04-20","2027-04-21"]) assert.equal(sessionFor(d).title,"Recover from Murph",d);
 for(let d="2027-04-19";d<"2027-05-09";d=addDays(d,1)) {
  const s=sessionFor(d);
  assert.ok((s.murphMinutes??0)<=10,d);
  if(!["2027-04-25","2027-05-02"].includes(d)) assert.equal(s.attempt,undefined,d);
 }
});

test("Sunday attempts replace long runs, Fridays stay easy, Saturdays rest and Mondays recover",()=>{
 for(const date of ["2027-04-23","2027-04-30","2027-05-07"]) {
  const s=sessionFor(date);
  assert.equal(s.murphMinutes,0,date);
  assert.equal(s.miles,{"2027-04-23":2,"2027-04-30":3,"2027-05-07":2}[date],date);
 }
 for(const date of ["2027-04-17","2027-04-24","2027-05-01","2027-05-08"]) assert.equal(sessionFor(date).kind,"rest",date);
 for(const date of ["2027-04-19","2027-04-26","2027-05-03","2027-05-10"]) {
  const s=sessionFor(date);
  assert.equal(s.kind,"recovery",date);
  assert.equal(s.miles,0,date);
  assert.equal(s.murphMinutes,0,date);
 }
 assert.equal(sessionFor("2027-04-25").miles,5/1.609344+2);
 assert.equal(sessionFor("2027-05-02").miles,10/1.609344+2);
 assert.equal(sessionFor("2027-04-18").miles,2);
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


test("routine travel and December retain two quality exposures without redundant cutbacks",()=>{
 for (const start of ["2026-11-08","2026-11-15","2026-11-22","2026-11-29","2026-12-06","2026-12-13","2026-12-20","2026-12-27","2027-01-03"]) {
  const sessions=week(start);
  assert.equal(sessions.filter(s=>/interval|threshold|assessment/i.test(s.title)).length,2,start);
  assert.ok(sessions.every(s=>s.kind!=="recovery"),start);
 }
 assert.equal(weeklySummary(week("2026-12-13"),[],[],"2026-11-08").plannedMiles,32);
 const travel=sessionFor("2026-11-24");
 assert.match(travel.detail,/Only with normal sleep/);
 assert.match(travel.detail,/otherwise keep all miles easy/);
 assert.equal(sessionFor("2026-11-29").miles,10);
 assert.equal(sessionFor("2026-11-30").murphMinutes,30);
});

test("post-ski running and vested work rebuild before peak practice",()=>{
 const totals=["2027-02-14","2027-02-21","2027-02-28","2027-03-07"].map(d=>weeklySummary(week(d),[],[],"2026-11-08").plannedMiles);
 assert.deepEqual(totals,[12,24,28,32]);
 for(const d of ["2027-02-16","2027-02-17"]){const s=sessionFor(d);assert.equal(s.miles,3);assert.match(s.detail,/No intervals, threshold or squats/);}
 assert.equal(sessionFor("2027-02-23").title,"Tuesday intervals");
 assert.equal(sessionFor("2027-03-02").title,"Measured 5K assessment");
 assert.equal(sessionFor("2027-02-05").murphTargets.vest,14);
 assert.equal(sessionFor("2027-02-26").murphTargets.vest,16);
 assert.equal(sessionFor("2027-03-19").murphTargets.vest,18);
 assert.match(sessionFor("2027-02-19").detail,/After reduced training, first repeat or reduce/);
 assert.equal(sessionFor("2027-03-21").miles,8);
});

test("attempt weeks retain easy aerobic work and include warm-up/cooldown miles",()=>{
 const totals=["2027-04-18","2027-04-25","2027-05-02"].map(d=>Number(weeklySummary(week(d),[],[],"2026-11-08").plannedMiles.toFixed(1)));
 assert.deepEqual(totals,[7,22.1,22.2]);
 for(const d of ["2027-04-25","2027-05-02"]) assert.match(sessionFor(d).detail,/1 easy warm-up mile and 1 easy cooldown mile/);
 for(const d of ["2027-04-27","2027-04-29","2027-05-04","2027-05-06"]) {
  const s=sessionFor(d);
  assert.equal(s.kind,"run",d);
  assert.ok(s.miles>=4,d);
  assert.match(s.rpe,/3–4/,d);
  assert.doesNotMatch(s.title,/interval|threshold/i,d);
 }
});

test("each weekly summary counts days and weeks left to May 11 from the week's last day",()=>{
 const first=weeklySummary(week("2026-11-08"),[],[],"2026-11-13");
 assert.equal(first.daysLeft,178);
 assert.equal(first.weeksLeft,25.4);
 assert.equal(weeklySummary(week("2027-05-02"),[],[],"2026-11-13").daysLeft,3);
 assert.equal(weeklySummary(week("2027-05-09"),[],[],"2026-11-13").daysLeft,0);
});
