import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./safe-next.ts";

test("same-site paths are allowed", () => {
  for (const ok of ["/", "/pricing", "/pricing?checkout=success", "/project/abc/report#map"]) assert.equal(safeNext(ok), ok);
});

test("anything that could leave the site is replaced with the fallback", () => {
  for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "http://evil.example/x", "javascript:alert(1)", "evil.example", "", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\u0000/evil", "\\\\evil"])
    assert.equal(safeNext(bad), "/", JSON.stringify(bad));
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(undefined), "/");
  assert.equal(safeNext("//evil", "/home"), "/home");
});
