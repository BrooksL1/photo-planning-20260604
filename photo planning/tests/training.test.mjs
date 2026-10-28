import { strict as assert } from "node:assert";
import { test } from "node:test";
import load from "./tsLoader.cjs";
const {
  START,
  BIRTHDAY,
  ATTEMPTS,
  CHALLENGE_START,
  DEFAULT_SETTINGS,
  addDays,
  dayDiff,
  monday,
  sessionFor,
  goalResults,
  validateTrips,
  validateLogs,
} = load("../../training plan/src/plan.ts");

test("six attempts start exactly six weeks before the birthday and rotate twice", () => {
  assert.equal(dayDiff(BIRTHDAY, CHALLENGE_START), 42);
  assert.deepEqual(
    ATTEMPTS.map((a) => a.goal),
    ["5K", "10K", "Murph", "5K", "10K", "Murph"],
  );
  assert.deepEqual(
    ATTEMPTS.map((a) => a.date),
    [
      "2027-03-30",
      "2027-04-06",
      "2027-04-13",
      "2027-04-20",
      "2027-04-27",
      "2027-05-04",
    ],
  );
  for (const a of ATTEMPTS) assert.equal(sessionFor(a.date).attempt, a.goal);
});
test("complete weeks have six mornings, Saturday rest, and 25 baseline running miles", () => {
  for (let week = "2026-11-02"; week < "2027-05-04"; week = addDays(week, 7)) {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      sessionFor(addDays(week, i)),
    );
    assert.equal(sessions.filter((s) => s.kind !== "rest").length, 6, week);
    assert.equal(sessions[5].kind, "rest");
  }
  const baseline = Array.from({ length: 7 }, (_, i) =>
    sessionFor(addDays("2026-11-02", i)),
  );
  assert.equal(
    baseline.reduce((n, s) => n + s.miles, 0),
    25,
  );
  assert.equal(sessionFor(START).date, START);
  assert.equal(sessionFor(BIRTHDAY).kind, "rest");
});
test("date math stays calendar-correct over DST and year boundaries", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2027-03-13", 1), "2027-03-14");
  assert.equal(monday("2027-03-14"), "2027-03-08");
  assert.equal(monday("2027-03-15"), "2027-03-15");
});
test("travel reduces load, respects inclusive end dates, and returns gently", () => {
  const trips = [
    {
      id: "trip",
      title: "Away",
      start: "2026-11-12",
      end: "2026-11-15",
      kind: "travel",
      tentative: false,
    },
  ];
  assert.equal(sessionFor("2026-11-15", trips).miles, 3);
  assert.equal(sessionFor("2026-11-14", trips).kind, "rest");
  assert.equal(sessionFor("2026-11-16", trips).kind, "recovery");
  assert.equal(sessionFor("2026-11-17", trips).tag, "Re-entry");
  const ski = [{ ...trips[0], kind: "ski" }];
  assert.equal(sessionFor("2026-11-13", ski).miles, 0);
  assert.match(sessionFor("2026-11-13", ski).detail, /Skip running/);
  const tentative = [{ ...trips[0], tentative: true }];
  assert.equal(
    sessionFor("2026-11-15", tentative, {
      ...DEFAULT_SETTINGS,
      includeTentative: false,
    }).miles,
    10,
  );
});
test("a travel conflict cannot silently remain a challenge attempt", () => {
  const trips = [
    {
      id: "trip",
      title: "Away",
      start: "2027-03-30",
      end: "2027-03-30",
      kind: "travel",
      tentative: false,
    },
  ];
  const s = sessionFor("2027-03-30", trips);
  assert.equal(s.attempt, undefined);
  assert.equal(s.kind, "recovery");
  assert.equal(s.miles, 0);
});
test("unpartitioned Murph is the default and its aftermath replaces harder sessions", () => {
  assert.equal(DEFAULT_SETTINGS.partition, "unpartitioned");
  assert.match(sessionFor("2027-03-04").detail, /THEN/);
  assert.match(sessionFor("2027-04-13").detail, /Complete each movement/);
  for (const d of ["2027-04-14", "2027-04-15", "2027-04-16"])
    assert.equal(sessionFor(d).kind, "recovery");
});
test("only complete, unscaled, unpartitioned vested Murph logs count toward RX", () => {
  const log = {
    id: "1",
    date: "2027-04-13",
    title: "Murph",
    kind: "murph",
    partition: "unpartitioned",
    status: "completed",
    minutes: 56,
    miles: 2,
    pullups: 100,
    pushups: 200,
    squats: 300,
    vest: 20,
    strictMax: 0,
    weight: 0,
    rpe: 8,
    scaled: false,
    notes: "",
  };
  assert.ok(goalResults([log]).murph);
  for (const patch of [
    { partition: "partitioned" },
    { scaled: true },
    { vest: 0 },
    { pullups: 99 },
    { pushups: 199 },
    { squats: 299 },
    { miles: 1 },
    { status: "skipped" },
    { status: "modified" },
  ])
    assert.equal(goalResults([{ ...log, ...patch }]).murph, undefined);
  assert.ok(validateLogs([log]));
  assert.equal(validateLogs([{ ...log, date: "2027-02-30" }]), false);
});
test("imports reject malformed trip data and impossible dates", () => {
  assert.equal(
    validateTrips([
      {
        id: "x",
        title: "Away",
        start: "2027-02-30",
        end: "2027-03-02",
        kind: "travel",
        tentative: false,
      },
    ]),
    false,
  );
  assert.equal(
    validateTrips([
      {
        id: "x",
        title: "Away",
        start: "2027-03-02",
        end: "2027-03-01",
        kind: "travel",
        tentative: false,
      },
    ]),
    false,
  );
  assert.equal(validateTrips(null), false);
});

test("short runs cannot be counted as a completed 5K or 10K", () => {
  const run = { kind: "run", status: "completed", minutes: 21.75, miles: 3.107 };
  assert.ok(goalResults([run]).five);
  assert.equal(goalResults([{ ...run, miles: 3.08 }]).five, undefined);
  assert.equal(goalResults([{ ...run, miles: 5 }]).five, undefined);
  assert.ok(goalResults([{ ...run, minutes: 45, miles: 6.214 }]).ten);
  assert.equal(goalResults([{ ...run, minutes: 44, miles: 6.18 }]).ten, undefined);
});
