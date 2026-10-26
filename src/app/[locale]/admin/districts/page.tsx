import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { addDistrictAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Input, Select } from "@/components/ui";

export default async function DistrictsPage({ params }: PageProps<"/[locale]/admin/districts">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("admin");

  const [byState, withIncharge, official] = await Promise.all([
    db.district.groupBy({ by: ["state"], _count: { _all: true }, orderBy: { state: "asc" } }),
    db.district.groupBy({ by: ["state"], where: { inchargeId: { not: null } }, _count: { _all: true } }),
    db.district.groupBy({ by: ["state"], where: { lgdCode: { not: null } }, _count: { _all: true } }),
  ]);
  const count = (rows: { state: string; _count: { _all: number } }[], state: string) => rows.find((r) => r.state === state)?._count._all ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <Card>
        <h2 className="mb-1 font-semibold">{t("addDistrict")}</h2>
        <p className="mb-3 text-xs text-muted">{t("addDistrictHint")}</p>
        <ActionForm action={addDistrictAction} submit={t("add")}>
          <Field label={t("state")}>
            <Select name="state" required defaultValue="">
              <option value="">—</option>
              {byState.map((r) => (
                <option key={r.state}>{r.state}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("name")}>
            <Input name="name" required />
          </Field>
        </ActionForm>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="p-3">{t("state")}</th>
              <th className="p-3 text-right">{t("districtsCol")}</th>
              <th className="p-3 text-right">{t("officialCol")}</th>
              <th className="p-3 text-right">{t("inchargesCol")}</th>
            </tr>
          </thead>
          <tbody>
            {byState.map((r) => (
              <tr key={r.state} className="border-b border-line last:border-0">
                <td className="p-3">
                  <Link href={`/admin/incharges?state=${encodeURIComponent(r.state)}`} className="hover:text-brand">
                    {r.state}
                  </Link>
                </td>
                <td className="p-3 text-right">{r._count._all}</td>
                <td className="p-3 text-right">{count(official, r.state)}</td>
                <td className="p-3 text-right">{count(withIncharge, r.state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
