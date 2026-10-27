import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/guard";
import { checkMatch } from "@/lib/family";
import { fullName, lifeSpan } from "@/lib/reference";
import { PersonPicker } from "@/components/PersonPicker";
import { Button, Card, Field, Notice, PageTitle } from "@/components/ui";

async function hit(id?: string) {
  if (!id) return null;
  const p = await db.person.findUnique({ where: { id }, include: { gotra: true } });
  return p ? { id: p.id, label: fullName(p), detail: [lifeSpan(p), p.gotra?.name].filter(Boolean).join(" · ") } : null;
}

export default async function MatchPage({ params, searchParams }: PageProps<"/[locale]/match">) {
  const { locale } = await params;
  const { a, b } = (await searchParams) as { a?: string; b?: string };
  setRequestLocale(locale);
  await requireViewer(locale);
  const t = await getTranslations("match");
  const [personA, personB] = await Promise.all([hit(a), hit(b)]);
  const result = personA && personB && personA.id !== personB.id ? await checkMatch(personA.id, personB.id) : null;
  const tone = { ok: "ok", caution: "warn", "not-permitted": "bad" } as const;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageTitle eyebrow={t("eyebrow")} sub={t("intro")}>{t("title")}</PageTitle>
      <Card>
        <form className="grid gap-4 sm:grid-cols-2">
          <Field label={t("personA")}>
            <PersonPicker name="a" placeholder={t("searchPlaceholder")} initial={personA} />
          </Field>
          <Field label={t("personB")}>
            <PersonPicker name="b" placeholder={t("searchPlaceholder")} initial={personB} />
          </Field>
          <Button className="self-start">{t("check")}</Button>
        </form>
      </Card>

      {result && (
        <Card className="flex flex-col gap-3">
          <Notice tone={tone[result.verdict]}>
            <span className="text-base font-semibold">{t(`verdict_${result.verdict}`)}</span>
          </Notice>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            <li>
              {!result.gotraA || !result.gotraB
                ? t("gotraMissing")
                : result.sameGotra
                  ? t("sameGotra", { gotra: result.gotraA })
                  : t("differentGotra", { a: result.gotraA, b: result.gotraB })}
            </li>
            {result.maternalClash && <li>{t("maternalClash", { gotra: result.maternalClash })}</li>}
            {result.common && (
              <li>
                {t("common", { name: result.common.name, a: result.common.genA, b: result.common.genB })}{" "}
                <Link href={`/tree/${result.common.id}`} className="text-brand underline">
                  →
                </Link>
              </li>
            )}
            {result.cousinType && <li>{t(result.cousinType)}</li>}
          </ul>
          <p className="text-xs text-muted">{t("disclaimer")}</p>
        </Card>
      )}
    </div>
  );
}
