"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  ATTEMPTS,
  BIRTHDAY,
  DEFAULT_SETTINGS,
  MILES_5K,
  PHASES,
  START,
  addDays,
  dayDiff,
  displayDate,
  goalResults,
  localDate,
  monday,
  phaseFor,
  secondsLabel,
  sessionFor,
  validateLogs,
  validateTrips,
  type Session,
  type Settings,
  type Trip,
  type Workout,
} from "./plan";
import styles from "./training.module.css";

const STORAGE_KEY = "brooksl.training.v1";
type Data = {
  version: 1;
  logs: Workout[];
  trips: Trip[];
  settings: Settings;
  calendarReviewed?: string;
};
const emptyData: Data = {
  version: 1,
  logs: [],
  trips: [],
  settings: DEFAULT_SETTINGS,
};
function validSettings(s: unknown): s is Settings {
  if (!s || typeof s !== "object") return false;
  const v = s as Settings;
  return (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(v.morning) &&
    ["partitioned", "unpartitioned"].includes(v.partition) &&
    typeof v.vestReady === "boolean" &&
    typeof v.includeTentative === "boolean"
  );
}
function isData(value: unknown): value is Data {
  if (!value || typeof value !== "object") return false;
  const d = value as Data;
  return (
    d.version === 1 &&
    validateLogs(d.logs) &&
    validateTrips(d.trips) &&
    validSettings(d.settings)
  );
}
function download(data: unknown, name: string, type = "application/json") {
  const url = URL.createObjectURL(
    new Blob(
      [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
      { type },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function blankLog(s: Session): Workout {
  return {
    id: "",
    date: s.date,
    title: s.title,
    kind: s.kind === "rest" ? "recovery" : s.kind,
    status: "completed",
    minutes: 0,
    miles: 0,
    pullups: 0,
    pushups: 0,
    squats: 0,
    vest: 0,
    strictMax: 0,
    weight: 0,
    rpe: 0,
    scaled: false,
    notes: "",
    partition: DEFAULT_SETTINGS.partition,
  };
}

export default function TrainingDashboard() {
  const [data, setData] = useState<Data>(emptyData);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [today, setToday] = useState(START);
  const [week, setWeek] = useState(monday(START));
  const [tab, setTab] = useState<"week" | "roadmap" | "journal" | "settings">(
    "week",
  );
  const [selected, setSelected] = useState<Session | null>(null);
  const [editing, setEditing] = useState<Workout | null>(null);
  const [tripDraft, setTripDraft] = useState({
    title: "",
    start: "",
    end: "",
    kind: "travel" as Trip["kind"],
    tentative: false,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const now = localDate();
    setToday(now);
    setWeek(monday(now < START ? START : now >= BIRTHDAY ? "2027-05-04" : now));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isData(parsed)) setData(parsed);
        else
          setNotice(
            "Saved data could not be read. Import a backup before saving new entries.",
          );
      }
    } catch {
      setNotice(
        "Browser storage is unavailable or unreadable. Export a backup after logging.",
      );
    }
    setReady(true);
  }, []);
  function persist(next: Data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setData(next);
      setNotice("Saved on this device.");
    } catch {
      setNotice(
        "Could not save: browser storage is unavailable or full. Export your current data before leaving.",
      );
      setData(next);
    }
  }
  useEffect(() => {
    if (selected) {
      dialogRef.current?.showModal();
    } else dialogRef.current?.close();
  }, [selected]);
  function openLog(s: Session, existing?: Workout) {
    setEditing(
      existing ?? { ...blankLog(s), partition: data.settings.partition },
    );
    setSelected(s);
  }
  function saveLog(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const log = { ...editing, id: editing.id || crypto.randomUUID() };
    persist({
      ...data,
      logs: [...data.logs.filter((l) => l.id !== log.id), log],
    });
    setSelected(null);
  }
  async function importFile(e: ChangeEvent<HTMLInputElement>, restore = false) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("File is too large.");
      const input = JSON.parse(await file.text());
      if (restore) {
        if (!isData(input))
          throw new Error("This is not a valid training backup.");
        // Merge by ID so an older backup cannot silently erase current records.
        const logs = [
          ...new Map(
            [...input.logs, ...data.logs].map((l) => [l.id, l]),
          ).values(),
        ];
        const trips = [
          ...new Map(
            [...input.trips, ...data.trips].map((t) => [t.id, t]),
          ).values(),
        ];
        persist({
          ...data,
          logs,
          trips,
          calendarReviewed: data.calendarReviewed ?? input.calendarReviewed,
        });
        setNotice("Backup merged. Current entries were kept when IDs matched.");
      } else {
        if (!validateTrips(input.trips))
          throw new Error(
            "Expected a calendar file with valid trips and inclusive YYYY-MM-DD dates.",
          );
        persist({
          ...data,
          trips: [
            ...new Map(
              [...data.trips, ...(input.trips as Trip[])].map((t) => [t.id, t]),
            ).values(),
          ],
          calendarReviewed:
            typeof input.reviewedAt === "string"
              ? input.reviewedAt
              : localDate(),
        });
        setNotice(
          "Calendar travel imported. The plan now adjusts those mornings.",
        );
      }
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Import failed. Your current data was kept.",
      );
    }
    e.target.value = "";
  }
  const phase = phaseFor(today);
  const focusDate =
    today < START ? START : today >= BIRTHDAY ? "2027-05-10" : today;
  const session = sessionFor(focusDate, data.trips, data.settings);
  const sessions = Array.from({ length: 7 }, (_, i) =>
    sessionFor(addDays(week, i), data.trips, data.settings),
  );
  const weekLogs = data.logs.filter(
    (l) =>
      l.date >= week && l.date <= addDays(week, 6) && l.status !== "skipped",
  );
  const totalMiles = weekLogs.reduce((n, l) => n + l.miles, 0);
  const plannedMiles = sessions.reduce((n, s) => n + s.miles, 0);
  const loggedDays = new Set(weekLogs.map((l) => l.date)).size;
  const results = goalResults(data.logs);
  const daysLeft = Math.max(0, dayDiff(BIRTHDAY, today));
  const nextAttempt = ATTEMPTS.find((a) => a.date >= today);
  const lastWeek = monday("2027-05-10");
  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (key === "morning" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) {
      setNotice("Choose a valid morning start time.");
      return;
    }
    persist({ ...data, settings: { ...data.settings, [key]: value } });
  }
  function exportCalendar() {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//brooksL//Road to 45//EN",
      "CALSCALE:GREGORIAN",
    ];
    for (let date = START; date < BIRTHDAY; date = addDays(date, 1)) {
      const s = sessionFor(date, data.trips, data.settings);
      if (s.kind === "rest") continue;
      // Floating local times keep the requested morning time at the destination.
      const start = `${date.replaceAll("-", "")}T${data.settings.morning.replace(":", "")}00`;
      const duration = Math.max(15, s.minutes);
      const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z");
      const escape = (v: string) =>
        v
          .replace(/\\/g, "\\\\")
          .replace(/\n/g, "\\n")
          .replace(/,/g, "\\,")
          .replace(/;/g, "\\;");
      lines.push(
        "BEGIN:VEVENT",
        `UID:road45-${date}@brooksl.com`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${start}`,
        `DURATION:PT${duration}M`,
        `SUMMARY:${escape(s.title)}`,
        `DESCRIPTION:${escape(s.detail)}`,
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    // RFC 5545 folds long content lines at no more than 75 octets.
    const folded =
      lines
        .map((line) => {
          let out = "",
            size = 0;
          for (const c of line) {
            const n = new TextEncoder().encode(c).length;
            if (size + n > 74) {
              out += "\r\n ";
              size = 1;
            }
            out += c;
            size += n;
          }
          return out;
        })
        .join("\r\n") + "\r\n";
    download(folded, "road-to-45.ics", "text/calendar;charset=utf-8");
  }
  const goals = [
    {
      label: "THE FAST ONE",
      name: "5K",
      target: "7:00",
      unit: "per mile",
      sub: "≈ 21:45 finish · 4:21/km",
      baseline: "Starting point: 25:00",
      log: results.five,
      met:
        !!results.five &&
        results.five.minutes * 60 <= Math.round(MILES_5K * 7 * 60),
    },
    {
      label: "THE STEADY ONE",
      name: "10K",
      target: "45:00",
      unit: "total time",
      sub: "7:15/mile · 4:30/km",
      baseline: "Starting point: not measured",
      log: results.ten,
      met: !!results.ten && results.ten.minutes <= 45,
    },
    {
      label: "THE ALL-IN ONE",
      name: "Murph",
      target: "57:00",
      unit: "unpartitioned · 20 lb",
      sub: "1 mi · 100 / 200 / 300 · 1 mi",
      baseline: "Starting point: 6 strict pull-ups",
      log: results.murph,
      met: !!results.murph && results.murph.minutes <= 57,
    },
  ];
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <a href="/" className={styles.brand}>
          brooks<span>L</span>
          <span className={styles.brandDivider}>/</span>
          <span className={styles.brandSection}>training</span>
        </a>
        <a className={styles.headerLink} href="/PhotoPlanning">
          Photo Planning ↗
        </a>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>
              THE BIRTHDAY PROJECT · MAY 11, 2027
            </p>
            <h1>
              The road to <em>45.</em>
            </h1>
            <p className={styles.lede}>
              Three challenges. Six mornings a week.
              <br />
              Show up, put in the work, write it down.
            </p>
          </div>
          <div className={styles.countdown}>
            <strong>{ready ? daysLeft : "—"}</strong>
            <span>DAYS TO 45</span>
            <small>Oct 27 → May 11</small>
          </div>
        </div>
        <section aria-label="Birthday challenge goals" className={styles.goals}>
          {goals.map((g, i) => (
            <article className={styles.goal} key={g.name}>
              <div className={styles.goalTop}>
                <span className={styles.eyebrow}>{g.label}</span>
                <span className={styles.goalNumber}>0{i + 1}</span>
              </div>
              <h2>{g.name}</h2>
              <div className={styles.target}>
                {g.target}
                <span>{g.unit}</span>
              </div>
              <p>{g.sub}</p>
              <div className={styles.goalBottom}>
                <span className={g.met ? styles.achieved : styles.goalStatus}>
                  {g.met
                    ? "✓ Goal logged"
                    : g.log
                      ? `Best logged: ${secondsLabel(g.log.minutes)}`
                      : "Goal ahead"}
                </span>
                <small>{g.baseline}</small>
              </div>
            </article>
          ))}
        </section>
        <div className={styles.toolbar}>
          <nav aria-label="Training views" className={styles.tabs}>
            {(
              [
                ["week", "This week"],
                ["roadmap", "The plan"],
                ["journal", "Workout log"],
                ["settings", "Travel & settings"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                className={tab === key ? styles.activeTab : ""}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <span className={styles.localBadge}>
            <span /> Saved on this device
          </span>
        </div>
        <p className={styles.notice} role="status" aria-live="polite">
          {notice ||
            (!ready
              ? "Opening your journal…"
              : "Your workout log is private to this browser. Export a backup to keep a copy.")}
        </p>
        {!data.calendarReviewed && ready && (
          <div className={styles.importNotice}>
            <div>
              <strong>Bring your calendar into the plan.</strong>
              <p>
                Import the private travel file prepared from your calendars, or
                add trips in Travel & settings. Until then, this is the base
                plan.
              </p>
            </div>
            <button onClick={() => fileRef.current?.click()}>
              Import travel ↗
            </button>
          </div>
        )}
        <input
          hidden
          type="file"
          accept="application/json,.json"
          ref={fileRef}
          aria-label="Import calendar travel file"
          onChange={(e) => void importFile(e)}
        />
        <input
          hidden
          type="file"
          accept="application/json,.json"
          ref={restoreRef}
          aria-label="Import workout backup"
          onChange={(e) => void importFile(e, true)}
        />
        {tab === "week" && (
          <>
            <section className={styles.today}>
              <div className={styles.todayBody}>
                <p className={styles.eyebrow}>
                  {today === focusDate ? "TODAY" : "TRAINING BLOCK"} ·{" "}
                  {displayDate(focusDate, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {data.settings.morning}
                </p>
                <div className={styles.todayHeading}>
                  <span className={styles.sessionSymbol}>↗</span>
                  <h2>{session.title}</h2>
                </div>
                <p>{session.detail}</p>
                <button
                  className={styles.primaryButton}
                  disabled={!ready}
                  onClick={() => openLog(session)}
                >
                  Log this morning <span>＋</span>
                </button>
              </div>
              <aside className={styles.todayAside}>
                <p className={styles.eyebrow}>CURRENT CHAPTER</p>
                <h3>{phase.title}</h3>
                <p>{phase.focus}</p>
                <span>
                  {nextAttempt
                    ? `Next attempt · ${displayDate(nextAttempt.date)} · ${nextAttempt.goal}`
                    : "Challenge block complete"}
                </span>
              </aside>
            </section>
            <section className={styles.weekSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>YOUR WEEK AT A GLANCE</p>
                  <h2>
                    {displayDate(week)} — {displayDate(addDays(week, 6))}
                  </h2>
                </div>
                <div className={styles.weekNav}>
                  <button
                    aria-label="Previous week"
                    disabled={week <= monday(START)}
                    onClick={() => setWeek(addDays(week, -7))}
                  >
                    ←
                  </button>
                  <button onClick={() => setWeek(monday(focusDate))}>
                    Today
                  </button>
                  <button
                    aria-label="Next week"
                    disabled={week >= lastWeek}
                    onClick={() => setWeek(addDays(week, 7))}
                  >
                    →
                  </button>
                </div>
              </div>
              <div className={styles.weekStats}>
                <span>
                  <strong>{loggedDays}</strong> days logged
                </span>
                <span>
                  <strong>{totalMiles.toFixed(1)}</strong> miles logged
                </span>
                <span>
                  <strong>{plannedMiles.toFixed(1)}</strong> miles planned
                </span>
                <span>Saturday · full rest</span>
              </div>
              <div className={styles.days}>
                {sessions.map((s) => {
                  const logs = data.logs.filter((l) => l.date === s.date);
                  return (
                    <article
                      key={s.date}
                      className={`${styles.day} ${s.date === today ? styles.currentDay : ""}`}
                    >
                      <div className={styles.dayDate}>
                        <span>{displayDate(s.date, { weekday: "short" })}</span>
                        <strong>
                          {displayDate(s.date, { day: "numeric" })}
                        </strong>
                      </div>
                      <div className={styles.dayBody}>
                        <span
                          className={`${styles.type} ${s.attempt ? styles.attemptType : ""}`}
                        >
                          {s.tag}
                        </span>
                        <h3>{s.title}</h3>
                        <p>
                          {s.kind === "rest"
                            ? "No alarm. No catch-up workout."
                            : `${data.settings.morning} · ${s.miles ? `${s.miles.toFixed(1)} mi · ` : ""}${s.minutes} min${s.trip ? ` · ${s.trip.title}` : ""}`}
                        </p>
                        <details>
                          <summary>Session details</summary>
                          <p>{s.detail}</p>
                        </details>
                        {logs.map((l) => (
                          <button
                            className={styles.loggedButton}
                            onClick={() => openLog(s, l)}
                            key={l.id}
                          >
                            {l.status === "skipped" ? "— Skipped" : "✓ Logged"}{" "}
                            · {l.title} · edit
                          </button>
                        ))}
                      </div>
                      {s.kind !== "rest" && (
                        <button
                          className={styles.dayLog}
                          aria-label={`Log workout ${s.date}`}
                          disabled={!ready}
                          onClick={() => openLog(s)}
                        >
                          ＋
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {tab === "roadmap" && (
          <section className={styles.roadmap}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>OCTOBER 27 → MAY 11</p>
                <h2>Build first. Then go for it.</h2>
              </div>
              <button className={styles.outlineButton} onClick={exportCalendar}>
                Export morning calendar ↗
              </button>
            </div>
            <p className={styles.sectionCopy}>
              A proposed progression from 201 lb, a 25-minute 5K, 25 miles per
              week, and 6 strict pull-ups. No weights are required; use a
              pull-up bar, bodyweight, and a vest after readiness. No injuries
              were reported. The targets are ambitious; checkpoints guide
              progression rather than promise a result. Six scheduled mornings
              means four runs and two strength sessions in the build, with
              Saturday off. Sundays can take 90–110 minutes.
            </p>
            <div className={styles.phases}>
              {PHASES.map((p, i) => (
                <article key={p.title} className={styles.phase}>
                  <span className={styles.phaseIndex}>0{i + 1}</span>
                  <div>
                    <p className={styles.eyebrow}>
                      {displayDate(p.start)} — {displayDate(p.end)}
                    </p>
                    <h3>{p.title}</h3>
                    <p>{p.focus}</p>
                    <div className={styles.checkpoint}>
                      <strong>Checkpoint</strong>
                      <p>{p.checkpoint}</p>
                    </div>
                    <button
                      onClick={() => {
                        setWeek(monday(p.start));
                        setTab("week");
                      }}
                    >
                      Explore these weeks →
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <h3 className={styles.attemptHeading}>
              The six challenge mornings
            </h3>
            <div className={styles.attempts}>
              {ATTEMPTS.map((a) => (
                <button
                  key={a.date}
                  onClick={() => {
                    setWeek(monday(a.date));
                    setTab("week");
                  }}
                >
                  <span>
                    {displayDate(a.date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <strong>{a.goal}</strong>
                  <small>View the week →</small>
                </button>
              ))}
            </div>
            <div className={styles.coachNotes}>
              <h3>Keep the plan honest.</h3>
              <p>
                Easy runs use the talk test (RPE 3–4/10); quality work is
                controlled (6–7/10). Warm up before every strength session. Stop
                sets with 2 good reps left. Increase circuit reps only after two
                comfortable sessions, and cut them back if soreness lasts more
                than 48 hours. After travel or illness, resume at the last
                comfortable dose; never catch up missed work. Skiing is training
                load. Poor sleep, unusual fatigue, or joint pain means an easier
                morning.
              </p>
              <p>
                Before a full vested Murph, work up through repeated partial
                sessions with clean movement and normal recovery. Don’t jump
                from six strict pull-ups to 100 vested reps. Review readiness
                with a qualified coach; an injury or exercise restriction needs
                an individualized adjustment. No target body weight is
                prescribed.
              </p>
              <p>
                Program design is a conservative synthesis, not a copied or
                validated six-month coaching program. References:{" "}
                <a
                  href="https://www.crossfit.com/benchmark/murph"
                  target="_blank"
                  rel="noreferrer"
                >
                  CrossFit Murph standard
                </a>
                ,{" "}
                <a
                  href="https://www.crossfit.com/murph-workout-training-plan"
                  target="_blank"
                  rel="noreferrer"
                >
                  CrossFit’s progression guidance
                </a>
                ,{" "}
                <a
                  href="https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/exercise-intensity/art-20046887"
                  target="_blank"
                  rel="noreferrer"
                >
                  Mayo Clinic on effort and gradual progression
                </a>
                .
              </p>
            </div>
          </section>
        )}
        {tab === "journal" && (
          <section>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>THE WORK YOU ACTUALLY DID</p>
                <h2>Every morning counts.</h2>
              </div>
              <button
                className={styles.primaryButton}
                onClick={() => openLog(session)}
              >
                Log a workout ＋
              </button>
            </div>
            <div className={styles.journalStats}>
              <div>
                <strong>
                  {data.logs.filter((l) => l.status !== "skipped").length}
                </strong>
                <span>workouts recorded</span>
              </div>
              <div>
                <strong>
                  {data.logs
                    .reduce(
                      (n, l) => n + (l.status === "skipped" ? 0 : l.miles),
                      0,
                    )
                    .toFixed(1)}
                </strong>
                <span>total miles</span>
              </div>
              <div>
                <strong>
                  {Math.max(
                    6,
                    ...data.logs
                      .filter((l) => l.status !== "skipped")
                      .map((l) => l.strictMax),
                  )}
                </strong>
                <span>best strict set · baseline 6</span>
              </div>
            </div>
            {!data.logs.length ? (
              <div className={styles.empty}>
                <span>↗</span>
                <h3>Your first entry starts the story.</h3>
                <p>
                  Record the work, the effort, and how you felt. Modified
                  workouts count, too.
                </p>
                <button onClick={() => openLog(session)}>
                  Log your first workout →
                </button>
              </div>
            ) : (
              <div className={styles.entries}>
                {[...data.logs]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((l) => (
                    <article className={styles.entry} key={l.id}>
                      <div>
                        <p className={styles.eyebrow}>
                          {displayDate(l.date, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          · {l.status}
                        </p>
                        <h3>{l.title}</h3>
                        <p>
                          {l.minutes ? `${secondsLabel(l.minutes)} · ` : ""}
                          {l.miles ? `${l.miles.toFixed(2)} mi · ` : ""}
                          {l.rpe ? `RPE ${l.rpe}/10` : ""}
                          {l.vest ? ` · ${l.vest} lb vest` : ""}
                        </p>
                        {l.pullups + l.pushups + l.squats > 0 && (
                          <p>
                            {l.pullups} pull-ups · {l.pushups} push-ups ·{" "}
                            {l.squats} squats{l.scaled ? " · scaled" : ""}
                            {l.kind === "murph" ? ` · ${l.partition}` : ""}
                          </p>
                        )}
                        {l.notes && (
                          <p className={styles.entryNotes}>{l.notes}</p>
                        )}
                      </div>
                      <div className={styles.entryActions}>
                        <button
                          onClick={() =>
                            openLog(
                              sessionFor(l.date, data.trips, data.settings),
                              l,
                            )
                          }
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this workout entry?"))
                              persist({
                                ...data,
                                logs: data.logs.filter((w) => w.id !== l.id),
                              });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            )}
            <div className={styles.backupBar}>
              <p>
                Logs stay in this browser. Clearing site data removes them.
                Export regularly; import a backup to move to another device.
              </p>
              <button
                onClick={() => download(data, `road-to-45-${localDate()}.json`)}
              >
                Export backup ↓
              </button>
              <button onClick={() => restoreRef.current?.click()}>
                Import backup ↑
              </button>
            </div>
          </section>
        )}
        {tab === "settings" && (
          <section className={styles.settings}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>MAKE ROOM FOR REAL LIFE</p>
                <h2>Travel, timing & standards.</h2>
              </div>
            </div>
            <div className={styles.settingsGrid}>
              <article className={styles.panel}>
                <h3>Your mornings</h3>
                <label>
                  Start time{" "}
                  <input
                    type="time"
                    value={data.settings.morning}
                    onChange={(e) => updateSetting("morning", e.target.value)}
                  />
                </label>
                <p>
                  Local time wherever you’re training. Most mornings take 45–60
                  minutes; Sunday needs longer. The calendar export uses local,
                  floating times.
                </p>
                <label>
                  Murph format{" "}
                  <select
                    value={data.settings.partition}
                    onChange={(e) =>
                      updateSetting(
                        "partition",
                        e.target.value as Settings["partition"],
                      )
                    }
                  >
                    <option value="partitioned">
                      Partitioned · 20 × 5/10/15
                    </option>
                    <option value="unpartitioned">Unpartitioned</option>
                  </select>
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={data.settings.vestReady}
                    onChange={(e) =>
                      updateSetting("vestReady", e.target.checked)
                    }
                  />
                  I have a vest and can complete 50 pull-ups, 100 push-ups, and
                  150 squats in small sets with normal recovery.
                </label>
                <p>
                  Your challenge: unpartitioned RX with a 20 lb vest.
                  Partitioned practice is optional; only an unpartitioned result
                  completes this goal. A scaled or unvested result stays in your
                  log but doesn’t mark the RX goal complete.
                </p>
                <button
                  className={styles.outlineButton}
                  onClick={exportCalendar}
                >
                  Download the plan as .ics ↓
                </button>
              </article>
              <article className={styles.panel}>
                <h3>Calendar-aware, privately</h3>
                <p>
                  {data.calendarReviewed
                    ? `Calendar snapshot reviewed ${data.calendarReviewed}. ${data.trips.length} travel blocks imported.`
                    : "Your calendar snapshot has not been imported on this device."}{" "}
                  This is a snapshot, not a live calendar sync. Confirm
                  tentative trips and add new travel as it is booked.
                </p>
                <p>
                  Travel means easy maintenance. Ski days replace leg work. Two
                  mornings after a trip ease you back in. Saturday stays off.
                  School holidays alone are not assumed to be trips.
                </p>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={data.settings.includeTentative}
                    onChange={(e) =>
                      updateSetting("includeTentative", e.target.checked)
                    }
                  />
                  Adjust for tentative trips, too
                </label>
                <button
                  className={styles.outlineButton}
                  onClick={() => fileRef.current?.click()}
                >
                  Import private calendar file ↑
                </button>
                <p>
                  File format:{" "}
                  <code>
                    {
                      '{"trips":[{"id":"trip-1","title":"Away","start":"2026-12-01","end":"2026-12-03","kind":"travel","tentative":false}]}'
                    }
                  </code>
                </p>
              </article>
            </div>
            <article className={styles.panel}>
              <h3>Add a trip</h3>
              <form
                className={styles.tripForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tripDraft.end < tripDraft.start) {
                    setNotice("Trip end must be on or after its start.");
                    return;
                  }
                  persist({
                    ...data,
                    trips: [
                      ...data.trips,
                      { ...tripDraft, id: crypto.randomUUID() },
                    ],
                  });
                  setTripDraft({
                    title: "",
                    start: "",
                    end: "",
                    kind: "travel",
                    tentative: false,
                  });
                }}
              >
                <label>
                  Label
                  <input
                    required
                    maxLength={200}
                    placeholder="A few days away"
                    value={tripDraft.title}
                    onChange={(e) =>
                      setTripDraft({ ...tripDraft, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  First day
                  <input
                    required
                    type="date"
                    value={tripDraft.start}
                    onChange={(e) =>
                      setTripDraft({ ...tripDraft, start: e.target.value })
                    }
                  />
                </label>
                <label>
                  Last day (inclusive)
                  <input
                    required
                    type="date"
                    min={tripDraft.start}
                    value={tripDraft.end}
                    onChange={(e) =>
                      setTripDraft({ ...tripDraft, end: e.target.value })
                    }
                  />
                </label>
                <label>
                  Type
                  <select
                    value={tripDraft.kind}
                    onChange={(e) =>
                      setTripDraft({
                        ...tripDraft,
                        kind: e.target.value as Trip["kind"],
                      })
                    }
                  >
                    <option value="travel">Travel</option>
                    <option value="ski">Skiing</option>
                  </select>
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={tripDraft.tentative}
                    onChange={(e) =>
                      setTripDraft({
                        ...tripDraft,
                        tentative: e.target.checked,
                      })
                    }
                  />
                  Tentative
                </label>
                <button className={styles.primaryButton}>Add trip ＋</button>
              </form>
              <div className={styles.tripList}>
                {[...data.trips]
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .map((t) => (
                    <div key={t.id}>
                      <span>
                        <strong>{t.title}</strong>
                        <small>
                          {displayDate(t.start)} — {displayDate(t.end)} ·{" "}
                          {t.kind}
                          {t.tentative ? " · tentative" : ""}
                        </small>
                      </span>
                      <button
                        aria-label={`Remove ${t.title}`}
                        onClick={() =>
                          persist({
                            ...data,
                            trips: data.trips.filter((v) => v.id !== t.id),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
              </div>
            </article>
            <div className={styles.backupBar}>
              <p>
                Workout data and travel dates are kept on this device, separate
                from the public plan.
              </p>
              <button
                onClick={() => download(data, `road-to-45-${localDate()}.json`)}
              >
                Export backup ↓
              </button>
              <button onClick={() => restoreRef.current?.click()}>
                Merge backup ↑
              </button>
            </div>
          </section>
        )}
        <footer className={styles.footer}>
          <a href="/">← All brooksL tools</a>
          <span>Consistency over heroics. Come back tomorrow.</span>
        </footer>
      </main>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onCancel={() => setSelected(null)}
        onClose={() => setSelected(null)}
      >
        {editing && (
          <form onSubmit={saveLog}>
            <div className={styles.dialogHeader}>
              <div>
                <p className={styles.eyebrow}>WRITE IT DOWN</p>
                <h2>{editing.id ? "Edit your workout" : "Log your morning"}</h2>
              </div>
              <button
                type="button"
                aria-label="Close workout form"
                onClick={() => setSelected(null)}
              >
                ✕
              </button>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.fullWidth}>
                Workout
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <label>
                Date
                <input
                  required
                  type="date"
                  value={editing.date}
                  onChange={(e) =>
                    setEditing({ ...editing, date: e.target.value })
                  }
                />
              </label>
              <label>
                Type
                <select
                  value={editing.kind}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      kind: e.target.value as Workout["kind"],
                    })
                  }
                >
                  <option value="run">Run</option>
                  <option value="strength">Strength</option>
                  <option value="murph">Murph</option>
                  <option value="recovery">Recovery</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      status: e.target.value as Workout["status"],
                    })
                  }
                >
                  <option value="completed">Completed</option>
                  <option value="modified">Modified</option>
                  <option value="skipped">Skipped</option>
                </select>
              </label>
              <label>
                Murph format
                <select
                  value={editing.partition}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      partition: e.target.value as Workout["partition"],
                    })
                  }
                >
                  <option value="unpartitioned">Unpartitioned</option>
                  <option value="partitioned">Partitioned</option>
                </select>
              </label>
              <label>
                Effort · RPE 0–10
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  value={editing.rpe || ""}
                  placeholder="6"
                  onChange={(e) =>
                    setEditing({ ...editing, rpe: Number(e.target.value) })
                  }
                />
              </label>
              {(
                [
                  ["minutes", "Time · minutes (decimals OK)", "0.01"],
                  ["miles", "Distance · miles", "0.001"],
                  ["pullups", "Total pull-ups", "1"],
                  ["pushups", "Total push-ups", "1"],
                  ["squats", "Total air squats", "1"],
                  ["vest", "Vest · lb", "0.5"],
                  ["strictMax", "Best unbroken strict pull-ups", "1"],
                  ["weight", "Body weight · lb (optional)", "0.1"],
                ] as const
              ).map(([key, label, step]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    max={key === "minutes" ? 1440 : 10000}
                    step={step}
                    value={editing[key] || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
              <p className={`${styles.formHelp} ${styles.fullWidth}`}>
                Record actual work, not planned work. For a timed 5K/10K,
                exclude warm-up and cooldown (5K = 3.107 mi; 10K = 6.214 mi).
                Enter 21:45 as 21.75 minutes. For Murph, record full distance,
                reps, vest load, format, and any scaling.
              </p>
              <label className={`${styles.checkbox} ${styles.fullWidth}`}>
                <input
                  type="checkbox"
                  checked={editing.scaled}
                  onChange={(e) =>
                    setEditing({ ...editing, scaled: e.target.checked })
                  }
                />
                Used assistance, shortened reps, or otherwise scaled Murph
              </label>
              <label className={styles.fullWidth}>
                Notes · sets, format, recovery
                <textarea
                  rows={3}
                  maxLength={4000}
                  placeholder="What felt strong? What needs adjusting?"
                  value={editing.notes}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value })
                  }
                />
              </label>
            </div>
            <div className={styles.dialogFooter}>
              <span>Private to this browser · export to back up</span>
              <button className={styles.primaryButton} type="submit">
                Save workout ✓
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
