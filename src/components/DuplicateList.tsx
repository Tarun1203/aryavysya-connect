"use client";

import { startTransition, useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Duplicate } from "@/lib/dedup";
import type { FormState } from "@/lib/forms";
import { Button, Card, Notice } from "./ui";
import { MarriageFlags } from "./MarriageFlags";

/**
 * Possible duplicates found before creating a person. Each can be opened, or – when adding a
 * relative – linked in place of a new record ("claim, don't recreate"). The parent form renders
 * the "create anyway" button, since it has to submit that form's fields.
 */
export function DuplicateList({
  duplicates,
  linkAction,
  confirm,
}: {
  duplicates: Duplicate[];
  linkAction?: (s: FormState, fd: FormData) => Promise<FormState>;
  confirm: React.ReactNode;
}) {
  const t = useTranslations();
  const [linkState, link, linking] = useActionState(linkAction ?? (async () => undefined), undefined);
  const [lastId, setLastId] = useState<string | null>(null);
  const linkTo = (id: string, confirmMatch = false) => {
    setLastId(id);
    const fd = new FormData();
    fd.set("otherId", id);
    if (confirmMatch) fd.set("confirmMatch", "yes");
    startTransition(() => link(fd));
  };

  return (
    <Card className="flex flex-col gap-3 border-warn">
      <h3 className="font-semibold">{t("trees.possibleDuplicates", { count: duplicates.length })}</h3>
      <p className="text-sm text-muted">{t("trees.duplicatesHint")}</p>
      {linkState?.error && <Notice tone="bad">{linkState.error}</Notice>}
      {linkState?.marriageFlags && lastId && (
        <MarriageFlags
          flags={linkState.marriageFlags}
          relative={linkState.relative}
          confirm={
            <Button type="button" onClick={() => linkTo(lastId, true)} variant="danger" disabled={linking}>
              {t("person.confirmMarriage")}
            </Button>
          }
        />
      )}
      <ul className="flex flex-col gap-2">
        {duplicates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
            <div>
              <Link href={`/person/${d.id}`} target="_blank" className="font-medium hover:text-brand">
                {d.name}
              </Link>{" "}
              <span className="text-xs text-muted">{d.code}</span>
              <div className="text-xs text-muted">{d.detail}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {d.reasons.map((r) => (
                  <span key={r} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs">
                    {t(`trees.reason_${r}`)}
                  </span>
                ))}
                {d.claimed && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">{t("person.status_CLAIMED")}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {d.alreadyLinked ? (
                <span className="text-muted">{t("trees.alreadyLinkedHere")}</span>
              ) : (
                linkAction && (
                  // This list sits inside the person form, so the button calls the link action itself instead of submitting
                  <Button type="button" onClick={() => linkTo(d.id)} variant="ghost" disabled={linking}>
                    {t("trees.linkInstead")}
                  </Button>
                )
              )}
              <Link href={`/person/${d.id}`} className="text-brand hover:underline">
                {t("trees.openExisting")}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {confirm}
    </Card>
  );
}
