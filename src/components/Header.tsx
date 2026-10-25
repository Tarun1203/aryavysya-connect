import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { currentUser } from "@/lib/auth";
import { canView, isAdmin } from "@/lib/permissions";
import { logoutAction } from "@/app/actions/auth";
import { LanguageSwitcher } from "./LanguageSwitcher";

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
  ].filter((l) => l.show);

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand">
          <span aria-hidden className="grid size-9 place-items-center rounded-full bg-brand text-lg text-white">ॐ</span>
          <span className="leading-tight">{t("app.name")}</span>
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-brand">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <LanguageSwitcher label={t("nav.language")} />
          {user ? (
            <>
              <Link href="/account" className="hover:text-brand">
                {user.name}
              </Link>
              <form action={logoutAction}>
                <button className="text-muted hover:text-brand">{t("nav.logout")}</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-brand">
                {t("nav.login")}
              </Link>
              <Link href="/register" className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white">
                {t("nav.register")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
