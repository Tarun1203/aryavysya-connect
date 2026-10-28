import "server-only";
import { db } from "@/lib/db";
import { foldLatin, latinPattern, learnFromPairs, mergeOverrides, transliterate, type Overrides, type Script } from "@/lib/translit";

/**
 * The community's spellings, layered over the generic transliteration (src/lib/translit.ts):
 *  1. gotra names – "verified" once an administrator has checked the scripts, else "community"
 *  2. kula (sankethanama) names in the gotra list – "community"
 *  3. given names and family names members entered in both English and script, where at least two
 *     records agree – "community"
 * Built from our own database only, and kept for a few minutes (it changes slowly).
 */
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; overrides: Overrides } | null = null;

type ScriptNames = { te?: string | null; kn?: string | null; ta?: string | null };
const entry = (names: ScriptNames, confidence: "verified" | "community") =>
  Object.fromEntries((["te", "kn", "ta"] as const).filter((s) => names[s]?.trim()).map((s) => [s, { text: names[s]!.trim(), confidence }]));

async function build(): Promise<Overrides> {
  const [gotras, people] = await Promise.all([
    db.gotra.findMany({ select: { name: true, nameTe: true, nameKn: true, nameTa: true, localVerified: true, kulaNames: true } }),
    db.person.findMany({
      where: { status: { not: "MERGED" }, OR: [{ givenNameLocal: { not: null } }, { surnameLocal: { not: null } }] },
      select: { givenName: true, surname: true, givenNameLocal: true, surnameLocal: true },
    }),
  ]);
  const gotraLayer: Overrides = new Map();
  const kulaLayer: Overrides = new Map();
  for (const g of gotras) {
    gotraLayer.set(foldLatin(g.name), entry({ te: g.nameTe, kn: g.nameKn, ta: g.nameTa }, g.localVerified ? "verified" : "community"));
    for (const [kula, names] of Object.entries((g.kulaNames ?? {}) as Record<string, ScriptNames>)) kulaLayer.set(foldLatin(kula), entry(names, "community"));
  }
  const learned = learnFromPairs([
    ...people.filter((p) => p.givenNameLocal).map((p) => ({ latin: p.givenName, local: p.givenNameLocal! })),
    ...people.filter((p) => p.surnameLocal && p.surname).map((p) => ({ latin: p.surname, local: p.surnameLocal! })),
  ]);
  return mergeOverrides(gotraLayer, kulaLayer, learned);
}

export async function communityOverrides(): Promise<Overrides> {
  if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), overrides: await build() };
  return cache.overrides;
}

/**
 * People whose English given or family name matches a word typed in Telugu, Kannada or Tamil
 * (by its usual English spellings, from the start of a word), so a search in script also finds
 * those entered only in English. Empty for Latin words; at most `take` ids.
 */
export async function idsMatchingScriptWord(word: string, take = 300): Promise<string[]> {
  if (word.length > 40) return [];
  const pattern = latinPattern(word);
  if (!pattern) return [];
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Person"
    WHERE "status" <> 'MERGED' AND ("givenName" ~* ${"\\m" + pattern} OR "surname" ~* ${"\\m" + pattern})
    LIMIT ${take}`;
  return rows.map((r) => r.id);
}

/** Latin to a script with the community's spellings first. */
export async function suggestSpelling(text: string, script: Script) {
  return transliterate(text, script, await communityOverrides());
}
