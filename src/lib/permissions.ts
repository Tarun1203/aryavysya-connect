import "server-only";
import { db } from "@/lib/db";
import { familyScope, type VirtualEdges } from "@/lib/family";
import type { SessionUser } from "@/lib/auth";

export class PermissionError extends Error {}

/**
 * Who administers what:
 *  SUPER_ADMIN        – everything (platform owner)
 *  STATE_ADMIN        – every district in the state of the body they administer
 *  DISTRICT_INCHARGE  – the one district they are in charge of (incl. all its local sanghas/sabhas)
 *  LOCAL_ADMIN        – endorses members of their own sangha/sabha; edits like a member otherwise
 */
export type AdminScope =
  | { kind: "all" }
  | { kind: "state"; state: string }
  | { kind: "district"; districtId: string; state: string }
  | { kind: "local"; orgId: string; districtId: string | null }
  | null;

export const isAdmin = (u: SessionUser | null) => !!u && u.role !== "MEMBER" && u.status === "APPROVED";
export const isSecondaryAdmin = (u: SessionUser | null) => isAdmin(u) && u!.role !== "SUPER_ADMIN";

export async function adminScope(u: SessionUser | null): Promise<AdminScope> {
  if (!u || u.status !== "APPROVED") return u?.role === "SUPER_ADMIN" ? { kind: "all" } : null;
  switch (u.role) {
    case "SUPER_ADMIN":
      return { kind: "all" };
    case "STATE_ADMIN": {
      const org = u.adminOrgId ? await db.organization.findUnique({ where: { id: u.adminOrgId } }) : null;
      return org?.state ? { kind: "state", state: org.state } : null;
    }
    case "DISTRICT_INCHARGE": {
      const d = await db.district.findUnique({ where: { inchargeId: u.id } });
      return d ? { kind: "district", districtId: d.id, state: d.state } : null;
    }
    case "LOCAL_ADMIN": {
      const org = u.adminOrgId ? await db.organization.findUnique({ where: { id: u.adminOrgId } }) : null;
      return org ? { kind: "local", orgId: org.id, districtId: org.districtId } : null;
    }
    default:
      return null;
  }
}

/** Prisma filter for districts inside an admin scope (null = none). */
export function districtWhere(scope: AdminScope) {
  if (!scope) return null;
  if (scope.kind === "all") return {};
  if (scope.kind === "state") return { state: scope.state };
  if (scope.kind === "district") return { id: scope.districtId };
  return scope.districtId ? { id: scope.districtId } : null;
}

/** Can this admin scope manage records in a district? (local admins cannot edit district-wide) */
async function scopeCoversDistrict(scope: AdminScope, districtId: string | null) {
  if (!scope || scope.kind === "local") return false;
  if (scope.kind === "all") return true;
  if (!districtId) return false;
  if (scope.kind === "district") return scope.districtId === districtId;
  const d = await db.district.findUnique({ where: { id: districtId } });
  return d?.state === scope.state;
}

/** Approved members (and admins) may view the tree. Pending users only see their own request. */
export function canView(u: SessionUser | null) {
  return !!u && (u.status === "APPROVED" || u.role === "SUPER_ADMIN");
}

/** May this user edit the given person? Admins by district/state; everyone by their own family scope. */
export async function canEditPerson(u: SessionUser | null, personId: string, v?: VirtualEdges) {
  if (!canView(u)) return false;
  const scope = await adminScope(u);
  if (scope?.kind === "all") return true;
  if (scope && scope.kind !== "local" && personId !== "__new__") {
    const p = await db.person.findUnique({ where: { id: personId }, select: { districtId: true } });
    if (p && (await scopeCoversDistrict(scope, p.districtId))) return true;
  }
  if (!u!.personId) return false;
  return (await familyScope(u!.personId, undefined, v)).has(personId);
}

/** Person ids a user may edit through their family (admins may also edit their district/state). */
export async function editableIds(u: SessionUser | null): Promise<Set<string> | null> {
  if (!canView(u)) return new Set();
  const scope = await adminScope(u);
  if (scope?.kind === "all") return null;
  const ids = new Set<string>(u!.personId ? (await familyScope(u!.personId)).keys() : []);
  const where = scope && scope.kind !== "local" ? districtWhere(scope) : null;
  if (where) {
    const people = await db.person.findMany({ where: { district: where }, select: { id: true } });
    people.forEach((p) => ids.add(p.id));
  }
  return ids;
}

export type Relation = "parent" | "child" | "spouse";

/**
 * Adding a relative is allowed only if the anchor is editable now AND the new person would
 * still be editable afterwards – so a member cannot grow the tree beyond 5 generations or
 * into other families. District/state admins may add anyone to a person in their area.
 */
export async function canAddRelative(u: SessionUser | null, anchorId: string, relation: Relation, coParentId?: string) {
  if (!(await canEditPerson(u, anchorId))) return false;
  const scope = await adminScope(u);
  if (scope && scope.kind !== "local") {
    if (scope.kind === "all") return true;
    const anchor = await db.person.findUnique({ where: { id: anchorId }, select: { districtId: true } });
    if (anchor && (await scopeCoversDistrict(scope, anchor.districtId))) return true;
  }
  const NEW = "__new__";
  const v: VirtualEdges =
    relation === "parent"
      ? { parentChild: [{ parentId: NEW, childId: anchorId }] }
      : relation === "child"
        ? {
            parentChild: [anchorId, coParentId]
              .filter((id): id is string => !!id)
              .map((parentId) => ({ parentId, childId: NEW })),
          }
        : { couples: [{ a: anchorId, b: NEW }] };
  return canEditPerson(u, NEW, v);
}

/** Can this user give final approval to (or endorse) a membership request? */
export async function claimRights(u: SessionUser | null, claim: { districtId: string; organizationId: string | null }) {
  const scope = await adminScope(u);
  if (!scope) return { approve: false, endorse: false };
  if (scope.kind === "local") return { approve: false, endorse: claim.organizationId === scope.orgId };
  const approve = await scopeCoversDistrict(scope, claim.districtId);
  return { approve, endorse: approve };
}

export async function audit(u: SessionUser | null, action: string, entity: string, entityId: string, details?: object) {
  await db.auditLog.create({ data: { userId: u?.id, action, entity, entityId, details: details ?? undefined } });
}
