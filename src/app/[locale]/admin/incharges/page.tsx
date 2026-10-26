import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { assignInchargeAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

/** One state at a time: with the full LGD directory there are ~750 districts. */
export default async function InchargesPage({ params, searchParams }: PageProps<"/[locale]/admin/incharges">) {
  const { locale } = await params;
  const sp = (await searchParams) as { state?: string; q?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  const scope = await adminScope(user);
  if (!scope || scope.kind === "local") redirect({ href: "/admin", locale });
  const s = scope!;
  const t = await getTranslations("admin");

  const stateCounts =
    s.kind === "all"
      ? await db.district.groupBy({ by: ["state"], _count: { _all: true }, orderBy: { state: "asc" } })
      : [];
  const state = s.kind === "all" ? sp.state : s.kind === "local" ? undefined : s.state;
  const q = sp.q?.trim();
  const canAssign = s.kind === "all" || s.kind === "state";

  const districts = state
    ? await db.district.findMany({
        where: {
          state,
          ...(s.kind === "district" ? { id: s.districtId } : {}),
          ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
        },
        include: { incharge: true, _count: { select: { users: true, organizations: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  const filled = districts.filter((d) => d.incharge).length;

  return (
    <div className="flex flex-col gap-6">
      {s.kind === "all" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("chooseState")}</h2>
          <div className="flex flex-wrap gap-2">
            {stateCounts.map((r) => (
              <Link
                key={r.state}
                href={`/admin/incharges?state=${encodeURIComponent(r.state)}`}
                className={`rounded-full border px-3 py-1 text-sm ${
                  r.state === state ? "border-brand bg-brand text-white" : "border-line hover:border-brand hover:text-brand"
                }`}
              >
                {r.state} <span className="opacity-70">({r._count._all})</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {!state && <Notice>{t("pickStateFirst")}</Notice>}

      {state && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{state}</h2>
              <p className="text-sm text-muted">{t("inchargeProgress", { filled, total: districts.length })}</p>
            </div>
            <form className="flex items-end gap-2">
              {s.kind === "all" && <input type="hidden" name="state" value={state} />}
              <Field label={t("searchDistricts")}>
                <Input name="q" defaultValue={q} />
              </Field>
              <Button variant="ghost">{t("filter")}</Button>
            </form>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-muted">
                <tr>
                  <th className="p-3">{t("districtCol")}</th>
                  <th className="p-3">{t("incharge")}</th>
                  {canAssign && <th className="p-3">{t("assign")}</th>}
                </tr>
              </thead>
              <tbody>
                {districts.map((d) => (
                  <tr key={d.id} className="border-b border-line align-top last:border-0">
                    <td className="p-3">
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-muted">
                        {t("districtStats", { members: d._count.users, bodies: d._count.organizations })}
                      </div>
                    </td>
                    <td className="p-3">
                      {d.incharge ? (
                        <>
                          <div className="font-medium">{d.incharge.name}</div>
                          <div className="text-xs text-muted">{d.incharge.email}</div>
                        </>
                      ) : (
                        <span className="text-muted">{t("noIncharge")}</span>
                      )}
                    </td>
                    {canAssign && (
                      <td className="p-3">
                        <ActionForm action={assignInchargeAction.bind(null, d.id)} submit={t("assign")} variant="ghost" className="flex flex-wrap items-start gap-2">
                          <Input name="email" type="email" placeholder={t("emailOfMember")} required />
                        </ActionForm>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
