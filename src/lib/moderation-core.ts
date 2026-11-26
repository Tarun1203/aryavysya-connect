import { WORDS, type Entry } from "./moderation-words";

/**
 * The local language filter (no I/O, nothing sent anywhere). Text is folded first, so the usual
 * tricks don't get past it:
 *  - look-alike letters from other alphabets (Cyrillic "а", Greek "ο") and full-width letters
 *  - leetspeak inside words (sh1t, @ss, $lut)
 *  - letters spaced or dotted out (f u c k, f.u.c.k, fu*ck) and stretched (fuuuuck)
 *  - invisible characters (zero-width spaces and joiners, soft hyphens) and accents on Latin letters
 * Telugu, Kannada and Tamil keep their vowel signs (they are marks too, so accents are only stripped
 * from Latin letters) and are matched in their own script, words or parts of words.
 *
 * "block" words are refused; "review" words – which also have innocent meanings – are let through
 * and shown to a moderator. Names are checked for "block" words only, so surnames and place names
 * that share a spelling with something rude are never flagged.
 */

export type Severity = "block" | "review";
export type Scan = { severity: Severity | null; terms: string[] };

const INVISIBLE = /[​-‍⁠﻿­͏]/g;
const LOOKALIKE: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", һ: "h", ӏ: "l", к: "k", м: "m", т: "t", в: "b", н: "h", ԛ: "q", ԝ: "w",
  α: "a", β: "b", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ɡ: "g", ı: "i", ℓ: "l",
};
const LEET: Record<string, string> = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", $: "s", "7": "t", "8": "b", "9": "g", "|": "l", "+": "t" };

/** Latin text folded for matching: lower case, look-alikes, leetspeak, spacing tricks, stretching. */
export function foldLatin(text: string): string {
  let s = text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase();
  s = [...s].map((c) => LOOKALIKE[c] ?? c).join("");
  // Accents off Latin letters only (Telugu, Kannada and Tamil vowel signs are marks as well)
  s = s.normalize("NFD").replace(/([a-z])[̀-ͯ]+/g, "$1").normalize("NFC");
  // Digits and symbols inside a word stand for letters
  s = s.replace(/[a-z0-9!@$|+]+/g, (tok) => (/[a-z]/.test(tok) && /[^a-z]/.test(tok) ? [...tok].map((c) => LEET[c] ?? c).join("") : tok));
  // Fillers between letters: f.u.c.k, fu*ck, f_u_c_k
  s = s.replace(/([a-z])[*._\-~]+(?=[a-z])/g, "$1");
  // Three or more single letters with spaces between: one word
  s = s.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/g, (m) => m.replace(/\s+/g, ""));
  // Stretched letters: three or more of the same become two
  return s.replace(/([a-z])\1{2,}/g, "$1$1");
}

/** Script text ready for matching: composed, invisible characters gone, spaces single. */
const foldScript = (text: string) => text.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ");

const isLatin = (term: string) => /^[a-z ]+$/.test(term);
const hasDouble = (term: string) => /([a-z])\1/.test(term);
const single = (s: string) => s.replace(/([a-z])\1+/g, "$1");

function matches(entry: Entry, latinTokens: string[], latinText: string, scriptTokens: string[], scriptText: string): boolean {
  if (entry.term.includes(" ")) {
    // A phrase: its words in order, with any spacing between them
    const haystack = isLatin(entry.term) ? latinText : scriptText;
    const words = entry.term.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(isLatin(entry.term) ? `\\b${words.join("\\s+")}\\b` : words.join("\\s*"), "u").test(haystack);
  }
  if (isLatin(entry.term)) {
    // "fuuck" (stretched) still matches "fuck", but "as" never matches "ass"
    const forms = (tok: string) => (hasDouble(entry.term) ? [tok] : [tok, single(tok)]);
    return latinTokens.some((tok) =>
      forms(tok).some((f) => (entry.match === "word" ? f === entry.term : entry.match === "stem" ? f.startsWith(entry.term) : f.includes(entry.term))),
    );
  }
  if (entry.match === "part") return scriptText.includes(entry.term);
  return scriptTokens.some((tok) => (entry.match === "word" ? tok === entry.term : tok.startsWith(entry.term)));
}

/** Check one piece of text. `name` mode looks for "block" words only. */
export function scan(text: string | null | undefined, mode: "text" | "name" = "text", words: Entry[] = WORDS): Scan {
  if (!text?.trim()) return { severity: null, terms: [] };
  const latinText = foldLatin(text);
  const latinTokens = latinText.split(/[^a-z]+/).filter(Boolean);
  const scriptText = foldScript(text);
  const scriptTokens = scriptText.split(/[\s\p{P}\p{S}\d]+/u).filter(Boolean);
  const hits = words.filter((e) => (mode === "text" || e.severity === "block") && matches(e, latinTokens, latinText, scriptTokens, scriptText));
  if (!hits.length) return { severity: null, terms: [] };
  return { severity: hits.some((h) => h.severity === "block") ? "block" : "review", terms: [...new Set(hits.map((h) => h.term))] };
}

export type FieldScan = { field: string; severity: Severity; terms: string[] };

/** Check several fields; `names` lists the ones holding names (block words only there). */
export function scanFields(fields: Record<string, string | string[] | null | undefined>, names: string[] = []): { block: FieldScan[]; review: FieldScan[] } {
  const out: FieldScan[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const r = scan(Array.isArray(value) ? value.join(", ") : value, names.includes(field) ? "name" : "text");
    if (r.severity) out.push({ field, severity: r.severity, terms: r.terms });
  }
  return { block: out.filter((f) => f.severity === "block"), review: out.filter((f) => f.severity === "review") };
}
