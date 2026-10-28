import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { adminScope, canEditPerson, canView } from "@/lib/permissions";

/**
 * Who may manage a person's photo (spec §1: "member's choice; off by default for women,
 * guardian-controlled for minors"):
 *  - a living minor (under 18): only their guardian – a member who is the minor's parent
 *  - a registered member: only that member
 *  - anyone else (not registered, or passed away): whoever may edit the person
 * Admins can always remove a photo (moderation) but don't choose one for someone.
 * A hidden photo is seen only by those who could manage it.
 */
export const ADULT_AGE = 18;

export function isMinor(p: { isLiving: boolean; birthDate: string | null }) {
  const year = p.birthDate ? Number(p.birthDate.slice(0, 4)) : NaN;
  return p.isLiving && Number.isFinite(year) && new Date().getFullYear() - year < ADULT_AGE;
}

/**
 * Treated as a minor for privacy: a living person under 18, or a living person with no birth year
 * who is neither married nor a parent – they may be a child, so they are protected until a birth
 * year is entered (or a parent consents). `married` and `parent` come from ageFacts().
 */
export function needsGuardian(p: { isLiving: boolean; birthDate: string | null }, facts?: { married: boolean; parent: boolean }) {
  if (isMinor(p)) return true;
  return p.isLiving && !p.birthDate && !(facts?.married || facts?.parent);
}

/** Living people with no birth year: whether each is married or a parent (for needsGuardian). */
export async function ageFacts(ids: string[]) {
  const facts = new Map(ids.map((id) => [id, { married: false, parent: false }]));
  if (!ids.length) return facts;
  const [couples, links] = await Promise.all([
    db.couple.findMany({ where: { status: { not: "PROPOSED" }, OR: [{ person1Id: { in: ids } }, { person2Id: { in: ids } }] }, select: { person1Id: true, person2Id: true } }),
    db.parentChild.findMany({ where: { parentId: { in: ids } }, select: { parentId: true }, distinct: ["parentId"] }),
  ]);
  couples.forEach((c) => [c.person1Id, c.person2Id].forEach((id) => facts.get(id) && (facts.get(id)!.married = true)));
  links.forEach((l) => facts.get(l.parentId) && (facts.get(l.parentId)!.parent = true));
  return facts;
}

export type PhotoRights = { manage: boolean; remove: boolean; seeHidden: boolean; minor: boolean; reason: "guardian" | "self" | "family" | null };

export async function photoRights(user: SessionUser | null, personId: string): Promise<PhotoRights> {
  const none: PhotoRights = { manage: false, remove: false, seeHidden: false, minor: false, reason: null };
  if (!user || !canView(user)) return none;
  const p = await db.person.findUnique({
    where: { id: personId },
    select: { isLiving: true, birthDate: true, user: { select: { id: true } }, asChild: { select: { parentId: true } } },
  });
  if (!p) return none;
  const minor = needsGuardian(p, p.birthDate ? undefined : (await ageFacts([personId])).get(personId));
  const admin = !!(await adminScope(user)) && user.role !== "MEMBER" && (await canEditPerson(user, personId));
  let manage: boolean;
  let reason: PhotoRights["reason"] = null;
  if (minor) {
    manage = !!user.personId && p.asChild.some((l) => l.parentId === user.personId);
    reason = "guardian";
  } else if (p.user) {
    manage = p.user.id === user.id;
    reason = "self";
  } else {
    manage = await canEditPerson(user, personId);
    reason = "family";
  }
  return { manage, remove: manage || admin, seeHidden: manage || admin, minor, reason };
}

/** Default for "show in the tree" on a first upload: on for men, off for women, minors and anyone of unknown age. */
export const defaultVisible = (p: { gender: string; isLiving: boolean; birthDate: string | null }) =>
  p.gender === "MALE" && !isMinor(p) && (!p.isLiving || !!p.birthDate);

export const photoUrl = (personId: string, updatedAt: Date) => `/api/photo/${personId}?v=${updatedAt.getTime()}`;
