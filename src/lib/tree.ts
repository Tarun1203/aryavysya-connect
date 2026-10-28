import "server-only";
import { db } from "@/lib/db";

const personInclude = { gotra: true } as const;

/**
 * Brothers and sisters in order: the child no. when one was entered, then birth date, then name.
 * The position in this order is the "child no." shown in the trees and on person pages.
 */
export function siblingOrder<T extends { birthOrder?: number | null; birthDate: string | null; givenName: string }>(a: T, b: T) {
  return (
    (a.birthOrder ?? 99) - (b.birthOrder ?? 99) ||
    (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999") ||
    a.givenName.localeCompare(b.givenName)
  );
}

export async function getFamily(personId: string) {
  const person = await db.person.findUnique({ where: { id: personId }, include: {
      ...personInclude,
      birthGotra: true,
      maternalGotra: true,
      photo: { select: { visible: true, updatedAt: true } },
      district: true,
      user: true,
      verifiedBy: { select: { name: true } },
      nativeLocality: { include: { taluk: true, district: true } },
      birthLocality: { include: { taluk: true, district: true } },
    },
  });
  if (!person) return null;

  const [parentLinks, childLinks, couples] = await Promise.all([
    db.parentChild.findMany({ where: { childId: personId }, include: { parent: { include: personInclude } } }),
    db.parentChild.findMany({ where: { parentId: personId }, include: { child: { include: personInclude } } }),
    db.couple.findMany({
      where: { OR: [{ person1Id: personId }, { person2Id: personId }] },
      include: { person1: { include: personInclude }, person2: { include: personInclude }, proposedBy: true },
      orderBy: [{ marriageDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const joined = couples.filter((c) => c.status !== "PROPOSED");
  const other = (c: (typeof couples)[number]) => (c.person1Id === personId ? c.person2 : c.person1);

  const parentIds = parentLinks.map((l) => l.parentId);
  const siblingLinks = parentIds.length
    ? await db.parentChild.findMany({
        where: { parentId: { in: parentIds }, childId: { not: personId } },
        include: { child: { include: personInclude } },
        distinct: ["childId"],
      })
    : [];

  const siblings = siblingLinks.map((l) => l.child).sort(siblingOrder);
  // This person's own place among their parents' children
  const all = [...siblings, person].sort(siblingOrder);
  const childNo = parentIds.length ? { n: all.findIndex((p) => p.id === personId) + 1, of: all.length } : null;

  return {
    person,
    parents: parentLinks.map((l) => ({ linkId: l.id, verifiedAt: l.verifiedAt, person: l.parent })).sort((a, b) => (a.person.gender === "MALE" ? -1 : b.person.gender === "MALE" ? 1 : 0)),
    spouses: joined.map((c) => ({ linkId: c.id, status: c.status, marriageDate: c.marriageDate, endDate: c.endDate, person: other(c) })),
    /** Marriage links waiting for acceptance; `incoming` when this person's side has to answer */
    proposals: couples
      .filter((c) => c.status === "PROPOSED")
      .map((c) => ({ linkId: c.id, incoming: c.person2Id === personId, proposedBy: c.proposedBy?.name ?? null, person: other(c) })),
    children: childLinks.map((l) => ({ linkId: l.id, verifiedAt: l.verifiedAt, person: l.child })).sort((a, b) => siblingOrder(a.person, b.person)),
    siblings,
    childNo,
  };
}

export type TreeNode = {
  id: string;
  givenName: string;
  surname: string;
  gender: string;
  birthDate: string | null;
  birthOrder?: number | null;
  deathDate: string | null;
  isLiving: boolean;
  /** Only whether there is a shown photo and when it changed – never the image itself */
  photo?: { visible: boolean; updatedAt: Date } | null;
  /** Shown as "Private" to this viewer: no name, dates, gotra, photo or link (src/lib/consent.ts) */
  private?: boolean;
  status?: string;
  memberNo?: number;
  givenNameLocal?: string | null;
  surnameLocal?: string | null;
  gotra?: GotraNames | null;
  /** Birth (puttinti) and mother's gotras, for the tree's gotra switch */
  birthGotra?: GotraNames | null;
  maternalGotra?: GotraNames | null;
};

type GotraNames = { name: string; nameTe: string | null; nameKn: string | null; nameTa: string | null };
const gotraSelect = { select: { name: true, nameTe: true, nameKn: true, nameTa: true } } as const;

const nodeSelect = {
  id: true,
  givenName: true,
  surname: true,
  gender: true,
  birthDate: true,
  birthOrder: true,
  deathDate: true,
  isLiving: true,
  status: true,
  memberNo: true,
  givenNameLocal: true,
  surnameLocal: true,
  gotra: gotraSelect,
  birthGotra: gotraSelect,
  maternalGotra: gotraSelect,
  photo: { select: { visible: true, updatedAt: true } },
} as const;

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
      where: { status: { not: "PROPOSED" }, OR: [{ person1Id: personId }, { person2Id: personId }] },
      include: { person1: { select: nodeSelect }, person2: { select: nodeSelect } },
      // Spouse 1, 2, … in the order of the marriages
      orderBy: [{ marriageDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    depth > 0 ? db.parentChild.findMany({ where: { parentId: personId }, select: { childId: true } }) : [],
  ]);
  const children = (await Promise.all(kids.map((k) => descendants(k.childId, depth - 1)))).filter((c): c is DescendantNode => !!c);
  children.sort(siblingOrder);
  return { ...p, spouses: couples.map((c) => (c.person1Id === personId ? c.person2 : c.person1)), children };
}

/**
 * The trunk of a pictorial tree: walk up from a person through the father (or the mother when no
 * father is recorded) to the eldest known ancestor, at most `maxUp` generations. Returns the
 * ancestor and the path of ids from them down to the person.
 */
export async function lineageRoot(personId: string, maxUp = 5): Promise<{ rootId: string; path: string[] }> {
  const path = [personId];
  for (let g = 0; g < maxUp; g++) {
    const parents = await db.parentChild.findMany({ where: { childId: path[0] }, include: { parent: { select: { id: true, gender: true } } } });
    const next = parents.find((l) => l.parent.gender === "MALE") ?? parents[0];
    if (!next || path.includes(next.parentId)) break;
    path.unshift(next.parentId);
  }
  return { rootId: path[0], path };
}
