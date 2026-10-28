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
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
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
    return null;
  }
}
export function saveLocation(value: SavedLocation) {
  setPreference(value.source);
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* The preference cookie can still persist without a coordinate cache. */
  }
  window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: value }));
}
export function forgetLocation() {
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
        saveLocation(value);
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
// Never trigger a permission prompt automatically. Reuse the saved place and
// refresh device coordinates only when the browser already grants access.
export async function refreshGrantedLocation() {
  if (locationPreference() !== "device" || !navigator.permissions) return;
  try {
    const permission = await navigator.permissions.query({
      name: "geolocation",
    });
    if (permission.state === "granted") await requestDeviceLocation();
  } catch {
    /* Keep the last saved location; browsers may not support querying. */
  }
}
