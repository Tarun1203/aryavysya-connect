import { test } from "node:test";
import assert from "node:assert/strict";
import { foldLatin, scan, scanFields } from "./moderation-core";

const sev = (t: string, mode: "text" | "name" = "text") => scan(t, mode).severity;

test("plain abuse is blocked, in every language", () => {
  for (const t of ["what the fuck", "You BASTARDS", "lanjakoduka", "nuvvu lanja", "boli maga", "thevidiya paiya", "ఆమె లంజ", "లంజకొడుకు", "ಬೋಳಿಮಗ", "ಬೋಳಿ  ಮಗ", "தேவடியா மகன்"]) {
    assert.equal(sev(t), "block", t);
  }
});

test("the usual tricks are folded away", () => {
  assert.equal(foldLatin("Ｆｕｃｋ"), "fuck", "full-width");
  assert.equal(foldLatin("fuсk"), "fuck", "Cyrillic с");
  assert.equal(foldLatin("sh1t"), "shit", "leetspeak");
  assert.equal(foldLatin("f.u.c.k"), "fuck", "dotted");
  assert.equal(foldLatin("f u c k"), "fuck", "spaced");
  assert.equal(foldLatin("fu​ck"), "fuck", "zero-width space");
  assert.equal(foldLatin("fuuuuuck"), "fuuck", "stretched");
  for (const t of ["Ｆｕｃｋ", "fuсk", "fu*ck", "f u c k", "fuuuuuck", "$lut", "b1tch", "@sshole", "fu​ck", "fúck"]) assert.equal(sev(t), "block", t);
  assert.equal(sev("లం‌జ"), "block", "a joiner inside a Telugu word");
});

test("innocent words are left alone", () => {
  const clean = [
    "He lived in Assam and taught a class on classic literature",
    "as soon as possible",
    "Scunthorpe",
    "Recovered from dengue fever in 1998",
    "Shiitake farmer",
    "Cocktail bartender",
    "Sunni Muslim neighbours",
    "Pushpa, Kotha family, Guntur",
    "Retired as Assistant Engineer",
    "e.g. 1st son, 100% sure",
    "శ్రీనివాస్ కోట, గుంటూరు",
    "ಬೆಂಗಳೂರು, ವ್ಯಾಪಾರಿ",
    "சென்னை, ஆசிரியர்",
  ];
  for (const t of clean) assert.equal(sev(t), null, t);
});

test("words with innocent meanings go to a moderator, not refused", () => {
  assert.deepEqual(scan("he is a dick"), { severity: "review", terms: ["dick"] });
  assert.equal(sev("Supriya Sule"), "review");
  assert.equal(sev("gudda"), "review");
});

test("names are checked for blocked words only", () => {
  assert.equal(sev("Sule", "name"), null, "a surname");
  assert.equal(sev("Dick", "name"), null, "a given name");
  assert.equal(sev("Gudda", "name"), null, "a place in Karnataka");
  assert.equal(sev("Lanja", "name"), "block");
});

test("fields: blocked and for-review separated, names treated as names", () => {
  const r = scanFields({ givenName: "Sule", notes: "a total bastard", occupation: "dick", aliases: ["Ravi", "R. K."], birthPlace: null }, ["givenName", "aliases"]);
  assert.deepEqual(r.block.map((f) => f.field), ["notes"]);
  assert.deepEqual(r.review.map((f) => f.field), ["occupation"]);
});
