import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { addDistrictAction, addGotrasAction, updateGotraAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Input, Textarea } from "@/components/ui";

export default async function SettingsPage({ params }: PageProps<"/[locale]/admin/settings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("admin");
  const gotras = await db.gotra.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="mb-3 font-semibold">{t("addGotras")}</h2>
          <ActionForm action={addGotrasAction} submit={t("add")}>
            <Textarea name="gotras" rows={6} />
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{t("addDistrict")}</h2>
          <ActionForm action={addDistrictAction} submit={t("add")}>
            <Field label={t("state")}>
              <Input name="state" required />
            </Field>
            <Field label={t("name")}>
              <Input name="name" required />
            </Field>
          </ActionForm>
        </Card>
      </div>

      <Card className="p-0">
        <h2 className="p-4 font-semibold">
          {t("gotras")} ({gotras.length})
        </h2>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-y border-line bg-surface text-left text-muted">
              <tr>
                <th className="p-2 pl-4">English</th>
                <th className="p-2">తెలుగు</th>
                <th className="p-2">ಕನ್ನಡ</th>
                <th className="p-2">தமிழ்</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {gotras.map((g) => (
                <tr key={g.id} className="border-b border-line last:border-0">
                  <td className="p-2 pl-4 font-medium">{g.name}</td>
                  <td colSpan={4} className="p-2">
                    <form action={updateGotraAction.bind(null, g.id)} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <input name="nameTe" defaultValue={g.nameTe ?? ""} className="min-w-0 rounded border border-line bg-background px-2 py-1" />
                      <input name="nameKn" defaultValue={g.nameKn ?? ""} className="min-w-0 rounded border border-line bg-background px-2 py-1" />
                      <input name="nameTa" defaultValue={g.nameTa ?? ""} className="min-w-0 rounded border border-line bg-background px-2 py-1" />
                      <button className="rounded border border-line px-2 text-xs hover:bg-brand-soft">{t("saveNames")}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
