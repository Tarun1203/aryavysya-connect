"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_NAMES, routing, type Locale } from "@/i18n/routing";

export function LanguageSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  return (
    <select
      aria-label={label}
      value={locale}
      className="rounded-md border border-line bg-background px-2 py-1"
      onChange={(e) => router.replace(search ? `${pathname}?${search}` : pathname, { locale: e.target.value as Locale })}
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
