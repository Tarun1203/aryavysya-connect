"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_NAMES, routing, type Locale } from "@/i18n/routing";

export function LanguageSwitcher({ label, className = "" }: { label: string; className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute left-3 size-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M1.5 8h13M8 1.5c2 2 2.8 4.2 2.8 6.5S10 12.5 8 14.5M8 1.5C6 3.5 5.2 5.7 5.2 8S6 12.5 8 14.5" />
      </svg>
      <select
        aria-label={label}
        value={locale}
        className="appearance-none rounded-full border border-line bg-surface py-1.5 pl-8 pr-7 text-sm outline-none transition hover:border-brand/40 focus:ring-4 focus:ring-brand/15"
        onChange={(e) => router.replace(search ? `${pathname}?${search}` : pathname, { locale: e.target.value as Locale })}
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2.5 text-[10px] text-muted">
        ▼
      </span>
    </label>
  );
}
