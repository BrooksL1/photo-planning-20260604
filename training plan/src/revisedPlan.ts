import type { Session, Settings } from "./plan";
import { ATTEMPTS, BIRTHDAY, CHALLENGE_START, FLEX_DATE, TAPER_START } from "./challenge";

export const REVISED_START = "2026-11-07";
export const SMOOTH_START = "2026-11-08";
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);
const weekday = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
// Public workload adjustments contain no calendar locations, titles, or travel records.
const maintenance = [["2026-11-12", "2026-11-13"], ["2026-11-24", "2026-11-28"], ["2026-12-07", "2026-12-08"], ["2026-12-27", "2027-01-02"], ["2027-01-21", "2027-01-24"]];
const recovery = [["2027-01-11", "2027-01-14"], ["2027-02-09", "2027-02-15"]];
type Friday = { vest: number[]; body: number[]; minutes: number };
const fridays: Record<string, Friday> = {
  "2026-11-20": {vest:[0,0,0],body:[18,50,90],minutes:30},
  "2026-12-04": {vest:[0,0,0],body:[24,60,120],minutes:30},
  "2026-12-11": {vest:[0,0,0],body:[30,70,120],minutes:30},
  "2026-12-18": {vest:[5,20,30],body:[25,40,60],minutes:30},
  "2026-12-25": {vest:[10,20,30],body:[30,60,90],minutes:35},
  "2027-01-08": {vest:[15,30,45],body:[25,50,75],minutes:35},
  "2027-01-29": {vest:[25,50,75],body:[25,50,75],minutes:40},
  "2027-02-05": {vest:[35,70,105],body:[25,50,75],minutes:45},
  "2027-02-19": {vest:[0,0,0],body:[20,40,60],minutes:20},
  "2027-02-26": {vest:[25,50,75],body:[15,30,45],minutes:35},
  "2027-03-05": {vest:[35,70,105],body:[25,50,75],minutes:45},
  "2027-03-12": {vest:[50,100,150],body:[25,50,75],minutes:50},
  "2027-03-19": {vest:[65,130,195],body:[25,50,75],minutes:60},
  "2027-03-26": {vest:[80,160,240],body:[20,40,60],minutes:60},
  "2027-04-02": {vest:[65,130,195],body:[15,30,45],minutes:50},
  "2027-04-09": {vest:[0,0,0],body:[20,40,60],minutes:20},
  "2027-04-16": {vest:[0,0,0],body:[6,20,0],minutes:10},
};
const sets = (total: number, size: number) => `${Math.floor(total / size)} × ${size}${total % size ? ` + 1 × ${total % size}` : ""} = ${total}`;
const easy = "RPE 3–4, around 135–145 bpm with full-sentence conversation. Slow or walk hills if effort rises; 155 bpm at RPE 6 is too hard for an easy run.";
const baseline = "November 9 baseline: strict unvested pull-up sets 7/4/3/3/4 with 90-second rests (21 total; last set to failure), and push-up sets 15/15/15/15/10 with 60-second rests (70 total; near failure). These are demanding test totals, not repeatable working-set targets. Keep working effort around RPE 6–7; HR is not a calisthenics rep target. Rest until breathing settles and rep quality returns. ";
const reserve = "Keep at least 2–3 clean reps in reserve. Advance only after two comfortable exposures with normal recovery. Otherwise repeat or reduce the previous dose. Reps use full range: chin above the bar and full elbow extension; chest to floor, straight body, full push-up lockout.";
const returnMiles: Record<string, number> = {
  "2027-01-17":6, "2027-01-18":3.5, "2027-01-19":4.5, "2027-01-20":4,
  "2027-02-18":4, "2027-02-21":6, "2027-02-22":3.5, "2027-02-23":4.5,
  "2027-02-24":3.5, "2027-02-25":4.5, "2027-02-28":8,
  "2027-03-01":4, "2027-03-02":5, "2027-03-03":4, "2027-03-04":5,
};

