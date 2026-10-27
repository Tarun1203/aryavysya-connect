import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { addGotrasAction, createGotraAction, removeGotraAction, updateGotraAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { kulaLabels } from "@/lib/reference";

type KulaScripts = Record<string, { te?: string; kn?: string; ta?: string }>;
/** One kula per line for editing: "Arasakula | అరసకుల | ಅರಸಕುಲ | அரசகுல" */
const kulaLines = (g: { kulas: string[]; kulaNames: unknown }) => {
  const local = (g.kulaNames ?? {}) as KulaScripts;
  return g.kulas.map((k) => [k, local[k]?.te, local[k]?.kn, local[k]?.ta].filter(Boolean).join(" | ")).join("\n");
};

type GotraRow = { no: number | null; name: string; nameTe: string | null; nameKn: string | null; nameTa: string | null; kulas: string[]; kulaNames: unknown; localVerified: boolean };
const cell = "min-w-0 rounded border border-line bg-background px-2 py-1";

/** The add and edit forms share these fields: number, name, the three scripts and the kula lines. */
function gotraInputs(t: (key: string) => string, g?: GotraRow) {
  return (
    <>
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <label className="flex flex-col gap-1 text-xs">
          {t("gotraNo")}
          <input name="no" type="number" min={1} defaultValue={g?.no ?? ""} className={cell} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("gotraName")}
          <input name="name" required defaultValue={g?.name ?? ""} className={cell} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input name="nameTe" defaultValue={g?.nameTe ?? ""} placeholder="తెలుగు" className={cell} />
        <input name="nameKn" defaultValue={g?.nameKn ?? ""} placeholder="ಕನ್ನಡ" className={cell} />
        <input name="nameTa" defaultValue={g?.nameTa ?? ""} placeholder="தமிழ்" className={cell} />
      </div>
      <label className="flex flex-col gap-1 text-xs">
        {t("sankethanamam")}
        <textarea name="kulas" rows={g ? Math.min(8, Math.max(3, g.kulas.length)) : 3} defaultValue={g ? kulaLines(g) : ""} className={`${cell} font-mono text-xs`} />
        <span className="text-muted">{t("kulaLinesHint")}</span>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="localVerified" defaultChecked={g?.localVerified ?? false} className="accent-brand" />
        {t("scriptsVerified")}
      </label>
    </>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The gotras, kept in the database by the super admins, laid out like the community's printed list: No · Gothiram name · Sankethanamam. */
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
  // About a hundred rows, so matching kula names (in every script) in memory is simpler than an array search in SQL
  const search = q?.trim() ?? "";
  const key = norm(search);
  const scripts = (g: (typeof all)[number]) => Object.values((g.kulaNames ?? {}) as KulaScripts).flatMap((v) => [v.te, v.kn, v.ta]);
  const gotras = key
    ? all.filter((g) => [g.name, g.nameTe, g.nameKn, g.nameTa, ...g.kulas, ...scripts(g)].some((s) => s && norm(s).includes(key)))
    : all;
  const unverified = all.filter((g) => !g.localVerified).length;

  return (
    <div className="flex flex-col gap-6">
      <details className="rounded-xl border border-line bg-surface p-5 shadow-sm [&[open]>summary]:mb-4">
        <summary className="cursor-pointer select-none font-semibold text-brand">+ {t("addGotra")}</summary>
        <p className="mb-3 text-xs text-muted">{t("addGotraHint")}</p>
        <ActionForm action={createGotraAction} submit={t("add")} resetOnSave className="flex max-w-xl flex-col gap-3">
          {gotraInputs(t)}
        </ActionForm>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs text-brand">{t("addGotras")}</summary>
          <p className="my-2 text-xs text-muted">{t("addGotrasHint")}</p>
          <ActionForm action={addGotrasAction} submit={t("add")} resetOnSave>
            <Textarea name="gotras" rows={4} placeholder="Agasthyasa: Anubha Gula, Anubala" />
          </ActionForm>
        </details>
      </details>

      <Card className="p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold">
              {t("gotras")} ({all.length})
            </h2>
            <p className="text-xs text-muted">{t("gotraSource")}</p>
            {unverified > 0 && <p className="text-xs text-muted">{t("unverifiedCount", { count: unverified })}</p>}
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
                    {!g.localVerified && <div className="mt-1 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-xs">{t("scriptsUnverified")}</div>}
                  </td>
                  <td className="p-2">{kulaLabels(g, locale).join(", ") || "–"}</td>
                  <td className="p-2 text-right">
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs text-brand hover:underline">{t("edit")}</summary>
                      <div className="mt-2 flex w-72 flex-col gap-4 text-left sm:w-96">
                        <ActionForm action={updateGotraAction.bind(null, g.id)} submit={t("saveNames")} className="flex flex-col gap-2">
                          {gotraInputs(t, g)}
                        </ActionForm>
                        <ActionForm action={removeGotraAction.bind(null, g.id)} submit={t("removeGotra")} variant="danger" className="flex flex-col gap-2 border-t border-line pt-3">
                          <label className="flex flex-col gap-1 text-xs">
                            {t("mergeInto")}
                            <Select name="into" defaultValue="">
                              <option value="">{t("mergeNone")}</option>
                              {all.filter((o) => o.id !== g.id).map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.no ? `${o.no}. ` : ""}
                                  {o.name}
                                </option>
                              ))}
                            </Select>
                            <span className="text-muted">{t("mergeHint")}</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" name="confirm" required className="accent-brand" />
                            {t("removeConfirm")}
                          </label>
                        </ActionForm>
                      </div>
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
