"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { gedcomImportAction } from "@/app/actions/gedcom";
import { Button, Card, Field, Input, Notice, Select } from "@/components/ui";

/**
 * Upload → preview → import. The form is never reset between the steps, so "Import" sends the same
 * file that was previewed; choosing another file clears the preview.
 */
export function GedcomImportForm({ districts }: { districts: { id: string; label: string }[] }) {
  const t = useTranslations("gedcom");
  const [state, dispatch, pending] = useActionState(gedcomImportAction, undefined);
  // Another file chosen since the preview: hide it, and the Import button with it
  const [stale, setStale] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    fd.set("intent", submitter?.value ?? "preview");
    setStale(false);
    startTransition(() => dispatch(fd));
  };
  const p = stale ? undefined : state?.preview;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.imported && (
        <Notice tone="ok">
          {t("imported", { count: state.imported.people })} <Link href={`/tree/${state.imported.firstId}`}>{t("openTree")} →</Link>
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("file")} hint={t("fileHint")}>
          <Input name="file" type="file" accept=".ged,.gedcom,text/plain" required onChange={() => setStale(true)} />
        </Field>
        <Field label={t("district")} hint={t("districtHint")}>
          <Select name="districtId" defaultValue="">
            <option value="">—</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="preview" variant={p ? "ghost" : "primary"} disabled={pending}>
          {t("preview")}
        </Button>
        {p && (
          <Button type="submit" name="intent" value="import" disabled={pending}>
            {t("import", { count: p.people })}
          </Button>
        )}
      </div>

      {p && (
        <Card className="flex flex-col gap-3 text-sm">
          <h3 className="font-semibold">{t("previewTitle")}</h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>{t("countPeople", { count: p.people, living: p.living })}</li>
            <li>{t("countLinks", { links: p.parentLinks, couples: p.couples })}</li>
            <li>{t("countGotras", { matched: p.gotrasMatched })}</li>
            {Object.keys(p.skipped).length > 0 && (
              <li>
                {t("skipped")}: {Object.entries(p.skipped).map(([k, n]) => `${k} ×${n}`).join(", ")}
              </li>
            )}
          </ul>
          {p.living > 0 && <Notice tone="warn">{t("livingNote")}</Notice>}
          {p.gotrasUnknown.length > 0 && (
            <p className="text-muted">
              {t("gotrasUnknown")}: {p.gotrasUnknown.join(", ")}
            </p>
          )}
          {p.possibleDuplicates.length > 0 && (
            <details open>
              <summary className="cursor-pointer font-medium">{t("duplicates", { count: p.possibleDuplicates.length })}</summary>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {p.possibleDuplicates.slice(0, 50).map((d, i) => (
                  <li key={i}>
                    {d.name} → {d.matches.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {p.warnings.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">{t("warnings", { count: p.warnings.length })}</summary>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {p.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <div>
            <p className="font-medium">{t("sample")}</p>
            <p className="text-muted">{p.sample.map((s) => (s.years ? `${s.name} (${s.years})` : s.name)).join(" · ")}</p>
          </div>
        </Card>
      )}
    </form>
  );
}
