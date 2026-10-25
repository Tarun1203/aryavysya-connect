import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/guard";
import { districtOptions, fullName, gotraLabel, gotraOptions, lifeSpan } from "@/lib/reference";
import { Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";

type Search = { q?: string; gotra?: string; district?: string; place?: string };

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  const sp = (await searchParams) as Search;
  setRequestLocale(locale);
  await requireViewer(locale);
  const t = await getTranslations("search");
  const tp = await getTranslations("person");
  const [gotras, districts] = await Promise.all([gotraOptions(locale), districtOptions()]);

  const words = (sp.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const searched = words.length > 0 || !!sp.gotra || !!sp.district || !!sp.place;
  const people = searched
    ? await db.person.findMany({
        where: {
          AND: [
            ...words.map((w) => ({
              OR: [
                { givenName: { contains: w, mode: "insensitive" as const } },
                { surname: { contains: w, mode: "insensitive" as const } },
                { givenNameLocal: { contains: w } },
                { surnameLocal: { contains: w } },
              ],
            })),
            sp.gotra ? { gotraId: sp.gotra } : {},
            sp.district ? { districtId: sp.district } : {},
            sp.place ? { nativePlace: { contains: sp.place, mode: "insensitive" as const } } : {},
          ],
        },
        include: { gotra: true, district: true },
        orderBy: [{ surname: "asc" }, { givenName: "asc" }],
        take: 100,
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <Card>
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("query")}>
            <Input name="q" defaultValue={sp.q} />
          </Field>
          <Field label={tp("gotra")}>
            <Select name="gotra" defaultValue={sp.gotra ?? ""}>
              <option value="">{t("anyGotra")}</option>
              {gotras.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tp("district")}>
            <Select name="district" defaultValue={sp.district ?? ""}>
              <option value="">{t("anyDistrict")}</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("place")}>
            <Input name="place" defaultValue={sp.place} />
          </Field>
          <Button className="self-start">{t("submit")}</Button>
        </form>
      </Card>

      {searched && (
        <section>
          <p className="mb-3 text-sm text-muted">{t("results", { count: people.length })}</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/person/${p.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-brand">
                  <div className="font-semibold">{fullName(p)}</div>
                  {(p.givenNameLocal || p.surnameLocal) && <div>{[p.givenNameLocal, p.surnameLocal].filter(Boolean).join(" ")}</div>}
                  <div className="mt-1 text-xs text-muted">
                    {[lifeSpan(p), gotraLabel(p.gotra, locale), p.nativePlace, p.district?.name].filter(Boolean).join(" · ")}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
