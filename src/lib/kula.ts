import { distance, phonetic } from "./phonetic";
import { latinPattern, scriptOf } from "./translit";

/**
 * Kula (sankethanama) → gotra: many families know their kula name better than their gotra. The
 * gotra list holds each gotra's kulas (Gotra.kulas, with Telugu/Kannada/Tamil spellings in
 * kulaNames); this is the reverse index, tolerant of how people actually type a kula:
 *  - "Arasakula", "Arasa kulam", "Arasakulamu", "Arasa" – the kula / kulam / gula ending is optional
 *  - "Arsakula", "Aarasakula" – spelling variants (phonetic key, then one or two letters off)
 *  - "అరస", "ಅರಸ", "அரச" – typed in script, matched against the local spellings and, through the
 *    usual English spellings of the script (src/lib/translit.ts), against the English name
 * Pure, so the gotra picker runs it in the browser over the list it already has.
 */

export type KulaSource = { gotraId: string; kula: string; local: string[] };
type Indexed = KulaSource & { key: string; localKeys: string[]; flat: string };
export type KulaIndex = Indexed[];

/** How a kula matched: the same name, one it starts with, or one that sounds alike */
export type KulaMatch = { gotraId: string; kula: string; how: "exact" | "start" | "close"; score: number };

const LATIN_ENDING = /(?:kulamu|kulam|kul|gulamu|gulam|gul|varu|vari)$/;
const LOCAL_ENDING = /(?:కులము|కులం|కుల|గుల|ಕುಲ|ಗುಲ|குலம்|குல)$/;

/** The phonetic key of a Latin kula name, without its kula/kulam/gula ending */
export function kulaKey(s: string) {
  const k = phonetic(s);
  const base = k.replace(LATIN_ENDING, "").replace(/a$/, "");
  return base.length >= 2 ? base : k;
}

const localKey = (s: string) => {
  const k = s.normalize("NFC").replace(/\s+/g, "");
  const base = k.replace(LOCAL_ENDING, "");
  return base.length >= 2 ? base : k;
};

export function buildKulaIndex(sources: KulaSource[]): KulaIndex {
  return sources.map((s) => ({ ...s, key: kulaKey(s.kula), localKeys: s.local.filter(Boolean).map(localKey), flat: s.kula.toLowerCase().replace(/\s+/g, "") }));
}

const RANK = { exact: 3, start: 2, close: 1 } as const;

export function lookupKula(index: KulaIndex, query: string, limit = 6): KulaMatch[] {
  const q = query.trim();
  if ([...q].length < 2) return [];
  const best = new Map<string, KulaMatch>();
  const add = (e: Indexed, how: KulaMatch["how"]) => {
    const id = `${e.gotraId}|${e.kula}`;
    if ((best.get(id)?.score ?? 0) < RANK[how]) best.set(id, { gotraId: e.gotraId, kula: e.kula, how, score: RANK[how] });
  };

  if (scriptOf(q)) {
    const lq = localKey(q);
    const pattern = latinPattern(q.replace(LOCAL_ENDING, "") || q);
    const sounds = pattern ? new RegExp(`^${pattern}`, "i") : null;
    for (const e of index) {
      if (e.localKeys.includes(lq)) add(e, "exact");
      else if (e.localKeys.some((k) => k.startsWith(lq))) add(e, "start");
      else if (sounds?.test(e.flat)) add(e, "close");
    }
  } else {
    const qk = kulaKey(q);
    const flat = q.toLowerCase().replace(/\s+/g, "");
    for (const e of index) {
      if (e.key === qk) add(e, "exact");
      else if ((qk.length >= 3 && e.key.startsWith(qk)) || (flat.length >= 3 && e.flat.startsWith(flat))) add(e, "start");
      else {
        const longer = Math.max(qk.length, e.key.length);
        const allowed = longer >= 7 ? 2 : longer >= 4 ? 1 : 0;
        if (allowed && distance(qk, e.key) <= allowed) add(e, "close");
      }
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.kula.localeCompare(b.kula)).slice(0, limit);
}

/**
 * The gotra to pick on its own: only when the best matches are exact and all point to one gotra,
 * and the query is long enough not to be someone still typing (four letters). Close or partial
 * matches are shown as suggestions for the person to choose.
 */
export function confidentGotra(matches: KulaMatch[], query: string): string | null {
  if ([...query.replace(/\s+/g, "")].length < 4) return null;
  const exact = matches.filter((m) => m.how === "exact");
  if (!exact.length) return null;
  const ids = new Set(exact.map((m) => m.gotraId));
  return ids.size === 1 ? exact[0].gotraId : null;
}
