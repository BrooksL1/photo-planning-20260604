import { test } from "node:test";
import { strict as assert } from "node:assert";
import load from "./tsLoader.cjs";

test("location remembers choices without repeatedly asking for browser permission", async () => {
  const records = new Map();
  let cookie = "",
    lastCookie = "",
    requests = 0,
    state = "prompt";
  globalThis.document = {
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      lastCookie = value;
      cookie = value.split(";")[0];
    },
  };
  globalThis.location = { hostname: "brooksl.com", protocol: "https:" };
  globalThis.localStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  };
  globalThis.window = new EventTarget();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      permissions: { query: async () => ({ state }) },
      geolocation: {
        getCurrentPosition: (success) => {
          requests++;
          success({ coords: { latitude: 33.75, longitude: -84.39 } });
        },
      },
    },
  });
  const {
    savedLocation,
    saveLocation,
    locationPreference,
    refreshGrantedLocation,
    requestDeviceLocation,
    forgetLocation,
  } = load("../app/lib/location.ts");
  assert.equal(savedLocation(), null);
  await refreshGrantedLocation();
  assert.equal(requests, 0);
  saveLocation({
    lat: 51.5,
    lng: -0.12,
    label: "Saved place",
    source: "saved",
    updatedAt: Date.now(),
  });
  assert.equal(locationPreference(), "saved");
  assert.equal(savedLocation().label, "Saved place");
  assert.match(lastCookie, /Max-Age=31536000/);
  assert.match(lastCookie, /Path=\//);
  assert.match(lastCookie, /Domain=brooksl.com/);
  assert.match(lastCookie, /Secure/);
  assert.doesNotMatch(cookie, /51.5/);
  await refreshGrantedLocation();
  assert.equal(requests, 0);
  await requestDeviceLocation();
  assert.equal(requests, 1);
  assert.equal(locationPreference(), "device");
  await refreshGrantedLocation();
  assert.equal(
    requests,
    1,
    "an expired permission must not prompt automatically",
  );
  state = "granted";
  await refreshGrantedLocation();
  assert.equal(requests, 2);
  forgetLocation();
  assert.equal(savedLocation(), null);
  assert.equal(locationPreference(), "off");
  await refreshGrantedLocation();
  assert.equal(requests, 2);
});
