"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit, canAddRelative, canEditPerson, canView, type Relation } from "@/lib/permissions";
import { familyScope } from "@/lib/family";
import { personFields, str, type FormState } from "@/lib/forms";
import { cleanPlaces } from "@/lib/locations/resolve";

export async function updatePersonAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const user = await currentUser();
  if (!(await canEditPerson(user, personId))) return { error: t("person.notAllowed") };
  const parsed = personFields(fd);
  if (!parsed.success) return { error: t("errors.required") };

  const before = await db.person.findUniqueOrThrow({ where: { id: personId } });
  const data = await cleanPlaces(parsed.data);
  await db.person.update({ where: { id: personId }, data: { ...data, updatedById: user!.id } });
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

  const anchor = await db.person.findUniqueOrThrow({ where: { id: anchorId } });
  const places = await cleanPlaces(parsed.data);
  const person = await db.$transaction(async (tx) => {
    const p = await tx.person.create({
      data: { ...places, districtId: places.districtId ?? anchor.districtId, createdById: user!.id, updatedById: user!.id },
    });
    if (relation === "parent") await tx.parentChild.create({ data: { parentId: p.id, childId: anchorId } });
    if (relation === "child") {
      await tx.parentChild.create({ data: { parentId: anchorId, childId: p.id } });
      if (coParentId) await tx.parentChild.create({ data: { parentId: coParentId, childId: p.id } });
    }
    if (relation === "spouse") await tx.couple.create({ data: { person1Id: anchorId, person2Id: p.id } });
    return p;
  });
  await audit(user, `add-${relation}`, "Person", person.id, { anchorId, coParentId });
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
  try {
    if (relation === "spouse") {
      const exists = await db.couple.findFirst({
        where: { OR: [{ person1Id: anchorId, person2Id: otherId }, { person1Id: otherId, person2Id: anchorId }] },
      });
      if (exists) return { error: t("person.alreadyLinked") };
      await db.couple.create({ data: { person1Id: anchorId, person2Id: otherId } });
    } else {
      await db.parentChild.create({ data: { parentId, childId } });
    }
  } catch {
    return { error: t("person.alreadyLinked") };
  }
  await audit(user, `link-${relation}`, "Person", anchorId, { otherId });
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
  const allowed = (await Promise.all(link.map((id) => canEditPerson(user, id)))).every(Boolean);
  if (!allowed) return;
  if (kind === "couple") await db.couple.delete({ where: { id: linkId } });
  else await db.parentChild.delete({ where: { id: linkId } });
  await audit(user, `unlink-${kind}`, "Person", link[0], { other: link[1] });
  revalidatePath("/", "layout");
  redirect({ href: `/person/${returnTo}`, locale: await getLocale() });
}