function challengeSession(original: Session): Session {
  const {date} = original, dow = weekday(date);
  if (original.attempt) return {...original, miles:original.miles+(original.attempt === "Murph"?0:2),murphMinutes:original.attempt === "Murph" ? 57 : 0,
    detail: original.attempt === "Murph" ? "Allow about 75 minutes including preparation. Timed goal: 57:00. In a 20 lb vest: run 1 mile, complete all 100 regular kipping pull-ups, all 200 clean push-ups, all 300 air squats, then run 1 mile. Small sets and rests within each movement are allowed. Attempt only after repeatable vested practice and normal recovery; otherwise log a scaled rehearsal. No butterfly pull-ups assumed. Record the actual run and calisthenics time when available; no fixed movement split is established by your historical recording." : original.detail+" The calendar mileage target includes 1 easy warm-up mile and 1 easy cooldown mile in addition to the measured attempt. Record the timed segment separately from these easy miles when assessing the goal."};
  if (original.trip || original.tag === "Re-entry" || original.title === "Recover from Murph") return {...original, murphMinutes:0};
  if (ATTEMPTS.some(a=>a.goal!=="Murph" && daysBetween(date,a.date)===1) || daysBetween(date,FLEX_DATE)===1) return {...original,kind:"recovery",miles:0,minutes:25,murphMinutes:0,tag:"Post-attempt recovery",title:"Recovery · walking and mobility",detail:"Recover from Sunday's running attempt or flexible training day. Walk and mobilize gently; no make-up work. Resume easy running only when soreness and effort are normal."};
  if (date === "2027-04-28") return {...original,kind:"murph",miles:2,minutes:62,murphMinutes:40,tag:"Murph maintenance",title:"Controlled partial Murph · readiness rehearsal",
    detail:`One unvested easy mile, then up to 40 minutes of sequential calisthenics, then one unvested easy mile. Only if recovered from the 10K and prior vested doses were comfortable: with a 20 lb vest, complete ALL 50 regular kipping pull-ups (up to 10 × 5 only if that vested set size is already repeatable; otherwise sets of 2–3 within the time cap), THEN ALL 100 clean push-ups (20 × 5), THEN ALL 150 air squats (10 × 15). Rest 90–120 seconds for pulls, 60–90 for pushes, and 20–40 for squats; stop at the time cap even if fewer reps are completed. RPE 5–6; no race against the clock, no failure, and no extra reps. This is the last substantial calisthenics session, 11 days before Murph. If still sore or planning a May 2 running retry, replace it with 10 minutes unvested technique: 3 × 2 strict pull-ups, then 2 × 10 clean push-ups, resting 60–90 seconds, and no squats. Record actual Cardio minutes. ${easy} ${reserve}`};
  if (date === FLEX_DATE) return {...original,kind:"run",miles:5,minutes:55,murphMinutes:0,tag:"Flexible week",title:"Flexible day · easy run or optional running retry",
    detail:`Default: 5 easy miles, ${easy} An optional retry of ONE missed running goal can replace this run only with normal recovery, a suitable route and weather, and no substantial April 28 Murph work. Choose 5K at 7:00/mile (about 21:45) or 10K in 45:00 (about 7:15/mile); warm up 10–15 minutes with 4 relaxed strides, then cool down 10 minutes. Do not attempt both. The calendar mileage target assumes the easy run; log actual work if you retry. May 3 is walking and mobility; after a retry, keep May 4–8 easy, with no calisthenics, and shorten runs if recovery is incomplete. If not ready, use this week for recovery; no Murph retry is scheduled.`};
  const maintenanceMiles: Record<string,number> = {"2027-04-20":5,"2027-04-21":4.5,"2027-04-22":4.5,"2027-04-23":3,"2027-04-27":4.5,"2027-04-29":4.5,"2027-04-30":4,"2027-05-04":4.5,"2027-05-05":4,"2027-05-06":3.5,"2027-05-07":2};
  const miles = maintenanceMiles[date] ?? (dow === 5 ? 2 : 3);
  const technique = ["2027-04-21","2027-05-05"].includes(date);
  return {...original,kind:"run",miles,minutes:Math.ceil(miles*11)+(technique?10:0),murphMinutes:technique?10:0,tag:"Challenge maintenance",
    title:technique ? "Easy run + light upper-body technique" : "Easy maintenance run",
    detail:`${miles} easy miles. ${easy} ${technique ? "Optional 10 minutes unvested technique including preparation: 3 × 2 strict pull-ups, then 2 × 10 clean push-ups; rest 60–90 seconds, RPE at most 5, with at least 3 clean reps in reserve. No squats, vest, butterfly work or failure. Skip if soreness remains or if you attempted a running retry on May 2." : "No threshold or additional interval workout; Sunday attempts replace quality sessions."} ${dow === 5 ? "No Murph practice this Friday; Saturday is rest before Sunday's attempt or flexible day." : ""} ${date >= "2027-04-29" ? "Final Murph taper: no substantial calisthenics in the final 7–10 days. Resume running after Murph only when soreness and easy effort are normal; otherwise walk." : ""}`};
}

