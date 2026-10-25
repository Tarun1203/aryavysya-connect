"use client";

import { useEffect, useState } from "react";

type Hit = { id: string; label: string; detail: string };

/** Search-as-you-type person selector; submits the chosen id as `name`. */
export function PersonPicker({ name, placeholder, initial }: { name: string; placeholder: string; initial?: Hit | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [chosen, setChosen] = useState<Hit | null>(initial ?? null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/people?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setHits)
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={chosen?.id ?? ""} />
      {chosen ? (
        <div className="flex items-center justify-between rounded-lg border border-brand bg-brand-soft px-3 py-2">
          <span>
            <span className="font-medium">{chosen.label}</span>
            {chosen.detail && <span className="ml-2 text-xs text-muted">{chosen.detail}</span>}
          </span>
          <button type="button" className="text-sm text-muted hover:text-brand" onClick={() => setChosen(null)} aria-label="Clear">
            ✕
          </button>
        </div>
      ) : (
        <input
          className="w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-brand"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < 2) setHits([]);
          }}
        />
      )}
      {!chosen && hits.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-brand-soft"
                onClick={() => {
                  setChosen(h);
                  setHits([]);
                  setQ("");
                }}
              >
                <div className="font-medium">{h.label}</div>
                <div className="text-xs text-muted">{h.detail}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
