import "server-only";
import { db } from "@/lib/db";
import { memberCode } from "@/lib/reference";

/**
 * Duplicate detection for new people. Names vary by transliteration and can change, so they are
 * only a supporting signal: candidates are blocked on gotra + place, then scored on the family
 * graph (the parents, spouse or children it would be linked to, or the father's name) and stable
 * facts (nakshatra, rasi, birth year). A human always decides –
 * nothing is merged automatically.
 */
export type NewPerson = {
  givenName: string;
  surname: string;
  aliases?: string[];
  gender: string;
  gotraId: string | null;
  districtId: string | null;
  nativeLocalityId: string | null;
  fatherName?: string | null;
  birthYear?: number | null;
  nakshatra?: string | null;
  rasi?: string | null;
  /** The people the new record is about to be linked to */
  relatives?: { parentIds?: string[]; childIds?: string[]; spouseIds?: string[] };
};

export type Duplicate = {
  id: string;
  memberNo: number;
  code: string;
  name: string;
  detail: string;
  score: number;
  reasons: string[];
  /** Already linked to the same relative in the same way – adding again would be a plain duplicate */
  alreadyLinked: boolean;
  /** A registered member is this person already */
  claimed: boolean;
};

/** Collapse common Telugu/Kannada/Tamil transliteration variants: Srinivasa / Sreenivas / Shrinivaasa. */
export function phonetic(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "")
    .replace(/x/g, "ks")
    .replace(/sh|ss|z/g, "s")
    .replace(/([bcdgjkpt])h/g, "$1")
    .replace(/w/g, "v")
    .replace(/ee|ii|y(?=[^aeiou]|$)/g, "i")
    .replace(/oo|uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/(.)\1+/g, "$1")
    .replace(/a$/, "");
}

function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** 2 = same name, 1 = close (one or two letters apart), 0 = different. */
function nameMatch(a: string[], b: string[]) {
  let best = 0;
  for (const x of a.map(phonetic).filter(Boolean))
    for (const y of b.map(phonetic).filter(Boolean)) {
      if (x === y) return 2;
      if (Math.min(x.length, y.length) >= 4 && distance(x, y) <= (x.length > 7 ? 2 : 1)) best = 1;
    }
  return best;
}

const yearOf = (d: string | null) => (d ? Number(d.slice(0, 4)) : null);

export async function findDuplicates(p: NewPerson, limit = 8): Promise<Duplicate[]> {
  // Block: blood relatives share the gotra, and a family keeps its native place / district
  const place = [
    p.nativeLocalityId ? { nativeLocalityId: p.nativeLocalityId } : null,
    p.districtId ? { districtId: p.districtId } : null,
  ].filter((x) => x !== null);
  const { parentIds = [], childIds = [], spouseIds = [] } = p.relatives ?? {};
  // ...and anyone already linked to the same relatives, whatever their gotra or place (a wife keeps her own gotra)
  const graph = [
    parentIds.length ? { asChild: { some: { parentId: { in: parentIds } } } } : null,
    childIds.length ? { asParent: { some: { childId: { in: childIds } } } } : null,
    spouseIds.length ? { couples1: { some: { person2Id: { in: spouseIds } } } } : null,
    spouseIds.length ? { couples2: { some: { person1Id: { in: spouseIds } } } } : null,
  ].filter((x) => x !== null);
  if (!place.length && !graph.length) return [];
  const exclude = [...parentIds, ...childIds, ...spouseIds];
  const candidates = await db.person.findMany({
    where: {
      status: { not: "MERGED" },
      id: { notIn: exclude },
      OR: [
        // Records without a gotra yet are still candidates
        ...(place.length ? [{ AND: [{ OR: place }, ...(p.gotraId ? [{ OR: [{ gotraId: p.gotraId }, { gotraId: null }] }] : [])] }] : []),
        ...graph,
      ],
    },
    include: {
      gotra: true,
      nativeLocality: true,
      district: true,
      asChild: { include: { parent: true } },
      asParent: { select: { childId: true } },
      couples1: { select: { person2Id: true } },
      couples2: { select: { person1Id: true } },
    },
    take: 2000,
  });

  const given = [p.givenName, ...(p.aliases ?? [])];
  const scored = candidates.map((c) => {
    const reasons: string[] = [];
    let score = 0;
    const g = nameMatch(given, [c.givenName, ...c.aliases]);
    if (g) {
      score += g === 2 ? 3 : 2;
      reasons.push(g === 2 ? "sameName" : "similarName");
    }
    if (nameMatch([p.surname], [c.surname]) === 2) {
      score += 2;
      reasons.push("sameIntiperu");
    }
    if (p.gotraId && c.gotraId === p.gotraId) reasons.push("sameGotra");
    if (p.nativeLocalityId && c.nativeLocalityId === p.nativeLocalityId) {
      score += 2;
      reasons.push("sameNativePlace");
    }
    const father = c.asChild.map((l) => l.parent).find((x) => x.gender === "MALE");
    if (p.fatherName && father && nameMatch([p.fatherName], [`${father.givenName} ${father.surname}`, father.givenName, ...father.aliases]) === 2) {
      score += 4;
      reasons.push("sameFather");
    }
    const year = yearOf(c.birthDate);
    if (p.birthYear && year && Math.abs(p.birthYear - year) <= 2) {
      score += 2;
      reasons.push("closeBirthYear");
    }
    if (p.nakshatra && c.nakshatra === p.nakshatra && p.rasi && c.rasi === p.rasi) {
      score += 2;
      reasons.push("sameStar");
    }
    // The family graph is the strongest signal: it is hard to fake and doesn't change with a name
    const linked =
      (parentIds.length > 0 && c.asChild.some((l) => parentIds.includes(l.parentId))) ||
      (childIds.length > 0 && c.asParent.some((l) => childIds.includes(l.childId))) ||
      (spouseIds.length > 0 && [...c.couples1.map((x) => x.person2Id), ...c.couples2.map((x) => x.person1Id)].some((id) => spouseIds.includes(id)));
    if (linked) {
      score += 5;
      reasons.push(parentIds.length ? "sameParents" : childIds.length ? "sameChild" : "sameSpouse");
    }
    if (c.gender !== p.gender) score -= 4;
    return {
      id: c.id,
      memberNo: c.memberNo,
      code: memberCode(c.memberNo),
      name: `${c.givenName} ${c.surname}`,
      detail: [c.birthDate?.slice(0, 4), c.gotra?.name, c.nativeLocality?.name ?? c.nativePlace, c.district?.name, father && `s/o ${father.givenName}`]
        .filter(Boolean)
        .join(" · "),
      score,
      reasons,
      named: g > 0,
      linked,
      sameGender: c.gender === p.gender,
      closeYear: reasons.includes("closeBirthYear"),
      claimed: c.status === "CLAIMED",
    };
  });
  // A name alone never flags a duplicate, and neither do place + gotra without some name likeness.
  // Soft guard: two children of the same parents, same gender, born within ~2 years are flagged even with different names.
  return scored
    .filter((d) => (d.named && d.score >= 5) || (d.linked && d.sameGender && (d.named || d.closeYear)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      memberNo: d.memberNo,
      code: d.code,
      name: d.name,
      detail: d.detail,
      score: d.score,
      reasons: d.reasons,
      alreadyLinked: d.linked,
      claimed: d.claimed,
    }));
}
