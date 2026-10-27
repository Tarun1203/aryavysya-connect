"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";

/**
 * Frame for the tree views: as wide as the window and nearly as tall, scrollable and zoomable,
 * with Fit (whole tree on screen) and Full screen. Opens centred on the person the tree was
 * opened for. When printed, the tree is scaled to the page and the zoom restored afterwards.
 */
export function TreeViewport({ children }: { children: ReactNode }) {
  const t = useTranslations("tree");
  const tApp = useTranslations("app");
  const locale = useLocale();
  const frame = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);

  const centre = () => {
    const el = box.current;
    const focus = el?.querySelector("[data-focus]");
    if (!el || !focus) return;
    const a = el.getBoundingClientRect(), b = focus.getBoundingClientRect();
    el.scrollLeft += b.left - a.left - a.width / 2 + b.width / 2;
    el.scrollTop += b.top - a.top - a.height / 2 + b.height / 2;
  };
  useEffect(centre, []);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Printing: scale the tree to a landscape A4 page (about 1040 × 700 CSS px inside the margins).
  // A tall tree keeps the page width and runs onto further pages rather than shrinking too far.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    let saved = 1;
    const before = () => {
      const c = content.current;
      if (!c) return;
      saved = zoomRef.current;
      const r = c.getBoundingClientRect();
      const w = r.width / saved, h = r.height / saved;
      const byWidth = Math.min(1, 1040 / w);
      const onePage = Math.min(byWidth, 700 / h);
      flushSync(() => setZoom(onePage >= 0.45 ? onePage : byWidth));
    };
    const after = () => setZoom(saved);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  // Zoom so the whole tree fits the frame (never above 100%)
  const fit = () => {
    const el = box.current, c = content.current;
    if (!el || !c) return;
    // The rendered size includes the current zoom; divide it out to get the tree's natural size
    const r = c.getBoundingClientRect();
    const w = r.width / zoom, h = r.height / zoom;
    setZoom(Math.max(0.3, Math.min(1, (el.clientWidth - 8) / w, (el.clientHeight - 8) / h)));
    el.scrollTo({ left: 0, top: 0 });
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen?.();
  };

  const button = "grid h-8 min-w-8 place-items-center rounded-xl border border-line bg-surface/90 px-2 text-sm leading-none shadow-soft backdrop-blur hover:bg-brand-soft";
  return (
    // Breaks out of the centred page column to use the window's width
    <div ref={frame} className={`tree-frame relative ${full ? "bg-background" : "left-1/2 w-[calc(100vw-2rem)] max-w-[1800px] -translate-x-1/2"}`}>
      <div className="absolute right-3 top-3 z-10 flex gap-1 print:hidden">
        <button type="button" className={button} onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} aria-label={t("zoomOut")}>
          −
        </button>
        <button type="button" className={`${button} text-xs`} onClick={() => (setZoom(1), requestAnimationFrame(centre))} title={t("zoomReset")}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className={button} onClick={() => setZoom((z) => Math.min(2, z + 0.15))} aria-label={t("zoomIn")}>
          +
        </button>
        <button type="button" className={`${button} text-xs`} onClick={fit}>
          {t("fit")}
        </button>
        <button type="button" className={`${button} text-xs`} onClick={toggleFull} aria-pressed={full}>
          {full ? t("exitFullScreen") : t("fullScreen")}
        </button>
      </div>
      <div
        ref={box}
        className={`tree-box overflow-auto border border-line bg-gradient-to-b from-brand-soft/40 to-background ${full ? "h-screen" : "h-[calc(100dvh-8rem)] min-h-[420px] rounded-2xl"}`}
      >
        <div ref={content} style={{ zoom }} className="mx-auto w-max p-4 pt-14 print:pt-2">
          {children}
        </div>
      </div>
      {/* Printed under the tree */}
      <p suppressHydrationWarning className="mt-3 hidden text-center text-[10px] text-muted print:block">
        {t("printedFrom", { site: tApp("name"), date: new Date().toLocaleDateString(locale, { dateStyle: "long" }) })}
      </p>
    </div>
  );
}
