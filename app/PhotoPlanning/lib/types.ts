// A single source's reading for one target moment. Every field is
// independently nullable -- null means "not available" (never guessed).
export type SourceReading = {
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  visibilityMiles: number | null;
  precipProbability: number | null;
  sourceUrl: string;
  note?: string;
};

export type SourceName = "Open-Meteo" | "HRRR (NOAA)" | "Aviation METAR/TAF";

export type SolarEventKind = "Sunrise" | "Sunset";

export type SolarEvent = {
  kind: SolarEventKind;
  // The instant weather is looked up at (sunrise or sunset itself).
  at: Date;
  // The 3 chronological boundary times shown as context, already in the
  // correct order for display (reversed for Sunset per the app's convention).
  boundaryTimes: { label: string; date: Date }[];
};

export type MoonEvent = {
  kind: "Moonrise" | "Moonset";
  // 0 degrees (standard rise/set) and 3 degrees (clear-of-horizon-clutter)
  // times, in chronological display order.
  times: { label: string; date: Date }[];
};

export type CelestialEvent = {
  category: "Eclipse" | "Meteor Shower" | "Comet";
  title: string;
  detail: string;
  date: Date | null;
  sourceUrl: string;
};
