"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { adminScope, audit } from "@/lib/permissions";
import { personFields, str } from "@/lib/forms";
import { cleanPlaces } from "@/lib/locations/resolve";
import { findDuplicates, type Duplicate } from "@/lib/dedup";

export type CreateTreeState = { error?: string; duplicates?: Duplicate[] } | undefined;

/**
 * Super admin: start a new family tree from its first known person (the one record allowed
 * without a parent, spouse or child link). Search first – possible duplicates are shown and the
 * admin must confirm before a new record is created; nothing is merged automatically.
 */
export async function createTreeAction(_: CreateTreeState, fd: FormData): Promise<CreateTreeState> {
  const t = await getTranslations();
  const user = await currentUser();
  if ((await adminScope(user))?.kind !== "all") return { error: t("admin.forbidden") };

  const parsed = personFields(fd);
  if (!parsed.success) return { error: t("errors.required") };
  const data = await cleanPlaces(parsed.data);
  // Required at creation: name, gender, gotra, intiperu, native place and its district
  if (!data.gotraId || !data.districtId || !(data.nativeLocalityId || data.nativePlace)) return { error: t("trees.missingRequired") };

  const fatherName = str(fd, "fatherName");
  if (fd.get("confirm") !== "yes") {
    const duplicates = await findDuplicates({
      ...data,
      fatherName,
      birthYear: data.birthDate ? Number(data.birthDate.slice(0, 4)) : null,
    });
    if (duplicates.length) return { duplicates };
  }

  const founder = await db.$transaction(async (tx) => {
    const p = await tx.person.create({ data: { ...data, createdById: user!.id, updatedById: user!.id } });
    // The father, when known, becomes the generation above – same intiperu, gotra and native place
    if (fatherName) {
      const parts = fatherName.split(/\s+/);
      const surname = parts.length > 1 && parts.at(-1)!.toLowerCase() === data.surname.toLowerCase() ? parts.pop()! : data.surname;
      const father = await tx.person.create({
        data: {
          givenName: parts.join(" "),
          surname,
          gender: "MALE",
          gotraId: data.gotraId,
          nativePlace: data.nativePlace,
          nativeLocalityId: data.nativeLocalityId,
          districtId: data.districtId,
          createdById: user!.id,
          updatedById: user!.id,
        },
      });
      await tx.parentChild.create({ data: { parentId: father.id, childId: p.id } });
    }
    return p;
  });
  await audit(user, "create-tree", "Person", founder.id, { fatherName, confirmedDespiteMatches: fd.get("confirm") === "yes" });
  revalidatePath("/", "layout");
  redirect({ href: `/person/${founder.id}`, locale: await getLocale() });
}
