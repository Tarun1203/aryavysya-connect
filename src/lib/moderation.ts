import "server-only";
import { db } from "@/lib/db";
import { changeDeciders, notify } from "@/lib/notify";
import { scanFields, type FieldScan } from "@/lib/moderation-core";
import type { ReportReason } from "@/generated/prisma/client";

/**
 * Moderation: the local language filter on what members type (src/lib/moderation-core.ts), and
 * reports – from the filter or from members – queued for the administrators over the person
 * (the same people who decide proposals about them). Nothing leaves our server.
 */

/** Fields of a person that hold names: checked for clearly abusive words only. */
export const NAME_FIELDS = ["givenName", "surname", "givenNameLocal", "surnameLocal", "aliases", "fatherName", "motherName", "name"];

/** The free-text fields of the person form (ids, dates and choices from lists are not checked). */
const PERSON_TEXT = ["givenName", "surname", "givenNameLocal", "surnameLocal", "aliases", "birthPlace", "deathTithi", "nativePlace", "kuladevata", "occupation", "currentCity", "notes"] as const;
export const personText = (data: Record<string, unknown>) =>
  Object.fromEntries(PERSON_TEXT.map((k) => [k, data[k] as string | string[] | null | undefined]));

/** Check typed fields. `blocked` lists the fields to send back; `review` is filed after saving. */
export function checkInput(fields: Record<string, string | string[] | null | undefined>) {
  const { block, review } = scanFields(fields, NAME_FIELDS);
  return { blocked: block.map((f) => f.field), review };
}

/** The message for refused input, naming the fields with the person form's own labels. */
export function blockedMessage(t: { (key: string, values?: Record<string, string>): string; has: (key: string) => boolean }, fields: string[]) {
  const labels = fields.map((f) => (t.has(`person.${f}`) ? t(`person.${f}`) : t.has(`moderation.field_${f}`) ? t(`moderation.field_${f}`) : f));
  return t("moderation.blocked", { fields: labels.join(", ") });
}

/** File the filter's for-review findings about a person, once per field while one is open. */
export async function fileFilterReports(personId: string, review: FieldScan[], actorId: string | null) {
  for (const f of review) {
    const open = await db.report.findFirst({ where: { personId, source: "FILTER", field: f.field, status: "OPEN" }, select: { id: true } });
    if (open) {
      await db.report.update({ where: { id: open.id }, data: { terms: f.terms } });
      continue;
    }
    await createReport({ personId, source: "FILTER", reason: "OFFENSIVE", field: f.field, terms: f.terms, reporterId: actorId });
  }
}

export async function createReport(r: { personId: string; source: "MEMBER" | "FILTER"; reason: ReportReason; field?: string; terms?: string[]; note?: string | null; reporterId: string | null }) {
  const report = await db.report.create({
    data: { personId: r.personId, source: r.source, reason: r.reason, field: r.field, terms: r.terms ?? [], note: r.note ?? null, reporterId: r.reporterId },
  });
  const person = await db.person.findUnique({ where: { id: r.personId }, select: { givenName: true, surname: true } });
  // The moderators of this person hear about it (the reporter is never told who they are)
  await notify(await changeDeciders(r.personId, "REPORT"), "REPORT_FILED", { name: person ? `${person.givenName} ${person.surname}` : "", ref: reportRef(report.number) }, "/admin/moderation", r.reporterId);
  return report;
}

export const reportRef = (n: number) => `R-${String(n).padStart(6, "0")}`;
