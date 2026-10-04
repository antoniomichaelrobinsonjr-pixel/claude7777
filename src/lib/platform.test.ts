import { test } from "node:test";
import assert from "node:assert/strict";
import { nativePlatform } from "./platform.ts";

const cap = (native: boolean, platform: string) => ({ Capacitor: { isNativePlatform: () => native, getPlatform: () => platform } });

test("native platform: only a real store app counts", () => {
  assert.equal(nativePlatform(cap(true, "ios")), "ios");
  assert.equal(nativePlatform(cap(true, "android")), "android");
  assert.equal(nativePlatform(cap(false, "web")), null, "Capacitor present in a browser is not a store app");
  assert.equal(nativePlatform(cap(false, "ios")), null);
  assert.equal(nativePlatform(cap(true, "electron")), null, "unknown platforms are treated as the web");
  assert.equal(nativePlatform({}), null);
  assert.equal(nativePlatform(undefined), null);
  assert.equal(nativePlatform({ Capacitor: {} }), null);
});
