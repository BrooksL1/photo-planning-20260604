// Single-source (Open-Meteo) reading at one specific lat/lng + time, used by
// the map: pin location shows temp/precip/visibility, the arrow tip shows
// cloud cover. Distinct from the 3-source cross-check table -- this is a
// simple directional readout, not an audit.

import { fetchHourlyAt } from "./openMeteoHourly";

const METERS_PER_MILE = 1609.34;

export type PointReading = {
  tempF: number | null;
  precipProbability: number | null;
  visibilityMiles: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
};

export async function fetchPointWeather(lat: number, lng: number, target: Date): Promise<PointReading> {
  const [row] = await fetchHourlyAt(
    lat,
    lng,
    ["temperature_2m", "precipitation_probability", "visibility", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high"],
    [target],
    "&temperature_unit=fahrenheit"
  );

  const visibility = row?.visibility ?? null;
  return {
    tempF: row?.temperature_2m ?? null,
    precipProbability: row?.precipitation_probability ?? null,
    visibilityMiles: visibility != null ? visibility / METERS_PER_MILE : null,
    cloudLow: row?.cloud_cover_low ?? null,
    cloudMid: row?.cloud_cover_mid ?? null,
    cloudHigh: row?.cloud_cover_high ?? null,
  };
}
