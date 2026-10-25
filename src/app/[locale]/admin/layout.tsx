import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { Notice, PageTitle } from "@/components/ui";
import { AdminTabs } from "./AdminTabs";

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  const user = await requireAdmin(locale);
  const scope = await adminScope(user);
  const t = await getTranslations("admin");

  const scopeLabel = !scope
    ? null
    : scope.kind === "all"
      ? t("scope_all")
      : scope.kind === "state"
        ? t("scope_state", { state: scope.state })
        : scope.kind === "district"
          ? t("scope_district", { district: user.inchargeOf?.name ?? "" })
          : t("scope_local", { org: user.adminOrg?.name ?? "" });

  const tabs = [
    { href: "/admin", label: t("tabPending") },
    ...(scope && scope.kind !== "local"
      ? [
          { href: "/admin/organizations", label: t("tabOrgs") },
          { href: "/admin/users", label: t("tabUsers") },
        ]
      : []),
    ...(scope?.kind === "all" ? [{ href: "/admin/settings", label: t("tabSettings") }] : []),
  ];

  return (
    <div>
      <PageTitle sub={scopeLabel}>{t("title")}</PageTitle>
      {scope ? (
        <>
          <AdminTabs tabs={tabs} />
          <div className="mt-6">{children}</div>
        </>
      ) : (
        <Notice tone="warn">
          {t("noAccess")} <Link href="/account">→</Link>
        </Notice>
      )}
    </div>
  );
}
