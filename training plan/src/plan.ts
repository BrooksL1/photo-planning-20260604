import { revisedSession, REVISED_START } from "./revisedPlan";
import { ATTEMPTS, BIRTHDAY, CHALLENGE_START, TAPER_START } from "./challenge";
export { ATTEMPTS, BIRTHDAY, CHALLENGE_START, FLEX_DATE, TAPER_START } from "./challenge";

export const START = "2026-10-27";
export const MILES_5K = 5 / 1.609344;
export const MILES_10K = 10 / 1.609344;

export type Trip = {
  id: string;
  title: string;
  start: string;
  end: string;
  kind: "travel" | "ski";
  tentative: boolean;
};
export type Workout = {
  id: string;
  date: string;
  title: string;
  kind: "run" | "strength" | "murph" | "recovery";
  status: "completed" | "modified" | "skipped";
  minutes: number;
  miles: number;
  pullups: number;
  pushups: number;
  squats: number;
  vest: number;
  strictMax: number;
  weight: number;
  rpe: number;
  scaled: boolean;
  notes: string;
  partition: "partitioned" | "unpartitioned";
  updatedAt?: string;
  avgHr?: number;
  maxHr?: number;
  runMinutes?: number;
  strengthMinutes?: number;
  garminIds?: string[];
  garmin?: GarminActivity[];
};
export type GarminActivity = {
  id: string; date: string; startTime: string; type: string; name: string;
  minutes: number; miles: number; avgHr?: number; maxHr?: number;
  device: string; rpe?: number; importedAt: string;
};
export type Settings = {
  morning: string;
  partition: "partitioned" | "unpartitioned";
  vestReady: boolean;
  includeTentative: boolean;
};
export const DEFAULT_SETTINGS: Settings = {
  morning: "06:00",
  partition: "unpartitioned",
  vestReady: false,
  includeTentative: true,
};
export type Session = {
  date: string;
  title: string;
  detail: string;
  kind: "run" | "strength" | "murph" | "recovery" | "rest";
  miles: number;
  minutes: number;
  tag: string;
  murphMinutes?: number;
  startTime?: string;
  trip?: Trip;
  attempt?: "5K" | "10K" | "Murph";
  goal?: string;
  heartRate?: string;
  rpe?: string;
};
export type Phase = {
  title: string;
  start: string;
  end: string;
  focus: string;
  checkpoint: string;
};
export const PHASES: Phase[] = [
  {
    title: "Build the foundation",
    start: START,
    end: "2026-11-22",
    focus:
      "From November 7, build toward the revised 32-mile week: Monday/Wednesday upper body before easy runs, Tuesday intervals, Thursday controlled threshold, Friday Murph preparation, Saturday rest, and Sunday long. Travel and recovery reduce the workload. Easy effort is anchored around 135–145 bpm and RPE 3–4.",
    checkpoint:
      "Consistent pain-free mornings; 6 × 2–3 strict pull-ups with clean reps and 2 reps in reserve.",
  },
  {
    title: "Build repeatability",
    start: "2026-11-23",
    end: "2027-01-03",
    focus:
      "Build repeatable, nonfailure upper-body work on Monday and Wednesday. Tuesday intervals and Thursday threshold stay controlled; Friday progresses sequential pull-ups, push-ups, and squats. Holiday weeks become maintenance.",
    checkpoint:
      "A controlled 20-minute tempo and 18–24 pull-ups, then 36–48 push-ups, then 54–72 squats, with no lingering soreness.",
  },
  {
    title: "Strength into endurance",
    start: "2027-01-04",
    end: "2027-02-14",
    focus:
      "Build toward 40–60 pull-ups, 80–120 push-ups, and 120–180 squats in sequential blocks. Ski weeks replace leg loading. Practice each movement in sequence, using small sets. A vest is optional only after the readiness check; keep it light and short.",
    checkpoint:
      "8–10 fresh strict pull-ups; 50 pull-ups, then 100 push-ups, then 150 squats without a vest, broken into small sets. If not ready, repeat the earlier volume.",
  },
  {
    title: "Practice the demands",
    start: "2027-02-15",
    end: "2027-04-03",
    focus:
      "Sustain 30–32 running miles in full weeks through April 3. Progress Friday unpartitioned rehearsals only after comfortable prior doses. Thursday threshold gets shorter for the biggest rehearsals; Sunday drops to eight miles. Monday/Wednesday include a 30-minute upper-body block before running. Keep most running conversational; travel, re-entry, and recovery still reduce load.",
    checkpoint:
      "For 5K: 3 × 1 km near 7:00/mile, 2 min jog. For 10K: 3 × 2 km near 7:15/mile, 2 min jog. These are readiness clues, not guarantees.",
  },
  {
    title: "Freshen up",
    start: TAPER_START,
    end: "2027-04-17",
    focus:
      "April 4–10: 25 running miles. April 11–17: 19 miles. These taper blocks match the Sunday–Saturday calendar rows. Retain short controlled intervals and reduce upper-body work. No full Murph rehearsal or new vest load. Friday April 16 has only light unvested upper-body technique, with no squats; Saturday is rest before Sunday's 5K.",
    checkpoint:
      "Normal sleep and easy-run effort, no joint pain, and recovered from the last strength session.",
  },
  {
    title: "Four Sundays. Three goals.",
    start: CHALLENGE_START,
    end: "2027-05-10",
    focus:
      "Sunday April 18: 5K. April 25: 10K. May 2: recovery/maintenance, with an optional running retry only when recovered. May 9: vested unpartitioned Murph. Sunday attempts replace the long run and weekday hard sessions. Mondays support recovery, and Saturdays remain rest. Reduce calisthenics during the final 7–10 days before Murph.",
    checkpoint:
      "A goal attempt is optional if readiness is missing. Log a scaled or controlled effort and carry the goal forward.",
  },
];

