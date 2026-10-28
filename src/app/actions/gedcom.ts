"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { adminScope } from "@/lib/permissions";
import { str, type FormState } from "@/lib/forms";
import { GedcomError } from "@/lib/gedcom";
import { MAX_GEDCOM_BYTES, previewImport, runImport, undoImport, type ImportPreview } from "@/lib/gedcom-db";

export type GedcomState = (FormState & { preview?: ImportPreview; imported?: { people: number; firstId: string } }) | undefined;

/** Super administrators only: an import adds a whole tree at once. */
async function importer() {
  const user = await currentUser();
  return user && (await adminScope(user))?.kind === "all" ? user : null;
}

/**
 * Upload a GEDCOM file. "preview" reads and checks it and says what would be added; "import"
 * (sent with the same file once the preview was read) saves it.
 */
export async function gedcomImportAction(_: GedcomState, fd: FormData): Promise<GedcomState> {
  const t = await getTranslations("gedcom");
  const user = await importer();
  if (!user) return { error: t("notAllowed") };
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: t("noFile") };
  if (file.size > MAX_GEDCOM_BYTES) return { error: t("tooLarge") };
  const districtId = str(fd, "districtId");
  if (districtId && !(await db.district.findUnique({ where: { id: districtId }, select: { id: true } }))) return { error: t("noFile") };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return { error: t("notUtf8") };
  }
  try {
    if (fd.get("intent") !== "import") return { preview: await previewImport(text, districtId) };
    const done = await runImport(user, text, districtId, file.name.slice(0, 120));
    revalidatePath("/", "layout");
    return { ok: true, imported: { people: done.people, firstId: done.firstId } };
  } catch (e) {
    // Problems with the file are worded for the person importing; anything else stays in the logs
    if (e instanceof GedcomError) return { error: e.message };
    console.error("GEDCOM import failed:", e instanceof Error ? e.message : e);
    return { error: t("failed") };
  }
}

export async function gedcomUndoAction(batch: string): Promise<FormState> {
  const t = await getTranslations("gedcom");
  const user = await importer();
  if (!user) return { error: t("notAllowed") };
  try {
    const r = await undoImport(user, batch);
    revalidatePath("/", "layout");
    return r.kept ? { error: t("undoPartial", { removed: r.removed, kept: r.kept }) } : { ok: true };
  } catch {
    return { error: t("failed") };
  }
}
