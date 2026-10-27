import type { ComponentProps, ReactNode } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  // A padding class passed in (e.g. "p-0" for a table card) replaces the default
  const padding = /(^|\s)p-\S+/.test(className) ? "" : "p-5";
  return <div className={`rounded-2xl border border-line bg-surface shadow-soft ${padding} ${className}`} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const control =
  "rounded-xl border border-line bg-background px-3 py-2 text-base outline-none transition placeholder:text-muted/60 hover:border-brand/40 focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:opacity-60";

export function Input(props: ComponentProps<"input">) {
  return <input className={control} {...props} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea className={control} rows={3} {...props} />;
}

export function Select({ children, ...props }: ComponentProps<"select">) {
  return (
    <select className={control} {...props}>
      {children}
    </select>
  );
}

export type ButtonVariant = "primary" | "ghost" | "danger";

/** Button look for links too (`<Link className={buttonClass("ghost")}>`). */
export function buttonClass(variant: ButtonVariant = "primary", className = "") {
  const styles = {
    // A light sweeps across the kumkum button on hover
    primary:
      "relative overflow-hidden bg-gradient-to-b from-brand to-brand-deep/90 text-white shadow-[0_8px_20px_-8px_var(--brand)] hover:-translate-y-px hover:shadow-[0_12px_26px_-10px_var(--brand)] before:absolute before:inset-0 before:shimmer before:opacity-0 hover:before:animate-shimmer hover:before:opacity-100 dark:from-brand dark:to-brand dark:text-[#1a0d08]",
    ghost: "border border-line bg-surface hover:border-brand/40 hover:bg-brand-soft",
    danger: "border border-bad/60 text-bad hover:bg-bad hover:text-white",
  }[variant];
  return `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 disabled:pointer-events-none disabled:opacity-50 ${styles} ${className}`;
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode }) {
  const styles = {
    info: "border-line bg-brand-soft/70",
    ok: "border-ok/30 bg-ok/10 text-ok",
    warn: "border-warn/30 bg-warn/10 text-warn",
    bad: "border-bad/30 bg-bad/10 text-bad",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Badge({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "gold" | "muted" }) {
  const styles = {
    brand: "border-brand/20 bg-brand-soft text-brand",
    gold: "border-accent/30 bg-accent/10 text-accent",
    muted: "border-line bg-surface-2 text-muted",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

/** Small uppercase label above a heading, with a turmeric dot. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
      <span aria-hidden className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
      {children}
    </span>
  );
}

export function PageTitle({ children, sub, eyebrow, actions }: { children: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="relative mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-3xl flex-col gap-2">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">{children}</h1>
        {sub && <p className="text-muted">{sub}</p>}
        <span aria-hidden className="mt-1 h-px w-24 bg-gradient-to-r from-brand via-accent to-transparent" />
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
