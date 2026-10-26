"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FormState } from "@/lib/forms";
import type { Duplicate } from "@/lib/dedup";
import { ActionForm } from "@/components/ActionForm";
import { PersonPicker } from "@/components/PersonPicker";
import { Field, Input } from "@/components/ui";

type Hit = { id: string; label: string; detail: string };

export function ApproveClaimForm({
  action,
  claimed,
  suggestions = [],
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  claimed: Hit | null;
  /** Existing records that look like the person registering – link one instead of creating a duplicate */
  suggestions?: Duplicate[];
}) {
  const t = useTranslations();
  const free = suggestions.filter((s) => !s.claimed);
  const first = claimed ?? (free[0] ? { id: free[0].id, label: free[0].name, detail: free[0].detail } : null);
  const [mode, setMode] = useState<"link" | "create">(first ? "link" : "create");
  const [picked, setPicked] = useState<Hit | null>(first);

  return (
    <ActionForm action={action} submit={t("admin.approve")}>
      <input type="hidden" name="mode" value={mode} />
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-warn p-3">
          <p className="text-sm font-semibold">{t("admin.existingRecords", { count: suggestions.length })}</p>
          <p className="text-xs text-muted">{t("admin.existingRecordsHint")}</p>
          <ul className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <Link href={`/person/${s.id}`} target="_blank" className="font-medium hover:text-brand">
                    {s.name}
                  </Link>{" "}
                  <span className="text-xs text-muted">
                    {s.code} · {s.detail}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.reasons.map((r) => (
                      <span key={r} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs">
                        {t(`trees.reason_${r}`)}
                      </span>
                    ))}
                  </div>
                </div>
                {s.claimed ? (
                  <span className="text-xs text-muted">{t("admin.alreadyRegistered")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("link");
                      setPicked({ id: s.id, label: s.name, detail: s.detail });
                    }}
                    className={`rounded border px-2 py-1 text-xs ${picked?.id === s.id && mode === "link" ? "border-brand bg-brand text-white" : "border-line hover:bg-brand-soft"}`}
                  >
                    {t("admin.useThisRecord")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "link"} onChange={() => setMode("link")} className="accent-brand" />
          {claimed ? t("admin.linkClaimed") : t("admin.linkOther")}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "create"} onChange={() => setMode("create")} className="accent-brand" />
          {t("admin.createNew")}
        </label>
      </div>
      {mode === "link" ? (
        // Remount when a suggestion is picked so the picker shows it
        <PersonPicker key={picked?.id ?? "none"} name="personId" placeholder={t("admin.pickPerson")} initial={picked} />
      ) : (
        <Field label={t("admin.createUnder")}>
          <PersonPicker name="parentId" placeholder={t("admin.pickPerson")} />
        </Field>
      )}
      <Field label={t("admin.note")}>
        <Input name="note" />
      </Field>
    </ActionForm>
  );
}
