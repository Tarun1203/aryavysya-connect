import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { requireViewer } from "@/lib/guard";
import { canAddRelative, type Relation } from "@/lib/permissions";
import { getFamily } from "@/lib/tree";
import { districtOptions, fullName, gotraOptions } from "@/lib/reference";
import { addRelativeAction, linkExistingAction } from "@/app/actions/person";
import { PersonForm, type PersonDefaults } from "@/components/PersonForm";
import { LinkExistingForm } from "@/components/LinkExistingForm";
import { Card, Notice, PageTitle } from "@/components/ui";

const RELATIONS: Relation[] = ["parent", "child", "spouse"];

export default async function AddRelativePage({ params }: PageProps<"/[locale]/person/[id]/add/[relation]">) {
  const { locale, id, relation: rel } = await params;
  setRequestLocale(locale);
  const relation = rel as Relation;
  if (!RELATIONS.includes(relation)) notFound();
  const user = await requireViewer(locale);
  const family = await getFamily(id);
  if (!family) notFound();
  const { person, spouses } = family;
  if (!(await canAddRelative(user, id, relation, spouses[0]?.person.id))) redirect({ href: `/person/${id}`, locale });

  const t = await getTranslations("person");
  const tm = await getTranslations("match");
  const [gotras, districts] = await Promise.all([gotraOptions(locale), districtOptions()]);
  const title = { parent: t("addParent"), child: t("addChild"), spouse: t("addSpouse") }[relation];

  // Sensible defaults: a child inherits the father's intiperu and gotra
  const father = relation === "child" ? (person.gender === "MALE" ? person : spouses.find((s) => s.person.gender === "MALE")?.person) : null;
  const defaults: PersonDefaults = {
    districtId: person.districtId,
    nativePlace: person.nativePlace,
    ...(relation === "child" && father ? { surname: father.surname, gotraId: father.gotraId } : {}),
    ...(relation === "parent" && person.gender ? { surname: person.surname } : {}),
    ...(relation === "spouse" ? { gender: person.gender === "MALE" ? "FEMALE" : "MALE", nativePlace: null } : {}),
  };
  const coParents = relation === "child" ? spouses.map((s) => ({ id: s.person.id, label: fullName(s.person) })) : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageTitle sub={fullName(person)}>{title}</PageTitle>
      {relation === "spouse" && (
        <Notice>
          <Link href={`/match?a=${id}`} className="font-semibold underline">
            {tm("title")} →
          </Link>{" "}
          {tm("intro")}
        </Notice>
      )}
      <section>
        <h2 className="mb-3 font-semibold">{t("createNew")}</h2>
        <PersonForm
          action={addRelativeAction.bind(null, id, relation)}
          defaults={defaults}
          gotras={gotras}
          districts={districts}
          coParents={coParents}
          submitLabel={title}
        />
      </section>
      <Card>
        <h2 className="mb-3 font-semibold">{t("linkExisting")}</h2>
        <LinkExistingForm action={linkExistingAction.bind(null, id, relation)} />
      </Card>
    </div>
  );
}
