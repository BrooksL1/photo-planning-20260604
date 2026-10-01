// "Right now" conditions at the pin (Open-Meteo `current=`, refreshed every
// 15 minutes upstream) -- a quick read of what the sky is doing before the
// next event, separate from the per-event forecasts.

const METERS_PER_MILE = 1609.34;

export type CurrentWeather = {
  observedAt: Date;
  tempF: number | null;
  relativeHumidity: number | null;
  windSpeedMph: number | null;
  visibilityMiles: number | null;
  precipitationIn: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  condition: string;
  // Raw WMO code, for picking the weather glyph.
  weatherCode: number | null;
  isDay: boolean;
};

// WMO weather interpretation codes, as Open-Meteo documents them.
function describeWeatherCode(code: number | null): string {
  if (code == null) return "Conditions not available";
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "Unsettled";
}

export async function fetchCurrentWeather(lat: number, lng: number): Promise<CurrentWeather> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,is_day" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" +
    "&timezone=GMT&timeformat=unixtime";

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo current request failed (${res.status})`);
  }
  const c = (await res.json()).current;
  const visibility: number | null = c.visibility ?? null;
  return {
    observedAt: new Date(c.time * 1000),
    tempF: c.temperature_2m ?? null,
    relativeHumidity: c.relative_humidity_2m ?? null,
    windSpeedMph: c.wind_speed_10m ?? null,
    visibilityMiles: visibility != null ? visibility / METERS_PER_MILE : null,
    precipitationIn: c.precipitation ?? null,
    cloudLow: c.cloud_cover_low ?? null,
    cloudMid: c.cloud_cover_mid ?? null,
    cloudHigh: c.cloud_cover_high ?? null,
    condition: describeWeatherCode(c.weather_code ?? null),
    weatherCode: c.weather_code ?? null,
    isDay: c.is_day === 1,
  };
}
