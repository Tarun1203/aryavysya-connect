"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/lib/forms";
import { PersonPicker } from "./PersonPicker";
import { Button, Notice } from "./ui";

export function LinkExistingForm({ action }: { action: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <PersonPicker name="otherId" placeholder={t("match.searchPlaceholder")} />
      <Button variant="ghost" disabled={pending} className="self-start">
        {t("person.save")}
      </Button>
    </form>
  );
}
