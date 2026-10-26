import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { adminScope } from "@/lib/permissions";
import { deleteMarriageRuleAction, saveMarriageRuleAction } from "@/app/actions/admin";
import { Card } from "@/components/ui";
import type { MarriageRule } from "@/generated/prisma/client";

const LEVELS = ["ALLOW", "WARN", "BLOCK"] as const;
const CHECKS = ["sagotra", "maternalGotra", "menarikam"] as const;

/** Super admin: marriage-check customs per region. "*" is the default for states without their own row. */
export default async function RulesPage({ params }: PageProps<"/[locale]/admin/rules">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  if ((await adminScope(user))?.kind !== "all") redirect({ href: "/admin", locale });
  const t = await getTranslations("rules");

  const [rules, states] = await Promise.all([
    db.marriageRule.findMany({ orderBy: { state: "asc" } }),
    db.district.findMany({ distinct: ["state"], select: { state: true }, orderBy: { state: "asc" } }),
  ]);
  const byState = new Map(rules.map((r) => [r.state, r]));
  const fallback = byState.get("*");
  const free = states.map((s) => s.state).filter((s) => !byState.has(s));
  const select = "rounded border border-line bg-background px-2 py-1 text-sm";

  const row = (state: string, rule: Partial<MarriageRule> | undefined) => (
    <form key={state} action={saveMarriageRuleAction.bind(null, state)} className="grid items-center gap-2 border-b border-line p-3 last:border-0 md:grid-cols-[10rem_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)_auto]">
      <div className="font-medium">{state === "*" ? t("default") : state}</div>
      {CHECKS.map((c) => (
        <label key={c} className="flex flex-col gap-1 text-xs text-muted md:contents">
          <span className="md:hidden">{t(`check_${c}`)}</span>
          <select name={c} defaultValue={rule?.[c] ?? fallback?.[c] ?? "WARN"} className={select}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`level_${l}`)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="keepGotra" defaultChecked={rule?.keepGotraAfterMarriageEnds ?? fallback?.keepGotraAfterMarriageEnds ?? true} className="accent-brand" />
        {t("keepGotra")}
      </label>
      <div className="flex gap-2">
        <button className="rounded border border-line px-3 py-1 text-sm hover:bg-brand-soft">{t("save")}</button>
        {state !== "*" && (
          <button formAction={deleteMarriageRuleAction.bind(null, state)} className="rounded px-2 py-1 text-xs text-muted hover:text-bad">
            {t("useDefault")}
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="text-sm text-muted">{t("intro")}</Card>
      <Card className="p-0">
        <div className="hidden gap-2 border-b border-line bg-brand-soft p-3 text-xs font-semibold md:grid md:grid-cols-[10rem_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)_auto]">
          <span>{t("region")}</span>
          {CHECKS.map((c) => (
            <span key={c}>{t(`check_${c}`)}</span>
          ))}
          <span>{t("afterMarriageEnds")}</span>
          <span />
        </div>
        {row("*", fallback)}
        {rules.filter((r) => r.state !== "*").map((r) => row(r.state, r))}
      </Card>
      {free.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">{t("addRegion")}</h2>
          <form action={async (fd: FormData) => {
            "use server";
            const state = String(fd.get("state") ?? "");
            if (state) await saveMarriageRuleAction(state, fd);
          }} className="flex flex-wrap items-center gap-2">
            <select name="state" required defaultValue="" className={select}>
              <option value="">—</option>
              {free.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {/* A new region starts as a copy of the default */}
            {CHECKS.map((c) => (
              <input key={c} type="hidden" name={c} value={fallback?.[c] ?? "WARN"} />
            ))}
            {(fallback?.keepGotraAfterMarriageEnds ?? true) && <input type="hidden" name="keepGotra" value="on" />}
            <button className="rounded border border-line px-3 py-1 text-sm hover:bg-brand-soft">{t("add")}</button>
          </form>
        </Card>
      )}
      <p className="text-xs text-muted">{t("note")}</p>
    </div>
  );
}
