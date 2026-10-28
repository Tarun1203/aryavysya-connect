/**
 * Transliteration between the Latin spellings people type ("Venkateswarlu", "Sreenivas") and
 * Telugu, Kannada and Tamil script, computed here – no service, no dictionary download.
 *
 * Indian-English spellings don't mark long vowels or retroflex consonants, so the generic result
 * is a best guess: ee/ii → ī, oo/uu → ū, aa → ā, th → త (dental), t → ట, d → ద, dd → డ్డ, sh → శ,
 * ksh/x → క్ష, Sri/Shri/Sree → శ్రీ, n or m before a consonant → the anusvara (ం), a final
 * consonant takes the virama. Community spellings are layered on top (see `transliterate`): a
 * gotra, kula or name spelled the same way by members wins over the guess, and every result says
 * where it came from.
 *
 * The other direction (`latinPattern`) turns script into a pattern matching the usual English
 * spellings, so a search typed in Telugu also finds people entered only in English.
 *
 * Pure functions, no I/O: used on the server (with the database's spellings) and unit-tested.
 */

export type Script = "te" | "kn" | "ta";
export const SCRIPTS: Script[] = ["te", "kn", "ta"];

/** Where a spelling came from: an administrator checked it, members use it, or it's computed */
export type Confidence = "verified" | "community" | "guess";

/* ---------------------------------------------------------------- Latin → sounds */

type Sound = { c: string } | { v: string } | { m: true } | { raw: string };

const CONSONANTS: [string, string][] = [
  ["ksh", "kṣ"], ["chh", "ch"], ["kh", "kh"], ["gh", "gh"], ["ch", "c"], ["jh", "jh"],
  ["th", "t"], ["dh", "dh"], ["ph", "ph"], ["bh", "bh"], ["sh", "ś"],
  ["k", "k"], ["q", "k"], ["g", "g"], ["c", "c"], ["j", "j"], ["z", "j"], ["x", "kṣ"],
  ["t", "ṭ"], ["d", "d"], ["n", "n"], ["p", "p"], ["f", "ph"], ["b", "b"], ["m", "m"],
  ["y", "y"], ["r", "r"], ["l", "l"], ["v", "v"], ["w", "v"], ["s", "s"], ["h", "h"],
];
const VOWELS: [string, string][] = [
  ["aa", "ā"], ["ai", "ai"], ["au", "au"], ["ou", "au"], ["ee", "ī"], ["ii", "ī"], ["ea", "ī"],
  ["oo", "ū"], ["uu", "ū"], ["a", "a"], ["i", "i"], ["u", "u"], ["e", "e"], ["o", "o"],
];
/** Doubled letters that mean a doubled (geminate) consonant – dd and tt are retroflex in names */
const GEMINATE: Record<string, string> = { dd: "ḍ", tt: "ṭ", ll: "l", nn: "n", mm: "m", pp: "p", kk: "k", ss: "s", rr: "r", vv: "v", gg: "g", cc: "c", bb: "b", yy: "y", jj: "j" };

/** One word of Latin letters into sounds */
function sounds(word: string): Sound[] {
  const w = word.toLowerCase();
  const out: Sound[] = [];
  let i = 0;
  // Sri / Shri / Sree / Shree at the start: శ్రీ
  const sri = /^(sh?r(?:ee|i))/.exec(w);
  if (sri) {
    out.push({ c: "ś" }, { c: "r" }, { v: "ī" });
    i = sri[1].length;
  }
  while (i < w.length) {
    const rest = w.slice(i);
    const pair = rest.slice(0, 2);
    if (GEMINATE[pair] && !VOWELS.some(([l]) => l === pair)) {
      out.push({ c: GEMINATE[pair] }, { c: GEMINATE[pair] });
      i += 2;
      continue;
    }
    // A final "y" after a consonant is a short i (Reddy, Chetty)
    if (rest === "y" && out.length && "c" in out[out.length - 1]) {
      out.push({ v: "i" });
      i++;
      continue;
    }
    const v = VOWELS.find(([l]) => rest.startsWith(l));
    if (v) {
      out.push({ v: v[1] });
      i += v[0].length;
      continue;
    }
    const c = CONSONANTS.find(([l]) => rest.startsWith(l));
    if (c) {
      out.push({ c: c[1] });
      i += c[0].length;
      continue;
    }
    out.push({ raw: w[i] });
    i++;
  }
  return refine(out);
}

