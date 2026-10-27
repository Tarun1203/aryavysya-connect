import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { currentUser } from "@/lib/auth";
import { canView, isAdmin } from "@/lib/permissions";
import { logoutAction } from "@/app/actions/auth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Navbar } from "./Navbar";
import { buttonClass } from "./ui";

export async function Header() {
  const t = await getTranslations();
  const user = await currentUser();
  const member = canView(user);

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

  return <Navbar brand={t("app.name")} links={links} actions={actions} menuLabel={t("nav.menu")} />;
}
