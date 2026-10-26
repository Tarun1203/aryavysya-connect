import "server-only";
import { db } from "@/lib/db";
import type { MarriageRule } from "@/generated/prisma/client";

/**
 * Each person carries up to three gotras (community custom):
 *  - birth gotra (puttinti): the father's, never changed by marriage
 *  - own gotra (swa): the birth gotra – except a married woman takes her husband's
 *  - mother's gotra: the mother's birth gotra
 * People enter the birth and mother's gotra; the own gotra is derived here, so it follows
 * marriages being confirmed or ending. Call after anything that changes a person, a parent link
 * or a marriage.
 */
export async function syncGotras(personIds: string[]) {
  const ids = [...new Set(personIds)];
  if (!ids.length) return;
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
    // A child's gotras come from the parents when they are known; anything typed in stays until then
    const birth = p.birthGotraId ?? father?.gotraId ?? p.gotraId;
    const maternal = p.maternalGotraId ?? mother?.birthGotraId ?? mother?.gotraId ?? null;

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
    }
  }
}

/** Everyone whose derived gotras may change when `personId` changes: them, their spouses and children. */
export async function syncAround(personId: string) {
  const [kids, couples] = await Promise.all([
    db.parentChild.findMany({ where: { parentId: personId }, select: { childId: true } }),
    db.couple.findMany({ where: { OR: [{ person1Id: personId }, { person2Id: personId }] }, select: { person1Id: true, person2Id: true } }),
  ]);
  // Spouses first (a wife's gotra follows her husband's), then the children (theirs follow the parents)
  await syncGotras([personId, ...couples.flatMap((c) => [c.person1Id, c.person2Id])]);
  await syncGotras(kids.map((k) => k.childId));
}

export type Rules = Pick<MarriageRule, "sagotra" | "maternalGotra" | "menarikam" | "keepGotraAfterMarriageEnds">;
const DEFAULT_RULES: Rules = { sagotra: "WARN", maternalGotra: "WARN", menarikam: "WARN", keepGotraAfterMarriageEnds: true };

/** The marriage rules for a state, falling back to the community-wide default row ("*"). */
export async function rulesFor(state: string | null | undefined): Promise<Rules> {
  const rows = await db.marriageRule.findMany({ where: { state: { in: [state ?? "*", "*"] } } });
  return rows.find((r) => r.state === state) ?? rows.find((r) => r.state === "*") ?? DEFAULT_RULES;
}
