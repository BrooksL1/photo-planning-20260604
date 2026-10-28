// Score a sunrise/sunset with the experimental sky-quality model.
//   node scripts/sky-score.cjs <lat> <lng> <YYYY-MM-DD> [sunset|sunrise]
// Works for dates within about 91 days back and 15 days ahead (the range of
// Open-Meteo's forecast endpoint). Prints the model inputs so you can compare
// them with what you remember of that evening.
const path = require("node:path");
const SunCalc = require("suncalc");
const load = require("../tests/tsLoader.cjs");

const lib = (name) => load(path.join(__dirname, "../app/PhotoPlanning/lib", name));
const { fetchSkyQualityInputs } = lib("skyInputs.ts");
const { scoreSkyQuality } = lib("skyQuality.ts");
const { toCompassBearing } = lib("geo.ts");

async function main() {
  const [latArg, lngArg, dateArg, kindArg = "sunset"] = process.argv.slice(2);
  const lat = Number(latArg);
  const lng = Number(lngArg);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg ?? "")) {
    console.error("usage: node scripts/sky-score.cjs <lat> <lng> <YYYY-MM-DD> [sunset|sunrise]");
    process.exit(2);
  }
  // Noon UTC of the date is a safe anchor for SunCalc's per-day times in the Americas.
  const times = SunCalc.getTimes(new Date(`${dateArg}T19:00:00Z`), lat, lng);
  const at = kindArg === "sunrise" ? times.sunrise : times.sunset;
  const bearing = toCompassBearing(SunCalc.getPosition(at, lat, lng).azimuth);

  console.log(`${kindArg} ${at.toISOString()}  bearing ${bearing.toFixed(0)} deg`);
  const inputs = await fetchSkyQualityInputs(lat, lng, bearing, at);
  if (!inputs) {
    console.log("No weather data for that time.");
    return;
  }
  for (const p of inputs.transect) {
    console.log(`  ${String(p.distanceMiles).padStart(3)} mi  low ${p.cloudLow}%  mid ${p.cloudMid}%  high ${p.cloudHigh}%`);
  }
  const { transect, ...rest } = inputs;
  console.log(" ", JSON.stringify(rest, (k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
  const result = scoreSkyQuality(inputs);
  console.log(`\nscore ${result.score}/100 (${result.label})`);
  console.log(
    `gate ${result.gate.toFixed(2)}  canvas ${result.canvas.toFixed(2)}  clarity ${result.clarity.toFixed(2)}  precip ${result.precip.toFixed(2)}  adj ${result.adjustment}`
  );
  for (const n of result.notes) console.log(" -", n);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
