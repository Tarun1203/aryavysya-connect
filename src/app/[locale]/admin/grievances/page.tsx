import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { respondGrievanceAction } from "@/app/actions/grievance";
import { ActionForm } from "@/components/ActionForm";
import { Segmented } from "@/components/Segmented";
import { Badge, Card, Select, Textarea } from "@/components/ui";

/** Whether a due date has passed (read at request time, on the server) */
const isPast = (d: Date) => d.getTime() < Date.now();

/** The Grievance Officer's list (super administrators): open requests first, oldest due date first. */
export default async function GrievancesPage({ params, searchParams }: PageProps<"/[locale]/admin/grievances">) {
  const { locale } = await params;
  const { show } = (await searchParams) as { show?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("legal");
  const format = await getFormatter();
  const resolved = show === "resolved";

  const rows = await db.grievance.findMany({
    where: resolved ? { status: "RESOLVED" } : { status: { not: "RESOLVED" } },
    // Child-safety reports first, then by due date
    orderBy: resolved ? [{ respondedAt: "desc" }] : [{ dueAt: "asc" }],
    take: 200,
  });
  const open = resolved ? rows : [...rows.filter((r) => r.kind === "CHILD_SAFETY"), ...rows.filter((r) => r.kind !== "CHILD_SAFETY")];

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        className="w-fit"
        items={[
          { href: "/admin/grievances", label: t("tabOpen"), active: !resolved },
          { href: "/admin/grievances?show=resolved", label: t("tabResolved"), active: resolved },
        ]}
      />
      {!open.length && <p className="text-sm text-muted">{t("noneOpen")}</p>}
      <ul className="flex flex-col gap-3">
        {open.map((g) => {
          const overdue = g.status !== "RESOLVED" && isPast(g.dueAt);
          return (
            <li key={g.id}>
              <Card className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">G-{String(g.number).padStart(6, "0")}</span>
                  <Badge tone={g.kind === "CHILD_SAFETY" ? "gold" : "brand"}>{t(`kind_${g.kind}`)}</Badge>
                  <Badge tone="muted">{t(`status_${g.status}`)}</Badge>
                  {overdue && <Badge tone="gold">{t("overdue")}</Badge>}
                  <span className="ml-auto text-xs text-muted">
                    {format.dateTime(g.createdAt, { dateStyle: "medium" })} · {t("due", { date: format.dateTime(g.dueAt, { dateStyle: "medium" }) })}
                  </span>
                </div>
                <div>
                  <strong>{g.name}</strong> · {g.contact}
                  {g.userId && <span className="text-muted"> · {t("signedIn")}</span>}
                </div>
                {g.aboutText && <div className="text-muted">{g.aboutText}</div>}
                <p className="whitespace-pre-wrap">{g.message}</p>
                {g.response && <p className="rounded-lg bg-surface-2 p-2 text-muted">{g.response}</p>}
                <ActionForm action={respondGrievanceAction.bind(null, g.id)} submit={t("save")} className="flex flex-col gap-2 border-t border-line pt-2">
                  <Select name="status" defaultValue={g.status}>
                    {(["OPEN", "IN_PROGRESS", "RESOLVED"] as const).map((s) => (
                      <option key={s} value={s}>
                        {t(`status_${s}`)}
                      </option>
                    ))}
                  </Select>
                  <Textarea name="response" defaultValue={g.response ?? ""} placeholder={t("responsePlaceholder")} />
                </ActionForm>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
