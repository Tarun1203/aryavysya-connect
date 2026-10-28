import "server-only";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { adminScope, canEditPerson, canView, editableIds } from "./permissions";
import { ageFacts, needsGuardian } from "./photo";
import type { ConsentBasis, ConsentPurpose } from "@/generated/prisma/client";

/**
 * Consent records (DPDP Act 2023). Consent is recorded per purpose with who gave it and when,
 * and can be withdrawn; nothing is ever edited in place. The rules:
 *  - A member consents for themselves when they register (membership + family tree).
 *  - A living minor (under 18 – or with no birth year and neither married nor a parent, see
 *    needsGuardian) is shown to members outside their family only once a parent has consented as
 *    guardian, through their own verified account, or an administrator has recorded a signed
 *    paper form from the guardian. Until then they appear as "Private".
 *  - An adult added by their family stays listed unless consent for the family tree is withdrawn
 *    (by them, once registered, or by an administrator on their request).
 */
export const CONSENT_NOTICE_VERSION = "2026-10";

const active = { withdrawnAt: null } as const;

export async function recordConsent(input: {
  purpose: ConsentPurpose;
  basis: ConsentBasis;
  personId?: string | null;
  userId?: string | null;
  givenById: string;
  guardianName?: string | null;
  guardianRelation?: string | null;
}) {
  return db.consent.create({ data: { ...input, noticeVersion: CONSENT_NOTICE_VERSION } });
}

/** Withdraw every active consent of this purpose for the person. */
export async function withdrawConsent(personId: string, purpose: ConsentPurpose, byId: string) {
  return db.consent.updateMany({ where: { personId, purpose, ...active }, data: { withdrawnAt: new Date(), withdrawnById: byId } });
}

/** Registration consents are given before the person record exists; attach them on approval. */
export async function attachUserConsents(userId: string, personId: string) {
  await db.consent.updateMany({ where: { userId, personId: null }, data: { personId } });
}

type Subject = { id: string; isLiving: boolean; birthDate: string | null };

/**
 * Of these people, the ones that must be shown as "Private" to members outside their family:
 * living minors without active guardian consent, and anyone whose family-tree consent was
 * withdrawn and not given again.
 */
export async function privateIds(people: Subject[]): Promise<Set<string>> {
  const living = people.filter((p) => p.isLiving);
  if (!living.length) return new Set();
  const consents = await db.consent.findMany({
    where: { personId: { in: living.map((p) => p.id) }, purpose: "FAMILY_TREE" },
    select: { personId: true, basis: true, withdrawnAt: true },
  });
  const facts = await ageFacts(living.filter((p) => !p.birthDate).map((p) => p.id));
  const out = new Set<string>();
  for (const p of living) {
    const mine = consents.filter((c) => c.personId === p.id);
    const current = mine.filter((c) => !c.withdrawnAt);
    if (needsGuardian(p, facts.get(p.id)) ? !current.some((c) => c.basis !== "SELF") : mine.length > 0 && current.length === 0) out.add(p.id);
  }
  return out;
}

/**
 * Who sees private records as they are: administrators over the person, and the family that
 * may edit them. Returns a check for many ids at once (editableIds is one query for all).
 */
export async function privateViewer(user: SessionUser | null) {
  if (!canView(user)) return () => false;
  const ids = await editableIds(user);
  return (id: string) => ids === null || ids.has(id);
}

/** Replace what identifies a private person with a placeholder; the shape is kept for the trees. */
export function mask<T extends { id: string }>(p: T, label: string): T {
  return {
    ...p,
    givenName: label,
    surname: "",
    givenNameLocal: null,
    surnameLocal: null,
    birthDate: null,
    deathDate: null,
    birthOrder: null,
    gotra: null,
    birthGotra: null,
    maternalGotra: null,
    photo: null,
    memberNo: undefined,
    private: true,
  } as T;
}

/** Walk a descendants tree (node, spouses, children) masking the private people in it. */
export async function maskTree<N extends Subject & { spouses: Subject[]; children: N[] }>(root: N, user: SessionUser | null, label: string): Promise<N> {
  const all: Subject[] = [];
  const collect = (n: N) => {
    all.push(n, ...n.spouses);
    n.children.forEach(collect);
  };
  collect(root);
  const [hidden, sees] = await Promise.all([privateIds(all), privateViewer(user)]);
  const hide = (p: Subject) => hidden.has(p.id) && !sees(p.id);
  const walk = (n: N): N => ({
    ...(hide(n) ? mask(n, label) : n),
    spouses: n.spouses.map((s) => (hide(s) ? mask(s, label) : s)),
    children: n.children.map(walk),
  });
  return walk(root);
}

/** The consent state shown on a person's page, and what the viewer may do about it. */
export async function consentPanel(user: SessionUser | null, personId: string) {
  const p = await db.person.findUnique({
    where: { id: personId },
    select: { isLiving: true, birthDate: true, user: { select: { id: true } }, asChild: { select: { parentId: true } } },
  });
  if (!p || !user) return null;
  const records = await db.consent.findMany({
    where: { personId },
    include: { givenBy: { select: { name: true } }, withdrawnBy: { select: { name: true } } },
    orderBy: { givenAt: "desc" },
  });
  const minor = needsGuardian(p, p.birthDate ? undefined : (await ageFacts([personId])).get(personId));
  const self = p.user?.id === user.id;
  const parent = !!user.personId && p.asChild.some((l) => l.parentId === user.personId);
  const admin = !!(await adminScope(user)) && user.role !== "MEMBER" && (await canEditPerson(user, personId));
  const treeActive = records.some((r) => r.purpose === "FAMILY_TREE" && !r.withdrawnAt && (!minor || r.basis !== "SELF"));
  return {
    minor,
    // Treated as a minor only because no birth year is recorded
    ageUnknown: minor && !p.birthDate,
    records,
    treeActive,
    hidden: (await privateIds([{ id: personId, isLiving: p.isLiving, birthDate: p.birthDate }])).has(personId),
    // Who may give or withdraw family-tree consent here
    canGiveAsGuardian: minor && parent,
    canRecordForm: minor && admin,
    canGiveSelf: !minor && self,
    canWithdraw: (minor && (parent || admin)) || (!minor && (self || admin)),
  };
}

/** Whether this person is private to this viewer (their page and tree then show a notice only). */
export async function isPrivateFor(user: SessionUser | null, personId: string) {
  const p = await db.person.findUnique({ where: { id: personId }, select: { id: true, isLiving: true, birthDate: true } });
  if (!p || !(await privateIds([p])).has(personId)) return false;
  return !(await privateViewer(user))(personId);
}

/** Mask the private people in a flat list (relatives, chart rows) for this viewer. */
export async function maskList<T extends Subject>(people: T[], user: SessionUser | null, label: string): Promise<T[]> {
  const [hidden, sees] = await Promise.all([privateIds(people), privateViewer(user)]);
  return people.map((p) => (hidden.has(p.id) && !sees(p.id) ? mask(p, label) : p));
}
