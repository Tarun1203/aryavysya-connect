import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { editableIds } from "@/lib/permissions";
import { fullName, memberCode } from "@/lib/reference";
import { marriageCheck } from "@/lib/marriage";
import { respondMarriageAction } from "@/app/actions/marriage";
import { Card } from "./ui";

/**
 * Marriage links proposed by another family to someone this user may answer for: themselves,
 * their family within edit scope, or – for an in-charge or state head – anyone in their area.
 */
export async function MarriageRequests({ user }: { user: SessionUser }) {
  const ids = await editableIds(user);
  const requests = await db.couple.findMany({
    where: { status: "PROPOSED", ...(ids ? { person2Id: { in: [...ids] } } : {}) },
    include: { person1: { include: { gotra: true, district: true } }, person2: { include: { gotra: true } }, proposedBy: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (!requests.length) return null;
  const t = await getTranslations("marriage");
  // Re-run the marriage check: the trees may have changed since the link was proposed
  const checks = await Promise.all(requests.map((r) => marriageCheck(r.person1Id, r.person2Id)));

  return (
    <Card>
      <h2 className="mb-1 font-semibold">{t("requestsTitle", { count: requests.length })}</h2>
      <p className="mb-3 text-sm text-muted">{t("requestsHint")}</p>
      <ul className="flex flex-col gap-3">
        {requests.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm">
            <div>
              <div>
                <Link href={`/person/${r.person1Id}`} className="font-medium hover:text-brand">
                  {fullName(r.person1)}
                </Link>{" "}
                <span className="text-xs text-muted">
                  {memberCode(r.person1.memberNo)} · {[r.person1.gotra?.name, r.person1.district?.name].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="text-muted">
                {t("wantsToMarry")}{" "}
                <Link href={`/person/${r.person2Id}`} className="font-medium text-foreground hover:text-brand">
                  {fullName(r.person2)}
                </Link>{" "}
                · {t("proposedBy", { name: r.proposedBy?.name ?? "—" })}
              </div>
              {checks[i].blocked && <div className="mt-1 text-xs text-bad">{t(`blocked_${checks[i].blocked}`, { name: checks[i].relative ?? "" })}</div>}
              {checks[i].flags.map((f) => (
                <div key={f} className="mt-1 text-xs text-bad">
                  {t(`flag_${f}`, { name: checks[i].relative ?? "" })}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {!checks[i].blocked && (
                <form action={respondMarriageAction.bind(null, r.id, true)}>
                  <button className="rounded-lg bg-brand px-3 py-1 text-white hover:opacity-90">{t("accept")}</button>
                </form>
              )}
              <form action={respondMarriageAction.bind(null, r.id, false)}>
                <button className="rounded-lg border border-line px-3 py-1 hover:bg-surface">{t("decline")}</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
