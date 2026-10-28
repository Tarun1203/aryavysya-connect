import "server-only";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { audit, canEditPerson, isAdmin } from "./permissions";
import { syncAround } from "./gotra";
import type { ChangeRequest, Prisma } from "@/generated/prisma/client";

/**
 * Proposal → review → decision (spec: "don't allow unrestricted family editing").
 *
 * Applies straight away: an administrator's edits, and a member's edits to an unverified record
 * kept by the family (so building the tree stays quick).
 * Goes for review: a member's edit to a verified record (an administrator reviews), or to another
 * registered member's own record (that member or an administrator reviews); removing a verified
 * link; and every dispute (an administrator decides).
 */

export type Changes = Record<string, { from: unknown; to: unknown }>;

/** The person fields a proposal may change (those of the person form). */
export const EDITABLE = [
  "givenName", "surname", "givenNameLocal", "surnameLocal", "aliases", "gender", "birthGotraId", "maternalGotraId",
  "isLiving", "birthDate", "birthOrder", "birthPlace", "deathDate", "deathTithi", "nativePlace", "nakshatra", "rasi",
  "kuladevata", "occupation", "currentCity", "notes", "districtId", "nativeLocalityId", "birthLocalityId",
] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Only the fields that differ, as { field: { from, to } }. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Changes {
  return Object.fromEntries(
    EDITABLE.filter((k) => k in after && !same(before[k], after[k])).map((k) => [k, { from: before[k] ?? null, to: after[k] ?? null }]),
  );
}

/** An administrator over this person: they verify, review and decide. */
export async function isReviewer(user: SessionUser | null, personId: string) {
  return isAdmin(user) && (await canEditPerson(user, personId));
}

/** Whether this user's edit to the person must be proposed rather than applied. */
export async function editNeedsReview(user: SessionUser | null, personId: string) {
  if (await isReviewer(user, personId)) return false;
  const p = await db.person.findUnique({ where: { id: personId }, select: { verifiedAt: true, user: { select: { id: true } } } });
  if (!p) return false;
  if (p.verifiedAt) return true;
  return !!p.user && p.user.id !== user?.id;
}

/** Whether removing this link must be proposed: it, or either person on it, is verified. */
export async function unlinkNeedsReview(user: SessionUser | null, kind: "parentChild" | "couple", linkId: string) {
  const ids =
    kind === "parentChild"
      ? await db.parentChild.findUnique({ where: { id: linkId }, select: { parentId: true, childId: true, verifiedAt: true } }).then((l) => l && { a: l.parentId, b: l.childId, verified: !!l.verifiedAt })
      : await db.couple.findUnique({ where: { id: linkId }, select: { person1Id: true, person2Id: true } }).then((c) => c && { a: c.person1Id, b: c.person2Id, verified: false });
  if (!ids) return false;
  if ((await isReviewer(user, ids.a)) && (await isReviewer(user, ids.b))) return false;
  if (ids.verified) return true;
  const verified = await db.person.count({ where: { id: { in: [ids.a, ids.b] }, verifiedAt: { not: null } } });
  return verified > 0;
}

/** Who may decide this request. */
export async function canReview(user: SessionUser | null, req: Pick<ChangeRequest, "kind" | "personId">) {
  if (!user) return false;
  if (await isReviewer(user, req.personId)) return true;
  // A member decides edits proposed to their own (unverified) record
  if (req.kind !== "EDIT") return false;
  const p = await db.person.findUnique({ where: { id: req.personId }, select: { verifiedAt: true, user: { select: { id: true } } } });
  return !!p && !p.verifiedAt && p.user?.id === user.id;
}

/** Fields of an edit proposal whose current value is no longer what the proposer saw. */
export async function conflicts(req: Pick<ChangeRequest, "personId" | "changes">) {
  const changes = (req.changes ?? {}) as Changes;
  const now = await db.person.findUnique({ where: { id: req.personId } });
  if (!now) return [];
  return Object.entries(changes)
    .filter(([k, v]) => !same((now as Record<string, unknown>)[k], v.from))
    .map(([k]) => k);
}

/** Apply an approved edit: only the proposed fields, to their proposed values. */
export async function applyEdit(req: ChangeRequest, reviewer: SessionUser) {
  const changes = (req.changes ?? {}) as Changes;
  const data = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])) as Prisma.PersonUpdateInput;
  await db.person.update({ where: { id: req.personId }, data: { ...data, updatedById: req.proposedById ?? reviewer.id } });
  await syncAround(req.personId);
  await audit(reviewer, "update", "Person", req.personId, { ...changes, changeRequest: req.id });
}

/** Remove the link a request is about (an approved unlink, or an upheld dispute). */
export async function removeLink(req: ChangeRequest, reviewer: SessionUser) {
  if (!req.linkId) return;
  const ends =
    req.linkKind === "couple"
      ? await db.couple.findUnique({ where: { id: req.linkId } }).then((c) => c && [c.person1Id, c.person2Id])
      : await db.parentChild.findUnique({ where: { id: req.linkId } }).then((l) => l && [l.parentId, l.childId]);
  if (!ends) return;
  if (req.linkKind === "couple") await db.couple.delete({ where: { id: req.linkId } });
  else await db.parentChild.delete({ where: { id: req.linkId } });
  await syncAround(ends[0]);
  await syncAround(ends[1]);
  await audit(reviewer, `unlink-${req.linkKind}`, "Person", ends[0], { other: ends[1], changeRequest: req.id });
}

/** Open disputes, for the "Disputed" badges: people disputed, and links disputed. */
export async function openDisputes(personIds: string[]) {
  const rows = await db.changeRequest.findMany({
    where: { kind: "DISPUTE", status: "PENDING", OR: [{ personId: { in: personIds } }, { linkId: { not: null } }] },
    select: { personId: true, linkId: true },
  });
  return {
    people: new Set(rows.filter((r) => !r.linkId && personIds.includes(r.personId)).map((r) => r.personId)),
    links: new Set(rows.map((r) => r.linkId).filter((x): x is string => !!x)),
  };
}
