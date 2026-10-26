import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { assignOrgAdminAction, createOrganizationAction, revokeAdminAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { LocationPicker } from "@/components/LocationPicker";
import { pickerDefaults } from "@/lib/locations/resolve";
import type { OrgLevel } from "@/generated/prisma/client";

const LEVELS: OrgLevel[] = ["NATIONAL", "STATE", "DISTRICT", "LOCAL"];

export default async function OrganizationsPage({ params, searchParams }: PageProps<"/[locale]/admin/organizations">) {
  const { locale } = await params;
  const sp = (await searchParams) as { state?: string; level?: string; q?: string };
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  const scope = await adminScope(user);
  if (!scope || scope.kind === "local") redirect({ href: "/admin", locale });
  const s = scope!;
  const t = await getTranslations("admin");

  // Scope first, then the viewer's filters
  const scoped = s.kind === "all" ? {} : s.kind === "state" ? { state: s.state } : { districtId: s.districtId };
  const level = LEVELS.includes(sp.level as OrgLevel) ? (sp.level as OrgLevel) : undefined;
  const q = sp.q?.trim();
  const [orgs, stateRows] = await Promise.all([
    db.organization.findMany({
      where: {
        ...scoped,
        ...(s.kind === "all" && sp.state ? { state: sp.state } : {}),
        ...(level ? { level } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { town: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { district: true, taluk: true, locality: true, admins: true, _count: { select: { members: true } } },
      orderBy: [{ state: "asc" }, { name: "asc" }],
    }),
    s.kind === "all" ? db.district.findMany({ distinct: ["state"], select: { state: true }, orderBy: { state: "asc" } }) : [],
  ]);
  const states = stateRows.map((r) => r.state);
  const placeDefaults = await pickerDefaults(null, s.kind === "district" ? s.districtId : null);

  const creatableLevels: OrgLevel[] = s.kind === "all" ? LEVELS : s.kind === "state" ? ["DISTRICT", "LOCAL"] : ["LOCAL"];
  const canManageAdmins = (l: OrgLevel) => l === "LOCAL" || s.kind === "all";
  const groups = LEVELS.map((l) => ({ level: l, items: orgs.filter((o) => o.level === l) })).filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-6">
      {/* Add a body – folded away so the list comes first */}
      <details className="rounded-xl border border-line bg-surface p-5 shadow-sm [&[open]>summary]:mb-4">
        <summary className="cursor-pointer select-none font-semibold text-brand">+ {t("newBody")}</summary>
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
            <Field label={t("state")} hint={t("stateHint")}>
              <Select name="state" defaultValue="">
                <option value="">—</option>
                {states.map((st) => (
                  <option key={st}>{st}</option>
                ))}
              </Select>
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
      </details>

      <Card>
        <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] [&_select]:w-full [&_select]:min-w-0">
          <Field label={t("searchBodies")}>
            <Input name="q" defaultValue={q} />
          </Field>
          <Field label={t("level")}>
            <Select name="level" defaultValue={level ?? ""}>
              <option value="">{t("allLevels")}</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`level_${l}`)}
                </option>
              ))}
            </Select>
          </Field>
          {s.kind === "all" ? (
            <Field label={t("state")}>
              <Select name="state" defaultValue={sp.state ?? ""}>
                <option value="">{t("allStates")}</option>
                {states.map((st) => (
                  <option key={st}>{st}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <div />
          )}
          <Button variant="ghost">{t("filter")}</Button>
        </form>
      </Card>

      {groups.length === 0 && <Notice>{t("noBodies")}</Notice>}

      {groups.map((g) => (
        <section key={g.level}>
          <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
            {t(`level_${g.level}`)}
            <span className="text-sm font-normal text-muted">({g.items.length})</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.items.map((o) => (
              <Card key={o.id} className="flex flex-col gap-3">
                <div>
                  <h3 className="font-semibold leading-snug">{o.name}</h3>
                  {o.nameLocal && <div className="text-sm">{o.nameLocal}</div>}
                  <div className="mt-1 text-xs text-muted">
                    {[o.kind, o.locality?.name ?? o.town, o.taluk?.name, o.district?.name, o.state].filter(Boolean).join(" · ")}
                    {o.locality?.pincode ? ` – ${o.locality.pincode}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-muted">{t("members", { count: o._count.members })}</div>
                </div>
                <div className="border-t border-line pt-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("admins")}</div>
                  {o.admins.length ? (
                    <ul className="flex flex-col gap-1 text-sm">
                      {o.admins.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {a.name} <span className="text-muted">({a.email})</span>
                          </span>
                          {canManageAdmins(o.level) && (
                            <form action={revokeAdminAction.bind(null, a.id)}>
                              <button className="shrink-0 text-xs text-muted hover:text-bad">{t("revoke")}</button>
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
      ))}
    </div>
  );
}
