import { db } from "@/lib/db";

/** How many generations up and down a member may edit from their own node. */
export const EDIT_GENERATIONS = Number(process.env.FAMILY_EDIT_GENERATIONS ?? 5);

/**
 * Generation offset relative to the member: +1 parent, +2 grandparent …,
 * -1 child, -2 grandchild …, 0 self / siblings.
 * `kind` is "blood" for direct line and siblings, "spouse" for their partners.
 */
export type ScopeEntry = { gen: number; kind: "blood" | "spouse" };
export type FamilyScope = Map<string, ScopeEntry>;

/** Extra edges used to test "would this change stay inside my family?" before writing it. */
export type VirtualEdges = {
  parentChild?: { parentId: string; childId: string }[];
  couples?: { a: string; b: string }[];
};

async function parentsOf(ids: string[], v: VirtualEdges): Promise<Map<string, string[]>> {
  const rows = ids.length
    ? await db.parentChild.findMany({ where: { childId: { in: ids } }, select: { parentId: true, childId: true } })
    : [];
  const all = [...rows, ...(v.parentChild ?? []).filter((e) => ids.includes(e.childId))];
  const out = new Map<string, string[]>();
  for (const r of all) out.set(r.childId, [...(out.get(r.childId) ?? []), r.parentId]);
  return out;
}

async function childrenOf(ids: string[], v: VirtualEdges): Promise<Map<string, string[]>> {
  const rows = ids.length
    ? await db.parentChild.findMany({ where: { parentId: { in: ids } }, select: { parentId: true, childId: true } })
    : [];
  const all = [...rows, ...(v.parentChild ?? []).filter((e) => ids.includes(e.parentId))];
  const out = new Map<string, string[]>();
  for (const r of all) out.set(r.parentId, [...(out.get(r.parentId) ?? []), r.childId]);
  return out;
}

export async function spousesOf(ids: string[], v: VirtualEdges = {}): Promise<Map<string, string[]>> {
  const rows = ids.length
    ? await db.couple.findMany({
        where: { OR: [{ person1Id: { in: ids } }, { person2Id: { in: ids } }] },
        select: { person1Id: true, person2Id: true },
      })
    : [];
  const pairs = [...rows.map((r) => ({ a: r.person1Id, b: r.person2Id })), ...(v.couples ?? [])];
  const out = new Map<string, string[]>();
  for (const { a, b } of pairs) {
    if (ids.includes(a)) out.set(a, [...(out.get(a) ?? []), b]);
    if (ids.includes(b)) out.set(b, [...(out.get(b) ?? []), a]);
  }
  return out;
}

/**
 * The part of the tree a member may edit:
 *  - self, and siblings of self
 *  - direct ancestors up to `depth` generations
 *  - direct descendants down to `depth` generations
 *  - the spouses of all of the above
 */
export async function familyScope(selfId: string, depth = EDIT_GENERATIONS, v: VirtualEdges = {}): Promise<FamilyScope> {
  const scope: FamilyScope = new Map([[selfId, { gen: 0, kind: "blood" }]]);

  let frontier = [selfId];
  for (let g = 1; g <= depth && frontier.length; g++) {
    const parents = await parentsOf(frontier, v);
    frontier = [...new Set([...parents.values()].flat())].filter((id) => !scope.has(id));
    frontier.forEach((id) => scope.set(id, { gen: g, kind: "blood" }));
  }

  frontier = [selfId];
  for (let g = 1; g <= depth && frontier.length; g++) {
    const children = await childrenOf(frontier, v);
    frontier = [...new Set([...children.values()].flat())].filter((id) => !scope.has(id));
    frontier.forEach((id) => scope.set(id, { gen: -g, kind: "blood" }));
  }

  // siblings: other children of my parents
  const myParents = (await parentsOf([selfId], v)).get(selfId) ?? [];
  const siblings = [...(await childrenOf(myParents, v)).values()].flat();
  siblings.forEach((id) => !scope.has(id) && scope.set(id, { gen: 0, kind: "blood" }));

  const blood = [...scope.keys()];
  for (const [pid, partners] of await spousesOf(blood, v)) {
    const gen = scope.get(pid)!.gen;
    partners.forEach((s) => !scope.has(s) && scope.set(s, { gen, kind: "spouse" }));
  }
  return scope;
}

/** Ancestors of a person with their generation distance (1 = parent). */
export async function ancestorsOf(personId: string, depth = 7): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  let frontier = [personId];
  for (let g = 1; g <= depth && frontier.length; g++) {
    const parents = await parentsOf(frontier, {});
    frontier = [...new Set([...parents.values()].flat())].filter((id) => !found.has(id) && id !== personId);
    frontier.forEach((id) => found.set(id, g));
  }
  return found;
}

export type MatchResult = {
  sameGotra: boolean;
  gotraA: string | null;
  gotraB: string | null;
  /** Nearest shared ancestor, if the two are blood relatives within 7 generations */
  common: { id: string; name: string; genA: number; genB: number } | null;
  /** "cross" = menarikam (children of a brother and a sister); "parallel" = children of two brothers / two sisters */
  cousinType: "cross" | "parallel" | null;
  verdict: "ok" | "caution" | "not-permitted";
};

/** Traditional marriage-compatibility check between two people in the tree. */
export async function checkMatch(aId: string, bId: string): Promise<MatchResult> {
  const [a, b] = await Promise.all(
    [aId, bId].map((id) => db.person.findUniqueOrThrow({ where: { id }, include: { gotra: true } }))
  );
  const sameGotra = !!a.gotraId && a.gotraId === b.gotraId;

  const [ancA, ancB] = await Promise.all([ancestorsOf(aId), ancestorsOf(bId)]);
  ancA.set(aId, 0);
  ancB.set(bId, 0);
  let best: { id: string; genA: number; genB: number } | null = null;
  for (const [id, genA] of ancA) {
    const genB = ancB.get(id);
    if (genB === undefined) continue;
    if (!best || genA + genB < best.genA + best.genB) best = { id, genA, genB };
  }

  let common: MatchResult["common"] = null;
  let cousinType: MatchResult["cousinType"] = null;
  if (best) {
    const anc = await db.person.findUniqueOrThrow({ where: { id: best.id } });
    common = { id: anc.id, name: `${anc.givenName} ${anc.surname}`, genA: best.genA, genB: best.genB };
    // First cousins: decide by the genders of the two linking parents
    if (best.genA === 2 && best.genB === 2) {
      const pa = await linkingChild(aId, best.id);
      const pb = await linkingChild(bId, best.id);
      if (pa && pb) cousinType = pa.gender === pb.gender ? "parallel" : "cross";
    }
  }

  let verdict: MatchResult["verdict"] = "ok";
  if (sameGotra) verdict = "not-permitted";
  else if (common) {
    const close = common.genA <= 1 || common.genB <= 1 || (common.genA === 2 && common.genB === 2 && cousinType === "parallel");
    verdict = close ? "not-permitted" : "caution";
  }

  return { sameGotra, gotraA: a.gotra?.name ?? null, gotraB: b.gotra?.name ?? null, common, cousinType, verdict };
}

/** The parent of `personId` who is a child of `ancestorId`. */
async function linkingChild(personId: string, ancestorId: string) {
  const parents = await db.parentChild.findMany({ where: { childId: personId }, include: { parent: true } });
  for (const p of parents) {
    const link = await db.parentChild.findFirst({ where: { parentId: ancestorId, childId: p.parentId } });
    if (link) return p.parent;
  }
  return null;
}
