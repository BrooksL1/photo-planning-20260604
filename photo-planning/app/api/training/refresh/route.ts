import { randomUUID } from "node:crypto";
import { authorized, privateHeaders, readPrivate, sameOrigin, writePrivate } from "../../../lib/server/training";
import { requestGarminRefresh } from "../../../lib/server/garminRefresh";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Request must come from this site." }, { status: 403, headers: privateHeaders });
  if (!(await authorized())) return Response.json({ error: "Open your personal editing link to request a Garmin refresh on this device." }, { status: 401, headers: privateHeaders });
  try {
    const result = await requestGarminRefresh(process.env.GARMIN_REFRESH_WEBHOOK_URL, {
      read: readPrivate, write: writePrivate, now: Date.now, id: randomUUID,
      dispatch: async (url, requestId) => {
        const response = await fetch(url, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, source: "brooksl-training" }), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("Refresh dispatch failed");
      },
    });
    return Response.json(result.body, { status: result.status, headers: privateHeaders });
  } catch { return Response.json({ error: "Refresh is temporarily unavailable. Existing history is unchanged." }, { status: 503, headers: privateHeaders }); }
}
