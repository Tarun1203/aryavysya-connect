import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canView, isAdmin } from "@/lib/permissions";
import { logoutAction } from "@/app/actions/auth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Navbar } from "./Navbar";
import { LiveBell } from "./Live";
import { buttonClass } from "./ui";

export async function Header() {
  const t = await getTranslations();
  const user = await currentUser();
  const member = canView(user);
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null } }) : 0;

  const links = [
    { href: "/", label: t("nav.home"), show: true },
    { href: "/search", label: t("nav.search"), show: member },
    { href: "/match", label: t("nav.match"), show: member },
    { href: user?.personId ? `/tree/${user.personId}` : "/account", label: t("nav.myTree"), show: !!user?.personId && member },
    { href: "/admin", label: t("nav.admin"), show: isAdmin(user) && user?.status === "APPROVED" },
  ]
    .filter((l) => l.show)
    .map(({ href, label }) => ({ href, label }));

  const initials = user?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const actions = (
    <>
      <LanguageSwitcher label={t("nav.language")} />
      {user ? (
        <>
          <Link
            href="/notifications"
            aria-label={unread ? t("notify.bellUnread", { count: unread }) : t("notify.title")}
            title={t("notify.title")}
            className="relative grid size-9 place-items-center rounded-full text-muted transition hover:bg-brand-soft hover:text-brand"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <Link href="/account" className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 hover:border-brand/40">
            <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-xs font-bold text-white">{initials}</span>
            <span className="max-w-32 truncate">{user.name}</span>
          </Link>
          <form action={logoutAction}>
            <button className="rounded-full px-3 py-1.5 text-muted transition hover:bg-brand-soft hover:text-brand">{t("nav.logout")}</button>
          </form>
        </>
      ) : (
        <>
          <Link href="/login" className="rounded-full px-3 py-1.5 transition hover:bg-brand-soft hover:text-brand">
            {t("nav.login")}
          </Link>
          <Link href="/register" className={buttonClass("primary", "rounded-full px-4 py-1.5")}>
            {t("nav.register")}
          </Link>
        </>
      )}
    </>
  );

  return (
    <>
      <Navbar brand={t("app.name")} links={links} actions={actions} menuLabel={t("nav.menu")} />
      {/* Once, outside the menu (which repeats the actions on phones): keeps the bell live */}
      {user && <LiveBell me={user.id} />}
    </>
  );
}
