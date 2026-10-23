// Experimental 0-100 sunrise/sunset color score. Pure function: no network, so
// it can be tested and tuned against past dates. Every threshold below is a
// physically motivated PRIOR, not a fitted value -- calibrate against rated
// photos before trusting the numbers (see the analysis in the project notes).
//
// score = gate x canvas x clarity x precip, plus small history adjustments:
//   gate     can the low sun reach the clouds? (low cloud along the sun azimuth)
//   canvas   is there mid/high cloud to catch the light, but not a lid of it?
//   clarity  visibility, aerosol optical depth, humidity
//   precip   rain chance now; a recent washout is a small bonus

export type TransectPoint = {
  distanceMiles: number;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
};

export type SkyQualityInputs = {
  /** Cloud layers (%) at increasing distances toward the sun/event. */
  transect: TransectPoint[];
  visibilityMiles: number | null;
  relativeHumidity: number | null;
  precipProbability: number | null;
  /** Aerosol optical depth at 550 nm (CAMS). */
  aod: number | null;
  /** Rain over the 24 h before the event, mm. */
  precip24hMm: number | null;
  /** Mean sea-level pressure change over the 3 h before the event, hPa. */
  pressureTrend3h: number | null;
  /** Ice-cloud proxy: RH at 300 hPa (~9 km). High RH = cirrus likely present. */
  rh300: number | null;
};

export type SkyQualityLabel = "Too Much Cloud Cover" | "Low Potential" | "Some Potential" | "High Potential" | "Very Promising!";

export type SkyQuality = {
  score: number;
  label: SkyQualityLabel;
  gate: number;
  canvas: number;
  clarity: number;
  precip: number;
  adjustment: number;
  notes: string[];
};

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Cloud-layer usefulness as a canvas. A clear sky still gives a gradient
// (0.25); 25-65% is the sweet spot; a solid sheet is a grey lid (0.2).
function canvasCurve(pct: number): number {
  if (pct <= 25) return lerp(0.25, 1, clamp(pct / 25));
  if (pct <= 65) return 1;
  return lerp(1, 0.2, clamp((pct - 65) / 35));
}

// Low cloud nearer the observer blocks more of the sun's final light.
const distanceWeight = (miles: number) => 1 / (1 + miles / 60);

function visibilityFactor(miles: number): number {
  if (miles < 3) return 0.2;
  if (miles < 5) return lerp(0.2, 0.45, (miles - 3) / 2);
  if (miles < 10) return lerp(0.45, 1, (miles - 5) / 5);
  return 1;
}

// Light aerosol (0.1-0.4) is ideal: it saturates reds without muddying the
// sky. Very clean air is slightly pale; heavy smoke/haze flattens contrast.
function aodFactor(aod: number): number {
  if (aod < 0.05) return 0.9;
  if (aod <= 0.4) return 1;
  if (aod <= 0.8) return lerp(1, 0.5, (aod - 0.4) / 0.4);
  return lerp(0.5, 0.25, clamp((aod - 0.8) / 1.2));
}

function labelFor(score: number, canvasHeavy: boolean): SkyQualityLabel {
  if (canvasHeavy) return "Too Much Cloud Cover";
  if (score >= 75) return "Very Promising!";
  if (score >= 55) return "High Potential";
  if (score >= 35) return "Some Potential";
  return "Low Potential";
}