const isC = (s: Sound | undefined): s is { c: string } => !!s && "c" in s;
const isV = (s: Sound | undefined): s is { v: string } => !!s && "v" in s;

/** Context rules: vocalic r (Krishna), ṣṇ (Vishnu), the anusvara, and long e / o after the first syllable */
function refine(s: Sound[]): Sound[] {
  const out: Sound[] = [];
  let syllable = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = s[i], next = s[i + 1], prev = out[out.length - 1];
    // consonant + "ri" + consonant, not after s/ś: kṛ (Krishna, Hrudaya stays as typed)
    if (isC(cur) && cur.c === "r" && isC(prev) && !["s", "ś", "r"].includes(prev.c) && isV(next) && next.v === "i" && isC(s[i + 2]) && out.length === 1) {
      out.push({ v: "ṛ" });
      i++;
      continue;
    }
    // ś before n or ṇ is ṣ, and n after ṣ is ṇ (Vishnu, Krishna)
    if (isC(cur) && cur.c === "ś" && isC(next) && next.c === "n") {
      out.push({ c: "ṣ" }, { c: "ṇ" });
      i++;
      continue;
    }
    if (isC(cur) && cur.c === "n" && isC(prev) && prev.c === "ṣ") {
      out.push({ c: "ṇ" });
      continue;
    }
    // n or m closing a syllable before another consonant: the anusvara (Venkata, Ranga, Pampa)
    if (isC(cur) && (cur.c === "n" || cur.c === "m") && isV(prev) && isC(next) && !["y", "r", "l", "v", "h", cur.c].includes(next.c)) {
      out.push({ m: true });
      continue;
    }
    if (isV(cur)) {
      syllable++;
      if (syllable > 1 && (cur.v === "e" || cur.v === "o")) {
        out.push({ v: cur.v === "e" ? "ē" : "ō" });
        continue;
      }
    }
    out.push(cur);
  }
  return out;
}

/* ---------------------------------------------------------------- sounds → script */

const TE_V: Record<string, [string, string]> = {
  a: ["అ", ""], ā: ["ఆ", "ా"], i: ["ఇ", "ి"], ī: ["ఈ", "ీ"], u: ["ఉ", "ు"], ū: ["ఊ", "ూ"], ṛ: ["ఋ", "ృ"],
  e: ["ఎ", "ె"], ē: ["ఏ", "ే"], ai: ["ఐ", "ై"], o: ["ఒ", "ొ"], ō: ["ఓ", "ో"], au: ["ఔ", "ౌ"],
};
const TE_C: Record<string, string> = {
  k: "క", kh: "ఖ", g: "గ", gh: "ఘ", c: "చ", ch: "ఛ", j: "జ", jh: "ఝ", ṭ: "ట", ḍ: "డ", ṇ: "ణ", t: "త", d: "ద", dh: "ధ",
  n: "న", p: "ప", ph: "ఫ", b: "బ", bh: "భ", m: "మ", y: "య", r: "ర", l: "ల", v: "వ", ś: "శ", ṣ: "ష", s: "స", h: "హ", ḷ: "ళ", kṣ: "క్ష",
};
const TE_VIRAMA = "్";
const TE_ANUSVARA = "ం";

/** Kannada sits exactly one block (0x80) after Telugu, letter for letter */
const toKannada = (s: string) => [...s].map((ch) => (ch >= "ఀ" && ch <= "౿" ? String.fromCharCode(ch.charCodeAt(0) + 0x80) : ch)).join("");