export function revisedSession(original: Session, settings: Settings): Session {
  const date = original.date, dow = weekday(date);
  if (date < REVISED_START || date >= BIRTHDAY || dow === 6) return {...original, murphMinutes:0};
  if (date >= CHALLENGE_START) return challengeSession(original);
  const returning = date in returnMiles, taper = date >= TAPER_START;
  let miles = [10,4.5,5.5,4.5,5.5,2,0][dow];
  if (dow === 0 && ["2026-11-08","2026-11-22","2027-03-21","2027-03-28"].includes(date)) miles = 8;
  if (date === "2026-12-06") miles = 9;
  if (returning) miles = returnMiles[date];
  if (taper) miles = (daysBetween(date,TAPER_START) < 7 ? [7,3.5,4.5,3.5,4.5,2,0] : [4,2.5,4,3,3.5,2,0])[dow];
  let s: Session = {...original,kind:"run",miles,minutes:Math.ceil(miles * 11),murphMinutes:0,tag:taper?"Taper":returning?"Gradual return":"Revised morning plan"};
  if (dow === 0) s = {...s,title:"Sunday long easy run",detail:`${miles} easy miles. ${easy} No fast finish. Shorter Sundays support the largest Friday rehearsals. Fuel and drink for the longer morning.`};
  else if (dow === 1 || dow === 3) {
    const initial = date < "2026-11-30" || (date >= "2027-02-08" && date < "2027-02-22");
    const specific = date >= "2027-02-22";
    const recalibrated = date > "2026-11-09";
    const building = date >= "2026-12-14" && !specific && !initial;
    const pullSets = taper ? 3 : recalibrated ? (specific ? (dow === 1 ? 5 : 4) : building ? (dow === 1 ? 6 : 5) : dow === 1 ? 5 : 4) : specific ? 5 : 6;
    const pullReps = recalibrated ? (taper ? 2 : building && dow === 3 ? 4 : 3) : dow === 1 ? (taper || initial ? 2 : 3) : (taper || initial ? 3 : 4);
    const pushSets = taper ? 2 : recalibrated ? (specific ? (dow === 1 ? 4 : 3) : dow === 1 ? 5 : 4) : specific ? 3 : 4;
    const pushReps = recalibrated ? (building ? 12 : 10) : taper ? 10 : initial ? (dow === 1 ? 12 : 10) : specific && dow === 3 ? 12 : 15;
    const pSets = returning ? Math.ceil(pullSets / 2) : pullSets, uSets = returning ? Math.ceil(pushSets / 2) : pushSets;
    const budget = taper || returning ? 15 : 30;
    s = {...s,minutes:s.minutes+budget,murphMinutes:budget,startTime:"05:30",title:`Upper body first + ${miles}-mile easy run`,
      detail:`5:30–${budget === 30 ? "6:00" : "5:45"}: ${budget}-minute upper-body block including warm-up and rests; then ${miles} easy miles. ${easy} Warm up 5 minutes with shoulder movement, 2 × 5 scapular pull-ups and 2 × 5 easy push-ups (additional warm-up reps). No vest. Complete ${pSets} × ${pullReps} = ${pSets*pullReps} ${dow === 1 ? "strict" : "regular kipping"} pull-ups before ${uSets} × ${pushReps} = ${uSets*pushReps} clean push-ups. Rest ${recalibrated ? (dow === 1 ? "120–150" : "90–120") : (dow === 1 ? "90–120" : "60–90")} seconds between pull-up sets, and ${recalibrated ? "90–120" : "60–90"} seconds between push-up sets. ${recalibrated ? baseline + "The listed future dose is a ceiling, earned only after two comfortable exposures. Until then use the initial dose: Monday 5 × 3 strict pulls and 5 × 10 pushes; Wednesday 4 × 3 regular kipping pulls and 4 × 10 pushes. Reduced return and taper doses override this fallback. If 3 pulls or 10 pushes leave fewer than 2 good reps, use sets of 2 pulls or 8 pushes with the same set count; do not add catch-up sets. " : ""}${reserve} The upper-body time is a cap: omit the last working set if needed, never shorten rests or rush the run. If this exceeds your recent weekly volume, halve the working sets for the first week. ${dow === 3 ? "Optional butterfly skill: replace five minutes of kipping practice with unvested, preferably coached practice only after regular kipping is controlled. No vested or fatigued butterfly work." : ""}`};
  } else if (dow === 2 || dow === 4) {
    const interval = dow === 2;
    let work = interval ? "4 × 3 minutes at RPE 7; 2-minute jog recoveries" : "2 × 6 minutes at RPE 6; 3-minute jog between";
    if (date >= "2026-12-07") work = interval ? "5 × 3 minutes at RPE 7–8; 2-minute jog recoveries" : "3 × 6 minutes at RPE 6–7; 2-minute jog recoveries";
    if (date >= "2027-01-04") work = interval ? "4 × 4 minutes at RPE 7–8; 2-minute jog recoveries" : "2 × 9 minutes at RPE 6–7; 3-minute jog between";
    if (date >= "2027-02-22") work = interval ? "5 × 4 minutes at RPE 7–8; 2-minute jog recoveries" : "2 × 10 minutes at RPE 6–7; 3-minute jog between";
    if (date >= "2027-03-08") work = interval ? "4 × 4 minutes at RPE 7–8; 2-minute jog recoveries" : "2 × 6 minutes at RPE 6; 3-minute jog between";
    if (taper) work = interval ? "4 × 1 minute at RPE 7; 2-minute jog recoveries" : daysBetween(date,TAPER_START) < 7 ? "2 × 4 minutes at RPE 6; 3-minute jog between" : "Easy running only; no threshold work";
    if (returning) work = interval ? "3 × 3 minutes at RPE 7; 2-minute jog recoveries" : "2 × 5 minutes at RPE 6; 3-minute jog between";
    const assessment = ["2026-12-15","2027-03-02"].includes(date);
    s = {...s,title:assessment?"Measured 5K assessment":taper && !interval && daysBetween(date,TAPER_START) >= 7?"Easy run · reduced load":interval?"Tuesday intervals":"Thursday threshold",
      detail:`${miles} miles TOTAL, including warm-up, recoveries, and cooldown. Run 10–15 minutes easy before the work and at least 8–10 minutes easy afterward. ${assessment ? "A measured 5K assessment replaces intervals today; no additional interval session." : work + "."} Initial pace references: intervals about 8:00–8:15/mile, threshold about 8:40–9:00/mile, based on your last reported 25-minute 5K. Effort overrides pace. Threshold RPE 6–7 often corresponds to 155–165 bpm; intervals RPE 7–8 may reach 165–175 late in reps. Do not chase HR on short repetitions. Future goals of 7:00/mile and about 7:15/mile are not automatic training paces. Shorten the work if needed; keep Thursday controlled before Friday.`};
  } else if (dow === 5) {
    const f = fridays[date] ?? {vest:[0,0,0],body:[24,60,90],minutes:30};
    const vested = f.vest.some(n=>n>0);
    const vestPullSize = date === "2026-12-18" ? 1 : date === "2026-12-25" ? 2 : date < "2027-03-12" ? 3 : 5;
    const bodyPullSize = date < "2027-01-01" ? 3 : date < "2027-02-22" ? 4 : 5;
    const labels = ["pull-ups","push-ups","squats"];
    const blocks = labels.map((label,i)=>f.vest[i]+f.body[i]===0 ? `${label}: none` : `${label}: ${vested ? `${sets(f.vest[i],[vestPullSize,5,15][i])} with 20 lb vest, then ` : ""}${sets(f.body[i],[bodyPullSize,10,15][i])} without vest`).join("; ");
    const loadedMiles = date === "2027-03-26" ? 1 : ["2027-03-19","2027-04-02"].includes(date) ? .75 : date === "2027-03-12" ? .5 : ["2027-01-29","2027-02-05","2027-02-26","2027-03-05"].includes(date) ? .25 : 0;
    s = {...s,kind:"murph",minutes:Math.ceil(miles*11)+f.minutes,murphMinutes:f.minutes,title:taper?"Light unpartitioned technique · taper":"Friday unpartitioned Murph practice",
      detail:`${miles} running miles total: ${miles/2} before and ${miles/2} after a ${f.minutes}-minute calisthenics block including preparation and rests. Complete the pull-up block, then the push-up block, then the squat block, without alternating movements. Working sets × reps (ceilings within each time allowance): ${blocks}. ${date === "2026-12-18" ? "The five vested pull-ups are STRICT singles for load assessment; bodyweight pull-ups use regular kipping." : "Pull-ups use regular kipping, never butterfly. Push-ups are clean, full range; squats reach hip crease below knee and finish standing tall."} ${vested ? `The vested dose is conditional on comfortable prior sessions${settings.vestReady ? " and your confirmed vest readiness" : "; vest readiness has not been confirmed in settings"}. If not ready, do those reps unvested or repeat a smaller prior dose.` : "No vest."} Rest 90–120 seconds for pull-up sets, 60–90 for push-up sets, and 20–40 for squats. If this means fewer reps fit the time cap, stop at the cap and log actual reps; do not rush rests to reach the ceiling. The first 5 minutes are preparation; split the remaining time approximately 40% pulls, 35% pushes and 25% squats. End each movement block at its time allowance even if reps remain, then move on; preserve time for squats. Future totals require two comfortable exposures at the previous dose; otherwise repeat that dose. Larger pull-up sets are conditional: first demonstrate 5 × 3, then 5 × 4, then 5 × 5 at the same vest load, each comfortably twice; until earned use the prior set size and complete fewer reps in the time allowance. Never transfer an unvested readiness result to vested work. After a reduced week, first repeat the last comfortable dose. ${baseline} Shorten rests only after the existing dose is repeatable. ${loadedMiles ? `Only if the prior loaded progression was comfortable, vest the first ${loadedMiles} mile of EACH run and do the remainder unvested.` : "Both runs are unvested and easy."} RPE 5–6 initially, 6–7 later; stop or reduce if technique fades or effort exceeds 7–8. Time is a cap: log partial work rather than rush or force all reps. Record the calisthenics block as Garmin Cardio and the runs separately. ${reserve}`};
  }
  if (taper && dow === 5) s.detail = s.detail.replace("RPE 5–6 initially, 6–7 later; stop or reduce if technique fades or effort exceeds 7–8.", "Taper effort: RPE 4–5, with at least 3 clean reps in reserve. Finish fresh; reduce reps rather than accumulate fatigue.");
  if (date === "2027-04-16") s = {...s,detail:`2 easy miles, one before and one after up to 10 minutes light upper-body technique, including preparation and rests. No vest. Complete 3 × 2 = 6 strict pull-ups, THEN 2 × 10 = 20 clean push-ups. Rest 60–90 seconds between sets. No squats, kipping or butterfly work today. RPE at most 5, with at least 3 clean reps in reserve; skip upper body if not fully recovered. ${easy} Saturday is rest before Sunday's 5K.`};
  const inWindow = (windows: string[][]) => windows.some(([start,end])=>date>=start&&date<=end);
  const skiReturn = recovery.some(([,end])=>daysBetween(date,end)>0&&daysBetween(date,end)<=2) || original.tag === "Re-entry";
  if (original.trip?.kind === "ski" || inWindow(recovery)) return {...s,kind:"recovery",miles:0,minutes:25,murphMinutes:0,startTime:undefined,tag:"Recovery block",title:"Recovery · walking and mobility",detail:"20–30 minutes gentle walking and mobility. Other leg loading replaces running and squat work during this recovery block. This is reduced running, not necessarily low total workload. Resume gradually when recovered; no make-up sessions."};
  if (skiReturn) {
    const upper = dow === 1 || dow === 3;
    return {...s,kind:"run",miles:3,minutes:33+(upper?15:0),murphMinutes:upper?15:0,startTime:upper?"05:30":undefined,tag:"Gradual return",title:"Easy return after leg loading",
      detail:`3 unvested easy miles. ${easy} If legs remain sore, sleep is poor or easy effort is abnormal, walk instead. No intervals, threshold or squats on these first return mornings. ${upper?"Optional 15-minute upper-body block at 5:30 before running, including preparation and rests: no vest; 2 × 2 = 4 strict pull-ups, THEN 2 × 8 = 16 clean push-ups, resting 90 seconds between sets. RPE at most 5, with at least 3 clean reps in reserve. Skip if not recovered.":"No Murph work today."} Later return targets are ceilings: repeat the last comfortable dose instead of forcing the next mileage increase.`};
  }
  if (original.trip || inWindow(maintenance)) {
    if (dow === 5) {
      const squats = date >= "2026-12-27" ? 60 : 90;
      return {...s,miles:2,minutes:52,murphMinutes:30,tag:"Travel adjusted",title:"Easy miles + floor-only Murph practice",detail:`One easy mile before and one after up to 30 minutes floor work: no pull-up bar or vest assumed. Clean push-ups 4 × 10 = 40, THEN air squats ${sets(squats,15)}. Rest 90 seconds for pushes and 20–40 for squats. RPE 5–6; stop with 2–3 good reps in reserve. After an overnight flight or poor recovery, replace the workout with walking.`};
    }
    const quality = dow === 2 || dow === 4, upper = dow === 1 || dow === 3;
    const travelMiles = Math.min(miles,dow === 0?6:quality?4.5:4);
    return {...s,kind:"run",miles:travelMiles,minutes:Math.ceil(travelMiles*11)+(upper?15:0),murphMinutes:upper?15:0,startTime:upper?"05:30":undefined,tag:"Travel adjusted",
      title:quality ? dow === 2 ? "Tuesday intervals · travel option" : "Thursday threshold · travel option" : upper ? "Easy run + floor-only upper body" : "Easy travel run",
      detail:`${travelMiles} miles total. ${quality ? `Only with normal sleep, recovery and a safe route or treadmill: warm up 10–15 minutes, ${dow===2?"4 × 2 minutes at RPE 7, with 2-minute jog recoveries":"2 × 5 minutes at RPE 6, with a 3-minute jog between"}, then cool down 10 minutes. Shorten the work to fit the run; otherwise keep all miles easy. HR lags during intervals; do not chase a number. Your provisional threshold anchor is 155–165 bpm.` : easy} ${upper ? "Before running, up to 15 minutes floor-only practice, including preparation and rests: 3 × 10 = 30 clean unvested push-ups, resting 90 seconds. RPE at most 6, with 2–3 clean reps in reserve. No pull-up equipment assumed." : "No vest or assumed pull-up equipment."} After an overnight flight, unusual fatigue or poor sleep, shorten to 20–30 minutes easy or walk. Routine travel does not automatically cancel the following two days; resume the usual plan if recovered, without making up missed work.`};
  }
  s.detail += " If fatigue accumulates across sessions, first reduce interval repetitions, threshold minutes or Murph sets while keeping easy running comfortable. Take a lighter day or week if poor recovery persists; no automatic every-fourth-week reduction. After reduced running, repeat the last comfortable dose if the next target is not yet repeatable.";
  return s;
}
