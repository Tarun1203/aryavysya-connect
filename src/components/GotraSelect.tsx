"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { GotraOption } from "@/lib/reference";
import { buildKulaIndex, confidentGotra, lookupKula, type KulaMatch } from "@/lib/kula";
import { Input, Select } from "./ui";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Gotra dropdown that can also be found by a kula name (sankethanamam), which many families know
 * better. Typing searches gotra names directly, and kula names through the kula lookup
 * (src/lib/kula.ts): any script, with or without the "kula" ending, tolerant of spelling. An exact
 * kula pointing to one gotra picks it; anything less certain is offered as suggestions to tap.
 */
export function GotraSelect({
  name,
  gotras,
  defaultValue,
  emptyLabel,
  required,
}: {
  name: string;
  gotras: GotraOption[];
  defaultValue?: string | null;
  emptyLabel: string;
  required?: boolean;
}) {
  const t = useTranslations("person");
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const index = useMemo(() => buildKulaIndex(gotras.flatMap((g) => g.kulaSpellings.map((k) => ({ gotraId: g.id, ...k })))), [gotras]);
  const byId = useMemo(() => new Map(gotras.map((g) => [g.id, g])), [gotras]);

  const q = norm(query);
  const byName = q ? gotras.filter((g) => norm(g.label).includes(q)) : [];
  const kulaMatches: KulaMatch[] = query.trim() ? lookupKula(index, query) : [];
  const viaKula = new Set(kulaMatches.map((m) => m.gotraId));
  const matches = q ? gotras.filter((g) => g.id === value || byName.includes(g) || viaKula.has(g.id)) : gotras;
  const selected = byId.get(value);

  const search = (text: string) => {
    setQuery(text);
    // One gotra by name, or an exact kula that belongs to one gotra: pick it so the list needn't be opened
    const names = norm(text) ? gotras.filter((g) => norm(g.label).includes(norm(text))) : [];
    const pick = names.length === 1 ? names[0].id : !names.length ? confidentGotra(lookupKula(index, text), text) : null;
    if (pick) setValue(pick);
  };

  // A kula in the viewer's script ("అరసకుల (Arasakula)"), as the gotra list labels it
  const kulaLabel = (m: KulaMatch) => {
    const g = byId.get(m.gotraId);
    return g?.kulas[g.kulaSpellings.findIndex((k) => k.kula === m.kula)] ?? m.kula;
  };
  // A kula match shown next to its gotra in the list
  const kulaFor = (id: string) => {
    const m = kulaMatches.find((x) => x.gotraId === id);
    return m && kulaLabel(m);
  };
  // Suggestions to tap when the lookup isn't sure enough to choose
  const suggestions = kulaMatches.filter((m) => m.gotraId !== value).slice(0, 4);

  return (
    <div className="flex flex-col gap-2">
      <Input type="search" value={query} onChange={(e) => search(e.target.value)} placeholder={t("findGotra")} aria-label={t("findGotra")} />
      <Select name={name} required={required} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">{q && !byName.length && !kulaMatches.length ? t("noGotraMatch") : emptyLabel}</option>
        {matches.map((g) => {
          const kula = kulaFor(g.id);
          return (
            <option key={g.id} value={g.id}>
              {kula ? `${g.label} — ${kula}` : g.label}
            </option>
          );
        })}
      </Select>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
          <span className="text-muted">{t(suggestions[0].how === "close" ? "kulaDidYouMean" : "kulaMatches")}</span>
          {suggestions.map((m) => (
            <button
              key={`${m.gotraId}|${m.kula}`}
              type="button"
              onClick={() => setValue(m.gotraId)}
              className="rounded-full border border-brand/40 px-2.5 py-1 text-brand hover:bg-brand-soft"
            >
              {t("kulaSuggestion", { kula: kulaLabel(m), gotra: byId.get(m.gotraId)?.label ?? "" })}
            </button>
          ))}
        </div>
      )}
      {selected && selected.kulas.length > 0 && (
        <span className="text-xs text-muted">
          {t("kulas")}: {selected.kulas.join(", ")}
        </span>
      )}
    </div>
  );
}
