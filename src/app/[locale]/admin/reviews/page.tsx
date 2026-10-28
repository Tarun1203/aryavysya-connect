import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { isReviewer } from "@/lib/review";
import { ChangeRequestList, requestInclude } from "@/components/ChangeRequestList";
import { Segmented } from "@/components/Segmented";
import { Card } from "@/components/ui";

/** Proposed edits, link removals and disputes for the people this administrator looks after. */
export default async function ReviewsPage({ params, searchParams }: PageProps<"/[locale]/admin/reviews">) {
  const { locale } = await params;
  const { show } = (await searchParams) as { show?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  const t = await getTranslations("review");
  const decided = show === "decided";

  const found = await db.changeRequest.findMany({
    where: decided ? { status: { not: "PENDING" } } : { status: "PENDING" },
    include: requestInclude,
    orderBy: { createdAt: decided ? "desc" : "asc" },
    take: 200,
  });
  // Only the people in this administrator's area
  const mine = (await Promise.all(found.map(async (r) => ((await isReviewer(user, r.personId)) ? r : null)))).filter((r) => r !== null);

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        className="w-fit"
        items={[
          { href: "/admin/reviews", label: t("tabPending", { count: decided ? 0 : mine.length }), active: !decided },
          { href: "/admin/reviews?show=decided", label: t("tabDecided"), active: decided },
        ]}
      />
      <p className="text-sm text-muted">{t("adminIntro")}</p>
      <Card>{mine.length ? <ChangeRequestList requests={mine} user={user} showPerson /> : <p className="text-sm text-muted">{decided ? t("noneDecided") : t("nonePending")}</p>}</Card>
    </div>
  );
}
