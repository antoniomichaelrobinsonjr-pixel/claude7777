import { test } from "node:test";
import assert from "node:assert/strict";
import { applyParsedComps } from "./apply.ts";
import { parseComps } from "./parse.ts";
import { dateOrderFor, recognitionCtor, recognitionLang, speechProblem } from "./speech.ts";
import { newComp, type Comp } from "../lib/comps.ts";

const today = new Date("2026-10-04T12:00:00Z");
const make = (o: Partial<Comp> = {}): Comp => ({ ...newComp(), ...o });
const parsed = (s: string) => parseComps(s, { kind: "home", today });

test("read-in comps fill blank placeholder rows first, then append", () => {
  const existing = [make({ id: "a", address: "Real St", salePrice: 100 }), make({ id: "b" }), make({ id: "c" })];
  const r = applyParsedComps(existing, parsed("1 One St sold for $1\n2 Two St sold for $2\n3 Three St sold for $3"), () => make({ id: "n" }), Infinity);
  assert.equal(r.added, 3);
  assert.equal(r.comps.length, 4, "the two blank rows were used and one row was added");
  assert.deepEqual(r.comps.map((c) => c.address), ["Real St", "1 One St", "2 Two St", "3 Three St"]);
  assert.equal(r.comps[0].salePrice, 100, "an existing comp is never overwritten");
  assert.ok(r.comps.every((c) => c.included));
});

test("nothing is added past the plan's limit, and the leftovers are counted", () => {
  const existing = [make({ id: "a", address: "A", salePrice: 1 }), make({ id: "b", address: "B", salePrice: 1 })];
  const r = applyParsedComps(existing, parsed("1 One St sold for $1\n2 Two St sold for $2\n3 Three St sold for $3"), () => make(), 3);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 2);
  assert.equal(r.comps.length, 3);
  const none = applyParsedComps(existing, parsed("1 One St sold for $1"), () => make(), 2);
  assert.deepEqual([none.added, none.skipped, none.comps.length], [0, 1, 2]);
  assert.equal(existing.length, 2, "the input list is not changed");
});

test("blank rows can be filled even when the list is at its limit", () => {
  const existing = [make({ id: "a" }), make({ id: "b" })];
  const r = applyParsedComps(existing, parsed("1 One St sold for $1\n2 Two St sold for $2"), () => make(), 2);
  assert.deepEqual([r.added, r.skipped], [2, 0]);
});

test("speech errors map to something a person can act on", () => {
  assert.equal(speechProblem("not-allowed"), "denied");
  assert.equal(speechProblem("service-not-allowed"), "denied");
  assert.equal(speechProblem("audio-capture"), "mic");
  assert.equal(speechProblem("no-speech"), "none");
  assert.equal(speechProblem("network"), "network");
  assert.equal(speechProblem("aborted"), null, "stopping it ourselves is not an error");
  assert.equal(speechProblem("something-new"), "generic");
  assert.equal(speechProblem(undefined), "generic");
});

test("the recogniser is found under either name, or not at all", () => {
  class R {}
  assert.equal(recognitionCtor({ SpeechRecognition: R }), R);
  assert.equal(recognitionCtor({ webkitSpeechRecognition: R }), R);
  assert.equal(recognitionCtor({}), null);
  assert.equal(recognitionCtor(undefined), null);
});

test("language and date order", () => {
  assert.equal(recognitionLang("en-GB"), "en-GB");
  assert.equal(recognitionLang("en"), "en-US", "a bare language code becomes a full tag the recogniser accepts");
  assert.equal(recognitionLang("fr-FR"), "en-US", "reading is English only, so the recogniser listens for English");
  assert.equal(recognitionLang("enigma"), "en-US");
  assert.equal(dateOrderFor("en-US"), "mdy");
  assert.equal(dateOrderFor("en-GB"), "dmy");
  assert.equal(dateOrderFor("de-DE"), "dmy");
  assert.equal(dateOrderFor("not a locale"), "mdy");
});
