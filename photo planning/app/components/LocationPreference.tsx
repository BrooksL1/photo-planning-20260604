"use client";

import { useEffect, useState } from "react";
import {
  forgetLocation,
  LOCATION_EVENT,
  locationPreference,
  refreshGrantedLocation,
  requestDeviceLocation,
  savedLocation,
  type SavedLocation,
} from "../lib/location";

export default function LocationPreference() {
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [preference, setPreference] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    function sync() {
      setSaved(savedLocation());
      setPreference(locationPreference());
    }
    sync();
    window.addEventListener(LOCATION_EVENT, sync);
    void refreshGrantedLocation();
    return () => window.removeEventListener(LOCATION_EVENT, sync);
  }, []);
  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      await requestDeviceLocation();
      setMessage(
        "Location saved for your next visit. Choose a lasting permission in the browser prompt when available.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Location unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      className="location-preference"
      aria-label="Site location preference"
    >
      <div>
        <strong>
          {saved
            ? saved.source === "device"
              ? "Device location remembered"
              : `Saved place: ${saved.label ?? "Photo Planning pin"}`
            : preference === "off"
              ? "Location is off"
              : "One location preference for your tools"}
        </strong>
        <p>
          {saved
            ? `Last saved ${new Date(saved.updatedAt).toLocaleDateString()}. We reuse this place when browser permission expires. Update it when you travel.`
            : "Remember a place across visits, or enable device location to keep Photo Planning close to home."}
        </p>
        <details>
          <summary>How remembering works</summary>
          <p>
            A one-year cookie remembers your choice across brooksl.com
            subdomains. Coordinates stay in this browser’s storage on this
            hostname. Browser and operating-system location permissions are
            separate; choose “Allow on every visit” or its equivalent if
            offered. Private browsing and clearing site data can reset these
            choices. A saved place works without requesting device access again.
          </p>
        </details>
        {message && <p role="status">{message}</p>}
      </div>
      <div className="location-actions">
        <button onClick={() => void enable()} disabled={busy}>
          {busy
            ? "Locating…"
            : saved
              ? "Update device location"
              : "Enable location"}
        </button>
        <a href="/PhotoPlanning">Choose a place</a>
        {preference !== "off" && (
          <button
            onClick={() => {
              forgetLocation();
              setMessage(
                "Saved coordinates removed. Browser permission can be changed in site settings.",
              );
            }}
          >
            {saved ? "Forget location" : "Not now"}
          </button>
        )}
      </div>
    </aside>
  );
}