const TA_V: Record<string, [string, string]> = {
  a: ["அ", ""], ā: ["ஆ", "ா"], i: ["இ", "ி"], ī: ["ஈ", "ீ"], u: ["உ", "ு"], ū: ["ஊ", "ூ"], ṛ: ["ரு", "்ரு"],
  e: ["எ", "ெ"], ē: ["ஏ", "ே"], ai: ["ஐ", "ை"], o: ["ஒ", "ொ"], ō: ["ஓ", "ோ"], au: ["ஔ", "ௌ"],
};
// Tamil has one letter for each family of stops; grantha letters for j, ṣ, s, h, kṣ. Names write
// "sh" with ஷ (வெங்கடேஷ்); ஶ is rare, so ś shares ஷ
const TA_C: Record<string, string> = {
  k: "க", kh: "க", g: "க", gh: "க", c: "ச", ch: "ச", j: "ஜ", jh: "ஜ", ṭ: "ட", ḍ: "ட", ṇ: "ண", t: "த", d: "த", dh: "த",
  n: "ன", p: "ப", ph: "ப", b: "ப", bh: "ப", m: "ம", y: "ய", r: "ர", l: "ல", v: "வ", ś: "ஷ", ṣ: "ஷ", s: "ஸ", h: "ஹ", ḷ: "ள", kṣ: "க்ஷ",
};
const TA_PULLI = "்";

function render(s: Sound[], script: Script): string {
  const ta = script === "ta";
  const V = ta ? TA_V : TE_V;
  const virama = ta ? TA_PULLI : TE_VIRAMA;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const cur = s[i], next = s[i + 1];
    if ("raw" in cur) out += cur.raw;
    else if ("m" in cur) {
      if (!ta) out += TE_ANUSVARA;
      else {
        // Tamil has no anusvara: the nasal of the consonant that follows
        const n = isC(next) ? next.c : "";
        out += (["k", "kh", "g", "gh"].includes(n) ? "ங" : ["c", "ch", "j", "jh"].includes(n) ? "ஞ" : ["ṭ", "ḍ"].includes(n) ? "ண" : ["t", "d", "dh"].includes(n) ? "ந" : ["p", "ph", "b", "bh", "m"].includes(n) ? "ம" : "ன") + TA_PULLI;
      }
    } else if ("v" in cur) {
      out += V[cur.v][0];
    } else {
      let letter = (ta ? TA_C : TE_C)[cur.c] ?? cur.c;
      // Tamil dental n at the start of a word or before t/d: ந (elsewhere ன)
      if (ta && cur.c === "n" && (i === 0 || (isC(next) && ["t", "d", "dh"].includes(next.c)))) letter = "ந";
      // Sri in Tamil is written ஸ்ரீ
      if (ta && cur.c === "ś" && i === 0 && isC(next) && next.c === "r") letter = "ஸ";
      out += letter;
      if (isV(next)) {
        out += V[next.v][1];
        i++;
      } else if (!(next && "raw" in next)) out += virama;
    }
  }
  return script === "kn" ? toKannada(out) : out;
}

/** The generic transliteration of Latin text (words kept apart, anything else left as it is) */
export function toScript(text: string, script: Script): string {
  return text.replace(/[A-Za-z]+/g, (w) => render(sounds(w), script));
}

/* ---------------------------------------------------------------- community overrides */

/** Known spellings: a Latin word or phrase (folded) → its spelling in each script */
export type Overrides = Map<string, Partial<Record<Script, { text: string; confidence: Exclude<Confidence, "guess"> }>>>;

/** Case, accents and spacing folded, so "Kowsikasa" and "kowsikasa " are the same key */
export const foldLatin = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export type Transliteration = {
  text: string;
  /** The weakest source among the words: one guessed word makes the whole result a guess */
  confidence: Confidence;
  words: { latin: string; text: string; confidence: Confidence }[];
};

const RANK: Record<Confidence, number> = { verified: 2, community: 1, guess: 0 };

