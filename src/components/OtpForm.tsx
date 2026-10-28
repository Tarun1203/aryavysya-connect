"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { OtpState } from "@/app/actions/otp";
import { Button, Field, Input, Notice } from "./ui";

type Action = (s: OtpState, fd: FormData) => Promise<OtpState>;

/** Phone number, then the 6-digit code sent to it. Used for signing in and for verifying a number. */
export function OtpForm({ send, verify, submitLabel, initialPhone = "" }: { send: Action; verify: Action; submitLabel: string; initialPhone?: string }) {
  const t = useTranslations("otp");
  const [state, setState] = useState<OtpState>({ step: "phone" });
  const [phone, setPhone] = useState(initialPhone);
  const [pending, start] = useTransition();
  const run = (action: Action) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => setState(await action(state, fd)));
  };

  if (state?.step === "code") {
    return (
      <form onSubmit={run(verify)} className="flex flex-col gap-4">
        {state.info && <Notice tone="info">{state.info}</Notice>}
        {state.error && <Notice tone="bad">{state.error}</Notice>}
        <input type="hidden" name="phone" value={state.phone ?? ""} />
        <Field label={t("code")} hint={t("codeHint", { phone: state.sentTo ?? "" })}>
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus />
        </Field>
        <Button disabled={pending}>{submitLabel}</Button>
        <div className="flex flex-wrap gap-4 text-sm">
          <button
            type="button"
            className="text-brand hover:underline disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("phone", state.phone ?? "");
              start(async () => setState(await send(state, fd)));
            }}
          >
            {t("resend")}
          </button>
          <button type="button" className="text-muted hover:text-brand" onClick={() => setState({ step: "phone" })}>
            {t("changeNumber")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={run(send)} className="flex flex-col gap-4">
      {state?.ok && state.info && <Notice tone="ok">{state.info}</Notice>}
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Field label={t("phone")} hint={t("phoneHint")}>
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Button disabled={pending}>{t("sendCode")}</Button>
    </form>
  );
}
