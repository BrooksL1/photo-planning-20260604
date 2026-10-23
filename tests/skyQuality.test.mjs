import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const load = require("./tsLoader.cjs");
const { scoreSkyQuality } = load("../app/PhotoPlanning/lib/skyQuality.ts");

const pt = (distanceMiles, cloudLow, cloudMid, cloudHigh) => ({ distanceMiles, cloudLow, cloudMid, cloudHigh });
const base = {
  visibilityMiles: 20,
  relativeHumidity: 55,
  precipProbability: 5,
  aod: 0.15,
  precip24hMm: null,
  pressureTrend3h: null,
  rh300: null,
};
const sky = (transect, extra = {}) => scoreSkyQuality({ ...base, transect, ...extra });
const ideal = [pt(20, 5, 40, 45), pt(60, 5, 40, 45), pt(120, 5, 40, 45), pt(200, 5, 40, 45)];

test("clear horizon with layered mid/high cloud scores very high", () => {
  assert.ok(sky(ideal).score >= 75);
});

test("a low cloud bank toward the sun sinks the score", () => {
  const blocked = [pt(20, 70, 40, 45), ...ideal.slice(1)];
  assert.ok(sky(blocked).score < 25);
});

test("a low bank far away hurts less than the same bank close in", () => {
  const near = sky([pt(20, 70, 40, 45), pt(60, 5, 40, 45), pt(120, 5, 40, 45), pt(200, 5, 40, 45)]);
  const far = sky([pt(20, 5, 40, 45), pt(60, 5, 40, 45), pt(120, 5, 40, 45), pt(200, 70, 40, 45)]);
  assert.ok(far.score > near.score);
});

test("a cloudless sky is middling, not best and not worst", () => {
  const clear = sky([pt(20, 0, 0, 0), pt(60, 0, 0, 0), pt(120, 0, 0, 0), pt(200, 0, 0, 0)]);
  assert.ok(clear.score >= 20 && clear.score <= 45, `got ${clear.score}`);
});

test("a solid mid+high lid is labelled too much cloud", () => {
  const lid = sky([pt(20, 10, 95, 95), pt(60, 10, 95, 95)]);
  assert.equal(lid.label, "Too Much Cloud Cover");
});

test("heavy smoke lowers an otherwise ideal sky; light aerosol does not", () => {
  const smoky = sky(ideal, { aod: 1.5 });
  const light = sky(ideal, { aod: 0.2 });
  assert.ok(smoky.score < light.score - 15);
});

test("low visibility lowers the score", () => {
  assert.ok(sky(ideal, { visibilityMiles: 3 }).score < sky(ideal).score - 15);
});

test("high precipitation chance lowers the score", () => {
  assert.ok(sky(ideal, { precipProbability: 90 }).score < sky(ideal).score - 40);
});

test("recent rain with clearing skies is a small bonus; falling pressure a penalty", () => {
  const plain = sky(ideal).score;
  assert.ok(sky(ideal, { precip24hMm: 4 }).score >= plain);
  assert.ok(sky(ideal, { pressureTrend3h: -4 }).score < plain);
});

test("missing optional inputs still score; missing cloud data returns null", () => {
  const minimal = scoreSkyQuality({ transect: ideal, visibilityMiles: null, relativeHumidity: null, precipProbability: null, aod: null, precip24hMm: null, pressureTrend3h: null, rh300: null });
  assert.ok(minimal && minimal.score > 50);
  assert.equal(scoreSkyQuality({ ...base, transect: [pt(20, null, null, null)] }), null);
});

test("score always stays within 0-100", () => {
  const best = sky(ideal, { precip24hMm: 4, pressureTrend3h: 3, rh300: 80 });
  assert.ok(best.score <= 100 && best.score >= 0);
});

test("explainSkyQuality describes a blocked sky in plain words", () => {
  const { explainSkyQuality } = load("../app/PhotoPlanning/lib/skyQuality.ts");
  const blocked = sky([pt(20, 90, 40, 45), pt(60, 90, 40, 45), pt(120, 90, 40, 45), pt(200, 90, 40, 45)]);
  const e = explainSkyQuality(blocked);
  assert.equal(e.factors[0].verdict, "poor");
  assert.match(e.factors[0].text, /block/i);
  assert.equal(e.summary, "Color is unlikely.");
  assert.equal(e.factors.length, 4);
});

test("explainSkyQuality calls the ideal case strong", () => {
  const { explainSkyQuality } = load("../app/PhotoPlanning/lib/skyQuality.ts");
  const e = explainSkyQuality(sky(ideal));
  assert.match(e.summary, /strong color/);
  assert.ok(e.factors.every((f) => f.verdict === "good"));
});

test("skyRating maps 0-100 onto 1-10", () => {
  const { skyRating } = load("../app/PhotoPlanning/lib/skyQuality.ts");
  assert.equal(skyRating(0), 1);
  assert.equal(skyRating(2), 1);
  assert.equal(skyRating(36), 4);
  assert.equal(skyRating(45), 5);
  assert.equal(skyRating(99), 10);
  assert.equal(skyRating(100), 10);
});
