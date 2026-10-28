export type SavedLocation = {
  lat: number;
  lng: number;
  label?: string;
  source: "device" | "saved";
  updatedAt: number;
};
export const LOCATION_EVENT = "brooksl:location";
const KEY = "brooksl.location.v1";
const COOKIE = "brooksl_location";
let pending: Promise<SavedLocation> | null = null;
let arrival: Promise<SavedLocation | undefined> | null = null;
let revision = 0;
let memory: SavedLocation | null = null;

export function locationPreference(): "device" | "saved" | "off" | null {
  const value = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.split("=")[1];
  return value === "device" || value === "saved" || value === "off"
    ? value
    : null;
}
function setPreference(value: "device" | "saved" | "off") {
  const domain =
    location.hostname === "brooksl.com" ||
    location.hostname.endsWith(".brooksl.com")
      ? "; Domain=brooksl.com"
      : "";
  document.cookie = `${COOKIE}=${value}; Max-Age=31536000; Path=/; SameSite=Lax${domain}${location.protocol === "https:" ? "; Secure" : ""}`;
}
export function savedLocation(): SavedLocation | null {
  if (locationPreference() === "off") return null;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? JSON.stringify(memory));
    return value &&
      Number.isFinite(value.lat) &&
      Math.abs(value.lat) <= 90 &&
      Number.isFinite(value.lng) &&
      Math.abs(value.lng) <= 180 &&
      ["device", "saved"].includes(value.source) &&
      Number.isFinite(value.updatedAt)
      ? value
      : null;
  } catch {
    return memory;
  }
}
export function saveLocation(value: SavedLocation) {
  revision++;
  memory = value;
  setPreference(value.source);
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* The preference cookie can still persist without a coordinate cache. */
  }
  window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: value }));
}
export function forgetLocation() {
  revision++;
  memory = null;
  setPreference("off");
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Storage may be disabled. */
  }
  window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: null }));
}
export function requestDeviceLocation(): Promise<SavedLocation> {
  if (pending) return pending;
  const startedAtRevision = revision;
  pending = new Promise<SavedLocation>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          "Device location is unavailable. Choose a place in Photo Planning.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const value: SavedLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: "device",
          updatedAt: Date.now(),
        };
        // Do not undo a manual place choice or opt-out while locating.
        if (revision === startedAtRevision) saveLocation(value);
        resolve(value);
      },
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "Location is blocked. Allow location for this site in your browser settings, or choose a saved place."
              : "Could not get a fresh location. Your saved place is still available.",
          ),
        ),
      { maximumAge: 300000, timeout: 12000, enableHighAccuracy: false },
    );
  }).finally(() => {
    pending = null;
  });
  return pending;
}
// Run once per document, shared by all routes and React effect remounts.
// A later visit can ask again if the browser granted only temporary permission.
export function initializeLocation(): Promise<SavedLocation | undefined> {
  const preference = locationPreference();
  if (preference === "off" || preference === "saved") return Promise.resolve(undefined);
  if (arrival) return arrival;
  arrival = (async () => {
    let denied = false;
    try {
      denied = (await navigator.permissions?.query({ name: "geolocation" }))?.state === "denied";
    } catch {
      // Safari and other browsers may not support the Permissions query.
    }
    if (denied) throw new Error("Location is blocked. Allow location for this site in your browser settings, or choose a saved place.");
    if (locationPreference() === "off" || locationPreference() === "saved") return;
    return requestDeviceLocation();
  })();
  return arrival;
}
