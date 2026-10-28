"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { sendGrievanceAction } from "@/app/actions/grievance";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "./ui";

const KINDS = ["ACCESS", "CORRECTION", "ERASURE", "CONSENT", "NOMINATION", "CHILD_SAFETY", "COMPLAINT", "OTHER"] as const;

/** Request or complaint to the Grievance Officer; shows the reference number once sent. */
export function GrievanceForm({ defaults }: { defaults: { name?: string; contact?: string } }) {
  const t = useTranslations("legal");
  const [state, dispatch, pending] = useActionState(sendGrievanceAction, undefined);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  if (state?.ok) return <Notice tone="ok">{t("formSent", { reference: state.reference ?? "" })}</Notice>;
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {state?.error && (
          <div className="sm:col-span-2">
            <Notice tone="bad">{state.error}</Notice>
          </div>
        )}
        <Field label={`${t("formKind")} *`}>
          <Select name="kind" required defaultValue="">
            <option value="" disabled>
              {t("formChoose")}
            </option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind_${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("formAbout")} hint={t("formAboutHint")}>
          <Input name="about" />
        </Field>
        <Field label={`${t("formName")} *`}>
          <Input name="name" required defaultValue={defaults.name} />
        </Field>
        <Field label={`${t("formContact")} *`} hint={t("formContactHint")}>
          <Input name="contact" required defaultValue={defaults.contact} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={`${t("formMessage")} *`}>
            <Textarea name="message" required rows={5} maxLength={5000} />
          </Field>
        </div>
        <Button disabled={pending} className="self-start">
          {t("formSend")}
        </Button>
      </form>
    </Card>
  );
}
