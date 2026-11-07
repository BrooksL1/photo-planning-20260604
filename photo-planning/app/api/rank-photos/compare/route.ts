import { parseInput, payload, parseResponse } from "../../../rank-photos/lib/ai";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
  // Each visitor supplies their own key. There is no public access to an owner key.
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origin not allowed." }, { status: 403, headers });
  const key = request.headers.get("x-openai-key") ?? "";
  if (!/^sk-[A-Za-z0-9_-]{16,500}$/.test(key)) return Response.json({ error: "Enter a valid OpenAI API key." }, { status: 400, headers });
  if (Number(request.headers.get("content-length")) > 4400000) return Response.json({ error: "Comparison is too large." }, { status: 413, headers });
  let input;
  try { const raw = await request.text(); if (raw.length > 4400000) throw new Error("Comparison is too large."); input = parseInput(JSON.parse(raw)); }
  catch { return Response.json({ error: "Invalid comparison input." }, { status: 400, headers }); }
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify(payload(input)), signal: AbortSignal.timeout(240000), cache: "no-store" });
    if (!response.ok) {
      // Never echo provider bodies, images, headers, or credentials into logs/errors.
      const message = response.status === 401 ? "OpenAI rejected this API key." : response.status === 429 ? "OpenAI rate or credit limit reached. Lower concurrency or check your API account." : response.status === 403 || response.status === 404 ? "This API account cannot access GPT-6.1 Terra." : "OpenAI did not complete the comparison.";
      return Response.json({ error: message + " No automatic retry was made; cost is reserved." }, { status: 502, headers });
    }
    return Response.json(parseResponse(await response.json(), input.images.length), { headers });
  } catch {
    return Response.json({ error: "The comparison ended without a usable response. No automatic retry was made; cost is reserved." }, { status: 502, headers });
  }
}
