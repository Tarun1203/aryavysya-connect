import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LEGAL_VERSION, legalContacts } from "@/lib/legal";
import { Card, Notice, PageTitle } from "./ui";

/**
 * Layout for the legal pages: title, version, a short summary in the reader's language, and the
 * full text (in English for now – the English text is the one that applies), with links between
 * the pages.
 */
export async function LegalPage({ page, children }: { page: "privacy" | "terms" | "childSafety" | "grievance"; children: ReactNode }) {
  const t = await getTranslations("legal");
  const locale = await getLocale();
  const summary = t.raw(`${page}Summary`) as string[];
  const c = legalContacts();
  const pages = [
    { href: "/privacy", key: "privacy" },
    { href: "/terms", key: "terms" },
    { href: "/child-safety", key: "childSafety" },
    { href: "/grievance", key: "grievance" },
  ] as const;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageTitle eyebrow={t("eyebrow")} sub={t("updated", { date: LEGAL_VERSION })}>
        {t(`${page}Title`)}
      </PageTitle>
      <nav className="flex flex-wrap gap-2 text-sm print:hidden">
        {pages.map((p) => (
          <Link
            key={p.key}
            href={p.href}
            className={`rounded-full border px-3 py-1 ${p.key === page ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line hover:border-brand/40"}`}
          >
            {t(`${p.key}Title`)}
          </Link>
        ))}
      </nav>
      {(!c.orgName || !c.officerEmail) && <Notice tone="warn">{t("notConfigured")}</Notice>}
      <Card className="flex flex-col gap-2 bg-brand-soft/40">
        <h2 className="font-semibold">{t("inBrief")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {locale !== "en" && <p className="text-xs text-muted">{t("englishApplies")}</p>}
      </Card>
      <article lang="en" className="legal flex flex-col gap-5 text-[15px] leading-relaxed">
        {children}
      </article>
    </div>
  );
}

/** A numbered section of the full text */
export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

/** The organisation and Grievance Officer, or a plain "not yet published" where a detail is missing */
export async function ContactBlock() {
  const c = legalContacts();
  const missing = "[not yet published]";
  return (
    <dl className="grid gap-1 rounded-xl border border-line bg-surface p-4 text-sm sm:grid-cols-[12rem_1fr]">
      <dt className="text-muted">Organisation (Data Fiduciary)</dt>
      <dd>{c.orgName ?? missing}</dd>
      <dt className="text-muted">Address</dt>
      <dd>{c.orgAddress ?? missing}</dd>
      <dt className="text-muted">Grievance Officer</dt>
      <dd>{c.officerName ?? missing}</dd>
      <dt className="text-muted">Email</dt>
      <dd>{c.officerEmail ? <a href={`mailto:${c.officerEmail}`} className="text-brand underline">{c.officerEmail}</a> : missing}</dd>
      {c.officerPhone && (
        <>
          <dt className="text-muted">Phone</dt>
          <dd>{c.officerPhone}</dd>
        </>
      )}
    </dl>
  );
}
