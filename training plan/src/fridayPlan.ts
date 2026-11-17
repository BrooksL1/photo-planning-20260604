import type { Session } from "./plan";

export type FridayWorkout = {
  volume: number;
  vest: number;
  block: number;
  middleMinutes: number;
};

// Volume and block size are pull-up counts; pushes and squats are 2× and 3×.
// Based on the user's November 17 spreadsheet, followed by the agreed rehearsal/taper.
export const FRIDAY_WORKOUTS: Record<string, FridayWorkout> = {
  "2026-11-20": { volume: 50, vest: 8, block: 5, middleMinutes: 25 },
  "2026-11-27": { volume: 50, vest: 8, block: 10, middleMinutes: 26 },
  "2026-12-04": { volume: 60, vest: 8, block: 10, middleMinutes: 30 },
  "2026-12-11": { volume: 60, vest: 10, block: 10, middleMinutes: 30 },
  "2026-12-18": { volume: 60, vest: 10, block: 15, middleMinutes: 32 },
  "2026-12-25": { volume: 60, vest: 10, block: 20, middleMinutes: 34 },
  "2027-01-01": { volume: 60, vest: 12, block: 20, middleMinutes: 34 },
  "2027-01-08": { volume: 70, vest: 12, block: 20, middleMinutes: 37 },
  "2027-01-15": { volume: 70, vest: 12, block: 25, middleMinutes: 37 },
  "2027-01-22": { volume: 70, vest: 14, block: 25, middleMinutes: 38 },
  "2027-01-29": { volume: 70, vest: 14, block: 30, middleMinutes: 39 },
  "2027-02-05": { volume: 70, vest: 14, block: 35, middleMinutes: 40 },
  "2027-02-12": { volume: 0, vest: 0, block: 0, middleMinutes: 0 },
  "2027-02-19": { volume: 80, vest: 16, block: 50, middleMinutes: 40 },
  "2027-02-26": { volume: 80, vest: 16, block: 60, middleMinutes: 42 },
  "2027-03-05": { volume: 80, vest: 18, block: 60, middleMinutes: 42 },
  "2027-03-12": { volume: 80, vest: 18, block: 70, middleMinutes: 43 },
  "2027-03-19": { volume: 80, vest: 18, block: 80, middleMinutes: 43 },
  "2027-03-26": { volume: 80, vest: 20, block: 80, middleMinutes: 44 },
  "2027-04-02": { volume: 100, vest: 20, block: 100, middleMinutes: 50 },
  "2027-04-09": { volume: 50, vest: 20, block: 50, middleMinutes: 25 },
  "2027-04-16": { volume: 0, vest: 0, block: 0, middleMinutes: 0 },
};

export function movementBlocks(volume: number, block: number): number[] {
  if (!Number.isInteger(volume) || volume < 0 || !Number.isInteger(block) || block < 0 || (volume > 0 && block === 0)) {
    throw new Error("Invalid Murph block prescription");
  }
  const result: number[] = [];
  for (let remaining = volume; remaining > 0; remaining -= block) result.push(Math.min(remaining, block));
  return result;
}

function sets(total: number, size: number) {
  const full = Math.floor(total / size), remainder = total % size;
  return `${full ? `${full} × ${size}` : ""}${full && remainder ? " + " : ""}${remainder ? `1 × ${remainder}` : ""} = ${total}`;
}

function describeBlocks(blocks: number[]) {
  const groups: { size: number; count: number }[] = [];
  for (const size of blocks) {
    const last = groups[groups.length - 1];
    if (last?.size === size) last.count++;
    else groups.push({ size, count: 1 });
  }
  return groups.map(({ size, count }) => `${count} × (${size} pull-ups / ${size * 2} push-ups / ${size * 3} squats)`).join(" + ");
}

