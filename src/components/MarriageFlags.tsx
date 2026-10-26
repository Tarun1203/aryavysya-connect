"use client";

import { useTranslations } from "next-intl";
import { Notice } from "./ui";

/** What the marriage check found (sagotra, menarikam, other blood relation), with the button that confirms it anyway. */
export function MarriageFlags({ flags, relative, confirm }: { flags: string[]; relative?: string | null; confirm: React.ReactNode }) {
  const t = useTranslations("marriage");
  return (
    <Notice tone="warn">
      <p className="font-semibold">{t("checkTitle")}</p>
      <ul className="my-2 list-disc pl-5">
        {flags.map((f) => (
          <li key={f}>{t(`flag_${f}`, { name: relative ?? "" })}</li>
        ))}
      </ul>
      <p className="mb-2 text-sm">{t("checkHint")}</p>
      {confirm}
    </Notice>
  );
}
