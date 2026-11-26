import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireSignedIn } from "@/lib/guard";
import { feedKey, type Kind } from "@/lib/notify-core";
import { markAllReadAction, openNotificationAction } from "@/app/actions/notify";
import { Card, PageTitle } from "@/components/ui";

/** Message values from the stored data (a missing one reads as empty, never as an error) */
const values = (data: unknown) => Object.fromEntries(Object.entries((data ?? {}) as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)]));

/** The member's notifications, newest first (the last 180 days). Opening one marks it read. */
export default async function NotificationsPage({ params }: PageProps<"/[locale]/notifications">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireSignedIn(locale);
  const t = await getTranslations("notify");
  const format = await getFormatter();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageTitle
        sub={t("pageHint")}
        actions={
          unread > 0 && (
            <form action={markAllReadAction}>
              <button className="rounded-xl border border-line px-3 py-1.5 text-sm hover:bg-brand-soft">{t("markAllRead")}</button>
            </form>
          )
        }
      >
        {t("title")}
      </PageTitle>
      {!items.length && <p className="text-sm text-muted">{t("empty")}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id}>
            <form action={openNotificationAction.bind(null, n.id)}>
              <button className="w-full text-left">
                <Card className={`flex items-start gap-3 text-sm transition hover:border-brand/40 ${n.readAt ? "" : "border-brand/40 bg-brand-soft/30"}`}>
                  <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={n.readAt ? "" : "font-semibold"}>{t(feedKey(n.kind as Kind), values(n.data))}</span>
                    <span className="text-xs text-muted">{format.relativeTime(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="sr-only">{t("unread")}</span>}
                </Card>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        <Link href="/account#notifications" className="underline">
          {t("settingsLink")}
        </Link>
      </p>
    </div>
  );
}
