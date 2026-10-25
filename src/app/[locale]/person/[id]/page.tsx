import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/guard";
import { canAddRelative, canEditPerson, isAdmin } from "@/lib/permissions";
import { getFamily } from "@/lib/tree";
import { fullName, gotraLabel, lifeSpan } from "@/lib/reference";
import { removeLinkAction } from "@/app/actions/person";
import { Card, Notice } from "@/components/ui";

type P = { id: string; givenName: string; surname: string; birthDate: string | null; deathDate: string | null; isLiving: boolean; gotra: { name: string; nameTe: string | null; nameKn: string | null; nameTa: string | null } | null };

export default async function PersonPage({ params }: PageProps<"/[locale]/person/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireViewer(locale);
  const family = await getFamily(id);
  if (!family) notFound();
  const t = await getTranslations("person");
  const format = await getFormatter();
  const { person, parents, spouses, children, siblings } = family;

  const [editable, canParent, canChild, canSpouse] = await Promise.all([
    canEditPerson(user, id),
    canAddRelative(user, id, "parent"),
    canAddRelative(user, id, "child", spouses[0]?.person.id),
    canAddRelative(user, id, "spouse"),
  ]);
  const history = isAdmin(user)
    ? await db.auditLog.findMany({ where: { entityId: id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 })
    : [];

  const details: [string, string | null | undefined][] = [
    [t("gotra"), gotraLabel(person.gotra, locale)],
    [t("birthDate"), person.birthDate],
    [t("birthPlace"), person.birthPlace],
    [t("deathDate"), person.isLiving ? null : person.deathDate],
    [t("deathTithi"), person.isLiving ? null : person.deathTithi],
    [t("nativePlace"), person.nativePlace],
    [t("district"), person.district && `${person.district.name}, ${person.district.state}`],
    [t("nakshatra"), person.nakshatra],
    [t("rasi"), person.rasi],
    [t("kuladevata"), person.kuladevata],
    [t("occupation"), person.occupation],
  ];

  const PersonLink = ({ p, linkId, kind }: { p: P; linkId?: string; kind?: "parentChild" | "couple" }) => (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
      <Link href={`/person/${p.id}`} className="hover:text-brand">
        <span className="font-medium">{fullName(p)}</span>
        <span className="ml-2 text-xs text-muted">
          {[lifeSpan(p), gotraLabel(p.gotra, locale)].filter(Boolean).join(" · ")}
        </span>
      </Link>
      {editable && linkId && kind && (
        <form action={removeLinkAction.bind(null, kind, linkId, id)}>
          <button className="text-xs text-muted hover:text-bad" title={t("removeLink")} aria-label={t("removeLink")}>
            ✕
          </button>
        </form>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand">
            {fullName(person)}
            {person.user?.id === user.id && <span className="ml-3 rounded-full bg-accent px-2 py-0.5 align-middle text-xs text-white">{t("you")}</span>}
          </h1>
          {(person.givenNameLocal || person.surnameLocal) && (
            <p className="text-xl">{[person.givenNameLocal, person.surnameLocal].filter(Boolean).join(" ")}</p>
          )}
          <p className="mt-1 text-muted">
            {lifeSpan(person)} · {person.isLiving ? t("living") : t("deceased")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/tree/${id}`} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-brand-soft">
            {t("viewTree")}
          </Link>
          {editable && (
            <Link href={`/person/${id}/edit`} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
              {t("edit")}
            </Link>
          )}
        </div>
      </div>

      <Notice tone={editable ? "ok" : "info"}>{editable ? t("editable") : t("readOnly")}</Notice>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <dl className="grid gap-3 text-sm">
            {details
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
          </dl>
          {person.notes && <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-sm">{person.notes}</p>}
        </Card>

        <Card className="grid gap-6 lg:col-span-2 sm:grid-cols-2">
          <Section title={t("parents")} none={t("none")}>
            {parents.map((p) => (
              <PersonLink key={p.linkId} p={p.person} linkId={p.linkId} kind="parentChild" />
            ))}
          </Section>
          <Section title={t("spouses")} none={t("none")}>
            {spouses.map((s) => (
              <PersonLink key={s.linkId} p={s.person} linkId={s.linkId} kind="couple" />
            ))}
          </Section>
          <Section title={t("children")} none={t("none")}>
            {children.map((c) => (
              <PersonLink key={c.linkId} p={c.person} linkId={c.linkId} kind="parentChild" />
            ))}
          </Section>
          <Section title={t("siblings")} none={t("none")}>
            {siblings.map((s) => (
              <PersonLink key={s.id} p={s} />
            ))}
          </Section>
          {(canParent || canChild || canSpouse) && (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {canParent && parents.length < 2 && (
                <Link href={`/person/${id}/add/parent`} className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand hover:bg-brand-soft">
                  + {t("addParent")}
                </Link>
              )}
              {canSpouse && (
                <Link href={`/person/${id}/add/spouse`} className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand hover:bg-brand-soft">
                  + {t("addSpouse")}
                </Link>
              )}
              {canChild && (
                <Link href={`/person/${id}/add/child`} className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand hover:bg-brand-soft">
                  + {t("addChild")}
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>

      {history.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">{t("history")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-3">
                <span className="text-muted">{format.dateTime(h.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="font-medium">{h.action}</span>
                <span>{h.user?.name ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Section({ title, none, children: items }: { title: string; none: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>
      {items.length ? <ul className="flex flex-col gap-2">{items}</ul> : <p className="text-sm text-muted">{none}</p>}
    </div>
  );
}
