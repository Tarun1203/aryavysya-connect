"use client";

import { usePathname } from "@/i18n/navigation";
import { Segmented } from "@/components/Segmented";

export function AdminTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <Segmented
      className="w-fit"
      items={tabs.map((tab) => ({
        ...tab,
        // Sub-pages (e.g. /admin/trees/people) keep their tab lit; /admin itself matches only exactly
        active: pathname === tab.href || (tab.href !== "/admin" && pathname.startsWith(`${tab.href}/`)),
      }))}
    />
  );
}
