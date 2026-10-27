import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope, claimRights } from "@/lib/permissions";
import { fullName, gotraLabel, lifeSpan } from "@/lib/reference";
import { approveClaimAction, endorseClaimAction, rejectClaimAction } from "@/app/actions/admin";
import { Button, Card, Input, Notice } from "@/components/ui";
import { ApproveClaimForm } from "./ApproveClaimForm";
import { findDuplicates } from "@/lib/dedup";
import { MarriageRequests } from "@/components/MarriageRequests";

export default async function PendingClaimsPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  const scope = await adminScope(user);
  const t = await getTranslations("admin");
  const tp = await getTranslations("person");
  const format = await getFormatter();
  if (!scope) return null;

  const where =
    scope.kind === "all"
      ? {}
      : scope.kind === "state"
        ? { district: { state: scope.state } }
        : scope.kind === "district"
          ? { districtId: scope.districtId }
          : { organizationId: scope.orgId };

  const claims = await db.familyClaim.findMany({
    where: { status: "PENDING", ...where },
    include: { user: true, district: true, organization: true, gotra: true, person: { include: { gotra: true } }, endorsedBy: true },
    orderBy: { createdAt: "asc" },
  });

  // In-charges answer marriage links for their area too, when the family hasn't
  const marriages = scope.kind !== "local" ? <MarriageRequests user={user} /> : null;
  if (!claims.length)
    return (
      <div className="flex flex-col gap-4">
        {marriages}
        <Notice>{t("noPending")}</Notice>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {marriages}
      {await Promise.all(
        claims.map(async (c) => {
          const rights = await claimRights(user, c);
          // The person registering may already be in the tree, added by a relative – suggest those records
          const suggestions =
            rights.approve && !c.personId
              ? await findDuplicates({
                  givenName: c.givenName,
                  surname: c.surname,
                  gender: c.gender,
                  birthGotraId: c.gotraId,
                  districtId: c.districtId,
                  nativeLocalityId: c.nativeLocalityId,
                  fatherName: c.fatherName,
                  birthYear: c.birthYear,
                })
              : [];
          const claimed = c.person
            ? { id: c.person.id, label: fullName(c.person), detail: [lifeSpan(c.person), c.person.gotra?.name].filter(Boolean).join(" · ") }
            : null;
          return (
            <Card key={c.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{t("claimFor", { name: c.user.name, person: `${c.givenName} ${c.surname}` })}</h2>
                  <p className="text-sm text-muted">
                    {c.user.email}
                    {c.user.phone && ` · ${c.user.phone}`} · {t("submittedOn", { date: format.dateTime(c.createdAt, { dateStyle: "medium" }) })}
                  </p>
                </div>
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs">
                  {c.district.name}
                  {c.organization && ` · ${c.organization.name}`}
                </span>
              </div>

              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                {[
                  [tp("gender"), tp(c.gender.toLowerCase() as "male")],
                  [tp("birthGotra"), gotraLabel(c.gotra, locale)],
                  [tp("fatherName"), c.fatherName],
                  [tp("motherName"), c.motherName],
                  [tp("birthYear"), c.birthYear],
                  [tp("nativePlace"), c.nativePlace],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={String(k)}>
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
              </dl>
              {c.note && <p className="rounded-xl bg-background p-3 text-sm">{c.note}</p>}
              {claimed && (
                <p className="text-sm">
                  {t("claimed")}:{" "}
                  <Link href={`/person/${claimed.id}`} className="font-semibold text-brand underline">
                    {claimed.label}
                  </Link>{" "}
                  <span className="text-muted">{claimed.detail}</span>
                </p>
              )}

              {c.organization &&
                (c.endorsedBy ? (
                  <Notice tone="ok">{t("endorsed", { name: c.endorsedBy.name })}</Notice>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Notice tone="warn">{t("awaitingEndorsement", { org: c.organization.name })}</Notice>
                    {rights.endorse && (
                      <form action={endorseClaimAction.bind(null, c.id)}>
                        <Button variant="ghost">{t("endorse")}</Button>
                      </form>
                    )}
                  </div>
                ))}

              {rights.approve && (
                <div className="grid gap-4 border-t border-line pt-4 lg:grid-cols-[2fr_1fr]">
                  <ApproveClaimForm action={approveClaimAction.bind(null, c.id)} claimed={claimed} suggestions={suggestions} />
                  <form action={rejectClaimAction.bind(null, c.id)} className="flex flex-col gap-3">
                    <Input name="note" placeholder={t("note")} />
                    <Button variant="danger" className="self-start">
                      {t("reject")}
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
