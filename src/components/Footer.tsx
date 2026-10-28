import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LOCALE_NAMES, routing } from "@/i18n/routing";
import { currentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { LogoMark } from "./Logo";

export async function Footer() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = await currentUser();
  const member = canView(user);

  const columns = [
    {
      title: t("footer.explore"),
      links: [
        { href: "/", label: t("nav.home") },
        ...(member
          ? [
              { href: "/search", label: t("nav.search") },
              { href: "/match", label: t("nav.match") },
            ]
          : []),
        ...(user ? [{ href: "/account", label: t("nav.account") }] : [{ href: "/register", label: t("nav.register") }, { href: "/login", label: t("nav.login") }]),
      ],
    },
    {
      title: t("footer.community"),
      links: [
        { href: "/#how", label: t("footer.how") },
        { href: "/#features", label: t("footer.features") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/privacy", label: t("legal.privacyTitle") },
        { href: "/terms", label: t("legal.termsTitle") },
        { href: "/child-safety", label: t("legal.childSafetyTitle") },
        { href: "/grievance", label: t("legal.grievanceTitle") },
      ],
    },
  ];

  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line bg-surface-2/60">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-8 pt-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark className="size-11" />
            <span className="font-display text-lg font-semibold leading-tight">{t("app.name")}</span>
          </Link>
          <p className="max-w-sm text-sm text-muted">{t("app.tagline")}</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted">{t("footer.maintained")}</p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{c.title}</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-foreground/80 transition hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{t("nav.language")}</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {routing.locales.map((l) => (
              <li key={l}>
                <Link href="/" locale={l} className={l === locale ? "font-semibold text-brand" : "text-foreground/80 transition hover:text-brand"}>
                  {LOCALE_NAMES[l]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The name as a large, faded wordmark */}
      <div aria-hidden className="pointer-events-none select-none px-4 text-center font-display text-[15vw] font-semibold leading-[0.8] tracking-tight bg-gradient-to-b from-foreground/[0.13] to-transparent bg-clip-text text-transparent sm:text-[11vw] lg:text-[150px]">
        Vamsha Vruksham
      </div>

      <div className="relative border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted sm:flex-row">
          <span>
            © {new Date().getFullYear()} {t("app.name")}
          </span>
          <span className="text-center font-medium text-brand">{t("footer.blessing")}</span>
          <a href="https://3dicons.co" target="_blank" rel="noopener noreferrer" className="hover:text-brand">
            {t("footer.iconCredit")}
          </a>
        </div>
      </div>
    </footer>
  );
}
