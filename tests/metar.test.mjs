import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import test from "node:test";
import ts from "typescript";

// Compile this isolated TypeScript helper with the project's own compiler.
const filename = new URL("../app/PhotoPlanning/lib/metar.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helper = new Module(filename.pathname);
helper._compile(compiled, filename.pathname);
const { normalizeMetars, observationForEvent, isRecentEvent, describeCloudLayer } = helper.exports;
const now = new Date("2026-10-05T23:30:00Z");
const event = new Date("2026-10-05T23:00:00Z");
const report = (stationId, observedAt, distanceMiles = 5) => ({
  stationId, stationName: stationId, observedAt, distanceMiles, clouds: [], rawReport: "", sourceUrl: "",
});

test("only actual events in the previous hour qualify, including the boundary", () => {
  assert.equal(isRecentEvent(new Date("2026-10-05T22:30:00Z"), now), true);
  assert.equal(isRecentEvent(new Date("2026-10-05T22:29:59Z"), now), false);
  assert.equal(isRecentEvent(new Date("2026-10-05T23:31:00Z"), now), false);
  assert.equal(observationForEvent([report("KPDK", event.toISOString())], new Date("2026-10-04T23:00:00Z"), now), null);
});

test("uses the latest report from the nearest eligible airport", () => {
  const old = report("KPDK", "2026-10-05T22:30:00Z");
  const latest = report("KPDK", "2026-10-05T22:55:00Z");
  const far = report("KATL", "2026-10-05T23:00:00Z", 15);
  assert.equal(observationForEvent([old, far, latest], event, now), latest);
});

test("later observations and stale observations cannot represent an event", () => {
  assert.equal(observationForEvent([
    report("KPDK", "2026-10-05T23:01:00Z"),
    report("KPDK", "2026-10-05T21:59:59Z"),
    report("KPDK", "invalid"),
  ], event, now), null);
});

test("missing cloud layers remain unknown, never manufactured as clear", () => {
  const observations = normalizeMetars([{
    icaoId: "KPDK", lat: 33.88, lon: -84.37, obsTime: event.getTime() / 1000,
  }], 33.88, -84.37, now);
  assert.deepEqual(observations[0].clouds, []);
});

test("preserves cloud-base feet and clear-sensor coverage limitations", () => {
  const observations = normalizeMetars([{
    icaoId: "KPDK", lat: 33.88, lon: -84.37, obsTime: event.getTime() / 1000,
    clouds: [{ cover: "SCT", base: 2500 }, { cover: "BKN", base: null }],
  }], 33.88, -84.37, now);
  assert.equal(describeCloudLayer(observations[0].clouds[0]), "Scattered clouds · 2,500 ft above ground");
  assert.equal(describeCloudLayer(observations[0].clouds[1]), "Broken clouds");
  assert.equal(describeCloudLayer({ cover: "CLR", baseFeet: null }), "No clouds detected below 12,000 ft");
});

test("rejects malformed, future, and distant reports", () => {
  const valid = { icaoId: "KPDK", lat: 33.88, lon: -84.37, obsTime: event.getTime() / 1000 };
  assert.deepEqual(normalizeMetars([
    {}, { ...valid, obsTime: NaN }, { ...valid, obsTime: now.getTime() / 1000 + 1 },
    { ...valid, lat: 40 }, { ...valid, lon: NaN },
  ], 33.88, -84.37, now), []);
});
