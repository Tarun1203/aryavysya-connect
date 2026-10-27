"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/lib/forms";
import { Button, Notice } from "./ui";

/**
 * Small wrapper for admin forms: runs a server action and shows its error / saved state.
 * Dispatched from onSubmit so an error keeps what was typed; the form clears only once saved.
 */
export function ActionForm({
  action,
  submit,
  children,
  className = "flex flex-col gap-3",
  variant = "primary",
  resetOnSave = false,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  submit: string;
  children?: ReactNode;
  className?: string;
  variant?: "primary" | "ghost" | "danger";
  resetOnSave?: boolean;
}) {
  const t = useTranslations("admin");
  const [state, dispatch, pending] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSave) form.current?.reset();
  }, [state, resetOnSave]);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return (
    <form ref={form} onSubmit={onSubmit} className={className}>
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.ok && <Notice tone="ok">{t("saved")}</Notice>}
      {children}
      <Button variant={variant} disabled={pending} className="self-start">
        {submit}
      </Button>
    </form>
  );
}
