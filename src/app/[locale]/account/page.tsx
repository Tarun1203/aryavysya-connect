import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { editableIds } from "@/lib/permissions";
import { fullName } from "@/lib/reference";
import { Badge, Card, Notice, PageTitle } from "@/components/ui";
import { OtpForm } from "@/components/OtpForm";
import { confirmVerifyCodeAction, sendVerifyCodeAction } from "@/app/actions/otp";
import { maskPhone, otpAvailable } from "@/lib/otp";
import { MarriageRequests } from "@/components/MarriageRequests";

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await currentUser();
  if (!user) redirect({ href: "/login", locale });
  const u = user!;
  const t = await getTranslations("account");
  const tp = await getTranslations("person");
  const to = await getTranslations("otp");
  const format = await getFormatter();

  const [claims, self, scope] = await Promise.all([
    db.familyClaim.findMany({ where: { userId: u.id }, include: { district: true }, orderBy: { createdAt: "desc" } }),
    u.personId ? db.person.findUnique({ where: { id: u.personId } }) : null,
    editableIds(u),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageTitle eyebrow={t("eyebrow")}>{t("title")}</PageTitle>
      <Card className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-sm text-muted">{t("status")}</div>
          <div className="font-semibold">{t(`status_${u.status}`)}</div>
        </div>
        <div>
          <div className="text-sm text-muted">{t("role")}</div>
          <div className="font-semibold">{t(`role_${u.role}`)}</div>
        </div>
        <div>
          <div className="text-sm text-muted">{tp("district")}</div>
          <div className="font-semibold">{u.district ? `${u.district.name}, ${u.district.state}` : "—"}</div>
        </div>
        {u.organization && (
          <div>
            <div className="text-sm text-muted">{t("organization")}</div>
            <div className="font-semibold">{u.organization.name}</div>
          </div>
        )}
        {(u.adminOrg || u.inchargeOf) && (
          <div>
            <div className="text-sm text-muted">{t("adminOf")}</div>
            <div className="font-semibold">{u.adminOrg?.name ?? `${u.inchargeOf!.name}, ${u.inchargeOf!.state}`}</div>
          </div>
        )}
        {self && (
          <div>
            <div className="text-sm text-muted">{t("linkedPerson")}</div>
            <Link href={`/person/${self.id}`} className="font-semibold text-brand underline">
              {fullName(self)}
            </Link>
          </div>
        )}
      </Card>

      {/* Phone: verified by a one-time code; only a verified number can be used to sign in */}
      {otpAvailable() && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{to("cardTitle")}</h2>
            {u.phoneVerifiedAt ? <Badge>{to("verifiedBadge")}</Badge> : <Badge tone="muted">{to("notVerifiedBadge")}</Badge>}
          </div>
          {u.phoneVerifiedAt && u.phone ? (
            <p className="text-sm text-muted">{to("verifiedText", { phone: maskPhone(u.phone) })}</p>
          ) : (
            <p className="text-sm text-muted">{to("verifyText")}</p>
          )}
          <details open={!u.phoneVerifiedAt}>
            <summary className="cursor-pointer text-sm text-brand">{u.phoneVerifiedAt ? to("change") : to("verifyNow")}</summary>
            <div className="mt-3 max-w-sm">
              <OtpForm send={sendVerifyCodeAction} verify={confirmVerifyCodeAction} submitLabel={to("verify")} initialPhone={u.phoneVerifiedAt ? "" : (u.phone ?? "")} />
            </div>
          </details>
        </Card>
      )}

      {(u.role === "MEMBER" || u.role === "LOCAL_ADMIN") && scope && scope.size > 0 && (
        <Notice tone="ok">{t("editScope", { count: scope.size })}</Notice>
      )}

      {u.status === "APPROVED" && <MarriageRequests user={u} />}

      {claims.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">{t("claims")}</h2>
          <ul className="flex flex-col gap-3">
            {claims.map((c) => (
              <li key={c.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {c.givenName} {c.surname} · {c.district.name}
                  </span>
                  <span className="text-muted">{format.dateTime(c.createdAt, { dateStyle: "medium" })}</span>
                </div>
                <div className="mt-1">{t(`status_${c.status}`)}</div>
                {c.reviewNote && (
                  <div className="mt-1 text-muted">
                    {t("reviewNote")}: {c.reviewNote}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
