import Link from "next/link";
import styles from "./home.module.css";

function ToolIcon({ kind }: { kind: "sun" | "training" }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {kind === "sun" ? (
        <>
          <path d="M8 43h48M13 51h38M18 43a14 14 0 0 1 28 0M32 9v8M10 21l6 6M54 21l-6 6" />
          <circle cx="32" cy="31" r="22" strokeDasharray="1 7" opacity=".3" />
        </>
      ) : (
        <>
          <path d="m13 44 12-14 9 8 16-24M39 14h11v11M12 52h41" />
          <circle cx="16" cy="16" r="4" opacity=".4" />
        </>
      )}
    </svg>
  );
}

export default function Home() {
  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          brooks<span>L</span>
        </Link>
        <span>SMALL TOOLS. REAL LIFE.</span>
        <a href="#tools">Explore the tools ↓</a>
      </header>
      <main className={styles.main}>
        <section className={styles.intro}>
          <div className={styles.introLabel}>
            <span /> A PERSONAL TOOLBOX, ALWAYS GROWING
          </div>
          <h1>
            Find the light.
            <br />
            Put in <em>the work.</em>
          </h1>
          <p>
            A few things I built to make more of the day.
            <br />
            For the places worth seeing and the goals worth chasing.
          </p>
          <div className={styles.heroDetail} aria-hidden="true">
            <div />
            <span>
              LOOK OUTWARD
              <br />
              KEEP MOVING
            </span>
          </div>
        </section>
        <section id="tools" className={styles.tools} aria-label="Tools">
          <div className={styles.sectionLabel}>
            <span>THE TOOLBOX</span>
            <span className={styles.desktopCount}>01 — 03</span>
            <span className={styles.mobileCount}>02 TOOLS / 06 SPACES</span>
          </div>
          <Link
            href="/PhotoPlanning"
            prefetch={false}
            className={`${styles.tool} ${styles.photo}`}
          >
            <div className={styles.toolIcon}>
              <ToolIcon kind="sun" />
            </div>
            <div className={styles.toolBody}>
              <span className={styles.number}>01 / GET OUTSIDE</span>
              <h2>Photo Planning</h2>
              <p>
                Good photographs start with good light. Find golden hour, blue
                hour, and what’s happening in the sky — wherever you’re headed.
              </p>
              <span className={styles.open}>
                Find your light <span>↗</span>
              </span>
            </div>
            <div className={styles.photoArt} aria-hidden="true">
              <div className={styles.sun} />
              <div className={styles.horizon} />
              <div className={styles.hill} />
              <span>THE BEST LIGHT IS AHEAD.</span>
            </div>
          </Link>
          <div className={styles.emptySlot} aria-label="Space for a future tool"><span>Future tool</span></div>
          <Link
            href="/training"
            prefetch={false}
            className={`${styles.tool} ${styles.training}`}
          >
            <div className={styles.toolIcon}>
              <ToolIcon kind="training" />
            </div>
            <div className={styles.toolBody}>
              <span className={styles.number}>02 / SHOW UP</span>
              <h2>Training</h2>
              <p>
                The road to 45. A morning training plan and workout journal for
                a faster 5K, a 45-minute 10K, and a 57-minute RX Murph.
              </p>
              <span className={styles.open}>
                Put in the work <span>↗</span>
              </span>
            </div>
            <div className={styles.trainingArt} aria-hidden="true">
              <strong>
                45<span>↗</span>
              </strong>
              <span>THREE GOALS. ONE MORNING AT A TIME.</span>
            </div>
          </Link>
          <div className={styles.emptySlot} aria-label="Space for a future tool"><span>Future tool</span></div>
          <article className={`${styles.tool} ${styles.future}`}>
            <span className={styles.futureIcon}>＋</span>
            <div>
              <span className={styles.number}>03 / WHAT’S NEXT</span>
              <h2>Room for the next idea.</h2>
              <p>More tools will find a home here.</p>
            </div>
            <span className={styles.soon}>TO BE CONTINUED</span>
            <span className={styles.mobileFuture}>Future tool</span>
          </article>
          <div className={styles.emptySlot} aria-label="Space for a future tool"><span>Future tool</span></div>
        </section>
        <footer className={styles.footer}>
          <span>brooksL.com</span>
          <span>Built for my days. Here for yours.</span>
        </footer>
      </main>
    </div>
  );
}