export function addDays(date: string, n: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + n);
  return value.toISOString().slice(0, 10);
}
export function dayDiff(a: string, b: string) {
  return Math.round(
    (Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000,
  );
}
export function monday(date: string) {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -(d + 6) % 7);
}
export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function displayDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}
export function phaseFor(date: string) {
  return (
    PHASES.find((p) => date >= p.start && date <= p.end) ??
    PHASES[date < START ? 0 : PHASES.length - 1]
  );
}
function buildSession(
  date: string,
  trips: Trip[] = [],
  settings: Settings = DEFAULT_SETTINGS,
): Session {
  const index = Math.max(0, Math.floor(dayDiff(date, "2026-10-26") / 7));
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const deload = index % 4 === 3;
  const target = (index < 8 ? 22 : 23) * (deload ? .8 : 1);
  const distance = (share: number) => Math.round(target * share / 22 * 10) / 10;
  const long = distance(8);
  const short = distance(4);
  const base = {
    date,
    miles: 0,
    minutes: 45,
    tag: deload ? "Cutback week" : "Morning session",
  };
  let s: Session;
  if (date < START || date >= BIRTHDAY)
    return {
      ...base,
      kind: "rest",
      minutes: 0,
      title:
        date === BIRTHDAY
          ? "Happy 45th, Brooks."
          : "Outside the training block",
      detail: date === BIRTHDAY ? "Celebrate your birthday and recover from Sunday's Murph. Gentle walking and mobility only; continue recovery through May 12 and resume running when soreness and easy effort are normal." : "Review your journal, recover, and choose what comes next.",
    };
  if (dow === 6)
    s = {
      ...base,
      kind: "rest",
      minutes: 0,
      title: "Rest, fully",
      detail:
        "No scheduled workout. A relaxed walk is optional. Keep this day free of catch-up sessions.",
      tag: "Rest day",
    };
  else if (dow === 0)
    s = {
      ...base,
      kind: "run",
      miles: long,
      minutes: Math.ceil(long * 11),
      title: "Sunday long run",
      detail: `${long} miles at conversational effort (RPE 3–4/10). Use roughly 140 bpm and RPE 3–4 as your easy anchor. Slow or walk hills; 155 bpm at your reported RPE 6 is too hard for this session. Fuel and drink for longer outings. No fast finish. Sunday is the longer-session exception to the weekday 50-minute cap.`,
    };
  else if (dow === 1 || dow === 5) {
    const miles = distance(3);
    const sets = deload ? 3 : 4;
    s = {
      ...base, kind: "run", miles, minutes: 50,
      title: "Easy run + controlled strength",
      detail: `30 min easy running (roughly ${miles} miles, not a mileage requirement) at RPE 3–4, using roughly 140 bpm as an anchor. Slow or walk hills before effort rises toward 6/10 at 155 bpm. Then 3 min shoulder preparation and up to 15 min of upper-body practice: warm shoulders, ${sets} sets of 2 clean unvested strict pull-ups with 2–3 min rests, then 2 small push-up sets with 2–3 clean reps left in reserve. Use singles or fewer sets if quality fades. Do not race the clock or add rounds to fill time. ${dow === 1 ? "Keep this especially light after Sunday; no high-volume squats." : "Finish with gentle calf/hip mobility. Protect Sunday recovery."} These reps are part of the weekly strength dose, not extras on top.`,
    };
  } else if (dow === 2) {
    const early = index < 2;
    const tempo = index % 2 === 0;
    const work = early
      ? "After 10–15 min easy, run 4 × 2 min at controlled RPE 6 with 2 min easy jog between. Cool down at least 10 min."
      : tempo
        ? `Warm up 10–15 min. Run ${index < 10 ? "3 × 5" : "3 × 7"} min at RPE 6–7, with 2–3 min easy jogging. Cool down at least 10 min.`
        : `Warm up 10–15 min. Run ${index < 10 ? "4 × 3" : "5 × 3"} min near current 5K effort, RPE 7–8, with 2 min easy jogging. Cool down at least 10 min.`;
    s = {
      ...base, kind: "run", miles: short, minutes: 50,
      title: deload ? "Easy run · cutback" : tempo ? "Controlled tempo" : "Controlled intervals",
      detail: deload ? `${short} easy miles, RPE 3–4 near 140 bpm. Skip quality work this week.` : `50 min maximum, roughly ${short} miles including all warm-up, recoveries, and cooldown. ${work} Shorten the work block if needed to fit your available time; never cut the warm-up to chase mileage. Your reported anchors: 155 bpm ≈ RPE 6, 165 ≈ 7, 175 ≈ 8. Heart rate lags on short reps: use effort, not a target to chase. Current 25:00 5K pace is about 8:03/mile; 7:00 and 7:15/mile are future race goals. Finish repeatable, with one rep in reserve.`,
    };
  } else if (dow === 4) {
    s = {
      ...base, kind: "run", miles: short, minutes: 50,
      title: "Easy aerobic run",
      detail: `Up to 45 min conversational running (roughly ${short} miles), then 5 min mobility. RPE 3–4. Use roughly 140 bpm as a working anchor; mid-140s prompts a breathing check, not a hard physiological cutoff. Slow down or walk hills if effort rises. No second quality session yet: this morning absorbs Wednesday's strength work. Finish with 5 min gentle mobility.`,
    };
  } else {
    const pulls = deload ? 12 : index < 4 ? 16 : index < 10 ? 24 : index < 16 ? 36 : index < 19 ? 48 : 60;
    s = {
      ...base, kind: "strength", minutes: 50,
      title: "Murph focus · strength and repeatability",
      detail: `Warm up shoulders, hips, and ankles for 5–8 min. Up to ${pulls} pull-ups, THEN ${pulls * 2} push-ups, THEN ${pulls * 3} air squats. Start with pull-up singles/doubles, small push-up sets with 2–3 reps in reserve, and squat sets of 10–15. Rest 60–120 sec as needed; finish each movement before the next. Cap the work at ${index < 16 ? 30 : 40} min, even if unfinished. These are ceilings, not mandatory jumps: repeat the last comfortable dose until you recover normally. ${settings.vestReady && index >= 10 ? "If readiness has been confirmed, use only a few small vested sets. Progress load, reps, or shorter rests one at a time, never together. Do not assume a fixed 20 lb vest is appropriate for every movement." : "Bodyweight only until repeatable unweighted work and normal recovery are established. No kipping is assumed."} Keep Monday/Friday practice small; reduce the weekly total if soreness affects the next session.`,
    };
  }
  if (date >= TAPER_START && date < CHALLENGE_START && s.kind !== "rest") {
    s =
      dow === 1 || dow === 3
        ? {
            ...base,
            kind: "recovery",
            title: "Mobility · keep it light",
            minutes: 25,
            detail:
              "20–25 min easy walk and mobility. No loaded circuits or strength fatigue.",
          }
        : {
            ...base,
            kind: "run",
            miles: dow === 0 ? 3 : 3.5,
            minutes: 35,
            title: "Taper · easy miles",
            detail:
              "Conversational effort. On Tuesday only, add 4 × 15 sec relaxed strides with full recovery.",
          };
  }
  if (date >= CHALLENGE_START) {
    const attempt = ATTEMPTS.find((a) => a.date === date);
    const recentMurph = ATTEMPTS.some(
      (a) =>
        a.goal === "Murph" &&
        dayDiff(date, a.date) > 0 &&
        dayDiff(date, a.date) <= 3,
    );
    if (attempt)
      s = {
        ...base,
        kind: attempt.goal === "Murph" ? "murph" : "run",
        attempt: attempt.goal,
        miles:
          attempt.goal === "5K"
            ? MILES_5K
            : attempt.goal === "10K"
              ? MILES_10K
              : 2,
        minutes: attempt.goal === "5K" ? 45 : attempt.goal === "10K" ? 65 : 75,
        title: `${attempt.goal} · attempt ${ATTEMPTS.filter((a) => a.goal === attempt.goal && a.date <= date).length}`,
        tag: "Challenge morning",
        detail:
          attempt.goal === "Murph"
            ? `This challenge requires a longer morning (about 75 min including preparation); it cannot fit a 50-minute cap. Target 57:00. 1 mile + 100 pull-ups / 200 push-ups / 300 air squats + 1 mile, with a 20 lb vest. ${settings.partition === "partitioned" ? "Partition as 20 rounds of 5/10/15; smaller sets are fine." : "Complete each movement before beginning the next."} Attempt RX only after repeated vested practice and normal recovery. Otherwise do a scaled rehearsal. Practice budget: 9 min first mile + 12 min pull-ups + 12 min push-ups + 12 min squats + 10 min final mile + 2 min transitions = 57 min. These are targets, not a reason to rush unsafe reps.`
            : `Target ${attempt.goal === "5K" ? "7:00/mile, about 21:45 total" : "45:00 (7:15/mile); allow about 65 min with warm-up/cooldown"}. Warm up 10–15 min, drills and 4 relaxed strides. Run a measured route, start controlled, then cool down 10 min. The logged miles and time should cover the timed effort only. If the checkpoint is not comfortable, make this a controlled run.`,
      };
    else if (s.kind !== "rest")
      s = recentMurph
        ? {
            ...base,
            kind: "recovery",
            minutes: 25,
            title: "Recover from Murph",
            detail:
              "20–30 min gentle walking and mobility only. Resume running when soreness and easy effort return to normal; no catch-up reps.",
          }
        : dow === 1 || dow === 3
          ? {
              ...base,
              kind: "recovery",
              minutes: 25,
              title: "Stay fresh · light movement",
              detail:
                "Walk 20 min, then easy mobility. Optional 3 × 2 unweighted pull-ups only if completely recovered. No hard circuits.",
            }
          : {
              ...base,
              kind: "run",
              miles: dow === 0 ? 4 : 3,
              minutes: dow === 0 ? 40 : 30,
              title: "Easy maintenance run",
              detail:
                "Keep every mile conversational. Shorten or walk if recovering from the last attempt. Protect the next Sunday attempt.",
            };
  }
  const trip = trips.find(
    (t) =>
      date >= t.start &&
      date <= t.end &&
      (!t.tentative || settings.includeTentative),
  );
  if (trip && s.kind !== "rest") {
    if (s.attempt)
      s = {
        ...s,
        title: `${s.attempt} · travel conflict`,
        attempt: undefined,
        kind: "recovery",
        miles: 0,
        minutes: 25,
        detail:
          "Your trip overlaps this attempt. Use an easy travel morning and move the attempt to a recovered, equipped day; do not stack two attempts. This week is not an automatic RX test.",
      };
    else if (trip.kind === "ski")
      s = {
        ...base,
        kind: "recovery",
        title: "Ski day · legs already working",
        minutes: 15,
        miles: 0,
        detail:
          "10–15 min morning mobility. Skiing counts as today's endurance and leg load. Skip running, squats, and vested circuits. Keep the rest day; take more recovery after a long ski day.",
      };
    else
      s = {
        ...base,
        kind: s.kind === "run" ? "run" : "recovery",
        title: "Travel · maintain the habit",
        miles: s.kind === "run" ? Math.min(s.miles, 3) : 0,
        minutes: 30,
        detail:
          s.kind === "run"
            ? "20–30 min easy run or treadmill, up to 3 miles. No speed work or vest. After an overnight flight, walk and prioritize sleep instead."
            : "20–30 min easy walking and mobility. Optional 2 light sets of push-ups and rows if equipment is available. Do not improvise unsafe pull-up anchors.",
      };
    s.trip = trip;
    s.tag = trip.tentative ? "Tentative travel" : "Travel adjusted";
  } else if (
    s.kind !== "rest" &&
    trips.some(
      (t) =>
        dayDiff(date, t.end) > 0 &&
        dayDiff(date, t.end) <= 2 &&
        (!t.tentative || settings.includeTentative),
    )
  ) {
    s = {
      ...base,
      kind: "recovery",
      title: "Return home · recover first",
      minutes: 30,
      tag: "Re-entry",
      detail:
        "20–30 min easy walking or gentle cycling, plus mobility. Restore sleep before quality work. Resume at the last comfortable week, reducing volume if needed. Never make up missed sessions.",
    };
  }
  s.detail +=
    s.kind === "run" && !s.attempt
      ? " If fatigue or pain changes your stride, stop and reduce the session."
      : "";
  return s;
}

