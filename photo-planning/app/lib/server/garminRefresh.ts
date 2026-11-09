type Snapshot = { value: Record<string, unknown> | null; etag: string | null };
type Dependencies = {
  read: (path: string) => Promise<Snapshot>;
  write: (path: string, value: unknown, etag: string | null) => Promise<{ etag: string }>;
  dispatch: (url: string, requestId: string) => Promise<void>;
  now: () => number;
  id: () => string;
};
const REQUEST_PATH = "training/refresh-request.json";
const COOLDOWN_MS = 5 * 60 * 1000;

// Persist the claim before dispatch, so separate server instances cannot queue
// duplicate imports. This record contains no webhook credentials.
export async function requestGarminRefresh(url: string | undefined, deps: Dependencies) {
  if (!url) return { status: 503, body: { error: "Garmin refresh is not configured. T3 Connect remote access is required." } };
  const [previous, garmin] = await Promise.all([deps.read(REQUEST_PATH), deps.read("training/garmin.json")]);
  const baseline = { syncedAt: garmin.value?.syncedAt ?? null, weightSyncedAt: garmin.value?.weightSyncedAt ?? null };
  const now = deps.now();
  if (previous.value?.status === "pending" && now - Date.parse(String(previous.value.requestedAt)) < COOLDOWN_MS) {
    return { status: 202, body: { ...previous.value, alreadyQueued: true } };
  }
  const record = { requestId: deps.id(), requestedAt: new Date(now).toISOString(), status: "pending", ...baseline };
  let claim;
  try { claim = await deps.write(REQUEST_PATH, record, previous.etag); }
  catch { return { status: 409, body: { error: "Another refresh request arrived. Wait a moment and try again." } }; }
  try {
    await deps.dispatch(url, record.requestId);
    return { status: 202, body: record };
  } catch {
    await deps.write(REQUEST_PATH, { ...record, status: "failed" }, claim.etag).catch(() => undefined);
    return { status: 503, body: { error: "Could not reach T3 to request Garmin data. Check that T3 Connect is online, then try again." } };
  }
}
