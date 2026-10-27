import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { fullName, gotraLabel, memberCode, PERSON_STATES, personState, stateWhere, type PersonState } from "@/lib/reference";
import { Button, Card, Field, Input } from "@/components/ui";

const PAGE = 50;

/** Super admin: the people behind the counts – registered, kept by family, passed away – as a searchable list. */
export default async function TreePeoplePage({ params, searchParams }: PageProps<"/[locale]/admin/trees/people">) {
  const { locale } = await params;
  const sp = (await searchParams) as { state?: string; q?: string; page?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("trees");
  const tp = await getTranslations("person");

  const state = (PERSON_STATES as readonly string[]).includes(sp.state ?? "") ? (sp.state as Exclude<PersonState, "MERGED">) : undefined;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const where = {
    ...(state ? stateWhere[state] : { status: { not: "MERGED" as const } }),
    AND: words.map((w) => ({
      OR: [
        { givenName: { contains: w, mode: "insensitive" as const } },
        { surname: { contains: w, mode: "insensitive" as const } },
        { givenNameLocal: { contains: w } },
        { surnameLocal: { contains: w } },
        ...(/^\d+$/.test(w.replace(/^avc-?/i, "")) ? [{ memberNo: Number(w.replace(/^avc-?/i, "")) }] : []),
      ],
    })),
  };
  const [people, total, counts] = await Promise.all([
    db.person.findMany({
      where,
      include: { gotra: true, district: true },
      orderBy: [{ surname: "asc" }, { givenName: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    db.person.count({ where }),
    Promise.all(PERSON_STATES.map((s) => db.person.count({ where: stateWhere[s] }))),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (over: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams(Object.entries({ state, q: q || undefined, ...over }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    return `/admin/trees/people${qs.size ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-sm ${active ? "border-brand bg-brand text-white" : "border-line hover:border-brand hover:text-brand"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/trees" className="text-sm text-brand hover:underline">
          ← {t("backToTrees")}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={link({ state: undefined, page: undefined })} className={chip(!state)}>
          {t("everyone")} ({counts.reduce((a, b) => a + b, 0)})
        </Link>
        {PERSON_STATES.map((s, i) => (
          <Link key={s} href={link({ state: s, page: undefined })} className={chip(state === s)}>
            {tp(`state_${s}`)} ({counts[i]})
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap items-end gap-2">
        {state && <input type="hidden" name="state" value={state} />}
        <Field label={t("searchPeople")}>
          <Input name="q" defaultValue={q} placeholder="Srinivas · AVC-000007" />
        </Field>
        <Button variant="ghost">{t("search")}</Button>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-brand-soft text-left">
            <tr>
              <th className="p-2 pl-4">{t("colCode")}</th>
              <th className="p-2">{t("colName")}</th>
              <th className="p-2">{tp("ownGotra")}</th>
              <th className="p-2">{tp("district")}</th>
              <th className="p-2">{t("colLife")}</th>
              <th className="p-2">{t("colState")}</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="p-2 pl-4 font-mono text-xs text-muted">{memberCode(p.memberNo)}</td>
                <td className="p-2">
                  <Link href={`/person/${p.id}`} className="font-medium hover:text-brand">
                    {fullName(p)}
                  </Link>
                  {(p.givenNameLocal || p.surnameLocal) && <div className="text-xs text-muted">{[p.givenNameLocal, p.surnameLocal].filter(Boolean).join(" ")}</div>}
                </td>
                <td className="p-2">{gotraLabel(p.gotra, locale) ?? "–"}</td>
                <td className="p-2">{p.district ? `${p.district.name}, ${p.district.state}` : "–"}</td>
                <td className="p-2 whitespace-nowrap">{[p.birthDate?.slice(0, 4) ?? "?", p.isLiving ? "" : p.deathDate?.slice(0, 4) ?? "?"].filter(Boolean).join(" – ")}</td>
                <td className="p-2">
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs">{tp(`state_${personState(p)}`)}</span>
                </td>
                <td className="p-2 text-right">
                  <Link href={`/tree/${p.id}`} className="text-xs text-brand hover:underline">
                    {t("openTree")}
                  </Link>
                </td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted">
                  {t("noPeople")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={link({ page: page - 1 })} className="text-brand hover:underline">← {t("prev")}</Link>}
          <span className="text-muted">{t("pageOf", { page, pages, total })}</span>
          {page < pages && <Link href={link({ page: page + 1 })} className="text-brand hover:underline">{t("next")} →</Link>}
        </div>
      )}
    </div>
  );
}
