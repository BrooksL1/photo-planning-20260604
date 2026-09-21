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

function assess(inputs: FogInputs): FogAssessment {
  const spreadPoints = scoreSpread(inputs.spreadF);
  const humidityPoints = scoreHumidity(inputs.relativeHumidity);
  const windPoints = scoreWind(inputs.windSpeedMph);
  const cloudPoints = scoreCloud(inputs.cloudCoverPercent);
  const points = spreadPoints + humidityPoints + windPoints + cloudPoints;
  const likelihood: FogLikelihood = points >= 7 ? "Highly Favorable" : points >= 5 ? "Possible" : "Unlikely";
  return { likelihood, points, spreadPoints, humidityPoints, windPoints, cloudPoints, inputs };
}

export async function fetchFogAssessments(
  lat: number,
  lng: number,
  targets: Date[]
): Promise<FogAssessment[]> {
  const inputs = await fetchFogInputs(lat, lng, targets);
  return inputs.map(assess);
}
