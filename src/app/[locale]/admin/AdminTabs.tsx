"use client";

import { Link, usePathname } from "@/i18n/navigation";

export function AdminTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => {
        // Sub-pages (e.g. /admin/trees/people) keep their tab lit; /admin itself matches only exactly
        const active = pathname === tab.href || (tab.href !== "/admin" && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm ${
              active ? "border-line border-b-background bg-background font-semibold text-brand" : "border-transparent text-muted hover:text-brand"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
