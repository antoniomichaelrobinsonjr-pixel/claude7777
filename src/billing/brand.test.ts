import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLogo, isSafeLogo, parseBrand, MAX_LOGO_BYTES } from "./brand.ts";

test("logo files: only png, jpeg and svg, and not too big", () => {
  assert.equal(checkLogo({ type: "image/png", size: 1000 }), "ok");
  assert.equal(checkLogo({ type: "image/jpeg", size: MAX_LOGO_BYTES }), "ok");
  assert.equal(checkLogo({ type: "image/svg+xml", size: 10 }), "ok");
  assert.equal(checkLogo({ type: "image/png", size: MAX_LOGO_BYTES + 1 }), "tooLarge");
  assert.equal(checkLogo({ type: "image/gif", size: 10 }), "badType");
  assert.equal(checkLogo({ type: "text/html", size: 10 }), "badType");
  assert.equal(checkLogo({ type: "", size: 10 }), "badType");
});

test("stored logos must be base64 data URLs of the allowed image types", () => {
  assert.equal(isSafeLogo("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(isSafeLogo("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), true);
  assert.equal(isSafeLogo("javascript:alert(1)"), false);
  assert.equal(isSafeLogo("https://evil.example/x.png"), false);
  assert.equal(isSafeLogo("data:text/html;base64,PHNjcmlwdD4="), false);
  assert.equal(isSafeLogo('data:image/png;base64,AAAA" onerror="alert(1)'), false);
  assert.equal(isSafeLogo(null), false);
});

test("corrupt or hostile stored brand data falls back to nothing", () => {
  assert.deepEqual(parseBrand(null), { name: "", logo: null });
  assert.deepEqual(parseBrand("not json"), { name: "", logo: null });
  assert.deepEqual(parseBrand(JSON.stringify({ name: 42, logo: "javascript:1" })), { name: "", logo: null });
  assert.equal(parseBrand(JSON.stringify({ name: "x".repeat(500) })).name.length, 80);
  assert.deepEqual(parseBrand(JSON.stringify({ name: "Acme", logo: "data:image/png;base64,AAAA" })), { name: "Acme", logo: "data:image/png;base64,AAAA" });
});
