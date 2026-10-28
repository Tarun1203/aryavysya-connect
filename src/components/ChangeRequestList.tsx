import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { fullName, gotraLabel } from "@/lib/reference";
import { canReview, conflicts, type Changes } from "@/lib/review";
import { reviewAction, withdrawRequestAction } from "@/app/actions/review";
import { ActionForm } from "./ActionForm";
import { Badge, Textarea } from "./ui";

/** Labels for the person fields, by the translation key in "person" */
const FIELD_LABEL: Record<string, string> = {
  birthGotraId: "birthGotra",
  maternalGotraId: "maternalGotra",
  districtId: "district",
  nativeLocalityId: "nativePlace",
  birthLocalityId: "birthPlace",
};

export const requestInclude = {
  person: { select: { id: true, givenName: true, surname: true } },
  proposedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { name: true } },
} as const;

type Request = Awaited<ReturnType<typeof db.changeRequest.findMany<{ include: typeof requestInclude }>>>[number];

/** Proposals, unlink requests and disputes, with what this viewer may do about each. */
export async function ChangeRequestList({ requests, user, showPerson = false }: { requests: Request[]; user: SessionUser; showPerson?: boolean }) {
  if (!requests.length) return null;
  const t = await getTranslations("review");
  const tp = await getTranslations("person");
  const format = await getFormatter();
  const locale = await getLocale();

  // Turn ids in the changes into names
  const values = requests.flatMap((r) => Object.values((r.changes ?? {}) as Changes).flatMap((c) => [c.from, c.to])).filter((v): v is string => typeof v === "string");
  const linkIds = requests.map((r) => r.linkId).filter((x): x is string => !!x);
  const [gotras, districts, localities, parentLinks, couples] = await Promise.all([
    db.gotra.findMany({ where: { id: { in: values } } }),
    db.district.findMany({ where: { id: { in: values } }, select: { id: true, name: true, state: true } }),
    db.locality.findMany({ where: { id: { in: values } }, select: { id: true, name: true } }),
    db.parentChild.findMany({ where: { id: { in: linkIds } }, include: { parent: { select: { givenName: true, surname: true } }, child: { select: { givenName: true, surname: true } } } }),
    db.couple.findMany({ where: { id: { in: linkIds } }, include: { person1: { select: { givenName: true, surname: true } }, person2: { select: { givenName: true, surname: true } } } }),
  ]);
  const show = (field: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? t("yes") : t("no");
    if (Array.isArray(v)) return v.join(", ") || "—";
    if (field.endsWith("GotraId")) return gotraLabel(gotras.find((g) => g.id === v) ?? null, locale) ?? String(v);
    if (field === "districtId") {
      const d = districts.find((x) => x.id === v);
      return d ? `${d.name}, ${d.state}` : String(v);
    }
    if (field.endsWith("LocalityId")) return localities.find((x) => x.id === v)?.name ?? String(v);
    if (field === "gender") return tp(String(v).toLowerCase());
    return String(v);
  };
  const subject = (r: Request) => {
    const l = parentLinks.find((x) => x.id === r.linkId);
    if (l) return t("subjectParent", { parent: fullName(l.parent), child: fullName(l.child) });
    const c = couples.find((x) => x.id === r.linkId);
    if (c) return t("subjectMarriage", { a: fullName(c.person1), b: fullName(c.person2) });
    return r.linkId ? t("subjectGone") : null;
  };

  const rows = await Promise.all(
    requests.map(async (r) => ({ r, review: r.status === "PENDING" && (await canReview(user, r)), clash: r.kind === "EDIT" && r.status === "PENDING" ? await conflicts(r) : [] })),
  );
  const tone = { PENDING: "gold", APPROVED: "brand", REJECTED: "muted", WITHDRAWN: "muted" } as const;

  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ r, review, clash }) => (
        <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-line p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={r.kind === "DISPUTE" ? "gold" : "brand"}>{t(`kind_${r.kind}`)}</Badge>
            <Badge tone={tone[r.status]}>{t(`status_${r.status}`)}</Badge>
            {showPerson && (
              <Link href={`/person/${r.person.id}`} className="font-semibold hover:text-brand">
                {fullName(r.person)}
              </Link>
            )}
            <span className="ml-auto text-xs text-muted">
              {t("by", { name: r.proposedBy?.name ?? "—", date: format.dateTime(r.createdAt, { dateStyle: "medium" }) })}
            </span>
          </div>
          {subject(r) && <div className="text-muted">{subject(r)}</div>}
          {r.reason !== "-" && (
            <p>
              <span className="text-muted">{t("reason")}: </span>
              {r.reason}
            </p>
          )}
          {r.kind === "EDIT" && (
            <table className="w-full text-xs">
              <tbody>
                {Object.entries((r.changes ?? {}) as Changes).map(([field, c]) => (
                  <tr key={field} className="border-t border-line">
                    <td className="py-1 pr-3 text-muted">{tp(FIELD_LABEL[field] ?? field)}</td>
                    <td className="py-1 pr-2 line-through decoration-bad/50">{show(field, c.from)}</td>
                    <td className="py-1 font-medium">→ {show(field, c.to)}</td>
                    {clash.includes(field) && <td className="py-1 pl-2 text-warn">{t("changedSince")}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {r.correction && (
            <p>
              <span className="text-muted">{t("correction")}: </span>
              {r.correction}
            </p>
          )}
          {r.evidence && (
            <p>
              <span className="text-muted">{t("evidence")}: </span>
              {r.evidence}
            </p>
          )}
          {r.status !== "PENDING" && r.reviewedBy && (
            <p className="text-xs text-muted">
              {t("decidedBy", { name: r.reviewedBy.name, date: r.reviewedAt ? format.dateTime(r.reviewedAt, { dateStyle: "medium" }) : "" })}
              {r.reviewNote ? ` — ${r.reviewNote}` : ""}
            </p>
          )}
          {review && r.proposedById !== user.id && (
            <ActionForm action={reviewAction.bind(null, r.id)} submit={t("decide")} className="mt-1 flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="approve" required className="accent-brand" />
                  {t(r.kind === "DISPUTE" ? "uphold" : "approve")}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="reject" className="accent-brand" />
                  {t("reject")}
                </label>
              </div>
              {r.kind === "DISPUTE" && r.linkId && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="removeLink" className="accent-brand" />
                  {t("removeDisputedLink")}
                </label>
              )}
              <Textarea name="note" placeholder={t("notePlaceholder")} />
            </ActionForm>
          )}
          {r.status === "PENDING" && r.proposedById === user.id && (
            <form action={withdrawRequestAction.bind(null, r.id)}>
              <button className="text-xs text-muted hover:text-bad">{t("withdraw")}</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
