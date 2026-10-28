"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit, canAddRelative, canEditPerson, canView, isAdmin, type Relation } from "@/lib/permissions";
import { familyScope } from "@/lib/family";
import { personFields, str, type FormState } from "@/lib/forms";
import { cleanPlaces } from "@/lib/locations/resolve";
import { findDuplicates } from "@/lib/dedup";
import { marriageCheck } from "@/lib/marriage";
import { rulesFor, syncAround } from "@/lib/gotra";
import { mergePeople, mergeProblem } from "@/lib/merge";
import { privateIds, privateViewer } from "@/lib/consent";

export async function updatePersonAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const user = await currentUser();
  if (!(await canEditPerson(user, personId))) return { error: t("person.notAllowed") };
  const parsed = personFields(fd);
  if (!parsed.success) return { error: t("errors.required") };

  const before = await db.person.findUniqueOrThrow({ where: { id: personId } });
  const data = await cleanPlaces(parsed.data);
  await db.person.update({ where: { id: personId }, data: { ...data, updatedById: user!.id } });
  await syncAround(personId);
  const changed = Object.fromEntries(
    Object.entries(data).filter(([k, v]) => before[k as keyof typeof before] !== v).map(([k, v]) => [k, { from: before[k as keyof typeof before], to: v }])
  );
  await audit(user, "update", "Person", personId, changed);
  revalidatePath("/", "layout");
  redirect({ href: `/person/${personId}`, locale: await getLocale() });
}

/** Create a new person and link them to `anchorId` as parent, child or spouse. */
export async function addRelativeAction(anchorId: string, relation: Relation, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const user = await currentUser();
  const coParentId = relation === "child" ? str(fd, "coParentId") ?? undefined : undefined;
  if (!(await canEditPerson(user, anchorId))) return { error: t("person.notAllowed") };
  if (!(await canAddRelative(user, anchorId, relation, coParentId))) return { error: t("person.outOfScope") };
  const parsed = personFields(fd);
  if (!parsed.success) return { error: t("errors.required") };

  const anchor = await db.person.findUniqueOrThrow({ where: { id: anchorId }, include: { district: true } });
  const places = await cleanPlaces(parsed.data);
  const data = { ...places, districtId: places.districtId ?? anchor.districtId, gotraId: places.birthGotraId };

  // Search first – claim, don't recreate. Until the member confirms none of these is the person,
  // show possible duplicates (matched on the family links and stable facts) instead of saving.
  const confirmed = fd.get("confirm") === "yes";
  if (!confirmed) {
    const duplicates = await findDuplicates({
      ...data,
      birthYear: data.birthDate ? Number(data.birthDate.slice(0, 4)) : null,
      relatives:
        relation === "parent"
          ? { childIds: [anchorId] }
          : relation === "child"
            ? { parentIds: [anchorId, ...(coParentId ? [coParentId] : [])] }
            : { spouseIds: [anchorId] },
    });
    if (duplicates.length) {
      // A private match still warns, but without its name or details
      const people = await db.person.findMany({ where: { id: { in: duplicates.map((d) => d.id) } }, select: { id: true, isLiving: true, birthDate: true } });
      const [hidden, sees] = await Promise.all([privateIds(people), privateViewer(user)]);
      const label = t("consent.privateLabel");
      return { duplicates: duplicates.map((d) => (hidden.has(d.id) && !sees(d.id) ? { ...d, name: label, detail: "", code: "" } : d)) };
    }
  }
  // A brand-new spouse has no ancestors in the tree yet, so only the gotras can be checked
  if (relation === "spouse" && fd.get("confirmMatch") !== "yes") {
    const rules = await rulesFor(anchor.district?.state);
    const anchorBirth = anchor.birthGotraId ?? anchor.gotraId;
    const found = [
      data.birthGotraId && data.birthGotraId === anchorBirth ? ["sagotra", rules.sagotra] : null,
      (data.birthGotraId && data.birthGotraId === anchor.maternalGotraId) || (anchorBirth && anchorBirth === data.maternalGotraId)
        ? ["maternalGotra", rules.maternalGotra]
        : null,
    ].filter((x): x is [string, "ALLOW" | "WARN" | "BLOCK"] => !!x && x[1] !== "ALLOW");
    const block = found.find(([, level]) => level === "BLOCK");
    if (block) return { error: t(`marriage.blocked_${block[0]}`, { name: "" }) };
    if (found.length) return { marriageFlags: found.map(([k]) => k) };
  }

  const person = await db.$transaction(async (tx) => {
    const p = await tx.person.create({
      data: { ...data, createdById: user!.id, updatedById: user!.id },
    });
    if (relation === "parent") await tx.parentChild.create({ data: { parentId: p.id, childId: anchorId } });
    if (relation === "child") {
      await tx.parentChild.create({ data: { parentId: anchorId, childId: p.id } });
      if (coParentId) await tx.parentChild.create({ data: { parentId: coParentId, childId: p.id } });
    }
    // The new spouse was entered by this family, so the marriage needs no one else's acceptance
    if (relation === "spouse")
      await tx.couple.create({ data: { person1Id: anchorId, person2Id: p.id, proposedById: user!.id, confirmedById: user!.id, confirmedAt: new Date() } });
    return p;
  });
  await syncAround(person.id);
  await syncAround(anchorId);
  await audit(user, `add-${relation}`, "Person", person.id, { anchorId, coParentId, confirmedDespiteMatches: confirmed || undefined });
  revalidatePath("/", "layout");
  redirect({ href: `/person/${person.id}`, locale: await getLocale() });
}

