import { test } from "node:test";
import { strict as assert } from "node:assert";
import load from "./tsLoader.cjs";
const { defaults, validate, parseBands, schedule, fit, accounting, reservation, validateEvidence } = load("../app/rank-photos/lib/core.ts");
const { payload, parseInput, parseResponse } = load("../app/rank-photos/lib/ai.ts");
function session(n, config = {}) {
  return { id: "test", created: 1, name: "Synthetic test", ready: true, config: { ...defaults, ...config }, photos: Array.from({ length: n }, (_, i) => ({ id: String(i), name: "frame-" + i + ".jpg", digest: String(i), width: 100, height: 100, size: 1, modified: 1, visual: Array(192).fill(i * 40 % 255) })), jobs: [], round: 0, importErrors: [] };
}
function observe(s) {
  for (const j of s.jobs) if (j.status === "pending") {
    j.status = "done"; j.cost = .01;
    j.value = { tiers: [...j.ids].sort((a, b) => Number(a) - Number(b)).map(id => [id]), reasons: Object.fromEntries(j.ids.map(id => [id, "Synthetic visual observation"])), input: 100, output: 20, summary: "Fixture only", uncertain: false };
  }
}
test("only active goal fields are validated; star bands preserve totals", () => {
  assert.doesNotThrow(() => validate({ ...defaults, goal: "percent", count: "", percent: 50 }));
  assert.throws(() => validate({ ...defaults, count: "" }), /winner count/);
  assert.throws(() => validate({ ...defaults, low: 4, high: 3 }), /exceed/);
  assert.throws(() => parseBands("3:60,4:60"), /total/);
  assert.throws(() => parseBands("3:50,3:50"), /Unique/);
  assert.throws(() => validate({ ...defaults, workers: 9 }), /concurrent/);
});
test("first overlapping pass covers and connects every photo, including 40,000", async () => {
  for (const n of [2, 3, 6, 7, 71, 40000]) {
    const s = session(n); schedule(s);
    assert.equal(new Set(s.jobs.flatMap(j => j.ids)).size, n);
    const parent = Array.from({ length: n }, (_, i) => i);
    const root = i => parent[i] === i ? i : parent[i] = root(parent[i]);
    s.jobs.forEach(j => j.ids.slice(1).forEach(id => { parent[root(+id)] = root(+j.ids[0]); }));
    assert.equal(new Set(parent.map((_, i) => root(i))).size, 1);
    assert.ok(s.jobs.every(j => j.ids.length >= 2 && j.ids.length <= 6));
  }
});
test("connected evidence produces relative order, selectable stars and persistent overrides", async () => {
  const s = session(40, { count: 2 });
  for (let a = 0; a < 40; a++) for (let b = a + 1; b < 40; b++) s.jobs.push({ id: `${a}:${b}`, round: 1, ids: [String(a), String(b)], status: "pending", reserve: 0, cost: 0 });
  observe(s);
  let result = await fit(s);
  assert.equal(result.compared, 40); assert.equal(result.components, 1);
  assert.equal(result.rows[0].id, "0"); assert.equal(result.rows.at(-1).id, "39");
  assert.equal(result.rows.filter(r => r.proposed === 4).length, 2);
  assert.equal(result.rows[0].score, 10000); assert.equal(result.rows.at(-1).score, 1);
  s.config = { ...s.config, goal: "bands", bands: "3:75,4:25" };
  result = await fit(s);
  assert.equal(result.rows.filter(r => r.proposed === 4).length, 10);
  assert.equal(result.rows.filter(r => r.proposed === 3).length, 30);
  s.photos[0].override = 1; result = await fit(s);
  assert.equal(result.rows[0].proposed, 1); assert.equal(result.rows[0].automatic, 4);
  assert.equal(accounting(s).done, s.jobs.length);
});
test("unobserved/disconnected pools get no invented global scores or automatic stars", async () => {
  const s = session(4); s.jobs = [{ id: "1", round: 1, ids: ["0", "1"], status: "pending", reserve: 0, cost: 0 }, { id: "2", round: 1, ids: ["2", "3"], status: "pending", reserve: 0, cost: 0 }]; observe(s);
  const r = await fit(s); assert.equal(r.components, 2); assert.ok(r.rows.every(r => r.score === null && r.proposed === null));
  s.jobs.pop(); const partial = await fit(s); assert.equal(partial.compared, 2); assert.ok(partial.rows.every(r => r.score === null));
});
test("ties share a percentile and do not arbitrarily assign a star at the cutoff", async () => {
  const s = session(2, { count: 1 }); schedule(s); observe(s); s.jobs[0].value.tiers = [["0", "1"]];
  const r = await fit(s); assert.equal(r.rows[0].score, r.rows[1].score); assert.equal(r.rows[0].place, r.rows[1].place); assert.ok(r.rows.every(r => r.proposed === null && r.boundary));
});
test("reference thresholds require two consistently ordered anchors", async () => {
  const s = session(6, { goal: "threshold" }); s.photos[0].reference = 4; s.photos[5].reference = 3; schedule(s); observe(s);
  let r = await fit(s); assert.equal(r.rows[0].proposed, 4); assert.equal(r.rows.at(-1).proposed, 3);
  s.photos[0].reference = 3; s.photos[5].reference = 4; r = await fit(s); assert.ok(r.rows.every(r => r.proposed === null));
});
test("explicit refinement contributes new evidence; cached jobs are not silently rescheduled", async () => {
  const s = session(2); schedule(s); observe(s); const before = s.jobs.length; schedule(s); assert.equal(s.jobs.length <= before + 1, true); observe(s);
  const coverage = (await fit(s)).rows[0].coverage; schedule(s, await fit(s), true); observe(s); assert.ok((await fit(s)).rows[0].coverage > coverage);
});
test("unknown costs stay reserved even when skipped and budget uses concurrent reservations", () => {
  const s = session(2); s.jobs = [{ id: "1", ids: ["0", "1"], status: "abandoned", reserve: .2, cost: 0 }, { id: "2", ids: ["0", "1"], status: "sent", reserve: .3, cost: 0 }];
  assert.equal(accounting(s).held, .5); assert.ok(reservation(8) > reservation(2));
});
test("Terra payload includes only anonymous previews and strict output, never filenames/stars", () => {
  const p = payload({ images: ["data:image/jpeg;base64,YQ==", "data:image/jpeg;base64,Yg=="], purpose: "photographic", criteria: "Prefer composition" });
  assert.equal(p.model, "gpt-6.1-terra"); assert.equal(p.store, false); assert.equal(p.text.format.strict, true); assert.equal(p.max_output_tokens, 4096);
  assert.deepEqual(p.text.format.schema.properties.reasons.required, ["P1", "P2"]);
  assert.throws(() => parseInput({ images: ["https://example.com/secret.jpg", "file:///secret"], purpose: "photographic", criteria: "" }));
});
test("response validation rejects wrong models, repeated/missing IDs, refusals and absent usage", () => {
  const value = { tiers: [["P1"], ["P2"]], reasons: { P1: "Strong composition", P2: "Distracting background" }, summary: "Fixture", uncertain: false };
  const response = { model: "gpt-6.1-terra", status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }], usage: { input_tokens: 100, output_tokens: 30 } };
  assert.equal(parseResponse(response, 2).input, 100);
  assert.throws(() => parseResponse({ ...response, model: "other" }, 2));
  assert.throws(() => parseResponse({ ...response, usage: {} }, 2), /usage/);
  assert.throws(() => validateEvidence({ ...value, tiers: [["P1", "P1"]], input: 1, output: 1 }, ["P1", "P2"]), /repeated/);
  assert.throws(() => parseResponse({ ...response, output: [{ content: [{ type: "refusal" }] }] }, 2), /declined/);
});
