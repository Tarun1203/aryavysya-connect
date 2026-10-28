import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentSessionId, currentUser } from "@/lib/auth";
import { endDeviceSessionAction, endOtherSessionsAction } from "@/app/actions/session";
import { editableIds } from "@/lib/permissions";
import { fullName } from "@/lib/reference";
import { Badge, Card, Notice, PageTitle } from "@/components/ui";
import { OtpForm } from "@/components/OtpForm";
import { ChangeRequestList, requestInclude } from "@/components/ChangeRequestList";
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
  const tr = await getTranslations("review");
  const ts = await getTranslations("sessions");
  const [sid, devices] = await Promise.all([
    currentSessionId(),
    db.session.findMany({ where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
  ]);
  // Proposals about this member's own record, and the requests they made
  const [aboutMe, myRequests] = await Promise.all([
    u.personId ? db.changeRequest.findMany({ where: { personId: u.personId, status: "PENDING", proposedById: { not: u.id } }, include: requestInclude, orderBy: { createdAt: "desc" } }) : [],
    db.changeRequest.findMany({ where: { proposedById: u.id }, include: requestInclude, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
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

      {/* Where you're signed in: every live session, with sign-out buttons */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{ts("title")}</h2>
          {devices.length > 1 && (
            <form action={endOtherSessionsAction}>
              <button className="text-sm text-bad hover:underline">{ts("endOthers")}</button>
            </form>
          )}
        </div>
        <p className="text-sm text-muted">{ts("intro")}</p>
        <ul className="flex flex-col gap-2">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{d.device ?? ts("unknownDevice")}</span>
                {d.id === sid && <Badge tone="gold">{ts("thisDevice")}</Badge>}
                <span className="block text-xs text-muted">
                  {ts("since", { date: format.dateTime(d.createdAt, { dateStyle: "medium" }) })} ·{" "}
                  {ts("lastSeen", { date: format.dateTime(d.lastSeenAt, { dateStyle: "medium", timeStyle: "short" }) })}
                </span>
              </span>
              <form action={endDeviceSessionAction.bind(null, d.id)}>
                <button className="text-xs text-muted hover:text-bad">{d.id === sid ? ts("signOutHere") : ts("signOutThere")}</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      {(u.role === "MEMBER" || u.role === "LOCAL_ADMIN") && scope && scope.size > 0 && (
        <Notice tone="ok">{t("editScope", { count: scope.size })}</Notice>
      )}

      {u.status === "APPROVED" && <MarriageRequests user={u} />}

      {(aboutMe.length > 0 || myRequests.length > 0) && (
        <Card className="flex flex-col gap-4">
          {aboutMe.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">{tr("aboutYou")}</h2>
              <ChangeRequestList requests={aboutMe} user={u} />
            </div>
          )}
          {myRequests.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">{tr("myRequests")}</h2>
              <ChangeRequestList requests={myRequests} user={u} showPerson />
            </div>
          )}
        </Card>
      )}

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
