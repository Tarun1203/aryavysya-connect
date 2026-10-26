import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { addGotrasAction, updateGotraAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The 102 gotras laid out like the community's printed list: No · Gothiram name · Sankethanamam. */
export default async function GotrasPage({ params, searchParams }: PageProps<"/[locale]/admin/gotras">) {
  const { locale } = await params;
  const { q } = (await searchParams) as { q?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("admin");

  const all = await db.gotra.findMany({
    include: { _count: { select: { persons: true } } },
    orderBy: [{ no: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
  // Only 102 rows, so matching kula names in memory is simpler than an array search in SQL
  const search = q?.trim() ?? "";
  const key = norm(search);
  const gotras = key ? all.filter((g) => [g.name, g.nameTe, g.nameKn, g.nameTa, ...g.kulas].some((s) => s && norm(s).includes(key))) : all;
  const cell = "min-w-0 rounded border border-line bg-background px-2 py-1";

  return (
    <div className="flex flex-col gap-6">
      <details className="rounded-xl border border-line bg-surface p-5 shadow-sm [&[open]>summary]:mb-4">
        <summary className="cursor-pointer select-none font-semibold text-brand">+ {t("addGotras")}</summary>
        <p className="mb-3 text-xs text-muted">{t("addGotrasHint")}</p>
        <ActionForm action={addGotrasAction} submit={t("add")}>
          <Textarea name="gotras" rows={4} placeholder="Agasthyasa: Anubha Gula, Anubala" />
        </ActionForm>
      </details>

      <Card className="p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold">
              {t("gotras")} ({all.length})
            </h2>
            <p className="text-xs text-muted">{t("gotraSource")}</p>
          </div>
          <form className="flex items-end gap-2">
            <Field label={t("searchGotras")}>
              <Input name="q" defaultValue={search} />
            </Field>
            <Button variant="ghost">{t("filter")}</Button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-line bg-brand-soft text-left">
              <tr>
                <th className="w-12 p-2 pl-4">{t("gotraNo")}</th>
                <th className="p-2">{t("gotraName")}</th>
                <th className="p-2">{t("sankethanamam")}</th>
                <th className="w-24 p-2" />
              </tr>
            </thead>
            <tbody>
              {gotras.map((g) => (
                <tr key={g.id} className="border-b border-line align-top last:border-0">
                  <td className="p-2 pl-4 text-muted">{g.no ?? "–"}</td>
                  <td className="p-2">
                    <div className="font-semibold uppercase">{g.name}</div>
                    {[g.nameTe, g.nameKn, g.nameTa].some(Boolean) && (
                      <div className="text-xs">{[g.nameTe, g.nameKn, g.nameTa].filter(Boolean).join(" · ")}</div>
                    )}
                    <div className="text-xs text-muted">{t("gotraPeople", { count: g._count.persons })}</div>
                  </td>
                  <td className="p-2 uppercase">{g.kulas.join(", ") || "–"}</td>
                  <td className="p-2 text-right">
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs text-brand hover:underline">{t("edit")}</summary>
                      <form action={updateGotraAction.bind(null, g.id)} className="mt-2 flex w-72 flex-col gap-2 text-left sm:w-96">
                        <label className="flex flex-col gap-1 text-xs">
                          {t("sankethanamam")}
                          <textarea name="kulas" rows={3} defaultValue={g.kulas.join(", ")} className={cell} />
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <input name="nameTe" defaultValue={g.nameTe ?? ""} placeholder="తెలుగు" className={cell} />
                          <input name="nameKn" defaultValue={g.nameKn ?? ""} placeholder="ಕನ್ನಡ" className={cell} />
                          <input name="nameTa" defaultValue={g.nameTa ?? ""} placeholder="தமிழ்" className={cell} />
                        </div>
                        <button className="self-end rounded border border-line px-3 py-1 text-xs hover:bg-brand-soft">{t("saveNames")}</button>
                      </form>
                    </details>
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
