import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { isReviewer } from "@/lib/review";
import { reportRef } from "@/lib/moderation";
import { fullName } from "@/lib/reference";
import { decideReportAction } from "@/app/actions/report";
import { ActionForm } from "@/components/ActionForm";
import { Segmented } from "@/components/Segmented";
import { Badge, Card, Textarea } from "@/components/ui";

/**
 * Reports for this administrator: those about people they may decide proposals for (the same
 * scope as reviews). Child-safety reports come first, then the oldest.
 */
export default async function ModerationPage({ params, searchParams }: PageProps<"/[locale]/admin/moderation">) {
  const { locale } = await params;
  const { show } = (await searchParams) as { show?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  const t = await getTranslations("moderation");
  const format = await getFormatter();
  const closed = show === "closed";

  const rows = await db.report.findMany({
    where: closed ? { status: { not: "OPEN" } } : { status: "OPEN" },
    orderBy: closed ? { resolvedAt: "desc" } : { createdAt: "asc" },
    take: 300,
    include: {
      person: { select: { id: true, givenName: true, surname: true } },
      reporter: { select: { name: true } },
      resolvedBy: { select: { name: true } },
    },
  });
  const mine = [];
  for (const r of rows) if (await isReviewer(user, r.personId)) mine.push(r);
  const ordered = closed ? mine : [...mine.filter((r) => r.reason === "CHILD_SAFETY"), ...mine.filter((r) => r.reason !== "CHILD_SAFETY")];

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        className="w-fit"
        items={[
          { href: "/admin/moderation", label: t("tabOpen"), active: !closed },
          { href: "/admin/moderation?show=closed", label: t("tabClosed"), active: closed },
        ]}
      />
      <p className="text-sm text-muted">{t("queueIntro")}</p>
      {!ordered.length && <p className="text-sm text-muted">{closed ? t("noneClosed") : t("noneOpen")}</p>}
      <ul className="flex flex-col gap-3">
        {ordered.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">{reportRef(r.number)}</span>
                <Badge tone={r.reason === "CHILD_SAFETY" ? "gold" : "brand"}>{t(`reason_${r.reason}`)}</Badge>
                <Badge tone="muted">{t(`source_${r.source}`)}</Badge>
                {closed && <Badge tone="muted">{t(`status_${r.status}`)}</Badge>}
                <span className="ml-auto text-xs text-muted">{format.dateTime(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <p>
                {t("about")}{" "}
                <Link href={`/person/${r.person.id}`} className="font-semibold text-brand hover:underline">
                  {fullName(r.person)}
                </Link>
                {" · "}
                <Link href={`/person/${r.person.id}/edit`} className="text-muted hover:text-brand">
                  {t("editRecord")}
                </Link>
              </p>
              {r.source === "FILTER" && (
                <p className="text-muted">{t("filterFound", { field: r.field ?? "", terms: r.terms.join(", ") })}</p>
              )}
              {r.note && <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3">{r.note}</p>}
              {r.reporter && <p className="text-xs text-muted">{t("reportedBy", { name: r.reporter.name })}</p>}
              {closed ? (
                <p className="text-muted">
                  {r.resolution} {r.resolvedBy && `— ${r.resolvedBy.name}`}
                </p>
              ) : (
                <ActionForm action={decideReportAction.bind(null, r.id)} submit={t("decide")} className="flex flex-col gap-2 border-t border-line pt-3">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="decision" value="RESOLVED" required className="accent-[var(--brand)]" />
                      {t("resolve")}
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="decision" value="DISMISSED" className="accent-[var(--brand)]" />
                      {t("dismiss")}
                    </label>
                  </div>
                  <Textarea name="resolution" required maxLength={1000} placeholder={t("resolutionPlaceholder")} />
                </ActionForm>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
