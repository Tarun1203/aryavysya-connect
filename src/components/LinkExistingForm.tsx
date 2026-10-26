"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/lib/forms";
import { PersonPicker } from "./PersonPicker";
import { MarriageFlags } from "./MarriageFlags";
import { Button, Notice } from "./ui";

export function LinkExistingForm({ action }: { action: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, undefined);
  // Dispatch by hand so the picked person stays selected while the marriage check asks for confirmation
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <PersonPicker name="otherId" placeholder={t("match.searchPlaceholder")} />
      {state?.marriageFlags ? (
        <MarriageFlags
          flags={state.marriageFlags}
          relative={state.relative}
          confirm={
            <Button name="confirmMatch" value="yes" variant="danger" disabled={pending}>
              {t("person.confirmMarriage")}
            </Button>
          }
        />
      ) : (
        <Button variant="ghost" disabled={pending} className="self-start">
          {t("person.save")}
        </Button>
      )}
    </form>
  );
}
