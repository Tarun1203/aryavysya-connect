"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";

const MIN = 0.3;
const MAX = 2;
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

/* The gotra switch is remembered in this browser (a convenience: it falls back to "own") */
const GOTRA_MODES = ["own", "birth", "mother", "all"] as const;
type GotraMode = (typeof GOTRA_MODES)[number];
const GOTRA_KEY = "vamsha.tree.gotra";
const gotraListeners = new Set<() => void>();
const readGotra = (): GotraMode => {
  try {
    const v = localStorage.getItem(GOTRA_KEY);
    return (GOTRA_MODES as readonly string[]).includes(v ?? "") ? (v as GotraMode) : "own";
  } catch {
    return "own";
  }
};
const writeGotra = (m: GotraMode) => {
  try {
    localStorage.setItem(GOTRA_KEY, m);
  } catch {
    // private window or blocked storage: the choice lasts for this page only
  }
  gotraListeners.forEach((l) => l());
};
const subscribeGotra = (l: () => void) => {
  gotraListeners.add(l);
  return () => void gotraListeners.delete(l);
};

/** Case- and accent-insensitive text for matching names */
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Frame for the tree views: as wide as the window and nearly as tall, with Fit and Full screen.
 * Opens centred on the person the tree was opened for. Interactions, all in the browser:
 *  - drag the background to move around; Ctrl/⌘ + wheel or a pinch zooms around the pointer;
 *    + / − / 0 on the keyboard zoom while the tree has focus
 *  - find a name: matches are outlined, Enter steps through them (opening collapsed branches)
 *  - collapse and expand branches (the buttons HierarchyTree renders under each card)
 *  - the gotra switch: own, birth, mother's or all three on every card (`gotraSwitch`)
 * When printed, the tree is scaled to the page and the zoom restored afterwards.
 */
