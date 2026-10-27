"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/permissions";
import { photoRights } from "@/lib/photo";
import type { FormState } from "@/lib/forms";

const MAX_BYTES = 300 * 1024; // the browser sends a 320px JPEG of about 20–40 KB
const MAGIC: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
];

/** Upload or replace a photo. The uploader confirms consent; it is recorded with the photo and in the audit log. */
export async function uploadPhotoAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("photo");
  const user = await currentUser();
  const rights = await photoRights(user, personId);
  if (!rights.manage) return { error: t(rights.minor ? "guardianOnly" : rights.reason === "self" ? "selfOnly" : "notAllowed") };
  if (fd.get("consent") !== "on") return { error: t("consentRequired") };
  const file = fd.get("photo");
  if (!(file instanceof File) || !file.size) return { error: t("choosePhoto") };
  if (file.size > MAX_BYTES) return { error: t("tooLarge") };
  const data = new Uint8Array(await file.arrayBuffer());
  // Trust the bytes, not the declared type
  const mime = MAGIC.find(([, sig]) => sig.every((b, i) => data[i] === b))?.[0];
  if (!mime) return { error: t("notImage") };
  const visible = fd.get("visible") === "on";
  await db.personPhoto.upsert({
    where: { personId },
    update: { data, mime, visible, uploadedById: user!.id, consentAt: new Date() },
    create: { personId, data, mime, visible, uploadedById: user!.id, consentAt: new Date() },
  });
  await audit(user, "upload-photo", "Person", personId, { visible, consent: rights.reason });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setPhotoVisibleAction(personId: string, visible: boolean) {
  const user = await currentUser();
  if (!(await photoRights(user, personId)).manage) return;
  await db.personPhoto.updateMany({ where: { personId }, data: { visible } });
  await audit(user, visible ? "show-photo" : "hide-photo", "Person", personId);
  revalidatePath("/", "layout");
}

export async function removePhotoAction(personId: string) {
  const user = await currentUser();
  if (!(await photoRights(user, personId)).remove) return;
  await db.personPhoto.deleteMany({ where: { personId } });
  await audit(user, "remove-photo", "Person", personId);
  revalidatePath("/", "layout");
}
