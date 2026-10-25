"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/lib/forms";
import { Button, Notice } from "./ui";

/** Small wrapper for admin forms: runs a server action and shows its error / saved state. */
export function ActionForm({
  action,
  submit,
  children,
  className = "flex flex-col gap-3",
  variant = "primary",
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  submit: string;
  children?: ReactNode;
  className?: string;
  variant?: "primary" | "ghost" | "danger";
}) {
  const t = useTranslations("admin");
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{t("saved")}</Notice>}
      {children}
      <Button variant={variant} disabled={pending} className="self-start">
        {submit}
      </Button>
    </form>
  );
}
