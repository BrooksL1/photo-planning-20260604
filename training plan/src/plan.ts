export const START = "2026-10-27";
export const BIRTHDAY = "2027-05-11";
export const CHALLENGE_START = "2027-03-30";
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
      "Redistribute to roughly 22 miles/week to fit 50-minute weekdays. Learn repeatable, submaximal strength work. Five runs, with one controlled quality session; three calisthenics exposures of different sizes. Easy effort is anchored near 140 bpm and RPE 3–4.",
    checkpoint:
      "Consistent pain-free mornings; 6 × 2–3 strict pull-ups with clean reps and 2 reps in reserve.",
  },
  {
    title: "Build repeatability",
    start: "2026-11-23",
    end: "2027-01-03",
    focus:
      "One controlled quality run each week, alternating tempo and short intervals. Build repeatable nonfailure strength and sequential movement blocks gradually. Holiday travel becomes maintenance.",
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
    end: "2027-03-21",
    focus:
      "Progress partial unpartitioned rehearsals only as recovery allows, toward recoverable partial-volume blocks within the 50-minute morning limit. Introduce goal-pace segments after a successful checkpoint. Keep most running conversational.",
    checkpoint:
      "For 5K: 3 × 1 km near 7:00/mile, 2 min jog. For 10K: 3 × 2 km near 7:15/mile, 2 min jog. These are readiness clues, not guarantees.",
  },
  {
    title: "Freshen up",
    start: "2027-03-22",
    end: "2027-03-29",
    focus:
      "Reduce run volume and circuit reps. A few relaxed strides keep the legs sharp. No full Murph rehearsal or new vest load.",
    checkpoint:
      "Normal sleep and easy-run effort, no joint pain, and recovered from the last strength session.",
  },
  {
    title: "Six weeks. Three goals.",
    start: CHALLENGE_START,
    end: "2027-05-10",
    focus:
      "One Tuesday attempt per week, rotating 5K, 10K, Murph twice. Attempts replace hard sessions. The other mornings support recovery.",
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
export const ATTEMPTS = Array.from({ length: 6 }, (_, i) => ({
  date: addDays(CHALLENGE_START, i * 7),
  goal: (["5K", "10K", "Murph"] as const)[i % 3],
}));

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
      detail: "Review your journal, recover, and choose what comes next.",
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
  if (date >= "2027-03-22" && date < CHALLENGE_START && s.kind !== "rest") {
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
            : `Target ${attempt.goal === "5K" ? "7:00/mile, about 21:45 total" : "45:00 (7:15/mile); allow about 65 min with warm-up/cooldown, beyond the normal weekday cap"}. Warm up 10–15 min, drills and 4 relaxed strides. Run a measured route, start controlled, then cool down 10 min. The logged miles and time should cover the timed effort only. If the checkpoint is not comfortable, make this a controlled run.`,
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
                "Keep every mile conversational. Shorten or walk if recovering from the last attempt. Sunday stays short ahead of Tuesday.",
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
  const s = buildSession(date, trips, settings);
  const quality = /tempo|interval/i.test(s.title);
  const combined = s.title.includes("controlled strength");
  const recovery = s.kind === "recovery" || s.kind === "rest";
  return { ...s,
    goal: s.attempt ? `Assess ${s.attempt} progress; attempts replace hard training.` : recovery ? "Restore readiness and absorb training." : quality ? "Improve running fitness through controlled, repeatable work." : s.kind === "strength" ? "Build clean repeated sets for unpartitioned Murph." : combined ? "Build aerobic fitness and pulling/pushing strength without exhausting either." : "Build aerobic endurance while preserving recovery.",
    rpe: s.attempt ? "8–9 for a ready, deliberate attempt; scale if not ready." : recovery ? "1–2 / 10" : quality ? "Work: 6–8 / 10. Warm-up and recovery: 2–4." : s.kind === "strength" ? "5–6 overall; leave 2–3 clean reps in reserve." : combined ? "Run: 3–4 / 10. Strength: controlled, no failure." : "3–4 / 10; comfortable full sentences.",
    heartRate: recovery ? "No target; easy breathing." : s.kind === "strength" || s.attempt === "Murph" ? "No HR target for strength. Rep quality and recovery set the dose." : s.attempt ? "No fixed cap; pace and effort guide the attempt, not an HR number to chase." : quality ? "Reported anchors: 155 ≈ RPE 6, 165 ≈ 7, 175 ≈ 8. HR lags; these are not measured zones." : "Around 140 bpm. Check breathing in the mid-140s; slow down well before 155 if effort reaches 6/10. Provisional, not a measured threshold.",
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