/**
 * Link two people who are both already in the tree.
 * Members may only link someone already inside their family, or marry into another family (spouse).
 */
export async function linkExistingAction(anchorId: string, relation: Relation, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const user = await currentUser();
  const otherId = str(fd, "otherId");
  if (!otherId || otherId === anchorId) return { error: t("errors.required") };
  if (!(await canEditPerson(user, anchorId))) return { error: t("person.notAllowed") };
  if (user!.role === "MEMBER" && relation !== "spouse") {
    const scope = await familyScope(user!.personId!);
    if (!scope.has(otherId)) return { error: t("person.outOfScope") };
  }

  const [parentId, childId] = relation === "parent" ? [otherId, anchorId] : [anchorId, otherId];
  let proposed = false;
  try {
    if (relation === "spouse") {
      const exists = await db.couple.findFirst({
        where: { OR: [{ person1Id: anchorId, person2Id: otherId }, { person1Id: otherId, person2Id: anchorId }] },
      });
      if (exists) return { error: t(exists.status === "PROPOSED" ? "marriage.alreadyProposed" : "person.alreadyLinked") };
      const check = await marriageCheck(anchorId, otherId);
      if (check.blocked) return { error: t(`marriage.blocked_${check.blocked}`, { name: check.relative ?? "" }) };
      if (check.flags.length && fd.get("confirmMatch") !== "yes") return { marriageFlags: check.flags, relative: check.relative };
      // Someone in another family's chart can't be attached unilaterally: their side has to accept
      proposed = !(await canEditPerson(user, otherId));
      await db.couple.create({
        data: {
          person1Id: anchorId,
          person2Id: otherId,
          status: proposed ? "PROPOSED" : "CONFIRMED",
          proposedById: user!.id,
          ...(proposed ? {} : { confirmedById: user!.id, confirmedAt: new Date() }),
        },
      });
    } else {
      await db.parentChild.create({ data: { parentId, childId } });
    }
  } catch {
    return { error: t("person.alreadyLinked") };
  }
  await syncAround(anchorId);
  await syncAround(otherId);
  await audit(user, proposed ? "propose-marriage" : `link-${relation}`, "Person", anchorId, {
    otherId,
    ...(relation === "spouse" && fd.get("confirmMatch") === "yes" ? { confirmedDespiteFlags: true } : {}),
  });
  revalidatePath("/", "layout");
  redirect({ href: `/person/${anchorId}`, locale: await getLocale() });
}

export async function removeLinkAction(kind: "parentChild" | "couple", linkId: string, returnTo: string) {
  const user = await currentUser();
  if (!canView(user)) return;
  const link =
    kind === "couple"
      ? await db.couple.findUnique({ where: { id: linkId } }).then((c) => c && [c.person1Id, c.person2Id])
      : await db.parentChild.findUnique({ where: { id: linkId } }).then((c) => c && [c.parentId, c.childId]);
  if (!link) return;
  // A proposal can be withdrawn by the side that made it; anything else needs both sides
  const pending = kind === "couple" && (await db.couple.findUnique({ where: { id: linkId } }))?.status === "PROPOSED";
  const allowed = pending
    ? await canEditPerson(user, link[0])
    : (await Promise.all(link.map((id) => canEditPerson(user, id)))).every(Boolean);
  if (!allowed) return;
  if (kind === "couple") await db.couple.delete({ where: { id: linkId } });
  else await db.parentChild.delete({ where: { id: linkId } });
  await syncAround(link[0]);
  await syncAround(link[1]);
  await audit(user, `unlink-${kind}`, "Person", link[0], { other: link[1] });
  revalidatePath("/", "layout");
  redirect({ href: `/person/${returnTo}`, locale: await getLocale() });
}

/**
 * Merge a duplicate record into this one (administrators only, with edit rights over both).
 * See src/lib/merge.ts for what moves; the duplicate keeps its id and member code and redirects here.
 */
export async function mergePersonAction(keepId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("merge");
  const user = await currentUser();
  const dupId = str(fd, "duplicateId");
  if (!dupId) return { error: t("chooseDuplicate") };
  if (fd.get("confirm") !== "on") return { error: t("confirmRequired") };
  if (!isAdmin(user) || !(await canEditPerson(user, keepId)) || !(await canEditPerson(user, dupId))) return { error: t("notAllowed") };
  const problem = await mergeProblem(keepId, dupId);
  if (problem) return { error: t(`problem_${problem}`) };
  const moved = await mergePeople(keepId, dupId);
  await audit(user, "merge", "Person", keepId, moved);
  await audit(user, "merged-into", "Person", dupId, { into: keepId });
  revalidatePath("/", "layout");
  return { ok: true };
}
