"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit, canView } from "@/lib/permissions";
import { isReviewer } from "@/lib/review";
import { str, type FormState } from "@/lib/forms";
import { hit, RULES } from "@/lib/ratelimit";
import { notify } from "@/lib/notify";
import { blockedMessage, checkInput, createReport, reportRef } from "@/lib/moderation";
import type { ReportReason } from "@/generated/prisma/client";

const REASONS: ReportReason[] = ["OFFENSIVE", "FAKE", "PRIVACY", "CHILD_SAFETY", "OTHER"];

/** "Report this record": any verified member, about any record they can see. */
export async function reportPersonAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const user = await currentUser();
  if (!canView(user)) return { error: t("moderation.notAllowed") };
  const reason = str(fd, "reason") as ReportReason | null;
  if (!reason || !REASONS.includes(reason)) return { error: t("moderation.chooseReason") };
  const note = str(fd, "note")?.slice(0, 1000) ?? null;
  // A report may quote what it is about: refuse only if the note itself is abusive
  const words = checkInput({ note });
  if (words.blocked.length) return { error: blockedMessage(t, words.blocked) };
  if (!(await db.person.findUnique({ where: { id: personId }, select: { id: true } }))) return { error: t("moderation.notAllowed") };
  const open = await db.report.findFirst({ where: { personId, reporterId: user!.id, status: "OPEN", source: "MEMBER" }, select: { id: true } });
  if (open) return { error: t("moderation.alreadyReported") };
  const limit = await hit(RULES.reportMember, user!.id);
  if (!limit.ok) return { error: t("moderation.tooMany") };
  const report = await createReport({ personId, source: "MEMBER", reason, note, reporterId: user!.id });
  await audit(user, "report", "Person", personId, { report: report.id, reason });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** A moderator closes a report: resolved (something was done) or dismissed (nothing wrong). */
export async function decideReportAction(reportId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const user = await currentUser();
  const report = await db.report.findUnique({ where: { id: reportId } });
  if (!user || !report || !(await isReviewer(user, report.personId))) return { error: t("moderation.notAllowed") };
  if (report.status !== "OPEN") return { error: t("moderation.alreadyDecided") };
  const decision = str(fd, "decision");
  if (decision !== "RESOLVED" && decision !== "DISMISSED") return { error: t("moderation.chooseDecision") };
  const resolution = str(fd, "resolution")?.slice(0, 1000) ?? null;
  if (!resolution) return { error: t("moderation.resolutionRequired") };
  await db.report.update({ where: { id: reportId }, data: { status: decision, resolution, resolvedById: user.id, resolvedAt: new Date() } });
  await audit(user, `report-${decision.toLowerCase()}`, "Person", report.personId, { report: reportId });
  // A member who reported it hears the outcome (the filter has no one to tell)
  await notify([report.reporterId], "REPORT_RESOLVED", { ref: reportRef(report.number), outcome: t(`moderation.status_${decision}`), resolution }, "/notifications", user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}
