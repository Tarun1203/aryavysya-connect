import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKulaIndex, confidentGotra, kulaKey, lookupKula } from "./kula";

const index = buildKulaIndex([
  { gotraId: "kowsika", kula: "Arasakula", local: ["అరసకుల", "ಅರಸಕುಲ", "அரசகுல"] },
  { gotraId: "kowsika", kula: "Anubha Gula", local: ["అనుభ గుల", "ಅನುಭ ಗುಲ", "அனுப குல"] },
  { gotraId: "kanva", kula: "Kotakula", local: ["కొతకుల", "ಕೊತಕುಲ", "கொதகுல"] },
  { gotraId: "kanva", kula: "Kotukula", local: ["కొతుకుల"] },
  { gotraId: "bhargava", kula: "Pruthvisetla", local: ["పృత్విసెట్ల"] },
  { gotraId: "bhargava", kula: "Kothapalli", local: [] },
]);
const top = (q: string) => lookupKula(index, q)[0];

test("the kula ending is optional", () => {
  assert.equal(kulaKey("Arasakula"), kulaKey("Arasa kulam"));
  assert.equal(kulaKey("Arasakulamu"), kulaKey("Arasa"));
  for (const q of ["Arasakula", "arasa kulam", "ARASAKULAMU", "Arasa"]) assert.deepEqual([top(q)?.kula, top(q)?.how], ["Arasakula", "exact"], q);
});

test("spelling variants are close matches, not exact ones", () => {
  assert.deepEqual([top("Aarasakula")?.kula, top("Aarasakula")?.how], ["Arasakula", "exact"], "a long vowel is the same name");
  assert.deepEqual([top("Arsakula")?.kula, top("Arsakula")?.how], ["Arasakula", "close"]);
  assert.deepEqual([top("Pruthvishetla")?.kula, top("Pruthvishetla")?.how], ["Pruthvisetla", "exact"], "sh / s");
  assert.deepEqual([top("Prudhvisetla")?.kula, top("Prudhvisetla")?.how], ["Pruthvisetla", "close"], "dh / th");
});

test("the start of a name finds the kulas that begin with it", () => {
  const found = lookupKula(index, "Kot").map((m) => m.kula);
  assert.deepEqual(found.sort(), ["Kotakula", "Kothapalli", "Kotukula"]);
  assert.equal(lookupKula(index, "K").length, 0, "one letter is too little");
});

test("typed in script: the local spelling, or the English name by sound", () => {
  assert.deepEqual([top("అరసకుల")?.kula, top("అరసకుల")?.how], ["Arasakula", "exact"]);
  assert.deepEqual([top("అరస")?.gotraId, top("అరస")?.how], ["kowsika", "exact"], "without the kula ending");
  assert.deepEqual([top("ಅರಸ")?.kula, top("ಅರಸ")?.how], ["Arasakula", "exact"]);
  assert.equal(top("அனுப")?.kula, "Anubha Gula");
  // No Kannada spelling stored for Kothapalli: matched through its English name
  assert.deepEqual([top("ಕೊತಪಲ್ಲಿ")?.kula, top("ಕೊತಪಲ್ಲಿ")?.how], ["Kothapalli", "close"]);
});

test("a gotra is picked on its own only when the exact matches agree", () => {
  const pick = (q: string) => confidentGotra(lookupKula(index, q), q);
  assert.equal(pick("Arasa"), "kowsika");
  assert.equal(pick("అరస"), null, "three letters: still typing");
  assert.equal(pick("అరసకుల"), "kowsika");
  assert.equal(pick("Arsakula"), null, "a close match is only a suggestion");
  assert.equal(pick("Kot"), null, "too short to choose");
  assert.equal(pick("Kothapalli"), "bhargava");
  const both = buildKulaIndex([
    { gotraId: "a", kula: "Gundakula", local: [] },
    { gotraId: "b", kula: "Gunda", local: [] },
  ]);
  assert.equal(confidentGotra(lookupKula(both, "Gunda"), "Gunda"), null, "the same kula name under two gotras");
});
