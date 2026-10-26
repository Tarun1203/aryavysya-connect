"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { GotraOption } from "@/lib/reference";
import { Input, Select } from "./ui";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Gotra dropdown that can also be found by a kula name (sankethanamam), which many families know better. */
export function GotraSelect({
  name,
  gotras,
  defaultValue,
  emptyLabel,
}: {
  name: string;
  gotras: GotraOption[];
  defaultValue?: string | null;
  emptyLabel: string;
}) {
  const t = useTranslations("person");
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");

  const q = norm(query);
  const found = (text: string) => gotras.filter((g) => [g.label, ...g.kulas].some((s) => norm(s).includes(norm(text))));
  const matches = q ? gotras.filter((g) => g.id === value || found(query).includes(g)) : gotras;
  const selected = gotras.find((g) => g.id === value);

  const search = (text: string) => {
    setQuery(text);
    // When the search narrows to one gotra, pick it so the person doesn't have to open the list
    const hits = norm(text) ? found(text) : [];
    if (hits.length === 1) setValue(hits[0].id);
  };

  const kulaHit = (g: GotraOption) => (q ? g.kulas.find((k) => norm(k).includes(q)) : undefined);

  return (
    <div className="flex flex-col gap-2">
      <Input type="search" value={query} onChange={(e) => search(e.target.value)} placeholder={t("findGotra")} aria-label={t("findGotra")} />
      <Select name={name} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">{q && matches.length === (selected ? 1 : 0) && !found(query).length ? t("noGotraMatch") : emptyLabel}</option>
        {matches.map((g) => {
          const hit = kulaHit(g);
          return (
            <option key={g.id} value={g.id}>
              {hit ? `${g.label} — ${hit}` : g.label}
            </option>
          );
        })}
      </Select>
      {selected && selected.kulas.length > 0 && (
        <span className="text-xs text-muted">
          {t("kulas")}: {selected.kulas.join(", ")}
        </span>
      )}
    </div>
  );
}
