import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { addGotrasAction, updateGotraAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";

export default async function GotrasPage({ params, searchParams }: PageProps<"/[locale]/admin/gotras">) {
  const { locale } = await params;
  const { q } = (await searchParams) as { q?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("admin");

  const search = q?.trim();
  const [gotras, total] = await Promise.all([
    db.gotra.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { nameTe: { contains: search } },
              { nameKn: { contains: search } },
              { nameTa: { contains: search } },
            ],
          }
        : {},
      include: { _count: { select: { persons: true } } },
      orderBy: { name: "asc" },
    }),
    db.gotra.count(),
  ]);
  const withLocal = gotras.filter((g) => g.nameTe || g.nameKn || g.nameTa).length;
  const cell = "min-w-0 rounded border border-line bg-background px-2 py-1";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2.5fr]">
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="mb-1 font-semibold">{t("addGotras")}</h2>
          <p className="mb-3 text-xs text-muted">{t("addGotrasHint")}</p>
          <ActionForm action={addGotrasAction} submit={t("add")}>
            <Textarea name="gotras" rows={6} />
          </ActionForm>
        </Card>
        <Card className="text-sm text-muted">{t("gotraSource")}</Card>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold">
              {t("gotras")} ({total})
            </h2>
            <p className="text-xs text-muted">{t("gotraLocalProgress", { done: withLocal, total: gotras.length })}</p>
          </div>
          <form className="flex items-end gap-2">
            <Field label={t("searchGotras")}>
              <Input name="q" defaultValue={search} />
            </Field>
            <Button variant="ghost">{t("filter")}</Button>
          </form>
        </div>
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
                  <td className="p-2 pl-4">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-xs text-muted">{t("gotraPeople", { count: g._count.persons })}</div>
                  </td>
                  <td colSpan={4} className="p-2">
                    <form action={updateGotraAction.bind(null, g.id)} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <input name="nameTe" defaultValue={g.nameTe ?? ""} className={cell} />
                      <input name="nameKn" defaultValue={g.nameKn ?? ""} className={cell} />
                      <input name="nameTa" defaultValue={g.nameTa ?? ""} className={cell} />
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
