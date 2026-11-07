// The endpoint is intentionally fixed to this Mac's loopback interface.
export const LOCAL_ENDPOINT = "http://127.0.0.1:8766";
const TOKEN_KEY = "brooksl-lightroom-pair";
export function pairing(): string {
  const hash = new URLSearchParams(location.hash.slice(1)), token = hash.get("lr");
  if (token) {
    history.replaceState(null, "", location.pathname + location.search);
    if (/^[A-Za-z0-9_-]{43}$/.test(token) && hash.get("port") === "8766") {
      sessionStorage.setItem(TOKEN_KEY, token); return token;
    }
  }
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}
export function forgetPairing() { sessionStorage.removeItem(TOKEN_KEY); }
export async function networkPermission(): Promise<PermissionState> {
  try { return (await navigator.permissions.query({ name: "loopback-network" as PermissionName })).state; }
  catch { return "prompt"; }
}
export async function localFetch(token: string, path: string, body?: unknown): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Open Rank & Rate from Lightroom to pair this browser.");
  const options: RequestInit & { targetAddressSpace: "loopback" } = {
    method: body === undefined ? "GET" : "POST", mode: "cors", cache: "no-store", credentials: "omit",
    targetAddressSpace: "loopback", signal: AbortSignal.timeout(20000),
    headers: { Authorization: "Bearer " + token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  let response;
  try { response = await fetch(LOCAL_ENDPOINT + path, options); }
  catch { throw new Error("Cannot reach Lightroom on this Mac. Keep Lightroom open and allow brooksl.com’s local / loopback network access in your browser. Reopen Rank & Rate from Lightroom if needed."); }
  if (!response.ok) { const value = await response.json().catch(() => ({})); throw new Error(value.error || "The local Lightroom connection ended."); }
  return response;
}
export async function localJSON<T>(token: string, path: string, body?: unknown): Promise<T> { return (await localFetch(token, path, body)).json(); }
