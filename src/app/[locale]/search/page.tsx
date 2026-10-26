import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/guard";
import { fullName, gotraLabel, gotraOptions, lifeSpan } from "@/lib/reference";
import { pickerDefaults } from "@/lib/locations/resolve";
import { LocationPicker } from "@/components/LocationPicker";
import { GotraSelect } from "@/components/GotraSelect";
import { Button, Card, Field, Input, PageTitle } from "@/components/ui";

type Search = {
  q?: string;
  gotra?: string;
  place?: string;
  state?: string;
  districtId?: string;
  talukId?: string;
  localityId?: string;
  pin?: string;
};

/** People linked to a place through their native place, birth place or (for districts) their district. */
function placeFilters(sp: Search) {
  const viaPlaces = (where: object) => ({ OR: [{ nativeLocality: where }, { birthLocality: where }] });
  const pin = sp.pin?.replace(/\D/g, "");
  return [
    sp.localityId ? { OR: [{ nativeLocalityId: sp.localityId }, { birthLocalityId: sp.localityId }] } : {},
    sp.talukId && !sp.localityId ? viaPlaces({ talukId: sp.talukId }) : {},
    sp.districtId && !sp.talukId && !sp.localityId ? { OR: [{ districtId: sp.districtId }, viaPlaces({ districtId: sp.districtId })] } : {},
    sp.state && !sp.districtId ? { OR: [{ district: { state: sp.state } }, viaPlaces({ district: { state: sp.state } })] } : {},
    pin && pin.length === 6 && !sp.localityId ? viaPlaces({ pincode: pin }) : {},
  ];
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  const sp = (await searchParams) as Search;
  setRequestLocale(locale);
  await requireViewer(locale);
  const t = await getTranslations("search");
  const tp = await getTranslations("person");
  const [gotras, saved] = await Promise.all([gotraOptions(locale), pickerDefaults(sp.localityId, sp.districtId)]);
  const placeDefaults = { ...saved, state: saved.state ?? sp.state, talukId: saved.talukId ?? sp.talukId };

  const words = (sp.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const searched =
    words.length > 0 || !!sp.gotra || !!sp.place || !!sp.state || !!sp.districtId || !!sp.talukId || !!sp.localityId || (sp.pin?.length ?? 0) === 6;
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
            sp.gotra ? { OR: [{ gotraId: sp.gotra }, { birthGotraId: sp.gotra }] } : {},
            ...placeFilters(sp),
            sp.place ? { nativePlace: { contains: sp.place, mode: "insensitive" as const } } : {},
          ],
        },
        include: { gotra: true, district: true, nativeLocality: true },
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
            <GotraSelect name="gotra" gotras={gotras} defaultValue={sp.gotra} emptyLabel={t("anyGotra")} />
          </Field>
          <Field label={t("place")}>
            <Input name="place" defaultValue={sp.place} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <LocationPicker defaults={placeDefaults} pinName="pin" defaultPin={sp.pin} />
          </div>
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
                    {[lifeSpan(p), gotraLabel(p.gotra, locale), p.nativeLocality?.name ?? p.nativePlace, p.district?.name, p.nativeLocality?.pincode].filter(Boolean).join(" · ")}
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
