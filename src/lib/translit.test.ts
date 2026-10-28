import { test } from "node:test";
import assert from "node:assert/strict";
import { foldLatin, latinPattern, learnFromPairs, mergeOverrides, scriptOf, toScript, transliterate, type Overrides } from "./translit";

test("Telugu: the common spelling conventions", () => {
  const cases: [string, string][] = [
    ["Lakshmi", "లక్ష్మి"],
    ["Krishna", "కృష్ణ"],
    ["Vishnu", "విష్ణు"],
    ["Sreenivas", "శ్రీనివస్"],
    ["Sri", "శ్రీ"],
    ["Venkata", "వెంకట"],
    ["Reddy", "రెడ్డి"],
    ["Seetha", "సీత"],
    ["Ranga", "రంగ"],
    ["Prasanna", "ప్రసన్న"],
    ["Madhavi", "మధవి"],
    ["Venkatesh", "వెంకటేశ్"],
  ];
  for (const [latin, te] of cases) assert.equal(toScript(latin, "te"), te, latin);
});

test("Kannada is the same letters one block along", () => {
  assert.equal(toScript("Lakshmi", "kn"), "ಲಕ್ಷ್ಮಿ");
  assert.equal(toScript("Venkata", "kn"), "ವೆಂಕಟ");
  assert.equal(toScript("Krishna", "kn"), "ಕೃಷ್ಣ");
});

test("Tamil: one letter per family, nasals instead of the anusvara, grantha letters", () => {
  assert.equal(toScript("Venkata", "ta"), "வெங்கட");
  assert.equal(toScript("Lakshmi", "ta"), "லக்ஷ்மி");
  assert.equal(toScript("Sri", "ta"), "ஸ்ரீ");
  assert.equal(toScript("Venkatesh", "ta"), "வெங்கடேஷ்");
  assert.equal(toScript("Ananth", "ta"), "அனந்த்");
  assert.equal(toScript("Nirmala", "ta"), "நிர்மல");
});

test("words, spaces and punctuation are kept", () => {
  assert.equal(toScript("Ravi Kumar", "te"), "రవి కుమర్");
  assert.equal(toScript("K. Ravi", "te"), "క్. రవి");
});

const overrides: Overrides = new Map([
  ["kowsikasa", { te: { text: "కౌశికస", confidence: "verified" }, kn: { text: "ಕೌಶಿಕಸ", confidence: "community" } }],
  ["kotha", { te: { text: "కోట", confidence: "community" } }],
  ["vasavi kanyaka parameswari", { te: { text: "వాసవీ కన్యకా పరమేశ్వరి", confidence: "verified" } }],
]);

test("community spellings win over the guess, with the weakest source reported", () => {
  assert.deepEqual(transliterate("Kowsikasa", "te", overrides), { text: "కౌశికస", confidence: "verified", words: [{ latin: "Kowsikasa", text: "కౌశికస", confidence: "verified" }] });
  const name = transliterate("Ravi Kotha", "te", overrides);
  assert.equal(name.text, "రవి కోట");
  assert.equal(name.confidence, "guess", "Ravi was guessed");
  assert.deepEqual(name.words.map((w) => w.confidence), ["guess", "community"]);
  assert.equal(transliterate(" vasavi  KANYAKA parameswari", "te", overrides).text, "వాసవీ కన్యకా పరమేశ్వరి", "a whole phrase, folded");
  assert.equal(transliterate("Kotha", "kn", overrides).confidence, "guess", "no Kannada spelling known");
});

test("learning from pairs members entered: two agreeing records make a spelling", () => {
  const learned = learnFromPairs([
    { latin: "Ravi Kumar", local: "రవి కుమార్" },
    { latin: "Ravi", local: "రవి" },
    { latin: "Kumar Swamy", local: "కుమార్ స్వామి" },
    { latin: "Swamy", local: "స్వామీ" },
    { latin: "Ravi Teja", local: "రవితేజ" }, // word counts differ: ignored
  ]);
  assert.equal(learned.get("ravi")?.te?.text, "రవి");
  assert.equal(learned.get("kumar")?.te?.text, "కుమార్");
  assert.equal(learned.get("swamy"), undefined, "two different spellings, one each");
  const merged = mergeOverrides(overrides, learned);
  assert.equal(transliterate("Ravi Kumar", "te", merged).confidence, "community");
});

test("script detection and folding", () => {
  assert.equal(scriptOf("రవి"), "te");
  assert.equal(scriptOf("ರವಿ"), "kn");
  assert.equal(scriptOf("ரவி"), "ta");
  assert.equal(scriptOf("Ravi"), null);
  assert.equal(foldLatin("  Kowśikasa  "), "kowsikasa");
});

test("script → a pattern matching the usual English spellings", () => {
  const match = (script: string, ...latin: string[]) => {
    const re = new RegExp(`^${latinPattern(script)}$`, "i");
    for (const l of latin) assert.ok(re.test(l), `${script} should match ${l} (${re})`);
  };
  match("వెంకట", "Venkata", "Venkat");
  match("సీత", "Seetha", "Sita", "Seeta");
  match("లక్ష్మి", "Lakshmi", "Laxmi");
  match("రెడ్డి", "Reddy", "Reddi");
  match("శ్రీనివాస్", "Srinivas", "Shreenivaas", "Sreenivas");
  match("ಲಕ್ಷ್ಮಿ", "Lakshmi");
  match("வெங்கடேஷ்", "Venkatesh", "Venkatesh");
  match("கிருஷ்ணன்", "Krishnan");
  assert.equal(latinPattern("Ravi"), null);
  assert.ok(!new RegExp(`^${latinPattern("రవి")}$`, "i").test("Ramu"));
});
