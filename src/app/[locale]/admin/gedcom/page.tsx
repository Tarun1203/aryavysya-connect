import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { districtOptions } from "@/lib/reference";
import { recentImports } from "@/lib/gedcom-db";
import { gedcomUndoAction } from "@/app/actions/gedcom";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card } from "@/components/ui";
import { GedcomImportForm } from "./GedcomImportForm";

/** GEDCOM import (super administrators): upload, check the preview, import; undo while untouched. */
export default async function GedcomPage({ params }: PageProps<"/[locale]/admin/gedcom">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("gedcom");
  const format = await getFormatter();
  const [districts, imports] = await Promise.all([districtOptions(), recentImports()]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">{t("importTitle")}</h2>
        <p className="text-sm text-muted">{t("importIntro")}</p>
        <GedcomImportForm districts={districts} />
      </Card>

      {imports.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold">{t("history")}</h2>
          <ul className="flex flex-col gap-2">
            {imports.map((i) => (
              <li key={i.batch}>
                <Card className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.fileName || "—"}</span>
                    <span className="text-muted">
                      {t("historyLine", { count: i.people, by: i.by, when: format.dateTime(i.at, { dateStyle: "medium", timeStyle: "short" }) })}
                    </span>
                    {i.undone && <Badge tone="muted">{t("undone")}</Badge>}
                  </span>
                  {!i.undone && (
                    <span className="flex items-center gap-3">
                      {i.firstId && <Link href={`/tree/${i.firstId}`}>{t("openTree")}</Link>}
                      <ActionForm action={gedcomUndoAction.bind(null, i.batch)} submit={t("undo")} variant="danger" className="flex items-center gap-2" />
                    </span>
                  )}
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t("undoHint")}</p>
        </section>
      )}
    </div>
  );
}