export function sessionFor(date: string, trips: Trip[] = [], settings: Settings = DEFAULT_SETTINGS): Session {
  const original = buildSession(date, trips, settings);
  const s = date >= REVISED_START ? revisedSession(original, settings) : {...original, murphMinutes: original.kind === "strength" ? 30 : original.title.includes("controlled strength") ? 15 : 0};
  const quality = /tempo|threshold|interval|assessment/i.test(s.title);
  const combined = s.kind === "run" && (s.murphMinutes ?? 0) > 0;
  const strength = s.kind === "strength" || s.kind === "murph";
  const recovery = s.kind === "recovery" || s.kind === "rest";
  const light = !s.attempt && (s.tag === "Taper" || s.tag === "Challenge maintenance");
  const effort = s.tag === "Flexible week" ? "Default easy run: 3–4 / 10. An optional, recovered running retry replaces it at 8–9." : s.tag === "Murph maintenance" ? "Calisthenics: 5–6 / 10, with 2–3 clean reps in reserve. Runs: 3–4." : light && (strength || combined) ? "Run: 3–4 / 10. Light calisthenics: at most 5, with at least 3 clean reps in reserve." : light && quality ? "Short intervals: 7 / 10; short threshold: 6. All other running: 3–4." : undefined;
  return { ...s,
    goal: s.attempt ? `Assess ${s.attempt} progress; attempts replace hard training.` : recovery ? "Restore readiness and absorb training." : quality ? "Improve running fitness through controlled, repeatable work." : strength ? "Build clean repeated sets for unpartitioned Murph." : combined ? "Build aerobic fitness and pulling/pushing strength without exhausting either." : "Build aerobic endurance while preserving recovery.",
    rpe: effort ?? (s.attempt ? "8–9 for a ready, deliberate attempt; scale if not ready." : recovery ? "1–2 / 10" : quality ? "Intervals: 7–8 / 10; threshold: 6–7. Warm-up and recovery: 2–4." : strength ? "Murph work: 5–6 initially, later 6–7; leave 2–3 clean reps in reserve. Runs stay easy at 3–4." : combined ? "Run: 3–4 / 10. Upper body: sets at most 7, with 2–3 clean reps in reserve." : "3–4 / 10; comfortable full sentences."),
    heartRate: recovery ? "No target; easy breathing." : s.attempt ? "No fixed cap; pace and effort guide the attempt, not an HR number to chase." : strength ? "No HR target for calisthenics: rep quality and recovery set the dose. Any practice runs stay conversational around 135–145 bpm." : quality ? "Threshold often 155–165 bpm; intervals may reach 165–175 late in a rep. HR lags: do not accelerate to force the number. Provisional effort guides, not measured zones." : "Start around 135–145 bpm with full-sentence conversation. Slow down if effort rises toward RPE 6 at 155 bpm. No HR target for upper-body work.",
  };
}