function average(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function scoreSkyQuality(input: SkyQualityInputs): SkyQuality | null {
  const usable = input.transect.filter((p) => p.cloudLow != null && p.cloudMid != null && p.cloudHigh != null);
  if (usable.length === 0) return null;
  const notes: string[] = [];

  // --- gate: low cloud along the azimuth ---
  let wSum = 0;
  let lowW = 0;
  let lowWorst = 0; // worst single bank, discounted by how far away it is
  const nearWeight = distanceWeight(Math.min(...usable.map((p) => p.distanceMiles)));
  for (const p of usable) {
    const w = distanceWeight(p.distanceMiles);
    wSum += w;
    lowW += w * (p.cloudLow as number);
    lowWorst = Math.max(lowWorst, (p.cloudLow as number) * Math.min(1, (1.2 * w) / nearWeight));
  }
  lowW /= wSum;
  const gateWeighted = clamp(1 - (lowW - 15) / 40); // 1 at <=15%, 0 at >=55%
  const gateWorst = clamp(1 - (lowWorst - 40) / 50); // one solid bank is enough to block
  const gate = gateWeighted * gateWorst;
  if (gate < 0.5) notes.push(`Low cloud toward the sun averages ${Math.round(lowW)}% coverage, likely blocking the horizon.`);

  // --- canvas: mid/high cloud, judged near the event (<= 120 mi) ---
  const near = usable.filter((p) => p.distanceMiles <= 120);
  const canvasPts = near.length ? near : usable;
  const mid = average(canvasPts.map((p) => p.cloudMid)) as number;
  const high = average(canvasPts.map((p) => p.cloudHigh)) as number;
  const cMid = canvasCurve(mid);
  const cHigh = canvasCurve(high);
  // One good layer is enough; the second adds layering for depth.
  const canvas = Math.max(cMid, cHigh) * 0.8 + Math.min(cMid, cHigh) * 0.2;
  const canvasHeavy = mid + high > 160;
  if (canvasHeavy) notes.push("Mid-level and high clouds together form a near-solid gray lid.");

  // --- afterglow: far high/mid cloud still lit after the sun sets ---
  const far = usable.filter((p) => p.distanceMiles > 120);
  const farCanvas = average(far.map((p) => Math.max(canvasCurve(p.cloudMid as number), canvasCurve(p.cloudHigh as number))));
  let adjustment = 0;
  if (farCanvas != null && farCanvas > 0.9 && gate > 0.5) {
    adjustment += 3;
    notes.push("Clouds far off toward the sun (120+ miles) can keep glowing after sunset.");
  }

  // --- clarity ---
  const clarityParts: number[] = [];
  if (input.visibilityMiles != null) clarityParts.push(visibilityFactor(input.visibilityMiles));
  if (input.aod != null) clarityParts.push(aodFactor(input.aod));
  let clarity = clarityParts.length ? average(clarityParts)! : 1;
  if (input.relativeHumidity != null && input.relativeHumidity > 85) clarity *= 0.85;
  if (input.aod != null && input.aod > 0.8) notes.push("Heavy smoke or haze in the air: expect a red sun but a flat sky.");
  if (input.visibilityMiles != null && input.visibilityMiles < 5) notes.push(`Visibility is only ${input.visibilityMiles.toFixed(1)} miles.`);
  const clarityFactor = 0.4 + 0.6 * clarity;

  // --- precipitation ---
  const pp = input.precipProbability;
  const precip = pp == null ? 1 : pp <= 40 ? 1 : lerp(1, 0.2, clamp((pp - 40) / 40));
  if (pp != null && pp > 60) notes.push(`${Math.round(pp)}% chance of rain or snow.`);

  // --- history: washout bonus, pressure trend ---
  const rainedRecently = input.precip24hMm != null && input.precip24hMm >= 1 && input.precip24hMm <= 15;
  if (rainedRecently && (pp ?? 0) < 20 && gate > 0.5) {
    adjustment += 5;
    notes.push("Rain in the last day, now clearing: the air should be washed clean.");
  }
  if (input.pressureTrend3h != null) {
    if (input.pressureTrend3h >= 1) adjustment += 2;
    if (input.pressureTrend3h <= -2) {
      adjustment -= 5;
      notes.push("Air pressure is falling fast: clouds are likely thickening ahead of a weather front.");
    }
  }
  // Ice cloud overhead (cirrus) with a modest high-cloud forecast: the model
  // may be underestimating the canvas.
  if (input.rh300 != null && input.rh300 > 70 && high < 20 && gate > 0.5) {
    adjustment += 2;
    notes.push("Moist air high up suggests thin wispy clouds that the forecast may be missing.");
  }

  const raw = 100 * gate * (0.15 + 0.85 * canvas) * clarityFactor * precip + adjustment;
  const score = Math.round(clamp(raw, 0, 100));
  return { score, label: labelFor(score, canvasHeavy), gate, canvas, clarity, precip, adjustment, notes };
}

export type SkyFactor = { name: string; verdict: "good" | "fair" | "poor"; text: string };

export type SkyExplanation = { summary: string; factors: SkyFactor[]; notes: string[] };

const verdictFor = (x: number, good: number, fair: number): SkyFactor["verdict"] => (x >= good ? "good" : x >= fair ? "fair" : "poor");

// Plain-English reading of a score, for the tile tooltip. Each factor is the
// same 0-1 multiplier the score is built from, bucketed into good/fair/poor.
export function explainSkyQuality(q: SkyQuality): SkyExplanation {
  const summary =
    q.label === "Too Much Cloud Cover"
      ? "Thick cloud will likely hide any color."
      : q.score >= 75
        ? "Good odds of strong color: a clear view to the sun plus clouds to light up."
        : q.score >= 55
          ? "Decent odds of nice color."
          : q.score >= 35
            ? "Some color is possible, but something is holding it back."
            : "Color is unlikely.";

  const sunPath = verdictFor(q.gate, 0.8, 0.4);
  const canvas = verdictFor(q.canvas, 0.8, 0.45);
  const clarity = verdictFor(q.clarity, 0.8, 0.5);
  const rain = verdictFor(q.precip, 0.95, 0.5);

  const factors: SkyFactor[] = [
    {
      name: "Light reaching the clouds",
      verdict: sunPath,
      text: { good: "Little low cloud toward the sun, so its light can get through.", fair: "Some low cloud toward the sun may dim or partly block it.", poor: "Low cloud toward the sun will likely block the light." }[sunPath],
    },
    {
      name: "Clouds to catch the color",
      verdict: canvas,
      text: { good: "Mid and high clouds should catch the light and glow.", fair: "Some clouds up high, but not an ideal amount.", poor: "Too few clouds to glow, or a solid gray layer." }[canvas],
    },
    {
      name: "Clear air",
      verdict: clarity,
      text: { good: "Clean, clear air.", fair: "Some haze or humidity will soften the color.", poor: "Haze, smoke or low visibility will wash out the color." }[clarity],
    },
    {
      name: "Rain",
      verdict: rain,
      text: { good: "Little chance of rain.", fair: "A fair chance of rain could spoil the view.", poor: "Rain is likely." }[rain],
    },
  ];

  return { summary, factors, notes: q.notes };
}
