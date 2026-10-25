import "server-only";
import { db } from "@/lib/db";

const personInclude = { gotra: true } as const;

export async function getFamily(personId: string) {
  const person = await db.person.findUnique({ where: { id: personId }, include: { ...personInclude, district: true, user: true } });
  if (!person) return null;

  const [parentLinks, childLinks, couples] = await Promise.all([
    db.parentChild.findMany({ where: { childId: personId }, include: { parent: { include: personInclude } } }),
    db.parentChild.findMany({ where: { parentId: personId }, include: { child: { include: personInclude } } }),
    db.couple.findMany({
      where: { OR: [{ person1Id: personId }, { person2Id: personId }] },
      include: { person1: { include: personInclude }, person2: { include: personInclude } },
    }),
  ]);

  const parentIds = parentLinks.map((l) => l.parentId);
  const siblingLinks = parentIds.length
    ? await db.parentChild.findMany({
        where: { parentId: { in: parentIds }, childId: { not: personId } },
        include: { child: { include: personInclude } },
        distinct: ["childId"],
      })
    : [];

  const byBirth = <T extends { birthDate: string | null }>(a: T, b: T) => (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999");

  return {
    person,
    parents: parentLinks.map((l) => ({ linkId: l.id, person: l.parent })).sort((a, b) => (a.person.gender === "MALE" ? -1 : b.person.gender === "MALE" ? 1 : 0)),
    spouses: couples.map((c) => ({ linkId: c.id, marriageDate: c.marriageDate, person: c.person1Id === personId ? c.person2 : c.person1 })),
    children: childLinks.map((l) => ({ linkId: l.id, person: l.child })).sort((a, b) => byBirth(a.person, b.person)),
    siblings: siblingLinks.map((l) => l.child).sort(byBirth),
  };
}

export type TreeNode = {
  id: string;
  givenName: string;
  surname: string;
  gender: string;
  birthDate: string | null;
  deathDate: string | null;
  isLiving: boolean;
};

const nodeSelect = { id: true, givenName: true, surname: true, gender: true, birthDate: true, deathDate: true, isLiving: true } as const;

/**
 * Ancestor chart: rows[g] holds 2^g slots (father first, then mother).
 * null = a known person's parent is not recorded; undefined = no slot (the child is unknown too).
 */
export async function pedigree(personId: string, generations = 4): Promise<(TreeNode | null | undefined)[][]> {
  const root = await db.person.findUnique({ where: { id: personId }, select: nodeSelect });
  const rows: (TreeNode | null | undefined)[][] = [[root]];
  for (let g = 1; g < generations; g++) {
    const prev = rows[g - 1];
    const ids = prev.filter(Boolean).map((p) => p!.id);
    const links = ids.length
      ? await db.parentChild.findMany({ where: { childId: { in: ids } }, include: { parent: { select: nodeSelect } } })
      : [];
    rows.push(
      prev.flatMap((child) => {
        if (!child) return [undefined, undefined];
        const parents = links.filter((l) => l.childId === child.id).map((l) => l.parent);
        const father = parents.find((p) => p.gender === "MALE") ?? null;
        const mother = parents.find((p) => p !== father) ?? null;
        return [father, mother];
      })
    );
  }
  return rows;
}

export type DescendantNode = TreeNode & { spouses: TreeNode[]; children: DescendantNode[] };

export async function descendants(personId: string, depth = 3): Promise<DescendantNode | null> {
  const p = await db.person.findUnique({ where: { id: personId }, select: nodeSelect });
  if (!p) return null;
  const [couples, kids] = await Promise.all([
    db.couple.findMany({
      where: { OR: [{ person1Id: personId }, { person2Id: personId }] },
      include: { person1: { select: nodeSelect }, person2: { select: nodeSelect } },
    }),
    depth > 0 ? db.parentChild.findMany({ where: { parentId: personId }, select: { childId: true } }) : [],
  ]);
  const children = (await Promise.all(kids.map((k) => descendants(k.childId, depth - 1)))).filter((c): c is DescendantNode => !!c);
  children.sort((a, b) => (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999"));
  return { ...p, spouses: couples.map((c) => (c.person1Id === personId ? c.person2 : c.person1)), children };
}
