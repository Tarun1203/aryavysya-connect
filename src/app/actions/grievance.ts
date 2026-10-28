"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { adminScope, audit } from "@/lib/permissions";
import { str, type FormState } from "@/lib/forms";
import { GRIEVANCE_DAYS } from "@/lib/legal";
import { hashIp } from "@/lib/otp";
import type { GrievanceKind, GrievanceStatus } from "@/generated/prisma/client";

const KINDS = ["ACCESS", "CORRECTION", "ERASURE", "CONSENT", "NOMINATION", "CHILD_SAFETY", "COMPLAINT", "OTHER"] as const;
export type GrievanceState = (FormState & { reference?: string }) | undefined;

/** A request or complaint to the Grievance Officer. Anyone may send one; 5 a day from one address. */
export async function sendGrievanceAction(_: GrievanceState, fd: FormData): Promise<GrievanceState> {
  const t = await getTranslations("legal");
  const kind = str(fd, "kind") as GrievanceKind | null;
  const name = str(fd, "name");
  const contact = str(fd, "contact");
  const message = str(fd, "message");
  if (!kind || !KINDS.includes(kind) || !name || !contact || !message) return { error: t("formRequired") };
  if (message.length > 5000) return { error: t("formTooLong") };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? "local";
  const ipHash = hashIp(ip);
  const today = await db.grievance.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 24 * 3600e3) } } });
  if (today >= 5) return { error: t("formTooMany") };
  const user = await currentUser();
  const g = await db.grievance.create({
    data: {
      kind,
      name,
      contact,
      message,
      aboutText: str(fd, "about"),
      userId: user?.id,
      ipHash,
      dueAt: new Date(Date.now() + GRIEVANCE_DAYS * 24 * 3600e3),
    },
  });
  return { ok: true, reference: `G-${String(g.number).padStart(6, "0")}` };
}

/** The Grievance Officer (a super administrator) records progress and the answer given. */
export async function respondGrievanceAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("legal");
  const user = await currentUser();
  if ((await adminScope(user))?.kind !== "all") return { error: t("notAllowed") };
  const status = str(fd, "status") as GrievanceStatus | null;
  if (!status || !["OPEN", "IN_PROGRESS", "RESOLVED"].includes(status)) return { error: t("formRequired") };
  const response = str(fd, "response");
  if (status === "RESOLVED" && !response) return { error: t("responseRequired") };
  await db.grievance.update({ where: { id }, data: { status, response, respondedById: user!.id, respondedAt: new Date() } });
  await audit(user, `grievance-${status.toLowerCase()}`, "Grievance", id);
  revalidatePath("/", "layout");
  return { ok: true };
}
