import { useId } from "react";

// Illustrated banner for a sun/moon tile: sky gradient + horizon, the sun
// (half-risen) or moon (drawn at its true phase and tilt), and three cloud
// bands -- high, mid, low -- whose density tracks the forecast cover toward
// the event. Low cloud sits on the horizon in front of the sun/moon, which is
// exactly the layer that blocks the view in real life.

export type SkySceneProps = {
  // "meteor"/"eclipse" draw a plain night sky with the event's glyph, so
  // celestial tiles keep the same image block as sun/moon tiles.
  // "none" = just sky (e.g. right now, at night with the moon down).
  body: "sun" | "moon" | "meteor" | "eclipse" | "none";
  rising: boolean;
  // 0-1 illuminated fraction, plus the on-screen rotation (degrees clockwise)
  // that turns the bright limb from "straight up" to where it really points.
  moon?: { fraction: number; rotationDeg: number };
  clouds: { low: number | null; mid: number | null; high: number | null } | null;
  cloudsLoading: boolean;
  // Small pill overlaid top-left (e.g. "Just passed · 12 min ago"). Lives on
  // the image so it never changes the tile's layout.
  badge?: string;
  // "Right now" mode: 0-1 share of the body's time above the horizon that has
  // passed. The body is placed along a dotted east-to-west arc at that point
  // (0 = rising at the left horizon, 0.5 = top, 1 = setting at the right)
  // instead of on the horizon, and the rise/set arrow is omitted.
  arc?: number;
  // Overrides the sky palette (default comes from body + rising).
  sky?: SkyKind;
  className?: string;
};

export type SkyKind = "sunrise" | "sunset" | "day" | "night";

const W = 360;
const H = 100;
const HORIZON_Y = 80;
const BODY_X = 118;
// Rising bodies sit left and climb up-right; setting bodies sit right and sink
// down-left. The set position stays clear of the cloud % labels on the right edge.
const RISE_X = 78;
const SET_X = 240;

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

// Right-now arc: elliptical path from the east horizon to the west, ending
// short of the cloud % labels on the right edge.
const ARC_CX = 160;
const ARC_RX = 120;
const ARC_RY = 52;

function arcPoint(f: number): { x: number; y: number } {
  const t = Math.PI * Math.max(0, Math.min(1, f));
  return { x: ARC_CX - ARC_RX * Math.cos(t), y: HORIZON_Y - ARC_RY * Math.sin(t) };
}

const PALETTES = {
  sunrise: { sky: ["#8fb0dc", "#f4c9a8", "#ffdca8"], ground: "#3a3f55", high: "#ffffff", mid: "#fbf4ee", low: "#9da3b3" },
  sunset: { sky: ["#5d6fae", "#e2957e", "#f7b267"], ground: "#352f45", high: "#fff6ec", mid: "#f8e6dc", low: "#8f8797" },
  day: { sky: ["#6f9fdc", "#a9c9ee", "#d3e3f5"], ground: "#3a3f55", high: "#ffffff", mid: "#f4f6fb", low: "#9aa3b5" },
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

function Sun({ x, cy = HORIZON_Y, glowId, diskId }: { x: number; cy?: number; glowId: string; diskId: string }) {
  return (
    <g>
      <circle cx={x} cy={cy} r={46} fill={`url(#${glowId})`} />
      <circle cx={x} cy={cy} r={21} fill={`url(#${diskId})`} />
    </g>
  );
}

const MOON_CY = 50;

function Moon({
  x,
  cy = MOON_CY,
  fraction,
  rotationDeg,
  glowId,
}: {
  x: number;
  cy?: number;
  fraction: number;
  rotationDeg: number;
  glowId: string;
}) {
  const r = 22;
  return (
    <g>
      <circle cx={x} cy={cy} r={42} fill={`url(#${glowId})`} opacity={0.35 + 0.65 * fraction} />
      <circle cx={x} cy={cy} r={r} fill="#232c4f" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={0.8} />
      <g transform={`translate(${x} ${cy}) rotate(${rotationDeg})`}>
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

// Diagonal arrow hinting at east-to-west travel: a rising body climbs up-right
// off its upper right; a setting body's arrow comes in from its upper left and
// points down-right into it. (bodyX, bodyY) is the body's center.
function RiseSetArrow({ rising, bodyX, bodyY, color }: { rising: boolean; bodyX: number; bodyY: number; color: string }) {
  const [x1, y1, x2, y2] = rising
    ? [bodyX + 26, bodyY - 8, bodyX + 42, bodyY - 24]
    : [bodyX - 42, bodyY - 24, bodyX - 26, bodyY - 8];
  // Arrowhead: two 6-unit barbs swept back 35 degrees from the tip.
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const barb = (offset: number) =>
    `${x2 - 6 * Math.cos(angle + offset)} ${y2 - 6 * Math.sin(angle + offset)}`;
  const spread = (35 * Math.PI) / 180;
  const d = `M ${x1} ${y1} L ${x2} ${y2} M ${barb(spread)} L ${x2} ${y2} L ${barb(-spread)}`;
  return <path d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

export default function SkyScene({
  body,
  rising,
  moon,
  clouds,
  cloudsLoading,
  badge,
  arc,
  sky,
  className = "mt-3 mb-1",
}: SkySceneProps) {
  const uid = useId().replace(/:/g, "");
  const skyKind: SkyKind = sky ?? (body !== "sun" ? "night" : rising ? "sunrise" : "sunset");
  const palette = skyKind === "night" ? PALETTES.moon : PALETTES[skyKind];
  const skyId = `sky-${uid}`;
  const glowId = `glow-${uid}`;
  const diskId = `disk-${uid}`;
  const dark = skyKind === "night";
  const onArc = arc != null ? arcPoint(arc) : null;
  const bodyX = onArc ? onArc.x : rising ? RISE_X : SET_X;

  const layers: { key: "high" | "mid" | "low"; label: string; value: number | null; topPct: number }[] = [
    { key: "high", label: "High", value: clouds?.high ?? null, topPct: 20 },
    { key: "mid", label: "Mid", value: clouds?.mid ?? null, topPct: 42 },
    { key: "low", label: "Low", value: clouds?.low ?? null, topPct: 66 },
  ];

  const pillClass = dark ? "bg-black/40 text-white/90" : "bg-white/75 text-gray-700";

  return (
    <div className={`relative w-full aspect-[360/100] rounded-lg overflow-hidden ${className}`}>
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

        {onArc && (
          <path
            d={`M ${ARC_CX - ARC_RX} ${HORIZON_Y} A ${ARC_RX} ${ARC_RY} 0 0 1 ${ARC_CX + ARC_RX} ${HORIZON_Y}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={dark ? 0.3 : 0.6}
            strokeWidth={1.2}
            strokeDasharray="2 4"
            strokeLinecap="round"
          />
        )}
        {body === "sun" && <Sun x={bodyX} cy={onArc?.y} glowId={glowId} diskId={diskId} />}
        {body === "moon" && (
          <Moon
            x={bodyX}
            cy={onArc?.y}
            fraction={moon?.fraction ?? 0.5}
            rotationDeg={moon?.rotationDeg ?? 0}
            glowId={glowId}
          />
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

        {!onArc && (body === "sun" || body === "moon") && (
          <RiseSetArrow
            rising={rising}
            bodyX={bodyX}
            bodyY={body === "sun" ? HORIZON_Y : MOON_CY}
            color={dark ? "#dfe4ff" : "#ffffff"}
          />
        )}
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
