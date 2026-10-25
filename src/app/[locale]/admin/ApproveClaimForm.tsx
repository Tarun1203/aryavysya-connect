"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/lib/forms";
import { ActionForm } from "@/components/ActionForm";
import { PersonPicker } from "@/components/PersonPicker";
import { Field, Input } from "@/components/ui";

type Hit = { id: string; label: string; detail: string };

export function ApproveClaimForm({
  action,
  claimed,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  claimed: Hit | null;
}) {
  const t = useTranslations("admin");
  const [mode, setMode] = useState<"link" | "create">(claimed ? "link" : "create");
  return (
    <ActionForm action={action} submit={t("approve")}>
      <input type="hidden" name="mode" value={mode} />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "link"} onChange={() => setMode("link")} className="accent-brand" />
          {claimed ? t("linkClaimed") : t("linkOther")}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "create"} onChange={() => setMode("create")} className="accent-brand" />
          {t("createNew")}
        </label>
      </div>
      {mode === "link" ? (
        <PersonPicker name="personId" placeholder={t("pickPerson")} initial={claimed} />
      ) : (
        <Field label={t("createUnder")}>
          <PersonPicker name="parentId" placeholder={t("pickPerson")} />
        </Field>
      )}
      <Field label={t("note")}>
        <Input name="note" />
      </Field>
    </ActionForm>
  );
}
