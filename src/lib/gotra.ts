import "server-only";
import { db } from "@/lib/db";
import type { MarriageRule } from "@/generated/prisma/client";

/**
 * Each person carries up to three gotras (community custom):
 *  - birth gotra (puttinti): the father's, never changed by marriage
 *  - own gotra (swa): the birth gotra – except a married woman takes her husband's
 *  - mother's gotra: the mother's birth gotra
 * When the father (or mother) is in the tree with a gotra, the birth (or mother's) gotra comes
 * from them and follows corrections to theirs; what was typed in is used only while that parent
 * is missing. The own gotra follows marriages being confirmed or ending. Call after anything that
 * changes a person, a parent link or a marriage. Returns the ids whose gotras changed.
 */
export async function syncGotras(personIds: string[]): Promise<string[]> {
  const ids = [...new Set(personIds)];
  if (!ids.length) return [];
  const changed: string[] = [];
  const people = await db.person.findMany({
    where: { id: { in: ids } },
    include: {
      district: true,
      asChild: { include: { parent: true } },
      couples1: { where: { status: { not: "PROPOSED" } }, include: { person2: true }, orderBy: { createdAt: "desc" } },
      couples2: { where: { status: { not: "PROPOSED" } }, include: { person1: true }, orderBy: { createdAt: "desc" } },
    },
  });
  for (const p of people) {
    const father = p.asChild.map((l) => l.parent).find((x) => x.gender === "MALE");
    const mother = p.asChild.map((l) => l.parent).find((x) => x.gender === "FEMALE");
    // A child's gotras come from the parents when they are known; anything typed in stays until then.
    // The father's birth gotra (his own one), and the mother's birth gotra – not her married one.
    const birth = father?.birthGotraId ?? father?.gotraId ?? p.birthGotraId ?? p.gotraId;
    const maternal = mother?.birthGotraId ?? p.maternalGotraId ?? null;

    let own = birth;
    if (p.gender === "FEMALE") {
      const marriages = [
        ...p.couples1.map((c) => ({ status: c.status, at: c.createdAt, spouse: c.person2 })),
        ...p.couples2.map((c) => ({ status: c.status, at: c.createdAt, spouse: c.person1 })),
      ]
        .filter((m) => m.spouse.gender === "MALE" && m.spouse.gotraId)
        .sort((a, b) => b.at.getTime() - a.at.getTime());
      const current = marriages.find((m) => m.status === "CONFIRMED");
      const ended = !current && marriages[0];
      if (current) own = current.spouse.gotraId;
      else if (ended && (await rulesFor(p.district?.state)).keepGotraAfterMarriageEnds) own = ended.spouse.gotraId;
    }
    if (own !== p.gotraId || birth !== p.birthGotraId || maternal !== p.maternalGotraId) {
      await db.person.update({ where: { id: p.id }, data: { gotraId: own, birthGotraId: birth, maternalGotraId: maternal } });
      changed.push(p.id);
    }
  }
  return changed;
}

const spousesOfIds = async (ids: string[]) =>
  (await db.couple.findMany({ where: { OR: [{ person1Id: { in: ids } }, { person2Id: { in: ids } }] }, select: { person1Id: true, person2Id: true } }))
    .flatMap((c) => [c.person1Id, c.person2Id])
    .filter((id) => !ids.includes(id));

/**
 * Re-derive the gotras of everyone a change to `personId` can reach: them and their spouses, then
 * down the generations – children, their spouses, grandchildren… – following only the branches
 * where something changed, so a corrected grandparent's gotra reaches every descendant.
 */
export async function syncAround(personId: string, maxGenerations = 15) {
  // The person first, then their spouses (a wife's own gotra follows her husband's)
  const top = await syncGotras([personId]);
  const spouses = await spousesOfIds([personId]);
  const topSpouses = await syncGotras(spouses);
  // The children are always checked once (a link may have just been added); deeper only on change
  let parents = [personId, ...spouses];
  let changedAbove = new Set([...top, ...topSpouses, personId]);
  const seen = new Set(parents);
  for (let g = 0; g < maxGenerations && parents.length; g++) {
    const links = await db.parentChild.findMany({ where: { parentId: { in: [...changedAbove] } }, select: { childId: true } });
    const kids = [...new Set(links.map((l) => l.childId))].filter((id) => !seen.has(id));
    if (!kids.length) break;
    kids.forEach((id) => seen.add(id));
    const changedKids = await syncGotras(kids);
    // Spouses of those whose gotra changed (a wife married into the family takes her husband's)
    const theirSpouses = (await spousesOfIds(changedKids)).filter((id) => !seen.has(id));
    theirSpouses.forEach((id) => seen.add(id));
    const changedSpouses = await syncGotras(theirSpouses);
    parents = kids;
    changedAbove = new Set([...changedKids, ...changedSpouses]);
  }
}

export type Rules = Pick<MarriageRule, "sagotra" | "maternalGotra" | "menarikam" | "keepGotraAfterMarriageEnds">;
const DEFAULT_RULES: Rules = { sagotra: "WARN", maternalGotra: "WARN", menarikam: "WARN", keepGotraAfterMarriageEnds: true };

/** The marriage rules for a state, falling back to the community-wide default row ("*"). */
export async function rulesFor(state: string | null | undefined): Promise<Rules> {
  const rows = await db.marriageRule.findMany({ where: { state: { in: [state ?? "*", "*"] } } });
  return rows.find((r) => r.state === state) ?? rows.find((r) => r.state === "*") ?? DEFAULT_RULES;
}
