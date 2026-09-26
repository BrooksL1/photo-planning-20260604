import { useId } from "react";

// Illustrated banner for a sun/moon tile: sky gradient + horizon, the sun
// (half-risen) or moon (drawn at its true phase and tilt), and three cloud
// bands -- high, mid, low -- whose density tracks the forecast cover toward
// the event. Low cloud sits on the horizon in front of the sun/moon, which is
// exactly the layer that blocks the view in real life.

export type SkySceneProps = {
  // "meteor"/"eclipse" draw a plain night sky with the event's glyph, so
  // celestial tiles keep the same image block as sun/moon tiles.
  body: "sun" | "moon" | "meteor" | "eclipse";
  rising: boolean;
  // 0-1 illuminated fraction, plus the on-screen rotation (degrees clockwise)
  // that turns the bright limb from "straight up" to where it really points.
  moon?: { fraction: number; rotationDeg: number };
  clouds: { low: number | null; mid: number | null; high: number | null } | null;
  cloudsLoading: boolean;
  // Small pill overlaid top-left (e.g. "Just passed · 12 min ago"). Lives on
  // the image so it never changes the tile's layout.
  badge?: string;
};

const W = 360;
const H = 100;
const HORIZON_Y = 80;
const BODY_X = 118;

// Fixed shuffled slot order, so 10% cover = the first slot, 20% = first two,
// etc. -- clouds spread across the sky rather than piling up on one side.
const SLOT_ORDER = [5, 2, 9, 0, 7, 11, 3, 6, 1, 10, 4, 8];
const SLOT_COUNT = SLOT_ORDER.length;
const SLOT_WIDTH = W / SLOT_COUNT;

// Per-slot size jitter so a row of clouds doesn't look stamped out.
const SLOT_SCALE = [1, 0.8, 1.15, 0.9, 1.05, 0.85, 1.2, 0.95, 0.8, 1.1, 0.9, 1];

function activeSlots(percent: number | null, offset: number): { x: number; s: number }[] {
  if (percent == null) return [];
  const count = Math.round((Math.max(0, Math.min(100, percent)) / 100) * SLOT_COUNT);
  return SLOT_ORDER.slice(0, count).map((slot) => ({
    x: slot * SLOT_WIDTH + SLOT_WIDTH / 2 + offset,
    s: SLOT_SCALE[slot],
  }));
}

// A soft continuous veil behind a layer's shapes: invisible when sparse,
// building to a solid-looking deck as cover approaches 100%.
function veilOpacity(percent: number | null): number {
  if (percent == null) return 0;
  return Math.max(0, (percent - 40) / 60) * 0.75;
}

const PALETTES = {
  sunrise: { sky: ["#8fb0dc", "#f4c9a8", "#ffdca8"], ground: "#3a3f55", high: "#ffffff", mid: "#fbf4ee", low: "#9da3b3" },
  sunset: { sky: ["#5d6fae", "#e2957e", "#f7b267"], ground: "#352f45", high: "#fff6ec", mid: "#f8e6dc", low: "#8f8797" },
  moon: { sky: ["#0c1330", "#1f2b55", "#34426f"], ground: "#0a0e20", high: "#aab3d6", mid: "#8c95bd", low: "#4c557c" },
};

// Lit part of a moon of radius r centered at the origin with the bright limb
// pointing up: the top semicircle, closed by the terminator -- a half-ellipse
// that bulges toward the lit side for a crescent and away from it for a gibbous.
function moonLitPath(fraction: number, r: number): string {
  const ry = r * Math.abs(1 - 2 * fraction);
  const sweep = fraction < 0.5 ? 0 : 1;
  return `M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 A ${r} ${ry} 0 0 ${sweep} ${-r} 0 Z`;
}

function Sun({ glowId, diskId }: { glowId: string; diskId: string }) {
  return (
    <g>
      <circle cx={BODY_X} cy={HORIZON_Y} r={46} fill={`url(#${glowId})`} />
      <circle cx={BODY_X} cy={HORIZON_Y} r={21} fill={`url(#${diskId})`} />
    </g>
  );
}

function Moon({ fraction, rotationDeg, glowId }: { fraction: number; rotationDeg: number; glowId: string }) {
  const r = 22;
  const cy = 50;
  return (
    <g>
      <circle cx={BODY_X} cy={cy} r={42} fill={`url(#${glowId})`} opacity={0.35 + 0.65 * fraction} />
      <circle cx={BODY_X} cy={cy} r={r} fill="#232c4f" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={0.8} />
      <g transform={`translate(${BODY_X} ${cy}) rotate(${rotationDeg})`}>
        <path d={moonLitPath(fraction, r)} fill="#f4f1e4" />
      </g>
    </g>
  );
}

function MeteorStreaks() {
  return (
    <g stroke="#ffffff" strokeLinecap="round">
      <path d="M150 18 L112 44" strokeWidth={2} opacity={0.9} />
      <path d="M196 26 L170 44" strokeWidth={1.4} opacity={0.7} />
      <path d="M92 16 L76 27" strokeWidth={1.2} opacity={0.6} />
    </g>
  );
}

function EclipseDiscs() {
  return (
    <g>
      <circle cx={BODY_X} cy={46} r={20} fill="#fff3c4" opacity={0.9} />
      <circle cx={BODY_X + 11} cy={46} r={20} fill="#141c3d" stroke="#ffffff" strokeOpacity={0.25} />
    </g>
  );
}

