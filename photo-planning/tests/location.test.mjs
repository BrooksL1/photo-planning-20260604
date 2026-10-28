import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import load from "./tsLoader.cjs";
const require = createRequire(import.meta.url);

test("site arrival shares location, reuses permission, and respects saved choices", async () => {
  const records = new Map();
  let cookie = "", lastCookie = "", requests = 0, state = "prompt", fail = false;
  let callback;
  globalThis.document = {
    get cookie() { return cookie; },
    set cookie(value) { lastCookie = value; cookie = value.split(";")[0]; },
  };
  globalThis.location = { hostname: "www.brooksl.com", protocol: "https:" };
  globalThis.localStorage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: key => records.delete(key),
  };
  globalThis.window = new EventTarget();
  let broadcasts = 0;
  window.addEventListener("brooksl:location", () => broadcasts++);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    permissions: { query: async () => ({ state }) },
    geolocation: { getCurrentPosition: (success, error) => {
      requests++;
      callback = () => fail ? error({code: 2}) : success({coords: {latitude: 33.75, longitude: -84.39}});
    } },
  }});
  function fresh() {
    delete require.cache[require.resolve("../app/lib/location.ts")];
    return load("../app/lib/location.ts");
  }
  let api = fresh();
  const first = api.initializeLocation();
  assert.equal(api.initializeLocation(), first, "one request across effect remounts");
  await Promise.resolve();
  assert.equal(requests, 1, "arrival requests permission when needed");
  callback(); await first;
  assert.equal(api.savedLocation().lat, 33.75);
  assert.equal(api.locationPreference(), "device");
  assert.equal(broadcasts, 1);
  assert.match(lastCookie, /Max-Age=31536000/);
  assert.match(lastCookie, /Path=\//);
  assert.match(lastCookie, /Domain=brooksl.com/);
  assert.match(lastCookie, /Secure/);
  assert.doesNotMatch(cookie, /33.75/);
  await api.initializeLocation(); assert.equal(requests, 1);

  state = "granted"; api = fresh();
  const revisit = api.initializeLocation(); await Promise.resolve(); callback(); await revisit;
  assert.equal(requests, 2, "new visit refreshes using existing permission");
  api.saveLocation({lat: 51.5, lng: -0.12, label: "London", source: "saved", updatedAt: Date.now()});
  api = fresh(); await api.initializeLocation();
  assert.equal(api.savedLocation().label, "London"); assert.equal(requests, 2);
  api.forgetLocation(); api = fresh(); await api.initializeLocation();
  assert.equal(api.savedLocation(), null); assert.equal(requests, 2);

  cookie = ""; state = "denied"; api = fresh();
  await assert.rejects(api.initializeLocation(), /blocked/); assert.equal(requests, 2);
  state = "prompt"; navigator.permissions = undefined; api = fresh();
  const fallback = api.initializeLocation();
  await Promise.resolve(); callback(); await fallback;
  assert.equal(requests, 3, "works without Permissions API");
  fail = true; api = fresh();
  const timeout = api.initializeLocation(); await Promise.resolve(); callback();
  await assert.rejects(timeout, /fresh location/);
  assert.equal(api.savedLocation().lat, 33.75, "failed refresh retains cache");
  fail = false; api = fresh();
  const pending = api.initializeLocation(); await Promise.resolve();
  api.forgetLocation(); callback(); await pending;
  assert.equal(api.savedLocation(), null, "pending GPS cannot undo opting out");
});
