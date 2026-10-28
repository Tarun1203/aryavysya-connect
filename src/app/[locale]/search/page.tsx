import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/guard";
import { fullName, gotraLabel, gotraOptions, lifeSpan } from "@/lib/reference";
import { pickerDefaults } from "@/lib/locations/resolve";
import { LocationPicker } from "@/components/LocationPicker";
import { GotraSelect } from "@/components/GotraSelect";
import { Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { privateIds, privateViewer } from "@/lib/consent";

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
  const user = await requireViewer(locale);
  const t = await getTranslations("search");
  const tp = await getTranslations("person");
  const [gotras, saved] = await Promise.all([gotraOptions(locale), pickerDefaults(sp.localityId, sp.districtId)]);
  const placeDefaults = { ...saved, state: saved.state ?? sp.state, talukId: saved.talukId ?? sp.talukId };

  const words = (sp.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const searched =
    words.length > 0 || !!sp.gotra || !!sp.place || !!sp.state || !!sp.districtId || !!sp.talukId || !!sp.localityId || (sp.pin?.length ?? 0) === 6;
  const found = searched
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

  // Private people (minors without guardian consent, withdrawn consent) are found only by their family
  const [hidden, sees] = await Promise.all([privateIds(found), privateViewer(user)]);
  const people = found.filter((p) => !hidden.has(p.id) || sees(p.id));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle eyebrow={t("eyebrow")}>{t("title")}</PageTitle>
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

      {!searched && (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-muted">
          <Image src="/icons/3d/zoom.png" alt="" width={120} height={120} className="animate-float drop-shadow-xl" />
          <p className="max-w-md">{t("start")}</p>
        </div>
      )}

      {searched && (
        <section>
          <p className="mb-3 text-sm text-muted">{t("results", { count: people.length })}</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/person/${p.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand/40">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-full border-2 bg-surface-2 ${p.gender === "FEMALE" ? "border-gold/70" : "border-brand/40"}`}>
                    <Image src={`/icons/3d/${p.gender === "FEMALE" ? "girl" : "boy"}.png`} alt="" width={40} height={40} className="size-9 transition group-hover:scale-110" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold group-hover:text-brand">{fullName(p)}</span>
                    {(p.givenNameLocal || p.surnameLocal) && <span className="block text-sm">{[p.givenNameLocal, p.surnameLocal].filter(Boolean).join(" ")}</span>}
                    <span className="mt-0.5 block text-xs text-muted">
                      {[lifeSpan(p), gotraLabel(p.gotra, locale), p.nativeLocality?.name ?? p.nativePlace, p.district?.name, p.nativeLocality?.pincode].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