export function fridaySession(original: Session): Session | undefined {
  const f = FRIDAY_WORKOUTS[original.date];
  if (!f) return undefined;
  const date = original.date;
  if (date === "2027-02-12" || original.trip?.kind === "ski") return {
    ...original, kind: "recovery", miles: 0, minutes: 25, murphMinutes: 0,
    title: "Recovery · no Murph progression", tag: "Recovery block",
    detail: "20–30 minutes easy walking and mobility as needed. Other leg loading replaces the Friday workout. No running, squats or vested circuits; resume the last comfortable Murph dose when recovered, without catch-up repetitions.",
  };
  if (date === "2027-04-16") return {
    ...original, kind: "run", miles: 2, minutes: 22, murphMinutes: 0,
    title: "Optional 2 easy miles · no Murph work", tag: "Taper",
    detail: "No calisthenics or vest today. Optional 2 easy unvested miles at RPE 3–4 with full-sentence conversation, or rest if you prefer. Saturday is rest before Sunday's April 18 Murph attempt.",
  };
  const blocks = movementBlocks(f.volume, f.block);
  const unpartitioned = blocks.length === 1;
  const half = date === "2027-04-09", full = date === "2027-04-02";
  const returning = date === "2027-01-15" || date === "2027-02-19" || original.tag === "Re-entry";
  const dose = `${f.volume}/${f.volume * 2}/${f.volume * 3}`;
  const pullSize = f.vest >= 10 ? 3 : 5, pushSize = f.vest >= 10 ? 5 : 10;
  const workSets = [...new Set(blocks)].map(n => `For each ${n}/${n * 2}/${n * 3} block: ${sets(n, pullSize)} regular kipping pull-ups, then ${sets(n * 2, pushSize)} clean push-ups, then ${sets(n * 3, 15)} air squats.`).join(" ");
  const effort = half ? "Controlled RPE 6–7; do not chase a finish time" : returning ? "Only with normal recovery; RPE 5–6 on the return session" : "RPE 7–8; no failed or grinding reps";
  const travel = original.trip?.kind === "travel" || ["2026-11-27", "2026-12-18", "2027-01-01", "2027-01-22"].includes(date);
  return {
    ...original, kind: "murph", miles: 2, minutes: 22 + 5 + f.middleMinutes,
    murphMinutes: 5 + f.middleMinutes,
    murphTargets: { pullups: f.volume, pushups: f.volume * 2, squats: f.volume * 3, vest: f.vest, blocks },
    title: half ? "Half Murph + 2 miles · 50/100/150 · 20 lb" : full ? "Full-volume rehearsal · 100/200/300 · 20 lb" : `Murph · ${dose} · ${f.vest} lb · ${unpartitioned ? "unpartitioned" : `${f.block}/${f.block * 2}/${f.block * 3} blocks`}`,
    tag: half ? "Taper" : returning ? "Murph return" : "Friday progression",
    goal: half ? "Rehearse half the calisthenics and both running miles while preserving freshness for April 18." : full ? "Rehearse full vested, unpartitioned calisthenics 16 days before the April 18 attempt; this is controlled practice." : "Build the agreed volume, movement-block size and vest load for unpartitioned Murph.",
    rpe: `${effort}. Keep about 2 clean reps in reserve within working sets. Runs: RPE 3–4.`,
    heartRate: "No fixed HR target for calisthenics; rep quality, breathing and recovery guide the work. Runs stay conversational; around 135–145 bpm is a provisional easy-effort reference, not a number to force.",
    detail: `Warm up shoulders, hips and ankles for 5 minutes. Run 1 easy mile, complete the calisthenics, then run 1 easy mile: 2 running miles total. ${half ? "Wear the 20 lb vest throughout both miles and all calisthenics. " : `Wear ${f.vest} lb for all calisthenics. Both runs are easy and unvested; any separate vested-running practice replaces part of those miles rather than adding mileage. `}Totals: ${f.volume} regular kipping pull-ups, ${f.volume * 2} clean push-ups and ${f.volume * 3} air squats. Block order: ${describeBlocks(blocks)}. ${unpartitioned ? "Unpartitioned: finish ALL pull-ups before ANY push-ups, then ALL push-ups before ANY squats. " : "Within EACH block, finish all pulls, then all pushes, then all squats before starting the next block. "}Blocks are accumulated work, not unbroken sets; small sets and rests are allowed. ${workSets} Rest about 15–30 seconds between pulling/pushing sets, 10–20 seconds between squat sets and 60–90 seconds between blocks as needed. Extend rests to keep clean reps; do not shorten them just because weight, volume or block size increased. ${effort}. Full range: chin over the bar with full elbow extension; chest to floor with a straight body and full push-up lockout; squats below parallel and finish standing tall. No butterfly pull-ups. Allow about ${f.middleMinutes} minutes for the calisthenics including rests, plus warm-up and running; this is a planning estimate, not a finish-time requirement. Stop and log partial work if the dose cannot be completed cleanly in your available time. Advance only after the prior comparable dose was clean and recovery was normal; otherwise repeat it. ${returning ? "After reduced training, first repeat or reduce the last comfortable dose; the displayed target is conditional, not a mandatory jump. " : ""}${full ? "This is the full-volume rehearsal on April 2, 16 days before April 18. Keep it controlled; do not race for 57 minutes today. " : ""}${half ? "This is 50% of Murph's calisthenics with the full two running miles, nine days before April 18. " : ""}${travel ? "This equipped target requires a suitable pull-up bar and adjustable vest. If unavailable, use 8 × 10 unvested clean push-ups and 8 × 15 air squats with easy rests; no pull-ups are counted. Resume the last completed equipped step afterward rather than skipping ahead. " : ""}Record the calisthenics and rests as Garmin Cardio and each run separately; log actual reps, vest weight and elapsed movement splits yourself. Planned quantities never certify completion or RX.`,
  };
}
