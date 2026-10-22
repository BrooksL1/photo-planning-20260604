"use client";

import { useState } from "react";
import { describeCloudLayer, type MetarObservation } from "./lib/metar";

export function MetarPanel({ observation, timeZone, loading = false, unavailable = false }: {
  observation: MetarObservation | null;
  timeZone: string;
  loading?: boolean;
  unavailable?: boolean;
}) {
  const time = observation && new Date(observation.observedAt).toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short",
  });
  return (
    <div className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-xs text-gray-600">
      <div className="font-semibold text-gray-800">Nearby airport observation · METAR</div>
      {observation ? <>
        <a href={observation.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline underline-offset-2" title={observation.stationName}>
          {observation.stationId} · {observation.distanceMiles.toFixed(1)} mi from your pin
        </a>
        <div className="mt-1">Observed {time}</div>
        <ul className="mt-1 space-y-0.5">
          {observation.clouds.length ? observation.clouds.map((layer, i) => <li key={i}>{describeCloudLayer(layer)}</li>) : <li>Cloud layers not reported</li>}
        </ul>
        <p className="mt-1 text-[10px] text-gray-500">At the airport; upper layers may be unreported.</p>
        {observation.rawReport && <details className="mt-1"><summary className="cursor-pointer">Raw report</summary><p className="mt-1 break-words font-mono text-[10px]">{observation.rawReport}</p></details>}
      </> : <p className="mt-1">{loading ? "Checking nearby observations…" : unavailable ? "Observations temporarily unavailable." : "No nearby report within the hour before this time."}</p>}
    </div>
  );
}

export default function LiveSky({ lat, lng }: { lat: number; lng: number }) {
  const [open, setOpen] = useState(false);
  const params = new URLSearchParams({
    lat: lat.toFixed(4), lon: lng.toFixed(4), zoom: "9", level: "surface",
    overlay: "satellite", product: "satellite", type: "map", location: "coordinates", marker: "true",
  });
  const windyUrl = `https://www.windy.com/-Satellite-satellite?${lat.toFixed(4)},${lng.toFixed(4)},9`;
  return (
    <section className="mb-8 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="live-satellite" className="font-semibold text-sm text-indigo-700 hover:text-indigo-900">
          {open ? "Hide" : "Show"} live satellite view {open ? "▴" : "▾"}
        </button>
        <a href={windyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 underline underline-offset-2">Open in Windy ↗</a>
      </div>
      <p className="mt-1 text-xs text-gray-600">Recent cloud imagery around your pin. Check the image time in the map; higher clouds can hide lower layers.</p>
      {open && <div id="live-satellite" className="mt-3">
        <iframe key={`${lat},${lng}`} title="Live satellite cloud imagery from Windy" src={`https://embed.windy.com/embed.html?${params}`} className="h-[360px] sm:h-[440px] w-full rounded-lg border-0" loading="lazy" allowFullScreen />
        <p className="mt-1 text-[10px] text-gray-500">Satellite imagery via Windy · current imagery, including when planning a different date.</p>
      </div>}
    </section>
  );
}
