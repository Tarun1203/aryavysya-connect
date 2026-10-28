import { getFormatter, getTranslations } from "next-intl/server";
import type { consentPanel } from "@/lib/consent";
import { giveGuardianConsentAction, giveSelfConsentAction, recordFormConsentAction, withdrawTreeConsentAction } from "@/app/actions/consent";
import { ActionForm } from "./ActionForm";
import { Badge, Card, Input } from "./ui";

type Panel = NonNullable<Awaited<ReturnType<typeof consentPanel>>>;

/** Consent for a person (DPDP): where they stand, what this viewer may do, and the record history. */
export async function ConsentCard({ personId, name, panel, showHistory }: { personId: string; name: string; panel: Panel; showHistory: boolean }) {
  const t = await getTranslations("consent");
  const format = await getFormatter();
  const tick = (label: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-brand" />
      <span>{label}</span>
    </label>
  );
  const status = panel.hidden ? t("statusPrivate") : t("statusListed");

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("cardTitle")}</h2>
        <Badge tone={panel.hidden ? "muted" : "brand"}>{status}</Badge>
      </div>
      <p className="text-sm text-muted">{panel.minor ? (panel.treeActive ? t("minorGiven") : panel.ageUnknown ? t("ageUnknown") : t("minorMissing")) : panel.hidden ? t("adultWithdrawn") : t("adultListed")}</p>

      {panel.canGiveAsGuardian && !panel.treeActive && (
        <ActionForm action={giveGuardianConsentAction.bind(null, personId)} submit={t("giveAsParent")} className="flex flex-col gap-3">
          <p className="text-sm">{t("guardianNotice", { name })}</p>
          {tick(t("guardianConfirm", { name }))}
        </ActionForm>
      )}

      {panel.canRecordForm && !panel.treeActive && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("recordForm")}</summary>
          <ActionForm action={recordFormConsentAction.bind(null, personId)} submit={t("recordFormSubmit")} className="mt-3 flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input name="guardianName" required placeholder={t("guardianName")} />
              <Input name="guardianRelation" required placeholder={t("guardianRelation")} />
            </div>
            {tick(t("formConfirm"))}
          </ActionForm>
        </details>
      )}

      {panel.canGiveSelf && panel.hidden && (
        <ActionForm action={giveSelfConsentAction.bind(null, personId)} submit={t("giveSelf")} className="flex flex-col gap-3">
          {tick(t("selfConfirm"))}
        </ActionForm>
      )}

      {panel.canWithdraw && !panel.hidden && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-bad">{t("withdraw")}</summary>
          <ActionForm action={withdrawTreeConsentAction.bind(null, personId)} submit={t("withdrawSubmit")} variant="danger" className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-muted">{t("withdrawNotice")}</p>
            {tick(t("withdrawConfirm", { name }))}
          </ActionForm>
        </details>
      )}

      {showHistory && panel.records.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("history")}</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {panel.records.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-line px-3 py-1.5">
                <span className="font-medium">{t(`purpose_${r.purpose}`)}</span>
                <span className="text-muted">
                  {t(`basis_${r.basis}`)}
                  {r.guardianName ? ` · ${r.guardianName}${r.guardianRelation ? ` (${r.guardianRelation})` : ""}` : r.givenBy ? ` · ${r.givenBy.name}` : ""}
                </span>
                <span className="text-xs text-muted">{format.dateTime(r.givenAt, { dateStyle: "medium" })}</span>
                {r.withdrawnAt && (
                  <Badge tone="muted">
                    {t("withdrawnOn", { date: format.dateTime(r.withdrawnAt, { dateStyle: "medium" }) })}
                  </Badge>
                )}
                <span className="ml-auto text-[11px] text-muted">{t("notice", { v: r.noticeVersion })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
