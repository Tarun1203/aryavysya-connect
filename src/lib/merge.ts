import "server-only";
import { db } from "./db";
import { fullName } from "./reference";
import { syncGotras } from "./gotra";

export type MergeProblem = "same" | "missing" | "alreadyMerged" | "twoAccounts" | "parentOfOther";

/** Details the survivor takes from the duplicate when its own are empty. */
const FILLABLE = [
  "givenNameLocal",
  "surnameLocal",
  "birthGotraId",
  "maternalGotraId",
  "birthDate",
  "birthOrder",
  "birthPlace",
  "birthLocalityId",
  "deathDate",
  "deathTithi",
  "nativePlace",
  "nativeLocalityId",
  "nakshatra",
  "rasi",
  "kuladevata",
  "occupation",
  "currentCity",
  "notes",
  "districtId",
] as const;

/** Why two records can't be merged, or null when they can. */
export async function mergeProblem(keepId: string, dupId: string): Promise<MergeProblem | null> {
  if (keepId === dupId) return "same";
  const [keep, dup] = await Promise.all([
    db.person.findUnique({ where: { id: keepId }, include: { user: { select: { id: true } } } }),
    db.person.findUnique({ where: { id: dupId }, include: { user: { select: { id: true } } } }),
  ]);
  if (!keep || !dup) return "missing";
  if (keep.status === "MERGED" || dup.status === "MERGED") return "alreadyMerged";
  // Two people who each have their own login are two members, not one record
  if (keep.user && dup.user) return "twoAccounts";
  // One recorded as the other's parent can't be the same person
  const direct = await db.parentChild.count({ where: { OR: [{ parentId: keepId, childId: dupId }, { parentId: dupId, childId: keepId }] } });
  if (direct) return "parentOfOther";
  return null;
}

/**
 * Merge a duplicate record into the one that is kept (spec §4). The survivor keeps its own
 * details, fills blanks from the duplicate, takes over its parents, children, marriages, photo,
 * membership requests and login, and records the duplicate's name as an alias. The duplicate
 * stays as a MERGED record pointing at the survivor, so its member code and old links still lead
 * there. Returns what moved, for the audit log.
 */
export async function mergePeople(keepId: string, dupId: string) {
  const [keep, dup] = await Promise.all([
    db.person.findUniqueOrThrow({ where: { id: keepId }, include: { user: true, photo: { select: { personId: true } } } }),
    db.person.findUniqueOrThrow({ where: { id: dupId }, include: { user: true, photo: { select: { personId: true } } } }),
  ]);
  const [keepParents, keepChildren, dupParents, dupChildren, couples] = await Promise.all([
    db.parentChild.findMany({ where: { childId: keepId } }),
    db.parentChild.findMany({ where: { parentId: keepId } }),
    db.parentChild.findMany({ where: { childId: dupId } }),
    db.parentChild.findMany({ where: { parentId: dupId } }),
    db.couple.findMany({ where: { OR: [{ person1Id: { in: [keepId, dupId] } }, { person2Id: { in: [keepId, dupId] } }] } }),
  ]);

  // Parent and child links: move the duplicate's, dropping any the survivor already has
  const hasParent = new Set(keepParents.map((l) => l.parentId));
  const hasChild = new Set(keepChildren.map((l) => l.childId));
  const moveParents = dupParents.filter((l) => !hasParent.has(l.parentId));
  const moveChildren = dupChildren.filter((l) => !hasChild.has(l.childId));
  const dropLinks = [...dupParents, ...dupChildren].filter((l) => !moveParents.includes(l) && !moveChildren.includes(l));

  // Marriages: move the duplicate's to the survivor unless the survivor is already married to that person
  const partner = (c: (typeof couples)[number], self: string) => (c.person1Id === self ? c.person2Id : c.person1Id);
  const keepPartners = new Set(couples.filter((c) => c.person1Id === keepId || c.person2Id === keepId).map((c) => partner(c, keepId)));
  const dupCouples = couples.filter((c) => c.person1Id === dupId || c.person2Id === dupId);
  const moveCouples = dupCouples.filter((c) => partner(c, dupId) !== keepId && !keepPartners.has(partner(c, dupId)));
  const dropCouples = dupCouples.filter((c) => !moveCouples.includes(c));

  const fill = Object.fromEntries(FILLABLE.filter((k) => keep[k] == null && dup[k] != null).map((k) => [k, dup[k]]));
  const aliases = [...new Set([...keep.aliases, ...dup.aliases, ...(fullName(dup) !== fullName(keep) ? [fullName(dup)] : [])])];

  await db.$transaction([
    db.parentChild.deleteMany({ where: { id: { in: dropLinks.map((l) => l.id) } } }),
    ...moveParents.map((l) => db.parentChild.update({ where: { id: l.id }, data: { childId: keepId } })),
    ...moveChildren.map((l) => db.parentChild.update({ where: { id: l.id }, data: { parentId: keepId } })),
    db.couple.deleteMany({ where: { id: { in: dropCouples.map((c) => c.id) } } }),
    ...moveCouples.map((c) => db.couple.update({ where: { id: c.id }, data: c.person1Id === dupId ? { person1Id: keepId } : { person2Id: keepId } })),
    db.familyClaim.updateMany({ where: { personId: dupId }, data: { personId: keepId } }),
    // The photo and the login go with the person, if the survivor has none of its own
    ...(dup.photo && !keep.photo ? [db.personPhoto.update({ where: { personId: dupId }, data: { personId: keepId } })] : []),
    ...(dup.photo && keep.photo ? [db.personPhoto.delete({ where: { personId: dupId } })] : []),
    ...(dup.user && !keep.user ? [db.user.update({ where: { id: dup.user.id }, data: { personId: keepId } })] : []),
    db.person.update({
      where: { id: keepId },
      data: { ...fill, aliases, ...(dup.status === "CLAIMED" ? { status: "CLAIMED" } : {}) },
    }),
    // Earlier merges into the duplicate now point straight at the survivor
    db.person.updateMany({ where: { mergedIntoId: dupId }, data: { mergedIntoId: keepId } }),
    db.person.update({ where: { id: dupId }, data: { status: "MERGED", mergedIntoId: keepId } }),
  ]);

  // Gotras follow parents and marriages, which may have just changed
  const touched = [keepId, ...moveParents.map((l) => l.parentId), ...moveChildren.map((l) => l.childId), ...moveCouples.map((c) => partner(c, dupId))];
  await syncGotras([...new Set(touched)]);

  return {
    from: { id: dupId, memberNo: dup.memberNo, name: fullName(dup) },
    parents: moveParents.length,
    children: moveChildren.length,
    marriages: moveCouples.length,
    dropped: dropLinks.length + dropCouples.length,
    filled: Object.keys(fill),
    login: !!(dup.user && !keep.user),
  };
}
