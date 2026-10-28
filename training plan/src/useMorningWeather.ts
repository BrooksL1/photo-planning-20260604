"use client";
import { useEffect, useState } from "react";
import { LOCATION_EVENT, savedLocation } from "../../photo-planning/app/lib/location";
import { nextMorningForecasts, type MorningForecast } from "./calendar";

export function useMorningWeather(morning: string) {
  const [weather, setWeather] = useState<MorningForecast[]>([]);
  const [message, setMessage] = useState("Enable location or choose a saved place to see morning weather.");
  useEffect(() => {
    let controller: AbortController | undefined;
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      controller?.abort();
      setWeather([]);
      const place = savedLocation();
      if (!place) {setMessage("Enable location or choose a saved place to see morning weather.");return;}
      controller = new AbortController();
      const active = controller;
      const timeout = setTimeout(() => active.abort(), 12000);
      setMessage("Loading morning weather…");
      try {
        const query = new URLSearchParams({latitude:place.lat.toFixed(3),longitude:place.lng.toFixed(3),hourly:"temperature_2m,precipitation_probability",temperature_unit:"fahrenheit",timezone:"auto",forecast_days:"4"});
        const response = await fetch("https://api.open-meteo.com/v1/forecast?" + query, {signal:active.signal});
        if (!response.ok) throw new Error("Forecast unavailable");
        const forecast = await response.json();
        const next = nextMorningForecasts(forecast, morning);
        if (current !== revision) return;
        setWeather(next);
        setMessage(`Next two mornings at ${morning} · ${place.label || "your shared location"} · ${forecast.timezone}. Rain chance includes other precipitation; hourly forecast nearest workout start.`);
      } catch {
        if (current === revision) setMessage("Morning forecast unavailable. Try again later; your calendar is unchanged.");
      } finally {clearTimeout(timeout);}
    }
    void refresh();
    const update = () => void refresh();
    window.addEventListener(LOCATION_EVENT, update);
    window.addEventListener("focus", update);
    const interval = setInterval(update, 30*60*1000);
    return () => {revision++;controller?.abort();window.removeEventListener(LOCATION_EVENT,update);window.removeEventListener("focus",update);clearInterval(interval);};
  }, [morning]);
  return {weather, message};
}
