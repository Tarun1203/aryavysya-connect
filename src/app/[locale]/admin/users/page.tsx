import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope, districtWhere } from "@/lib/permissions";
import { setUserStatusAction } from "@/app/actions/admin";
import { adminEndUserSessionsAction } from "@/app/actions/session";
import { Card, Input } from "@/components/ui";

export default async function UsersPage({ params, searchParams }: PageProps<"/[locale]/admin/users">) {
  const { locale } = await params;
  const { q } = (await searchParams) as { q?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  const scope = await adminScope(user);
  if (!scope || scope.kind === "local") redirect({ href: "/admin", locale });
  const t = await getTranslations("admin");
  const ta = await getTranslations("account");
  const ts = await getTranslations("sessions");

  const dWhere = districtWhere(scope!);
  const users = await db.user.findMany({
    where: {
      ...(scope!.kind === "all" ? {} : { district: dWhere ?? { id: "__none__" } }),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { district: true, organization: true, person: true },
    orderBy: [{ role: "desc" }, { name: "asc" }],
    take: 200,
  });
  // Signed-in devices per member, for "Sign out everywhere"
  const live = await db.session.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((x) => x.id) }, revokedAt: null, expiresAt: { gt: new Date() } },
    _count: { _all: true },
  });
  const devices = new Map(live.map((l) => [l.userId, l._count._all]));

  return (
    <div className="flex flex-col gap-4">
      <form className="max-w-sm">
        <Input name="q" defaultValue={q} placeholder={`${t("name")} / email`} />
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="p-3">{t("name")}</th>
              <th className="p-3">{ta("role")}</th>
              <th className="p-3">{t("bodies")}</th>
              <th className="p-3">{t("status")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  <div className="font-medium">
                    {u.person ? (
                      <Link href={`/person/${u.person.id}`} className="hover:text-brand">
                        {u.name}
                      </Link>
                    ) : (
                      u.name
                    )}
                  </div>
                  <div className="text-xs text-muted">{u.email}</div>
                </td>
                <td className="p-3">{ta(`role_${u.role}`)}</td>
                <td className="p-3 text-xs">{[u.district?.name, u.organization?.name].filter(Boolean).join(" · ")}</td>
                <td className="p-3">{ta(`status_${u.status}`)}</td>
                <td className="p-3 text-right">
                  {u.role !== "SUPER_ADMIN" && u.id !== user.id && (devices.get(u.id) ?? 0) > 0 && (
                    <form action={adminEndUserSessionsAction.bind(null, u.id)} className="mb-1">
                      <button className="text-xs text-brand hover:underline">{ts("adminSignOut", { count: devices.get(u.id) ?? 0 })}</button>
                    </form>
                  )}
                  {u.role !== "SUPER_ADMIN" && u.id !== user.id && u.status === "APPROVED" && (
                    <form action={setUserStatusAction.bind(null, u.id, "SUSPENDED")}>
                      <button className="text-xs text-bad hover:underline">{t("suspend")}</button>
                    </form>
                  )}
                  {u.status === "SUSPENDED" && (
                    <form action={setUserStatusAction.bind(null, u.id, "APPROVED")}>
                      <button className="text-xs text-ok hover:underline">{t("reactivate")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
