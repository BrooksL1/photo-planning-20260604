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
      "Hold roughly 25 miles/week. Learn repeatable, submaximal strength work. One easy run gets short strides; no new hard running block yet.",
    checkpoint:
      "Consistent pain-free mornings; 6 × 2–3 strict pull-ups with clean reps and 2 reps in reserve.",
  },
  {
    title: "Build repeatability",
    start: "2026-11-23",
    end: "2027-01-03",
    focus:
      "One controlled quality run each week, alternating tempo and short intervals. Build bodyweight circuit volume gradually. Holiday travel becomes maintenance.",
    checkpoint:
      "A controlled 20-minute tempo and 6–8 rounds of 3 pull-ups / 6 push-ups / 9 squats, with no lingering soreness.",
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
      "Progress partial unpartitioned rehearsals only as recovery allows, toward 50–80 pull-ups, 100–160 push-ups, and 150–240 squats. Introduce goal-pace segments after a successful checkpoint. Keep most running conversational.",
    checkpoint:
      "For 5K: 3 × 1 km near 4:21/km, 2 min jog. For 10K: 3 × 2 km near 4:30/km, 2 min jog. These are readiness clues, not guarantees.",
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

const mileage = [
  25, 25, 26, 21, 26, 27, 27, 22, 24, 20, 20, 24, 18, 25, 22, 26, 18, 23, 25,
  26, 22, 18, 10,
];
export function sessionFor(
  date: string,
  trips: Trip[] = [],
  settings: Settings = DEFAULT_SETTINGS,
): Session {
  const index = Math.max(0, Math.floor(dayDiff(date, "2026-10-26") / 7));
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const target = mileage[Math.min(index, mileage.length - 1)];
  const long = Math.min(10, Math.round(target * 0.4));
  const short = Math.round(((target - long) / 3) * 10) / 10;
  const deload = [3, 7, 11, 15, 19].includes(index);
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
      minutes: long * 10,
      title: "Sunday long run",
      detail: `${long} miles at conversational effort (RPE 3–4/10). Keep the familiar 10-mile distance only when recovered. Fuel and drink for longer outings. No fast finish.`,
    };
  else if (dow === 1)
    s = {
      ...base,
      kind: "strength",
      title: "Strength · quality before quantity",
      detail: `Warm up 5–8 min. ${deload ? "4" : "6"} sets of ${index < 5 ? "2" : "2–4"} strict pull-ups, resting 90–120 sec. Keep 2 reps in reserve; use assistance when needed. Then 3 × 6–10 controlled push-ups, 3 × 8 split squats/side, 3 × 10 bodyweight hip hinges, and 2 × 30 sec side planks. Add reps only after two comfortable sessions.`,
    };
  else if (dow === 2) {
    const early = index < 4;
    const tempo = index % 2 === 0;
    const quality = early
      ? "Easy run + strides"
      : tempo
        ? "Controlled tempo"
        : "Intervals · controlled, repeatable";
    const work = early
      ? "Run easy. Finish with 4 × 15 sec relaxed strides, walking 60–90 sec between. Strides are smooth, never sprints."
      : tempo
        ? `Within the total distance, warm up 10–15 min, then ${index < 10 ? "2 × 8" : index < 17 ? "3 × 7" : "2 × 12"} min at RPE 6–7/10 with 3 min easy jog; cool down at least 10 min.`
        : `Within the total distance, warm up 10–15 min, then ${index < 10 ? "5 × 2" : "5 × 3"} min at current 5K effort, with 2 min easy jog; cool down at least 10 min. Reps should be even, with one left in reserve.`;
    s = {
      ...base,
      kind: "run",
      title: deload ? "Easy run · cutback" : quality,
      miles: short,
      minutes: Math.round(short * 10),
      detail: deload
        ? `${short} miles easy. Skip speed work this week.`
        : `${short} miles total, including warm-up and cooldown. ${work} Start from current fitness (25:00 5K), not goal pace. ${index >= 17 ? "After a successful checkpoint, replace the quality block with 3 × 1 km at 4:21/km OR 2 × 2 km at 4:30/km, with 2 min easy jog; do not add both or add these to the original work." : ""}`,
    };
  } else if (dow === 3 || dow === 5)
    s = {
      ...base,
      kind: "run",
      title: dow === 3 ? "Easy aerobic miles" : "Easy run · absorb the work",
      miles: short,
      minutes: Math.round(short * 10),
      detail: `${short} miles at RPE 3–4/10, able to speak full sentences. A rough starting range is 9:30–11:00/mile, but effort wins over pace. Finish with 5 min calf and hip mobility.`,
    };
  else {
    const rounds = deload
      ? 4
      : index < 4
        ? 4
        : index < 10
          ? 6
          : index < 16
            ? 8
            : index < 19
              ? 10
              : index < 21
                ? 12
                : 16;
    const reps =
      index < 10
        ? "3 pull-ups / 6 push-ups / 9 air squats"
        : "up to 5 pull-ups / 10 push-ups / 15 air squats";
    const per = index < 10 ? 3 : 5;
    const block =
      settings.partition === "unpartitioned"
        ? `Up to ${rounds * per} pull-ups, THEN ${rounds * per * 2} push-ups, THEN ${rounds * per * 3} squats. Finish each movement before starting the next. Use sets of 2–3 pull-ups and 5–10 push-ups, resting 30–90 sec. `
        : `Up to ${rounds} rounds of ${reps}, resting 60–90 sec. `;
    s = {
      ...base,
      kind: "strength",
      title: "Murph practice · leave some in reserve",
      minutes: index >= 17 ? 60 : 45,
      detail: `Warm up 8 min. ${block}Scale push-ups before form fails. Stop at ${index >= 17 ? 45 : 30} min of work, even if the planned reps are unfinished. ${settings.partition === "unpartitioned" ? "In the specific phase, add a half-mile easy run before and after only if the blocks are comfortable. Do not add run distance and vest load together." : "Practice consistent transitions, without racing the clock."} ${settings.vestReady && index >= 10 ? "Only after 50/100/150 comfortable bodyweight reps and normal recovery: try 5–10 lb for a few small sets. Build load or reps in a session, never both. Full 20 lb only after repeated pain-free lighter sessions." : "Bodyweight only. A vest stays out until the readiness check is satisfied."} If sore for more than 48 hours, repeat or reduce the last comfortable dose.`,
    };
  }
  if (date >= "2027-03-22" && date < CHALLENGE_START && s.kind !== "rest") {
    s =
      dow === 1 || dow === 4
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
            ? `Target 57:00. 1 mile + 100 pull-ups / 200 push-ups / 300 air squats + 1 mile, with a 20 lb vest. ${settings.partition === "partitioned" ? "Partition as 20 rounds of 5/10/15; smaller sets are fine." : "Complete each movement before beginning the next."} Attempt RX only after repeated vested practice and normal recovery. Otherwise do a scaled rehearsal. Practice budget: 9 min first mile + 12 min pull-ups + 12 min push-ups + 12 min squats + 10 min final mile + 2 min transitions = 57 min. These are targets, not a reason to rush unsafe reps.`
            : `Target ${attempt.goal === "5K" ? "7:00/mile (4:21/km), about 21:45 total" : "45:00 (7:15/mile, 4:30/km)"}. Warm up 10–15 min, drills and 4 relaxed strides. Run a measured route, start controlled, then cool down 10 min. The logged miles and time should cover the timed effort only. If the checkpoint is not comfortable, make this a controlled run.`,
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
        : dow === 1 || dow === 4
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
        l.rpe <= 10,
    )
  );
}
