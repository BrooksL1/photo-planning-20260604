import type { Session, Settings } from "./plan";

export const REVISED_START = "2026-11-07";
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);
const weekday = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
const mondayOf = (date: string) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
};

// Public workload adjustments contain no calendar locations, titles, or travel records.
const maintenance = [["2026-11-12", "2026-11-13"], ["2026-11-24", "2026-11-28"], ["2026-12-07", "2026-12-08"], ["2026-12-27", "2027-01-02"], ["2027-01-21", "2027-01-24"]];
const recovery = [["2027-01-11", "2027-01-14"], ["2027-02-09", "2027-02-15"]];
type Friday = { vest: number[]; body: number[]; minutes: number };
const fridays: Record<string, Friday> = {
  "2026-11-20": {vest:[0,0,0],body:[24,60,90],minutes:30},
  "2026-12-04": {vest:[0,0,0],body:[32,80,120],minutes:30},
  "2026-12-11": {vest:[0,0,0],body:[40,80,120],minutes:30},
  "2026-12-18": {vest:[5,20,30],body:[15,20,30],minutes:20},
  "2026-12-25": {vest:[10,20,30],body:[30,60,90],minutes:35},
  "2027-01-08": {vest:[15,30,45],body:[25,50,75],minutes:35},
  "2027-01-29": {vest:[25,50,75],body:[25,50,75],minutes:40},
  "2027-02-05": {vest:[35,70,105],body:[25,50,75],minutes:45},
  "2027-02-19": {vest:[0,0,0],body:[30,60,90],minutes:30},
  "2027-02-26": {vest:[35,70,105],body:[25,50,75],minutes:45},
  "2027-03-05": {vest:[50,100,150],body:[25,50,75],minutes:50},
  "2027-03-12": {vest:[65,130,195],body:[25,50,75],minutes:60},
  "2027-03-19": {vest:[80,160,240],body:[20,40,60],minutes:60},
  "2027-03-26": {vest:[0,0,0],body:[20,40,60],minutes:20},
};
const sets = (total: number, size: number) => `${Math.floor(total / size)} × ${size}${total % size ? ` + 1 × ${total % size}` : ""} = ${total}`;
const easy = "RPE 3–4, around 135–145 bpm with full-sentence conversation. Slow or walk hills if effort rises; 155 bpm at RPE 6 is too hard for an easy run.";
const reserve = "Keep at least 2–3 clean reps in reserve. Advance only after two comfortable exposures with normal recovery. Otherwise repeat or reduce the previous dose. Reps use full range: chin above the bar and full elbow extension; chest to floor, straight body, full push-up lockout.";