/** Latin to script, community spellings first: the whole text, then word by word, then the guess */
export function transliterate(text: string, script: Script, overrides: Overrides = new Map()): Transliteration {
  const whole = overrides.get(foldLatin(text))?.[script];
  if (whole) return { text: whole.text, confidence: whole.confidence, words: [{ latin: text.trim(), ...whole }] };
  const words = (text.match(/[A-Za-z]+|[^A-Za-z]+/g) ?? []).map((part) => {
    if (!/[A-Za-z]/.test(part)) return { latin: part, text: part, confidence: "verified" as Confidence };
    const known = overrides.get(foldLatin(part))?.[script];
    return known ? { latin: part, ...known } : { latin: part, text: toScript(part, script), confidence: "guess" as Confidence };
  });
  const real = words.filter((w) => /[A-Za-z]/.test(w.latin));
  const confidence = real.length ? real.reduce<Confidence>((low, w) => (RANK[w.confidence] < RANK[low] ? w.confidence : low), "verified") : "guess";
  return { text: words.map((w) => w.text).join(""), confidence, words: real };
}

/**
 * Learn spellings from pairs members entered (English name, name in script): a word pair counts
 * when both sides have the same number of words. A spelling used by at least `min` different
 * records becomes a community spelling; ties go to the most used.
 */
export function learnFromPairs(pairs: { latin: string; local: string }[], min = 2): Overrides {
  const counts = new Map<string, Map<string, number>>();
  for (const { latin, local } of pairs) {
    const a = latin.trim().split(/\s+/);
    const b = local.trim().split(/\s+/);
    if (a.length !== b.length) continue;
    a.forEach((w, i) => {
      const script = scriptOf(b[i]);
      if (!script || !/^[A-Za-z]+$/.test(w)) return;
      const key = `${script}|${foldLatin(w)}`;
      const m = counts.get(key) ?? new Map<string, number>();
      m.set(b[i], (m.get(b[i]) ?? 0) + 1);
      counts.set(key, m);
    });
  }
  const out: Overrides = new Map();
  for (const [key, m] of counts) {
    const [script, word] = key.split("|") as [Script, string];
    const [best, n] = [...m].sort((x, y) => y[1] - x[1])[0];
    if (n < min) continue;
    out.set(word, { ...out.get(word), [script]: { text: best, confidence: "community" } });
  }
  return out;
}

/** Merge override layers; earlier layers win (put the checked ones first) */
export function mergeOverrides(...layers: Overrides[]): Overrides {
  const out: Overrides = new Map();
  for (const layer of layers.toReversed())
    for (const [k, v] of layer) out.set(k, { ...out.get(k), ...v });
  return out;
}

/* ---------------------------------------------------------------- script → Latin pattern */

/** Which of our scripts a piece of text is in (null: Latin or other) */
export function scriptOf(s: string): Script | null {
  if (/[ఀ-౿]/.test(s)) return "te";
  if (/[ಀ-೿]/.test(s)) return "kn";
  if (/[஀-௿]/.test(s)) return "ta";
  return null;
}

// The usual English spellings of each sound, as regular-expression alternatives
const SPELL: Record<string, string> = {
  a: "a", ā: "aa?", i: "(?:i|ee|y)", ī: "(?:ee|ii?|ea|y)", u: "(?:u|oo)", ū: "(?:oo|uu?)", ṛ: "(?:ri|ru)", e: "(?:e|a)", ē: "(?:e|ae|ee)",
  ai: "(?:ai|ay)", o: "o", ō: "(?:o|oo)", au: "(?:au|ou|ow)",
  k: "(?:k|c|q)", kh: "kh?", g: "g", gh: "gh?", c: "(?:ch|c)", ch: "ch", j: "(?:j|z)", jh: "jh?", ṭ: "t", ḍ: "d", ṇ: "n", t: "th?", d: "dh?", dh: "dh?",
  n: "n", p: "p", ph: "(?:ph|f)", b: "b", bh: "bh?", m: "m", y: "y", r: "r", l: "l", v: "(?:v|w)", ś: "(?:sh?)", ṣ: "(?:sh?)", s: "s", h: "h", ḷ: "l", kṣ: "(?:ksh|x)",
  M: "(?:n|m)", ṅ: "n", ñ: "n",
};

