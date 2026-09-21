// Fog likelihood for a Sunrise/Sunset moment, derived from Open-Meteo's
// temperature/dew point/humidity/wind forecast (a single source -- unlike
// the 3-source weather audit table, this is one synthesized indicator, not
// a cross-check).

export type FogInputs = {
  tempF: number | null;
  dewPointF: number | null;
  spreadF: number | null;
  relativeHumidity: number | null;
  windSpeedMph: number | null;
  cloudCoverPercent: number | null;
};

export type FogLikelihood = "Unlikely" | "Possible" | "Highly Favorable";

export type FogAssessment = {
  likelihood: FogLikelihood;
  points: number;
  spreadPoints: number;
  humidityPoints: number;
  windPoints: number;
  cloudPoints: number;
  reason: string;
  inputs: FogInputs;
};

async function fetchFogInputs(lat: number, lng: number, targets: Date[]): Promise<FogInputs[]> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&hourly=temperature_2m,dew_point_2m,relative_humidity_2m,wind_speed_10m,cloud_cover" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph" +
    "&forecast_days=3&timezone=auto";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo fog inputs request failed (${res.status})`);
  }
  const data = await res.json();

  const hourlyTimes: Date[] = data.hourly.time.map((t: string) => new Date(t));
  const temp: number[] = data.hourly.temperature_2m;
  const dewPoint: number[] = data.hourly.dew_point_2m;
  const humidity: number[] = data.hourly.relative_humidity_2m;
  const wind: number[] = data.hourly.wind_speed_10m;
  const cloudCover: number[] = data.hourly.cloud_cover;

  function nearestIndex(target: Date): number {
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < hourlyTimes.length; i++) {
      const diff = Math.abs(hourlyTimes[i].getTime() - target.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  return targets.map((target) => {
    const idx = nearestIndex(target);
    const t = temp[idx] ?? null;
    const dp = dewPoint[idx] ?? null;
    return {
      tempF: t,
      dewPointF: dp,
      spreadF: t != null && dp != null ? t - dp : null,
      relativeHumidity: humidity[idx] ?? null,
      windSpeedMph: wind[idx] ?? null,
      cloudCoverPercent: cloudCover[idx] ?? null,
    };
  });
}

// 0 points outside the "necessary" bound, 1 between necessary and highly
// favorable, 2 at highly favorable.
function scoreSpread(spreadF: number | null): number {
  if (spreadF == null) return 0;
  if (spreadF < 2) return 2;
  if (spreadF < 4) return 1;
  return 0;
}

function scoreHumidity(rh: number | null): number {
  if (rh == null) return 0;
  if (rh > 95) return 2;
  if (rh > 90) return 1;
  return 0;
}

function scoreWind(windMph: number | null): number {
  if (windMph == null) return 0;
  if (windMph < 5) return 2;
  if (windMph < 10) return 1;
  return 0;
}

// Radiation fog forms under clear skies -- clouds trap heat and prevent the
// ground-level cooling that drives fog, so low cloud cover scores highest.
function scoreCloud(cloudCoverPercent: number | null): number {
  if (cloudCoverPercent == null) return 0;
  if (cloudCoverPercent < 20) return 2;
  if (cloudCoverPercent < 50) return 1;
  return 0;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function assess(inputs: FogInputs): FogAssessment {
  const spreadPoints = scoreSpread(inputs.spreadF);
  const humidityPoints = scoreHumidity(inputs.relativeHumidity);
  const windPoints = scoreWind(inputs.windSpeedMph);
  const cloudPoints = scoreCloud(inputs.cloudCoverPercent);
  const points = spreadPoints + humidityPoints + windPoints + cloudPoints;
  // Fog needs every condition working together -- one limiting factor (0 pt)
  // rules it out regardless of how favorable the others are.
  const limitingFactors: string[] = [];
  if (spreadPoints === 0) limitingFactors.push("temp–dew point spread");
  if (humidityPoints === 0) limitingFactors.push("humidity");
  if (windPoints === 0) limitingFactors.push("wind");
  if (cloudPoints === 0) limitingFactors.push("cloud cover");
  const anyLimiting = limitingFactors.length > 0;
  const likelihood: FogLikelihood = anyLimiting ? "Unlikely" : points === 8 ? "Highly Favorable" : "Possible";

  let reason: string;
  if (anyLimiting) {
    const verb = limitingFactors.length > 1 ? "aren't" : "isn't";
    reason = `Unlikely: ${joinWithAnd(limitingFactors)} ${verb} favorable for fog to form.`;
  } else if (likelihood === "Highly Favorable") {
    reason = "Highly Favorable: clear skies, high humidity, calm wind, and a tight temp–dew point spread all support fog forming.";
  } else {
    reason = "Possible: conditions are workable for fog, but not every factor is optimal.";
  }

  return { likelihood, points, spreadPoints, humidityPoints, windPoints, cloudPoints, reason, inputs };
}

export async function fetchFogAssessments(
  lat: number,
  lng: number,
  targets: Date[]
): Promise<FogAssessment[]> {
  const inputs = await fetchFogInputs(lat, lng, targets);
  return inputs.map(assess);
}
