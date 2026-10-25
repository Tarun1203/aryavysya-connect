import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope, districtWhere } from "@/lib/permissions";
import { assignInchargeAction, assignOrgAdminAction, createOrganizationAction, revokeAdminAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Input, Select } from "@/components/ui";
import { LocationPicker } from "@/components/LocationPicker";
import { pickerDefaults } from "@/lib/locations/resolve";
import type { OrgLevel } from "@/generated/prisma/client";

export default async function OrganizationsPage({ params }: PageProps<"/[locale]/admin/organizations">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  const scope = await adminScope(user);
  if (!scope || scope.kind === "local") redirect({ href: "/admin", locale });
  const s = scope!;
  const t = await getTranslations("admin");

  const dWhere = districtWhere(s) ?? { id: "__none__" };
  const orgWhere = s.kind === "all" ? {} : s.kind === "state" ? { state: s.state } : { districtId: s.districtId };
  const [districts, orgs] = await Promise.all([
    db.district.findMany({ where: dWhere, include: { incharge: true }, orderBy: [{ state: "asc" }, { name: "asc" }] }),
    db.organization.findMany({
      where: orgWhere,
      include: { district: true, taluk: true, locality: true, admins: true, _count: { select: { members: true } } },
      orderBy: [{ level: "asc" }, { name: "asc" }],
    }),
  ]);
  const states = [...new Set(districts.map((d) => d.state))];
  const placeDefaults = await pickerDefaults(null, s.kind === "district" ? s.districtId : null);

  const canAssignIncharge = s.kind === "all" || s.kind === "state";
  const creatableLevels: OrgLevel[] =
    s.kind === "all" ? ["NATIONAL", "STATE", "DISTRICT", "LOCAL"] : s.kind === "state" ? ["DISTRICT", "LOCAL"] : ["LOCAL"];
  const canManageAdmins = (level: OrgLevel) => level === "LOCAL" || s.kind === "all";

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("districts")}</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="p-3">{t("name")}</th>
                <th className="p-3">{t("incharge")}</th>
                {canAssignIncharge && <th className="p-3">{t("assign")}</th>}
              </tr>
            </thead>
            <tbody>
              {districts.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0 align-top">
                  <td className="p-3">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted">{d.state}</div>
                  </td>
                  <td className="p-3">
                    {d.incharge ? (
                      <>
                        <div className="font-medium">{d.incharge.name}</div>
                        <div className="text-xs text-muted">{d.incharge.email}</div>
                      </>
                    ) : (
                      <span className="text-muted">{t("noIncharge")}</span>
                    )}
                  </td>
                  {canAssignIncharge && (
                    <td className="p-3">
                      <ActionForm action={assignInchargeAction.bind(null, d.id)} submit={t("assign")} variant="ghost" className="flex flex-wrap items-start gap-2">
                        <Input name="email" type="email" placeholder={t("emailOfMember")} required />
                      </ActionForm>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("bodies")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {orgs.map((o) => (
            <Card key={o.id} className="flex flex-col gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-accent">{t(`level_${o.level}`)}</div>
                <h3 className="text-lg font-semibold">{o.name}</h3>
                {o.nameLocal && <div>{o.nameLocal}</div>}
                <div className="text-sm text-muted">
                  {[o.kind, o.locality?.name ?? o.town, o.taluk?.name, o.district?.name, o.state].filter(Boolean).join(" · ")}{o.locality?.pincode ? ` – ${o.locality.pincode}` : ""} · {t("members", { count: o._count.members })}
                </div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">{t("admins")}</div>
                {o.admins.length ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {o.admins.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <span>
                          {a.name} <span className="text-muted">({a.email})</span>
                        </span>
                        {canManageAdmins(o.level) && (
                          <form action={revokeAdminAction.bind(null, a.id)}>
                            <button className="text-xs text-muted hover:text-bad">{t("revoke")}</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">—</p>
                )}
              </div>
              {canManageAdmins(o.level) && o.level !== "DISTRICT" && (
                <ActionForm action={assignOrgAdminAction.bind(null, o.id)} submit={t("makeAdmin")} variant="ghost" className="flex flex-wrap items-start gap-2">
                  <Input name="email" type="email" placeholder={t("emailOfMember")} required />
                </ActionForm>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("newBody")}</h2>
        <Card>
          <ActionForm action={createOrganizationAction} submit={t("add")} className="grid gap-4 sm:grid-cols-2">
            <Field label={t("level")}>
              <Select name="level" required defaultValue={creatableLevels.at(-1)}>
                {creatableLevels.map((l) => (
                  <option key={l} value={l}>
                    {t(`level_${l}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("kind")}>
              <Input name="kind" required placeholder="Sangham" />
            </Field>
            <Field label={t("name")}>
              <Input name="name" required />
            </Field>
            <Field label={t("nameLocal")}>
              <Input name="nameLocal" />
            </Field>
            {s.kind === "all" && (
              <Field label={t("state")}>
                <Input name="state" list="states" />
                <datalist id="states">
                  {states.map((st) => (
                    <option key={st} value={st} />
                  ))}
                </datalist>
              </Field>
            )}
            <div className="sm:col-span-2">
              {/* District → taluk → village / post office where the body is based */}
              <LocationPicker prefix="place" defaults={placeDefaults} />
            </div>
            <Field label={t("town")}>
              <Input name="town" />
            </Field>
            <Field label={t("phone")}>
              <Input name="phone" type="tel" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("address")}>
                <Input name="address" />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