function RiseSetArrow({ rising, color }: { rising: boolean; color: string }) {
  const x = BODY_X + 40;
  const d = rising ? `M ${x} 70 V 50 M ${x - 5} 55 L ${x} 50 L ${x + 5} 55` : `M ${x} 50 V 70 M ${x - 5} 65 L ${x} 70 L ${x + 5} 65`;
  return <path d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

export default function SkyScene({ body, rising, moon, clouds, cloudsLoading, badge }: SkySceneProps) {
  const uid = useId().replace(/:/g, "");
  const palette = body !== "sun" ? PALETTES.moon : rising ? PALETTES.sunrise : PALETTES.sunset;
  const skyId = `sky-${uid}`;
  const glowId = `glow-${uid}`;
  const diskId = `disk-${uid}`;
  const dark = body !== "sun";

  const layers: { key: "high" | "mid" | "low"; label: string; value: number | null; topPct: number }[] = [
    { key: "high", label: "High", value: clouds?.high ?? null, topPct: 20 },
    { key: "mid", label: "Mid", value: clouds?.mid ?? null, topPct: 42 },
    { key: "low", label: "Low", value: clouds?.low ?? null, topPct: 66 },
  ];

  const pillClass = dark ? "bg-black/40 text-white/90" : "bg-white/75 text-gray-700";

  return (
    <div className="relative w-full aspect-[360/100] rounded-lg overflow-hidden mt-3 mb-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden>
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.sky[0]} />
            <stop offset="0.6" stopColor={palette.sky[1]} />
            <stop offset="0.8" stopColor={palette.sky[2]} />
          </linearGradient>
          <radialGradient id={glowId}>
            <stop offset="0" stopColor={dark ? "#e8ecff" : "#fff3c4"} stopOpacity={dark ? 0.35 : 0.9} />
            <stop offset="1" stopColor={dark ? "#e8ecff" : "#ffb347"} stopOpacity={0} />
          </radialGradient>
          <radialGradient id={diskId} cx="0.45" cy="0.4">
            <stop offset="0" stopColor="#fffbe6" />
            <stop offset="0.6" stopColor="#ffd36b" />
            <stop offset="1" stopColor="#ff9f43" />
          </radialGradient>
        </defs>

        <rect width={W} height={H} fill={`url(#${skyId})`} />

        {dark &&
          [
            [28, 14],
            [70, 30],
            [205, 12],
            [248, 36],
            [300, 20],
            [338, 44],
            [180, 48],
            [52, 58],
          ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.9} fill="#ffffff" opacity={0.7} />)}

        {body === "sun" && <Sun glowId={glowId} diskId={diskId} />}
        {body === "moon" && (
          <Moon fraction={moon?.fraction ?? 0.5} rotationDeg={moon?.rotationDeg ?? 0} glowId={glowId} />
        )}
        {body === "meteor" && <MeteorStreaks />}
        {body === "eclipse" && <EclipseDiscs />}

        {/* High: thin cirrus streaks */}
        <rect y={12} width={W} height={14} rx={7} fill={palette.high} opacity={veilOpacity(clouds?.high ?? null) * 0.6} />
        {activeSlots(clouds?.high ?? null, 0).map(({ x, s }, i) => (
          <g key={`h${i}`} transform={`rotate(-6 ${x} 20)`} fill={palette.high} opacity={0.85}>
            <ellipse cx={x} cy={18} rx={17 * s} ry={1.6} />
            <ellipse cx={x + 7} cy={22} rx={12 * s} ry={1.2} />
          </g>
        ))}
        {/* Mid: puffy altocumulus clusters */}
        <rect y={38} width={W} height={11} rx={5} fill={palette.mid} opacity={veilOpacity(clouds?.mid ?? null)} />
        {activeSlots(clouds?.mid ?? null, 8).map(({ x, s }, i) => (
          <g key={`m${i}`} transform={`translate(${x} 44) scale(${s}) translate(${-x} -44)`} fill={palette.mid} opacity={0.93}>
            <circle cx={x - 7} cy={44} r={5} />
            <circle cx={x} cy={41} r={6.5} />
            <circle cx={x + 8} cy={44} r={5} />
            <rect x={x - 12} y={44} width={24} height={4} rx={2} />
          </g>
        ))}

        <rect y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill={palette.ground} />
        <line x1={0} x2={W} y1={HORIZON_Y} y2={HORIZON_Y} stroke="#ffffff" strokeOpacity={dark ? 0.2 : 0.45} />

        {/* Low: heavy stratus banks sitting on the horizon, in front of the sun/moon */}
        <rect y={HORIZON_Y - 12} width={W} height={12} fill={palette.low} opacity={veilOpacity(clouds?.low ?? null)} />
        {activeSlots(clouds?.low ?? null, -6).map(({ x, s }, i) => (
          <g key={`l${i}`} fill={palette.low} opacity={0.97}>
            <ellipse cx={x} cy={HORIZON_Y - 6} rx={20 * s} ry={9 * s} />
            <ellipse cx={x + 9} cy={HORIZON_Y - 11 * s} rx={11 * s} ry={7 * s} />
          </g>
        ))}

        {(body === "sun" || body === "moon") && <RiseSetArrow rising={rising} color={dark ? "#dfe4ff" : "#ffffff"} />}
      </svg>

      {badge && (
        <span className="absolute left-2 top-2 text-[10px] leading-none font-semibold px-2 py-1 rounded-full whitespace-nowrap bg-gray-900/85 text-white">
          {badge}
        </span>
      )}

      <div className="absolute right-2 inset-y-0">
        {layers.map((l) => (
          <span
            key={l.key}
            className={`absolute right-0 -translate-y-1/2 whitespace-nowrap text-[10px] leading-none font-semibold px-1.5 py-[3px] rounded-full ${pillClass}`}
            style={{ top: `${l.topPct}%` }}
          >
            {l.label} {l.value != null ? `${Math.round(l.value)}%` : cloudsLoading ? "…" : "n/a"}
          </span>
        ))}
      </div>

    </div>
  );
}
