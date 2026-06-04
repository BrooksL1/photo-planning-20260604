"use client";

import { useState, useEffect } from "react";
import SunCalc from "suncalc";

type SunTimes = {
  goldenHourMorningStart: Date;
  goldenHourMorningEnd: Date;
  blueHourMorningStart: Date;
  blueHourMorningEnd: Date;
  sunrise: Date;
  solarNoon: Date;
  sunset: Date;
  goldenHourEveningStart: Date;
  goldenHourEveningEnd: Date;
  blueHourEveningStart: Date;
  blueHourEveningEnd: Date;
};

function fmt(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtRange(start: Date, end: Date): string {
  return `${fmt(start)} – ${fmt(end)}`;
}

function calcTimes(lat: number, lng: number, date: Date): SunTimes {
  const t = SunCalc.getTimes(date, lat, lng);
  return {
    blueHourMorningStart: t.nauticalDawn,
    blueHourMorningEnd: t.dawn,
    goldenHourMorningStart: t.dawn,
    goldenHourMorningEnd: t.goldenHourEnd,
    sunrise: t.sunrise,
    solarNoon: t.solarNoon,
    sunset: t.sunset,
    goldenHourEveningStart: t.goldenHour,
    goldenHourEveningEnd: t.dusk,
    blueHourEveningStart: t.dusk,
    blueHourEveningEnd: t.nauticalDusk,
  };
}

type TimeRowProps = { label: string; value: string; color: string; note?: string };

function TimeRow({ label, value, color, note }: TimeRowProps) {
  return (
    <div className={`flex items-center justify-between py-3 px-4 rounded-lg ${color}`}>
      <div>
        <span className="font-medium text-white">{label}</span>
        {note && <span className="ml-2 text-xs text-white/60">{note}</span>}
      </div>
      <span className="text-white font-mono text-sm">{value}</span>
    </div>
  );
}

export default function GoldenHourCalculator() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [times, setTimes] = useState<SunTimes | null>(null);

  useEffect(() => {
    if (lat !== null && lng !== null) {
      setTimes(calcTimes(lat, lng, new Date(date + "T12:00:00")));
    }
  }, [lat, lng, date]);

  function detectLocation() {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported by this browser.");
      return;
    }
    setLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocationLabel(
          `${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°`
        );
        setLoading(false);
      },
      () => {
        setGeoError("Location access denied. Enter coordinates manually below.");
        setLoading(false);
      }
    );
  }

  function applyManual() {
    const la = parseFloat(manualLat);
    const lo = parseFloat(manualLng);
    if (isNaN(la) || isNaN(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
      setGeoError("Enter valid coordinates (lat: -90 to 90, lng: -180 to 180).");
      return;
    }
    setGeoError(null);
    setLat(la);
    setLng(lo);
    setLocationLabel(`${la.toFixed(4)}°, ${lo.toFixed(4)}°`);
  }

  return (
    <div className="max-w-md w-full mx-auto space-y-6">
      {/* Date */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Location */}
      <div className="space-y-3">
        <label className="block text-sm text-gray-400">Location</label>
        <button
          onClick={detectLocation}
          disabled={loading}
          className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-white transition-colors disabled:opacity-50"
        >
          {loading ? "Detecting…" : "Use My Current Location"}
        </button>

        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Latitude"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-amber-500 text-sm"
          />
          <input
            type="number"
            placeholder="Longitude"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-amber-500 text-sm"
          />
          <button
            onClick={applyManual}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-sm transition-colors"
          >
            Go
          </button>
        </div>

        {geoError && <p className="text-red-400 text-sm">{geoError}</p>}
        {locationLabel && (
          <p className="text-gray-500 text-xs">Location: {locationLabel}</p>
        )}
      </div>

      {/* Results */}
      {times && (
        <div className="space-y-2">
          <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3">Morning</h2>
          <TimeRow
            label="Blue Hour"
            value={fmtRange(times.blueHourMorningStart, times.blueHourMorningEnd)}
            color="bg-blue-900/60"
            note="pre-dawn"
          />
          <TimeRow
            label="Golden Hour"
            value={fmtRange(times.goldenHourMorningStart, times.goldenHourMorningEnd)}
            color="bg-amber-800/60"
          />
          <TimeRow
            label="Sunrise"
            value={fmt(times.sunrise)}
            color="bg-orange-900/40"
          />

          <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3 mt-5">Midday</h2>
          <TimeRow
            label="Solar Noon"
            value={fmt(times.solarNoon)}
            color="bg-gray-800"
            note="harsh light"
          />

          <h2 className="text-gray-400 text-sm uppercase tracking-widest mb-3 mt-5">Evening</h2>
          <TimeRow
            label="Sunset"
            value={fmt(times.sunset)}
            color="bg-orange-900/40"
          />
          <TimeRow
            label="Golden Hour"
            value={fmtRange(times.goldenHourEveningStart, times.goldenHourEveningEnd)}
            color="bg-amber-800/60"
          />
          <TimeRow
            label="Blue Hour"
            value={fmtRange(times.blueHourEveningStart, times.blueHourEveningEnd)}
            color="bg-blue-900/60"
            note="post-sunset"
          />
        </div>
      )}

      {!times && !loading && (
        <p className="text-gray-600 text-sm text-center pt-4">
          Set a location above to see your golden hour times.
        </p>
      )}
    </div>
  );
}
