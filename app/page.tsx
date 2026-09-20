import Link from "next/link";
import type { ReactNode } from "react";

function SunriseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path
        d="M12 3v3M4.2 10.5l2.1 1.2M19.8 10.5l-2.1 1.2M2 17h20M5 17a7 7 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2 21h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path
        d="M12 3l1.8 4.9L19 9.5l-4.9 1.8L12 16l-1.8-4.7L5 9.5l5.2-1.6L12 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M19 15l.9 2.3L22 18l-2.1.8L19 21l-.9-2.2L16 18l2.1-.7L19 15Z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function ToolCard({
  href,
  external,
  icon,
  title,
  description,
  badge,
}: {
  href: string;
  external?: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  const className =
    "group relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-amber-500/40 hover:bg-white/[0.06] hover:shadow-[0_0_40px_-15px_rgba(245,158,11,0.5)]";

  const content = (
    <>
      <div className="flex items-start justify-between">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 transition-colors group-hover:bg-amber-500/20">
          {icon}
        </span>
        {badge && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            {badge}
          </span>
        )}
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-400">{description}</p>
      </div>
      <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-amber-400 opacity-0 transition-opacity group-hover:opacity-100">
        Open
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden bg-gray-950 px-6 py-24 text-white">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-[-6rem] h-96 w-96 rounded-full bg-orange-600/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:24px_24px] opacity-40" />
      </div>

      <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-500/80">
          brooksl.com
        </span>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Photography tools
        </h1>
        <p className="mt-4 max-w-md text-balance text-base text-gray-400">
          A small, growing set of tools I built for my own photography workflow —
          some are ready for anyone to try, others are wired up to run only on my
          own machine.
        </p>

        <div className="mt-14 grid w-full gap-5 sm:grid-cols-2">
          <ToolCard
            href="/PhotoPlanning"
            icon={<SunriseIcon />}
            title="Photo Planning"
            description="Golden hour & blue hour calculator — find the best light for a shoot, anywhere."
          />
          <ToolCard
            href="http://localhost:4000"
            external
            icon={<SparkleIcon />}
            title="AI Ratings"
            description="Review Lightroom photos with AI-suggested star ratings, side by side with your own."
            badge="Local only"
          />
        </div>
      </div>
    </main>
  );
}