/** Reverse tables (script letter → sound), built from the forward ones */
function reverseTables(script: Script) {
  const V = script === "ta" ? TA_V : TE_V;
  const C = script === "ta" ? TA_C : TE_C;
  const conv = (s: string) => (script === "kn" ? toKannada(s) : s);
  const cons = new Map<string, string>();
  for (const [sound, letter] of Object.entries(C)) if ([...letter].length === 1 && !cons.has(conv(letter))) cons.set(conv(letter), sound);
  if (script === "ta") {
    // Tamil letters stand for whole families: match any of them
    cons.set("ந", "n").set("ங", "ṅ").set("ஞ", "ñ").set("ழ", "l").set("ற", "r");
  } else cons.set(conv("ఙ"), "ṅ").set(conv("ఞ"), "ñ").set(conv("ఠ"), "ṭ").set(conv("ఢ"), "ḍ").set(conv("థ"), "t").set(conv("ఱ"), "r");
  const indep = new Map<string, string>();
  const matra = new Map<string, string>();
  for (const [sound, [i, m]] of Object.entries(V)) {
    if ([...i].length === 1) indep.set(conv(i), sound);
    if (m && [...m].length === 1) matra.set(conv(m), sound);
  }
  return { cons, indep, matra, virama: conv(script === "ta" ? TA_PULLI : TE_VIRAMA), anusvara: conv(TE_ANUSVARA) };
}

const TAMIL_FAMILY: Record<string, string> = { k: "(?:k|g|c)h?", c: "(?:ch|s|j)", ṭ: "(?:t|d)", t: "(?:th?|dh?)", p: "(?:p|b)h?" };

/**
 * A regular expression (as a string, case-insensitive use) matching the usual English spellings of
 * a word written in Telugu, Kannada or Tamil: "వెంకట" → v e (n|m) k a t a … Null for other text.
 */
export function latinPattern(text: string): string | null {
  const script = scriptOf(text);
  if (!script) return null;
  const { cons, indep, matra, virama, anusvara } = reverseTables(script);
  const parts: string[] = [];
  const chars = [...text.normalize("NFC")];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    let next = chars[i + 1];
    if (cons.has(ch)) {
      let sound = cons.get(ch)!;
      // క్ష (k + virama + ṣ) is one sound, often spelt x (Laxmi)
      if (sound === "k" && next === virama && cons.get(chars[i + 2]) === "ṣ") {
        sound = "kṣ";
        i += 2;
        next = chars[i + 1];
      }
      parts.push(script === "ta" && TAMIL_FAMILY[sound] ? TAMIL_FAMILY[sound] : SPELL[sound] ?? sound);
      // Tamil writes the vocalic r of Krishna as கிரு (ki-ru)
      if (script === "ta" && matra.get(next) === "i" && chars[i + 2] === "ர" && matra.get(chars[i + 3]) === "u") {
        parts.push("(?:iru|ri|ru)");
        i += 3;
        continue;
      }
      if (next === virama) {
        i++;
        // A doubled consonant is often written once in English (Reddy / Redy are both seen)
        if (chars[i + 1] === ch) {
          parts.push("?");
          continue;
        }
      } else if (next && matra.has(next)) {
        parts.push(SPELL[matra.get(next)!]);
        i++;
      } else parts.push("a?");
    } else if (indep.has(ch)) parts.push(SPELL[indep.get(ch)!]);
    else if (ch === anusvara) parts.push(SPELL.M);
    else if (/\s/.test(ch)) parts.push("\\s+");
    else if (!/\p{M}/u.test(ch)) parts.push(ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  return parts.length ? parts.join("") : null;
}