export function revisedSession(original: Session, settings: Settings): Session {
  const date = original.date, dow = weekday(date), week = mondayOf(date);
  if (date < REVISED_START || date >= "2027-05-11" || dow === 6) return {...original, murphMinutes:0};
  if (date === "2027-03-29") return {...original,kind:"run",miles:2.5,minutes:28,murphMinutes:0,title:"Easy run before the first attempt",detail:`2.5 easy miles, no strength. ${easy} Finish fresh for Tuesday's 5K.`};
  if (date >= "2027-03-30") {
    if (original.attempt) return {...original, murphMinutes:original.attempt === "Murph" ? 57 : 0,
      detail: original.attempt === "Murph" ? "Allow about 75 minutes including preparation. Timed goal: 57:00. In a 20 lb vest: run 1 mile, complete all 100 regular kipping pull-ups, all 200 clean push-ups, all 300 air squats, then run 1 mile. Small sets and rests within each movement are allowed. Attempt only after repeatable vested practice and normal recovery; otherwise log a scaled rehearsal. No butterfly pull-ups assumed. Record the actual run and calisthenics time when available; no fixed movement split is established by your historical recording." : original.detail};
    if (original.trip || original.tag === "Re-entry" || original.title === "Recover from Murph") return {...original, murphMinutes:0};
    if (dow === 3) return {...original,kind:"recovery",miles:0,minutes:25,murphMinutes:0,title:"Recovery · walking and mobility",detail:"Recover from Tuesday's attempt. Walk and mobilize gently; no make-up repetitions."};
    const miles = dow === 0 ? 5 : dow === 1 ? 2.5 : dow === 5 ? 2 : 3;
    return {...original,kind:"run",miles,minutes:Math.ceil(miles * 11) + (dow === 5 ? 10 : 0),murphMinutes:dow === 5 ? 10 : 0,
      title:dow === 5 ? "Easy run + light technique" : "Easy maintenance run",
      detail:`${miles} easy miles. ${easy} ${dow === 1 ? "No strength before Tuesday's attempt." : dow === 5 ? "Optional 10 minutes unvested technique only if fully recovered: 3 × 2 strict pull-ups, then 2 × 10 clean push-ups; rest 60–90 seconds. Skip after Murph if soreness remains." : "No threshold or additional quality session during the challenge block."}`};
  }
  const reduced = week === "2026-12-14", taper = date >= "2027-03-22";
  let miles = [10,4.5,5.5,4.5,5.5,2,0][dow];
  if (dow === 0 && ["2026-11-08","2026-11-22","2027-03-14","2027-03-21"].includes(date)) miles = 8;
  if (date === "2026-12-06") miles = 9;
  if (reduced) miles *= .75;
  if (taper) miles = [6,3.5,4,3.5,4,2,0][dow];
  let s: Session = {...original,kind:"run",miles,minutes:Math.ceil(miles * 11),murphMinutes:0,tag:taper?"Taper":reduced?"Reduced week":"Revised morning plan"};
  if (dow === 0) s = {...s,title:"Sunday long easy run",detail:`${miles} easy miles. ${easy} No fast finish. Shorter Sundays support the largest Friday rehearsals. Fuel and drink for the longer morning.`};
  else if (dow === 1 || dow === 3) {
    const initial = date < "2026-11-30" || (date >= "2027-02-08" && date < "2027-02-22");
    const specific = date >= "2027-02-22";
    const pullSets = taper ? 3 : specific ? 5 : 6;
    const pullReps = dow === 1 ? (taper || initial ? 2 : 3) : (taper || initial ? 3 : 4);
    const pushSets = taper ? 2 : specific ? 3 : 4;
    const pushReps = taper ? 10 : initial ? (dow === 1 ? 12 : 10) : specific && dow === 3 ? 12 : 15;
    const pSets = reduced ? Math.ceil(pullSets / 2) : pullSets, uSets = reduced ? Math.ceil(pushSets / 2) : pushSets;
    const budget = taper || reduced ? 15 : 30;
    s = {...s,minutes:s.minutes+budget,murphMinutes:budget,startTime:"05:30",title:`Upper body first + ${miles}-mile easy run`,
      detail:`5:30–${budget === 30 ? "6:00" : "5:45"}: ${budget}-minute upper-body block including warm-up and rests; then ${miles} easy miles. ${easy} Warm up 5 minutes with shoulder movement, 2 × 5 scapular pull-ups and 2 × 5 easy push-ups (additional warm-up reps). No vest. Complete ${pSets} × ${pullReps} = ${pSets*pullReps} ${dow === 1 ? "strict" : "regular kipping"} pull-ups before ${uSets} × ${pushReps} = ${uSets*pushReps} clean push-ups. Rest ${dow === 1 ? "90–120" : "60–90"} seconds between pull-up sets, and 60–90 seconds between push-up sets. ${reserve} If this exceeds your recent weekly volume, halve the working sets for the first week. ${dow === 3 ? "Optional butterfly skill: replace five minutes of kipping practice with unvested, preferably coached practice only after regular kipping is controlled. No vested or fatigued butterfly work." : ""}`};
  } else if (dow === 2 || dow === 4) {
    const interval = dow === 2;
    let work = interval ? "4 × 3 minutes at RPE 7; 2-minute jog recoveries" : "2 × 6 minutes at RPE 6; 3-minute jog between";
    if (date >= "2026-12-07") work = interval ? "5 × 3 minutes at RPE 7–8; 2-minute jog recoveries" : "3 × 6 minutes at RPE 6–7; 2-minute jog recoveries";
    if (date >= "2027-01-04") work = interval ? "4 × 4 minutes at RPE 7–8; 2-minute jog recoveries" : "2 × 9 minutes at RPE 6–7; 3-minute jog between";
    if (date >= "2027-02-22") work = interval ? "5 × 4 minutes at RPE 7–8; 2-minute jog recoveries" : "2 × 10 minutes at RPE 6–7; 3-minute jog between";
    if (date >= "2027-03-08") work = interval ? "4 × 4 minutes at RPE 7–8; 2-minute jog recoveries" : "2 × 6 minutes at RPE 6; 3-minute jog between";
    if (taper) work = interval ? "4 × 1 minute at RPE 7; 2-minute jog recoveries" : "Easy running only; no threshold work";
    if (reduced) work = "Easy running only during this reduced week";
    const assessment = ["2026-12-15","2027-02-23"].includes(date) && !reduced;
    s = {...s,title:assessment?"Measured 5K assessment":taper && !interval || reduced?"Easy run · reduced load":interval?"Tuesday intervals":"Thursday threshold",
      detail:`${miles} miles TOTAL, including warm-up, recoveries, and cooldown. Run 10–15 minutes easy before the work and at least 8–10 minutes easy afterward. ${assessment ? "A measured 5K assessment replaces intervals today; no additional interval session." : work + "."} Initial pace references: intervals about 8:00–8:15/mile, threshold about 8:40–9:00/mile, based on your last reported 25-minute 5K. Effort overrides pace. Threshold RPE 6–7 often corresponds to 155–165 bpm; intervals RPE 7–8 may reach 165–175 late in reps. Do not chase HR on short repetitions. Future goals of 7:00/mile and about 7:15/mile are not automatic training paces. Shorten the work if needed; keep Thursday controlled before Friday.`};
  } else if (dow === 5) {
    const f = fridays[date] ?? {vest:[0,0,0],body:[24,60,90],minutes:30};
    const vested = f.vest.some(n=>n>0);
    const vestPullSize = date === "2026-12-18" ? 1 : date === "2026-12-25" ? 2 : date === "2027-01-08" ? 3 : 5;
    const bodyPullSize = ["2026-11-20","2026-12-04"].includes(date) ? 4 : 5;
    const labels = ["pull-ups","push-ups","squats"];
    const blocks = labels.map((label,i)=>`${label}: ${vested ? `${sets(f.vest[i],[vestPullSize,5,15][i])} with 20 lb vest, then ` : ""}${sets(f.body[i],[bodyPullSize,10,15][i])} without vest`).join("; ");
    const loadedMiles = date >= "2027-03-19" && !taper ? 1 : date === "2027-03-12" ? .75 : ["2027-02-26","2027-03-05"].includes(date) ? .5 : ["2027-01-29","2027-02-05"].includes(date) ? .25 : 0;
    s = {...s,kind:"murph",minutes:Math.ceil(miles*11)+f.minutes,murphMinutes:f.minutes,title:"Friday unpartitioned Murph practice",
      detail:`${miles} running miles total: ${miles/2} before and ${miles/2} after a ${f.minutes}-minute calisthenics block including preparation and rests. Complete ALL pull-ups, then ALL push-ups, then ALL squats. Working sets × reps: ${blocks}. ${date === "2026-12-18" ? "The five vested pull-ups are STRICT singles for load assessment; bodyweight pull-ups use regular kipping." : "Pull-ups use regular kipping, never butterfly. Push-ups are clean, full range; squats reach hip crease below knee and finish standing tall."} ${vested ? `The vested dose is conditional on comfortable prior sessions${settings.vestReady ? " and your confirmed vest readiness" : "; vest readiness has not been confirmed in settings"}. If not ready, do those reps unvested or repeat a smaller prior dose.` : "No vest."} Rest 60–90 seconds for vested pulls, 45–60 for unvested pulls, 30–60 for pushes, and 20–40 for squats. Shorten rests only after the existing dose is repeatable. ${loadedMiles ? `Only if the prior loaded progression was comfortable, vest the first ${loadedMiles} mile of EACH run and do the remainder unvested.` : "Both runs are unvested and easy."} RPE 5–6 initially, 6–7 later; stop or reduce if technique fades or effort exceeds 7–8. Time is a cap: log partial work rather than rush or force all reps. Record the calisthenics block as Garmin Cardio and the runs separately. ${reserve}`};
  }
  const inWindow = (windows: string[][]) => windows.some(([start,end])=>date>=start&&date<=end);
  const knownReentry = [...maintenance,...recovery].some(([,end])=>daysBetween(date,end)>0&&daysBetween(date,end)<=2);
  if (original.trip?.kind === "ski" || inWindow(recovery) || original.tag === "Re-entry" || (!original.trip && knownReentry)) return {...s,kind:"recovery",miles:0,minutes:25,murphMinutes:0,startTime:undefined,tag:original.tag === "Re-entry" || knownReentry ? "Re-entry" : "Recovery block",title:"Recovery · walking and mobility",detail:"20–30 minutes gentle walking and mobility. Other leg loading replaces running and squat work during this recovery block. Resume gradually when recovered; no make-up sessions."};
  if (original.trip || inWindow(maintenance)) {
    if (dow === 5) {
      const squats = date >= "2026-12-27" ? 60 : 90;
      return {...s,miles:2,minutes:52,murphMinutes:30,title:"Easy miles + floor-only Murph practice",detail:`One easy mile before and one after up to 30 minutes floor work: no pull-up bar or vest assumed. Clean push-ups 4 × 10 = 40, THEN air squats ${sets(squats,15)}. Rest 30–60 seconds for pushes and 20–40 for squats. RPE 5–6; stop with 2–3 good reps in reserve. After an overnight flight or poor recovery, replace the workout with walking.`};
    }
    return {...s,kind:"run",miles:Math.min(miles,3),minutes:30,murphMinutes:0,startTime:undefined,title:"Easy maintenance run",detail:"20–30 minutes easy running, up to 3 miles. No speed work, vest, or assumed pull-up equipment. After an overnight flight, walk and prioritize sleep instead."};
  }
  return s;
}
