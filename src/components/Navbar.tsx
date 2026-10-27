"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Link, usePathname } from "@/i18n/navigation";
import { LogoMark } from "./Logo";

export type NavLink = { href: string; label: string };

/**
 * Full-width at the top of the page; once scrolled it narrows into a floating, blurred pill.
 * A soft highlight slides between links on hover.
 */
export function Navbar({ brand, links, actions, menuLabel }: { brand: string; links: NavLink[]; actions: ReactNode; menuLabel: string }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const pathname = usePathname();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3">
      <motion.div
        initial={false}
        style={{ maxWidth: 1200 }}
        animate={{ maxWidth: scrolled ? 1040 : 1200, y: scrolled ? 4 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 32 }}
        className={`pointer-events-auto mx-auto flex items-center gap-3 rounded-2xl border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-300 ${
          scrolled || open ? "border-line bg-surface/80 shadow-soft backdrop-blur-xl" : "border-transparent bg-transparent"
        }`}
      >
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-xl pr-2" onClick={() => setOpen(false)}>
          <LogoMark className="size-9 shrink-0 drop-shadow-sm" />
          <span className="truncate font-display text-[15px] font-semibold leading-tight text-foreground sm:text-base">{brand}</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center xl:flex" onMouseLeave={() => setHovered(null)}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onMouseEnter={() => setHovered(l.href)}
              className={`relative isolate whitespace-nowrap px-3.5 py-2 text-sm transition-colors ${active(l.href) ? "font-semibold text-brand" : "text-foreground/75 hover:text-foreground"}`}
            >
              {hovered === l.href && (
                <motion.span layoutId="nav-hover" className="absolute inset-0 -z-10 rounded-full bg-brand-soft" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
              )}
              {l.label}
              {active(l.href) && <span aria-hidden className="absolute inset-x-3.5 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-brand to-transparent" />}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 whitespace-nowrap text-sm xl:flex">{actions}</div>

        <button
          type="button"
          aria-label={menuLabel}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="ml-auto grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface/70 xl:hidden"
        >
          <span className="relative block h-3 w-4">
            <span className={`absolute left-0 h-0.5 w-4 rounded bg-foreground transition ${open ? "top-1.5 rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 top-1.5 h-0.5 w-4 rounded bg-foreground transition ${open ? "opacity-0" : ""}`} />
            <span className={`absolute left-0 h-0.5 w-4 rounded bg-foreground transition ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
          </span>
        </button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto mx-auto mt-2 flex max-w-[1040px] flex-col gap-1 rounded-2xl border border-line bg-surface/95 p-3 shadow-soft backdrop-blur-xl xl:hidden"
          >
            {links.map((l, i) => (
              <motion.div key={l.href} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 ${active(l.href) ? "bg-brand-soft font-semibold text-brand" : "hover:bg-surface-2"}`}
                >
                  {l.label}
                </Link>
              </motion.div>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
              {actions}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
