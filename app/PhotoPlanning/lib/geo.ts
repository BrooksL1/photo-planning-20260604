const EARTH_RADIUS_MILES = 3958.8;

/** Destination point given a start point, bearing (degrees from north, clockwise), and distance in miles. */
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMiles: number
): { lat: number; lng: number } {
  const delta = distanceMiles / EARTH_RADIUS_MILES;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lng * Math.PI) / 180;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  return {
    lat: (phi2 * 180) / Math.PI,
    lng: (((lambda2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

/** SunCalc's azimuth is radians measured from south, clockwise. Converts to a standard compass bearing from north. */
export function toCompassBearing(sunCalcAzimuthRad: number): number {
  return (((sunCalcAzimuthRad * 180) / Math.PI + 180) % 360 + 360) % 360;
}
