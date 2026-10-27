"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { Link } from "@/i18n/navigation";

/** A row of links where a kumkum pill glides to the selected one. */
export function Segmented({ items, className = "" }: { items: { href: string; label: string; active: boolean }[]; className?: string }) {
  const id = useId();
  return (
    <nav className={`flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/80 p-1 text-sm shadow-soft backdrop-blur [scrollbar-width:none] ${className}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`relative isolate shrink-0 whitespace-nowrap rounded-xl px-3.5 py-1.5 transition-colors ${item.active ? "font-semibold text-white dark:text-[#1a0d08]" : "text-muted hover:text-foreground"}`}
        >
          {item.active && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-b from-brand to-brand/85 shadow-[0_6px_16px_-8px_var(--brand)]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
