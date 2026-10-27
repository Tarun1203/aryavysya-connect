"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/** Scrollable, zoomable frame for the pictorial tree; opens centred on the person the tree was opened for. */
export function TreeViewport({ children }: { children: ReactNode }) {
  const t = useTranslations("tree");
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = box.current;
    const focus = el?.querySelector("[data-focus]");
    if (!el || !focus) return;
    const a = el.getBoundingClientRect(), b = focus.getBoundingClientRect();
    el.scrollLeft += b.left - a.left - a.width / 2 + b.width / 2;
    el.scrollTop += b.top - a.top - a.height / 2 + b.height / 2;
  }, []);

  const button = "size-8 rounded-xl border border-line bg-surface text-lg leading-none hover:bg-brand-soft";
  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        <button type="button" className={button} onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} aria-label={t("zoomOut")}>
          −
        </button>
        <button type="button" className={`${button} w-auto px-2 text-xs`} onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className={button} onClick={() => setZoom((z) => Math.min(2, z + 0.15))} aria-label={t("zoomIn")}>
          +
        </button>
      </div>
      <div ref={box} className="max-h-[75vh] overflow-auto rounded-xl border border-line bg-gradient-to-b from-brand-soft/40 to-background">
        <div style={{ zoom }} className="mx-auto w-max p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
