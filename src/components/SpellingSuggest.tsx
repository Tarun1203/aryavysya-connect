"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Confidence, Script } from "@/lib/translit";

type Result = { text: string; confidence: Confidence };

/**
 * "Fill in from the English name": suggests the given name and family name in Telugu, Kannada or
 * Tamil (the page's language by default), community spellings first, and says how sure it is.
 * Fills only fields that are empty unless asked to replace; the member can always correct them.
 */
export function SpellingSuggest({ from, to }: { from: [string, string]; to: [string, string] }) {
  const t = useTranslations("translit");
  const locale = useLocale();
  const [script, setScript] = useState<Script>(locale === "kn" || locale === "ta" ? locale : "te");
  const [state, setState] = useState<{ busy?: boolean; confidence?: Confidence; error?: boolean; filled?: number }>({});
  const anchor = useRef<HTMLDivElement>(null);

  const suggest = async () => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
    const sources = from.map((n) => field(n)?.value.trim() ?? "");
    if (!sources.some(Boolean)) return setState({ error: true });
    setState({ busy: true });
    try {
      const qs = new URLSearchParams([["script", script], ...sources.map((s) => ["text", s] as [string, string])]);
      const res = await fetch(`/api/translit?${qs}`);
      if (!res.ok) throw new Error();
      const results = (await res.json()) as Result[];
      let filled = 0;
      let low: Confidence = "verified";
      results.forEach((r, i) => {
        const target = field(to[i]);
        if (!target || !sources[i] || !r.text) return;
        // Never replace what is already there without asking
        if (target.value.trim() && !confirm(t("replace", { old: target.value, new: r.text }))) return;
        target.value = r.text;
        filled++;
        if (r.confidence === "guess" || (r.confidence === "community" && low === "verified")) low = r.confidence;
      });
      setState({ confidence: filled ? low : undefined, filled });
    } catch {
      setState({ error: true });
    }
  };

  return (
    <div ref={anchor} className="flex flex-wrap items-center gap-2 text-sm sm:col-span-2">
      <select value={script} onChange={(e) => setScript(e.target.value as Script)} aria-label={t("script")} className="h-9 rounded-xl border border-line bg-surface px-2">
        <option value="te">తెలుగు</option>
        <option value="kn">ಕನ್ನಡ</option>
        <option value="ta">தமிழ்</option>
      </select>
      <button type="button" onClick={suggest} disabled={state.busy} className="h-9 rounded-xl border border-brand px-3 text-brand hover:bg-brand-soft disabled:opacity-50">
        {t("suggest")}
      </button>
      <span aria-live="polite" className={`text-xs ${state.confidence === "guess" || state.error ? "text-gold" : "text-muted"}`}>
        {state.error ? t("needEnglish") : state.confidence ? t(`confidence_${state.confidence}`) : ""}
      </span>
    </div>
  );
}