export function TreeViewport({ children, gotraSwitch = false }: { children: ReactNode; gotraSwitch?: boolean }) {
  const t = useTranslations("tree");
  const tApp = useTranslations("app");
  const locale = useLocale();
  const frame = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [collapsed, setCollapsed] = useState(0);
  const gotra = useSyncExternalStore(subscribeGotra, readGotra, () => "own" as GotraMode);

  // Find
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ at: number; of: number }>({ at: 0, of: 0 });
  const matches = useRef<HTMLElement[]>([]);

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  /** Scroll so this element sits in the middle of the frame */
  const centreOn = (target: Element | null | undefined) => {
    const el = box.current;
    if (!el || !target) return;
    const a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
    el.scrollLeft += b.left - a.left - a.width / 2 + b.width / 2;
    el.scrollTop += b.top - a.top - a.height / 2 + b.height / 2;
  };
  const centre = () => centreOn(box.current?.querySelector("[data-focus]"));
  useEffect(centre, []);

  /** Zoom to `next`, keeping the point under (x, y) – screen coordinates – where it is */
  const zoomAt = (next: number, x?: number, y?: number) => {
    const el = box.current;
    const z = clamp(next);
    if (!el) return setZoom(z);
    const r = el.getBoundingClientRect();
    const ox = (x ?? r.left + r.width / 2) - r.left;
    const oy = (y ?? r.top + r.height / 2) - r.top;
    const k = z / zoomRef.current;
    const cx = el.scrollLeft + ox, cy = el.scrollTop + oy;
    flushSync(() => setZoom(z));
    zoomRef.current = z;
    el.scrollLeft = cx * k - ox;
    el.scrollTop = cy * k - oy;
  };

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Ctrl/⌘ + wheel (and a trackpad pinch, which arrives as one) zooms instead of scrolling the page.
  // Added by hand: React's wheel listener is passive and can't prevent the browser's own zoom.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Dragging with the mouse pans; two fingers pinch-zoom. Links, buttons and fields keep their clicks.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("a, button, summary, input, select, details[open]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomRef.current };
      drag.current = null;
      return;
    }
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = box.current!;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = box.current!;
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      zoomAt(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) el.setAttribute("data-dragging", "");
    d.moved = true;
    el.scrollLeft = d.left - dx;
    el.scrollTop = d.top - dy;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
    box.current?.removeAttribute("data-dragging");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("input, select")) return;
    if (e.key === "+" || e.key === "=") zoomAt(zoomRef.current + 0.15);
    else if (e.key === "-") zoomAt(zoomRef.current - 0.15);
    else if (e.key === "0") {
      setZoom(1);
      requestAnimationFrame(centre);
    } else return;
    e.preventDefault();
  };

  // Collapse / expand: one listener for every branch button in the tree
  const countCollapsed = () => setCollapsed(content.current?.querySelectorAll("li[data-collapsed]").length ?? 0);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    // Only one person's action menu open at a time; a click elsewhere closes it
    const menu = (e.target as Element).closest(".node-menu");
    content.current?.querySelectorAll(".node-menu[open]").forEach((d) => d !== menu && d.removeAttribute("open"));
    const button = (e.target as Element).closest<HTMLButtonElement>("[data-toggle]");
    const li = button?.closest("li");
    if (!button || !li) return;
    const closing = !li.hasAttribute("data-collapsed");
    li.toggleAttribute("data-collapsed", closing);
    button.setAttribute("aria-expanded", String(!closing));
    countCollapsed();
  };
  const expandAll = () => {
    content.current?.querySelectorAll("li[data-collapsed]").forEach((li) => {
      li.removeAttribute("data-collapsed");
      li.querySelector(":scope > div [data-toggle]")?.setAttribute("aria-expanded", "true");
    });
    countCollapsed();
  };

  // Find: mark every match, then step through them
  const show = (i: number) => {
    const list = matches.current;
    if (!list.length) return;
    const at = ((i % list.length) + list.length) % list.length;
    list.forEach((m, j) => m.toggleAttribute("data-match-current", j === at));
    // Open any collapsed branch the match is hidden in
    for (let li = list[at].closest("li[data-collapsed]"); li; li = li.parentElement?.closest("li[data-collapsed]") ?? null) {
      li.removeAttribute("data-collapsed");
      li.querySelector(":scope > div [data-toggle]")?.setAttribute("aria-expanded", "true");
    }
    countCollapsed();
    requestAnimationFrame(() => centreOn(list[at]));
    setFound({ at, of: list.length });
  };
  const search = (q: string) => {
    setQuery(q);
    content.current?.querySelectorAll("[data-match]").forEach((m) => {
      m.removeAttribute("data-match");
      m.removeAttribute("data-match-current");
    });
    const needle = fold(q.trim());
    matches.current =
      needle.length < 2 ? [] : [...(content.current?.querySelectorAll<HTMLElement>("[data-name]") ?? [])].filter((el) => fold(el.dataset.name ?? "").includes(needle));
    matches.current.forEach((m) => m.setAttribute("data-match", ""));
    if (matches.current.length) show(0);
    else setFound({ at: 0, of: 0 });
  };

  // Printing: scale the tree to a landscape A4 page (about 1040 × 715 CSS px inside the margins;
  // the title and the legend take about 190 of that on the first sheet). A tall tree keeps the page width and
  // runs onto further pages rather than shrinking too far.
  useEffect(() => {
    let saved = 1;
    const before = () => {
      const c = content.current;
      if (!c) return;
      saved = zoomRef.current;
      const r = c.getBoundingClientRect();
      const w = r.width / saved, h = r.height / saved;
      const byWidth = Math.min(1, 1040 / w);
      const onePage = Math.min(byWidth, 520 / h);
      flushSync(() => setZoom(onePage >= 0.3 ? onePage : byWidth));
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
    setZoom(Math.max(MIN, Math.min(1, (el.clientWidth - 8) / w, (el.clientHeight - 8) / h)));
    el.scrollTo({ left: 0, top: 0 });
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen?.();
  };

  const button = "grid h-8 min-w-8 place-items-center rounded-xl border border-line bg-surface/90 px-2 text-sm leading-none shadow-soft backdrop-blur hover:bg-brand-soft";
  const field = "h-8 rounded-xl border border-line bg-surface/90 px-2 text-sm shadow-soft backdrop-blur";
  return (
    // Breaks out of the centred page column to use the window's width
    <div
      ref={frame}
      data-gotra={gotra}
      className={`tree-frame relative ${full ? "bg-background" : "left-1/2 w-[calc(100vw-2rem)] max-w-[1800px] -translate-x-1/2 print:left-0 print:w-auto print:max-w-none print:translate-x-0"}`}
    >
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1">
          <input
            type="search"
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                show(found.at + (e.shiftKey ? -1 : 1));
              }
              if (e.key === "Escape") search("");
            }}
            placeholder={t("findPlaceholder")}
            aria-label={t("findLabel")}
            className={`${field} w-44`}
          />
          {query.trim().length >= 2 && (
            <>
              <span className="rounded-lg bg-surface/90 px-1.5 text-xs text-muted" aria-live="polite">
                {found.of ? t("findCount", { at: found.at + 1, of: found.of }) : t("findNone")}
              </span>
              {found.of > 1 && (
                <button type="button" className={button} onClick={() => show(found.at + 1)} aria-label={t("findNext")} title={t("findNext")}>
                  ↓
                </button>
              )}
            </>
          )}
          {gotraSwitch && (
            <label className="flex items-center gap-1 text-xs text-muted">
              <span className="rounded-lg bg-surface/90 px-1">{t("gotraShow")}</span>
              <select value={gotra} onChange={(e) => writeGotra(e.target.value as GotraMode)} className={field}>
                <option value="own">{t("gotraOwn")}</option>
                <option value="birth">{t("gotraBirth")}</option>
                <option value="mother">{t("gotraMother")}</option>
                <option value="all">{t("gotraAll")}</option>
              </select>
            </label>
          )}
          {collapsed > 0 && (
            <button type="button" className={`${button} text-xs`} onClick={expandAll}>
              {t("expandAll")}
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex gap-1">
          <button type="button" className={button} onClick={() => zoomAt(zoom - 0.15)} aria-label={t("zoomOut")}>
            −
          </button>
          <button type="button" className={`${button} text-xs`} onClick={() => (setZoom(1), requestAnimationFrame(centre))} title={t("zoomReset")}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className={button} onClick={() => zoomAt(zoom + 0.15)} aria-label={t("zoomIn")}>
            +
          </button>
          <button type="button" className={`${button} text-xs`} onClick={fit}>
            {t("fit")}
          </button>
          <button type="button" className={`${button} text-xs`} onClick={toggleFull} aria-pressed={full}>
            {full ? t("exitFullScreen") : t("fullScreen")}
          </button>
        </div>
      </div>
      <div
        ref={box}
        tabIndex={0}
        aria-label={t("panHint")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onClick={onClick}
        className={`tree-box cursor-grab touch-pan-x touch-pan-y overflow-auto border border-line bg-gradient-to-b from-brand-soft/40 to-background outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${full ? "h-screen" : "h-[calc(100dvh-8rem)] min-h-[420px] rounded-2xl"}`}
      >
        <div ref={content} style={{ zoom }} className="mx-auto w-max p-4 pt-24 sm:pt-14 print:pt-2">
          {children}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted print:hidden">{t("panHint")}</p>
      {/* Printed under the tree */}
      <p suppressHydrationWarning className="mt-3 hidden text-center text-[10px] text-muted print:block">
        {t("printedFrom", { site: tApp("name"), date: new Date().toLocaleDateString(locale, { dateStyle: "long" }) })}
      </p>
    </div>
  );
}
