// Connected comparisons and target policies, shared by the browser and tests.
export const MODEL = "gpt-6.1-terra";
export const RUBRIC = "rank-rate-v1";
export type Goal = "best" | "percent" | "bands" | "rank" | "threshold";
export type Config = { goal: Goal; count: number; percent: number; low: number; high: number; bands: string; budget: number; size: number; workers: number; purpose: "photographic" | "memories"; criteria: string; variety: boolean };
export const defaults: Config = { goal: "best", count: 2, percent: 25, low: 3, high: 4, bands: "3:75,4:25", budget: 5, size: 6, workers: 3, purpose: "photographic", criteria: "", variety: false };
export type Photo = { id: string; name: string; size: number; modified: number; digest: string; width: number; height: number; visual: number[]; reference?: number; override?: number };
export type Evidence = { tiers: string[][]; reasons: Record<string, string>; summary: string; uncertain: boolean; input: number; output: number };
export type Job = { id: string; round: number; ids: string[]; status: "pending" | "sent" | "done" | "uncertain" | "abandoned"; reserve: number; cost: number; value?: Evidence; error?: string };
export type Session = { id: string; name: string; created: number; version?: string; config: Config; photos: Photo[]; jobs: Job[]; round: number; ready: boolean; importErrors: string[] };
export type Row = { id: string; place: number | null; score: number | null; strength: number; coverage: number; reason: string; proposed: number | null; automatic: number | null; boundary: boolean };
export type Ranking = { rows: Row[]; components: number; compared: number };
export function numeric(v: unknown, min: number, max: number, label: string, integer = false): number {
  if (typeof v === "boolean" || v === "" || v == null) throw new Error(`Invalid ${label}.`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`Invalid ${label}.`);
  return n;
}
export function parseBands(text: string): [number, number][] {
  const pairs = text.split(",").map(p => p.trim().split(":"));
  if (pairs.length < 2 || pairs.length > 6 || pairs.some(p => p.length !== 2)) throw new Error("Use star bands such as 3:75,4:25.");
  const bands: [number, number][] = pairs.map(([a, b]) => [numeric(a, 0, 5, "band stars", true), numeric(b, 0, 100, "band percent")]);
  if (new Set(bands.map(b => b[0])).size !== bands.length || Math.abs(bands.reduce((a, b) => a + b[1], 0) - 100) > .001) throw new Error("Unique star bands must total 100%.");
  return bands.sort((a, b) => b[0] - a[0]);
}
export function validate(c: Config): Config {
  if (!["best", "percent", "bands", "rank", "threshold"].includes(c.goal)) throw new Error("Choose a ranking goal.");
  if (c.goal === "best") numeric(c.count, 1, 100000, "winner count", true);
  if (c.goal === "percent") numeric(c.percent, 0, 100, "percentage");
  if (["best", "percent", "threshold"].includes(c.goal)) {
    numeric(c.low, 0, 5, "lower stars", true); numeric(c.high, 0, 5, "upper stars", true);
    if (c.low >= c.high) throw new Error("Upper stars must exceed lower stars.");
  }
  if (c.goal === "bands") parseBands(c.bands);
  numeric(c.size, 2, 8, "comparison size", true); numeric(c.workers, 1, 8, "concurrent requests", true); numeric(c.budget, 0, 10000, "budget");
  if (typeof c.criteria !== "string" || c.criteria.length > 3000) throw new Error("Keep preferences under 3,000 characters.");
  if (!["photographic", "memories"].includes(c.purpose)) throw new Error("Choose a photographic purpose.");
  return { ...c };
}
export const reservation = (n: number) => (3500 + 5000 * n + 4096 * 5) / 1e6;
export function accounting(s: Session) {
  return { spent: s.jobs.reduce((a, j) => a + j.cost, 0), held: s.jobs.filter(j => ["sent", "uncertain", "abandoned"].includes(j.status)).reduce((a, j) => a + j.reserve, 0), done: s.jobs.filter(j => j.status === "done").length, pending: s.jobs.filter(j => j.status === "pending").length, uncertain: s.jobs.filter(j => j.status === "uncertain").length };
}
function random(seed: string) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => { n |= 0; n = n + 0x6D2B79F5 | 0; let t = Math.imul(n ^ n >>> 15, 1 | n); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffle<T>(list: T[], rng: () => number) {
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
export function schedule(s: Session, ranking?: Ranking, refine = false): void {
  const round = s.round + 1, rng = random(s.id + ":" + round);
  let ids = ranking && round >= 3 ? ranking.rows.map(r => r.id) : s.photos.map(p => p.id);
  if (round <= 2) ids = shuffle(ids, rng);
  if (round >= 4 && ranking && !refine && s.config.goal !== "rank") {
    const chosen = new Set(ranking.rows.filter(r => r.boundary || r.coverage < 2).map(r => r.id));
    ids = ids.filter(id => chosen.has(id));
    if (ids.length < 2) ids = ranking.rows.slice(0, Math.min(12, ranking.rows.length)).map(r => r.id);
  }
  const anchors = s.photos.filter(p => p.reference != null).map(p => p.id);
  const batches: string[][] = [], covered = new Set<string>();
  for (let first = 0; first < ids.length - 1;) {
    let batch = ids.slice(first, first + s.config.size), step = s.config.size - 1;
    if (anchors.length) {
      const anchor = anchors[batches.length % anchors.length];
      if (!batch.includes(anchor)) { batch = [...batch.slice(0, s.config.size - 1), anchor]; step = Math.max(1, s.config.size - 2); }
    }
    batches.push(shuffle(batch, rng)); batch.forEach(id => covered.add(id)); first += step;
  }
  for (const id of ids) if (!covered.has(id)) { const other = ids.find(p => p !== id); if (other) batches.push([id, other]); }
  for (const id of anchors) if (ids[0] && id !== ids[0]) batches.push([ids[0], id]);
  const seen = new Set(s.jobs.filter(j => j.status === "done").map(j => JSON.stringify(j.ids)));
  for (const batch of batches) {
    const signature = JSON.stringify(batch);
    if (!refine && seen.has(signature)) continue;
    seen.add(signature);
    s.jobs.push({ id: `${round}:${s.jobs.length}`, round, ids: batch, status: "pending", reserve: 0, cost: 0 });
  }
  s.round = round;
}
const yieldUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));
export async function fit(s: Session): Promise<Ranking> {
  const n = s.photos.length, index = new Map(s.photos.map((p, i) => [p.id, i]));
  const wins = new Float64Array(n).fill(.5), appearances = new Uint32Array(n), parents = Int32Array.from({ length: n }, (_, i) => i);
  const edgesA: number[] = [], edgesB: number[] = [], reasons: Record<string, string> = {};
  function root(i: number): number { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; }
  for (const job of s.jobs) {
    if (job.status !== "done" || !job.value) continue;
    const levels = new Map<string, number>(); job.value.tiers.forEach((tier, i) => tier.forEach(id => levels.set(id, i)));
    const ids = [...levels.keys()];
    ids.forEach(id => { appearances[index.get(id)!]++; reasons[id] = job.value!.reasons[id]; });
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const x = index.get(ids[a])!, y = index.get(ids[b])!;
      if (x == null || y == null) throw new Error("Saved comparison contains an unknown photo.");
      edgesA.push(x); edgesB.push(y); parents[root(x)] = root(y);
      const w = levels.get(ids[a])! < levels.get(ids[b])! ? 1 : levels.get(ids[a]) === levels.get(ids[b]) ? .5 : 0;
      wins[x] += w; wins[y] += 1 - w;
    }
  }
  const components = new Set(s.photos.flatMap((_, i) => appearances[i] ? [root(i)] : [])).size;
  let strength = new Float64Array(n).fill(1);
  for (let iteration = 0; iteration < 80 && n; iteration++) {
    const denom = Float64Array.from(strength, v => .5 / (v + 1));
    for (let i = 0; i < edgesA.length; i++) { const a = edgesA[i], b = edgesB[i], w = 1 / (strength[a] + strength[b]); denom[a] += w; denom[b] += w; }
    const updated = Float64Array.from(wins, (v, i) => v / denom[i]);
    const norm = Math.exp(updated.reduce((a, v) => a + Math.log(v), 0) / n);
    let change = 0;
    for (let i = 0; i < n; i++) { updated[i] /= norm; change = Math.max(change, Math.abs(Math.log(updated[i] / strength[i]))); }
    strength = updated;
    if (change < 1e-5) break;
    if (iteration % 8 === 0) await yieldUI();
  }
  const rows: Row[] = s.photos.map((p, i) => ({ id: p.id, place: null, score: null, strength: Math.log(strength[i]), coverage: appearances[i], reason: reasons[p.id] ?? "", proposed: null, automatic: null, boundary: false })).sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  const compared = rows.filter(r => r.coverage > 0).length;
  if (components === 1 && compared === n) {
    for (let start = 0; start < n;) {
      let end = start + 1;
      while (end < n && Math.abs(rows[start].strength - rows[end].strength) < 1e-7) end++;
      const score = Math.round(1 + 9999 * (1 - (start + end - 1) / 2 / Math.max(1, n - 1)));
      for (let i = start; i < end; i++) { rows[i].place = start + 1; rows[i].score = score; }
      start = end;
    }
    allocate(rows, s);
  }
  const overrides = new Map(s.photos.filter(p => p.override != null).map(p => [p.id, p.override!]));
  for (const r of rows) { r.automatic = r.proposed; if (overrides.has(r.id)) r.proposed = overrides.get(r.id)!; }
  return { rows, components, compared };
}
function allocate(rows: Row[], s: Session) {
  const c = s.config, n = rows.length;
  if (c.goal === "rank") return;
  const cuts: number[] = [];
  if (c.goal === "bands") {
    const bands = parseBands(c.bands), exact = bands.map(b => n * b[1] / 100), sizes = exact.map(Math.floor);
    const order = sizes.map((_, i) => i).sort((a, b) => (exact[b] - sizes[b]) - (exact[a] - sizes[a]) || a - b);
    for (let i = 0, remaining = n - sizes.reduce((a, b) => a + b, 0); i < remaining; i++) sizes[order[i]]++;
    let pos = 0;
    bands.forEach(([stars], i) => { for (let j = 0; j < sizes[i]; j++) rows[pos++].proposed = stars; cuts.push(pos); });
  } else if (c.goal === "threshold") {
    const ref = new Map(s.photos.filter(p => p.reference != null).map(p => [p.id, p.reference]));
    const values = (rating: number) => rows.filter(r => ref.get(r.id) === rating).map(r => r.strength).sort((a, b) => a - b);
    const lo = values(c.low), hi = values(c.high), median = (v: number[]) => (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2;
    if (!lo.length || !hi.length || median(hi) <= median(lo)) return;
    const threshold = (median(lo) + median(hi)) / 2;
    rows.forEach(r => { r.proposed = r.strength >= threshold ? c.high : c.low; r.boundary = Math.abs(r.strength - threshold) < .35; });
  } else {
    const count = Math.min(n, c.goal === "best" ? c.count : Math.ceil(n * c.percent / 100));
    let chosen = new Set(rows.slice(0, count).map(r => r.id));
    if (c.variety && count) {
      const photos = new Map(s.photos.map(p => [p.id, p])), selected: string[] = [], deferred: string[] = [];
      for (const r of rows) {
        const vector = photos.get(r.id)!.visual;
        const near = selected.slice(-200).some(id => { const other = photos.get(id)!.visual; return vector.length && vector.reduce((a, v, i) => a + ((v - other[i]) / 255) ** 2, 0) / vector.length < .0025; });
        (near ? deferred : selected).push(r.id);
        if (selected.length >= count) break;
      }
      chosen = new Set([...selected, ...deferred].slice(0, count));
    }
    rows.forEach(r => { r.proposed = chosen.has(r.id) ? c.high : c.low; }); cuts.push(count);
  }
  for (const cut of cuts) if (cut > 0 && cut < n) {
    for (let i = Math.max(0, cut - 6); i < Math.min(n, cut + 6); i++) rows[i].boundary = true;
    if (Math.abs(rows[cut - 1].strength - rows[cut].strength) < 1e-7) {
      const tied = rows[cut].strength; rows.filter(r => Math.abs(r.strength - tied) < 1e-7).forEach(r => { r.proposed = null; r.boundary = true; });
    }
  }
}
export function validateEvidence(value: unknown, ids: string[]): Evidence {
  const v = value as Evidence;
  if (!v || !Array.isArray(v.tiers) || !v.tiers.length || !v.reasons || typeof v.summary !== "string" || typeof v.uncertain !== "boolean") throw new Error("Incomplete ranking response.");
  const seen = new Set<string>();
  for (const tier of v.tiers) {
    if (!Array.isArray(tier) || !tier.length) throw new Error("Empty ranking tier.");
    for (const id of tier) {
      if (!ids.includes(id) || seen.has(id)) throw new Error("Unknown or repeated photo in ranking.");
      seen.add(id);
    }
  }
  if (seen.size !== ids.length || Object.keys(v.reasons).length !== ids.length) throw new Error("Every photo must be ranked and explained.");
  for (const id of ids) if (typeof v.reasons[id] !== "string" || !v.reasons[id].trim() || v.reasons[id].length > 600) throw new Error("Missing or excessive visual reason.");
  numeric(v.input, 0, 10000000, "input usage", true); numeric(v.output, 0, 10000000, "output usage", true);
  return v;
}