export function secondsLabel(minutes: number) {
  const total = Math.round(minutes * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
export function goalResults(logs: Workout[]) {
  const valid = logs.filter((l) => l.status === "completed");
  return {
    five: valid
      .filter(
        (l) =>
          l.kind === "run" &&
          l.miles >= MILES_5K - 0.001 && l.miles <= MILES_5K + 0.04 &&
          l.minutes > 0,
      )
      .sort((a, b) => a.minutes - b.minutes)[0],
    ten: valid
      .filter(
        (l) =>
          l.kind === "run" &&
          l.miles >= MILES_10K - 0.001 && l.miles <= MILES_10K + 0.05 &&
          l.minutes > 0,
      )
      .sort((a, b) => a.minutes - b.minutes)[0],
    murph: valid
      .filter(
        (l) =>
          l.kind === "murph" &&
          l.partition === "unpartitioned" &&
          !l.scaled &&
          l.vest >= 20 &&
          l.miles >= 2 &&
          l.pullups >= 100 &&
          l.pushups >= 200 &&
          l.squats >= 300 &&
          l.minutes > 0,
      )
      .sort((a, b) => a.minutes - b.minutes)[0],
  };
}

export function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function validateTrips(value: unknown): value is Trip[] {
  return (
    Array.isArray(value) &&
    value.length <= 200 &&
    value.every(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.title === "string" &&
        t.title.length <= 200 &&
        isDate(t.start) &&
        isDate(t.end) &&
        t.start <= t.end &&
        ["travel", "ski"].includes(t.kind) &&
        typeof t.tentative === "boolean",
    )
  );
}
export function validateLogs(value: unknown): value is Workout[] {
  return (
    Array.isArray(value) &&
    value.length <= 10000 &&
    value.every(
      (l) =>
        l &&
        typeof l.id === "string" &&
        isDate(l.date) &&
        typeof l.title === "string" &&
        typeof l.notes === "string" &&
        ["run", "strength", "murph", "recovery"].includes(l.kind) &&
        ["partitioned", "unpartitioned"].includes(l.partition) &&
        ["completed", "modified", "skipped"].includes(l.status) &&
        typeof l.scaled === "boolean" &&
        [
          "minutes",
          "miles",
          "pullups",
          "pushups",
          "squats",
          "vest",
          "strictMax",
          "weight",
          "rpe",
        ].every(
          (k) => typeof l[k] === "number" && Number.isFinite(l[k]) && l[k] >= 0,
        ) &&
        l.rpe <= 10 &&
        ["avgHr", "maxHr", "runMinutes", "strengthMinutes"].every(k => l[k] === undefined || (typeof l[k] === "number" && Number.isFinite(l[k]) && l[k] >= 0 && l[k] <= (k.endsWith("Hr") ? 250 : 1440))),
    )
  );
}
