import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { fullName, gotraOptions, memberCode, PERSON_STATES, stateWhere } from "@/lib/reference";
import { CreateTreeForm } from "@/components/CreateTreeForm";
import { Card } from "@/components/ui";

/** Super admin: start new family trees and see the ones started recently. */
export default async function TreesPage({ params }: PageProps<"/[locale]/admin/trees">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("trees");
  const tp = await getTranslations("person");

  const [gotras, counts, started] = await Promise.all([
    gotraOptions(locale),
    Promise.all(PERSON_STATES.map((s) => db.person.count({ where: stateWhere[s] }))),
    db.auditLog.findMany({ where: { action: "create-tree" }, orderBy: { createdAt: "desc" }, take: 15, include: { user: true } }),
  ]);
  const founders = await db.person.findMany({
    where: { id: { in: started.map((s) => s.entityId) } },
    include: { gotra: true, district: true },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("createTitle")}</h2>
          <p className="text-sm text-muted">{t("createHint")}</p>
        </div>
        <CreateTreeForm gotras={gotras} />
      </section>

      <aside className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-2 font-semibold">{t("people")}</h2>
          {/* Each count opens the list of those people */}
          <ul className="flex flex-col gap-1 text-sm">
            {PERSON_STATES.map((s, i) => (
              <li key={s}>
                <Link href={`/admin/trees/people?state=${s}`} className="flex justify-between rounded px-1 hover:bg-brand-soft">
                  <span className="text-muted">{tp(`state_${s}`)}</span>
                  <span className="font-medium text-brand">{counts[i]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/admin/trees/people" className="mt-2 inline-block text-sm text-brand hover:underline">
            {t("seeEveryone")} →
          </Link>
          <p className="mt-2 text-xs text-muted">{t("statesHint")}</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t("recent")}</h2>
          {started.length === 0 && <p className="text-sm text-muted">{t("noneYet")}</p>}
          <ul className="flex flex-col gap-2 text-sm">
            {started.map((s) => {
              const p = founders.find((f) => f.id === s.entityId);
              if (!p) return null;
              return (
                <li key={s.id}>
                  <Link href={`/tree/${p.id}`} className="font-medium hover:text-brand">
                    {fullName(p)}
                  </Link>{" "}
                  <span className="text-xs text-muted">{memberCode(p.memberNo)}</span>
                  <div className="text-xs text-muted">
                    {[p.gotra?.name, p.district?.name, s.createdAt.toLocaleDateString(locale)].filter(Boolean).join(" · ")}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="text-xs text-muted">{t("rulesNote")}</Card>
      </aside>
    </div>
  );
}
