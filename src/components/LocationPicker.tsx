"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Option = { id: string; name: string };
type Place = {
  id: string;
  name: string;
  nameLocal: string | null;
  kind: "VILLAGE" | "POST_OFFICE";
  pincode: string | null;
  officeType: string | null;
  talukId: string | null;
  districtId?: string;
  taluk?: { name: string } | null;
  district?: { name: string; state: string };
};

export type PickedLocation = {
  state?: string | null;
  districtId?: string | null;
  talukId?: string | null;
  localityId?: string | null;
  localityLabel?: string | null;
};

const api = (q: Record<string, string>) => fetch(`/api/locations?${new URLSearchParams(q)}`).then((r) => (r.ok ? r.json() : []));

/**
 * Cascading State → District → Taluk → Village / Post office picker with pincode lookup.
 * Submits `<prefix>DistrictId`, `<prefix>TalukId`, `<prefix>LocalityId`, `<prefix>State` and a readable `<prefix>Text`.
 */
export function LocationPicker({
  prefix = "",
  defaults = {},
  required = false,
  showLocality = true,
  onDistrictChange,
  pinName,
  defaultPin = "",
}: {
  prefix?: string;
  defaults?: PickedLocation;
  required?: boolean;
  showLocality?: boolean;
  onDistrictChange?: (districtId: string) => void;
  /** Submit the pincode box under this name (used by search filters) */
  pinName?: string;
  defaultPin?: string;
}) {
  const t = useTranslations("locations");
  const field = (k: string) => (prefix ? prefix + k[0].toUpperCase() + k.slice(1) : k);

  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [taluks, setTaluks] = useState<Option[]>([]);
  const [state, setState] = useState(defaults.state ?? "");
  const [districtId, setDistrictId] = useState(defaults.districtId ?? "");
  const [talukId, setTalukId] = useState(defaults.talukId ?? "");
  const [locality, setLocality] = useState<{ id: string; label: string; pincode?: string | null } | null>(
    defaults.localityId ? { id: defaults.localityId, label: defaults.localityLabel ?? "" } : null
  );
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [pin, setPin] = useState(defaultPin);
  const [pinHits, setPinHits] = useState<Place[] | null>(null);

  useEffect(() => {
    api({ type: "states" }).then(setStates);
  }, []);
  useEffect(() => {
    if (state) api({ type: "districts", state }).then(setDistricts);
  }, [state]);
  useEffect(() => {
    onDistrictChange?.(districtId);
    if (districtId) api({ type: "taluks", districtId }).then(setTaluks);
  }, [districtId]); // eslint-disable-line react-hooks/exhaustive-deps

  // search villages / post offices inside the chosen district (and taluk)
  const searching = showLocality && !!districtId && !locality;
  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(() => {
      api({ type: "localities", districtId, talukId, q: query }).then(setHits);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, districtId, talukId, searching]);

  // Lists only apply while their parent is chosen (stale results from a previous choice are hidden)
  const districtList = state ? districts : [];
  const talukList = districtId ? taluks : [];
  const hitList = searching ? hits : [];

  const label = (p: Place) =>
    `${p.name}${p.nameLocal ? ` (${p.nameLocal})` : ""} · ${p.kind === "POST_OFFICE" ? `${t("postOffice")}${p.officeType ? ` ${p.officeType}` : ""}` : t("village")}${p.pincode ? ` · ${p.pincode}` : ""}`;

  function choose(p: Place) {
    if (p.district) {
      setState(p.district.state);
      setDistrictId(p.districtId!);
    }
    if (p.talukId) setTalukId(p.talukId);
    setLocality({ id: p.id, label: label(p), pincode: p.pincode });
    setPinHits(null);
    setHits([]);
    setQuery("");
  }

  async function lookupPin(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setPin(digits);
    if (digits.length !== 6) return setPinHits(null);
    const rows: Place[] = await api({ type: "pincode", pin: digits });
    if (rows.length === 1) choose(rows[0]);
    else setPinHits(rows);
  }

  const districtName = districtList.find((d) => d.id === districtId)?.name;
  const talukName = talukList.find((x) => x.id === talukId)?.name;
  const text = [locality?.label.split(" · ")[0], talukName, districtName, state].filter(Boolean).join(", ") + (locality?.pincode ? ` – ${locality.pincode}` : "");
  const select = "rounded-xl border border-line bg-background px-3 py-2 text-base outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={field("districtId")} value={districtId} />
      <input type="hidden" name={field("talukId")} value={talukId} />
      <input type="hidden" name={field("localityId")} value={locality?.id ?? ""} />
      <input type="hidden" name={field("state")} value={state} />
      <input type="hidden" name={field("text")} value={districtId ? text : ""} />

      {showLocality && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("pincode")}</span>
          <input
            inputMode="numeric"
            name={pinName}
            value={pin}
            onChange={(e) => lookupPin(e.target.value)}
            placeholder="522201"
            className={`${select} max-w-40`}
          />
          <span className="text-xs text-muted">{t("pincodeHint")}</span>
        </label>
      )}
      {pinHits && (
        <ul className="max-h-60 overflow-auto rounded-xl border border-line bg-surface text-sm">
          {pinHits.length === 0 && <li className="px-3 py-2 text-muted">{t("noMatches")}</li>}
          {pinHits.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => choose(p)} className="w-full px-3 py-2 text-left hover:bg-brand-soft">
                <div className="font-medium">{label(p)}</div>
                <div className="text-xs text-muted">{[p.taluk?.name, p.district?.name, p.district?.state].filter(Boolean).join(", ")}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            {t("state")}
            {required && " *"}
          </span>
          <select
            className={select}
            value={state}
            required={required}
            onChange={(e) => {
              setState(e.target.value);
              setDistrictId("");
              setTalukId("");
              setLocality(null);
            }}
          >
            <option value="">{t("choose")}</option>
            {[...new Set([...(state ? [state] : []), ...states])].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            {t("district")}
            {required && " *"}
          </span>
          <select
            className={select}
            value={districtId}
            required={required}
            disabled={!state}
            onChange={(e) => {
              setDistrictId(e.target.value);
              setTalukId("");
              setLocality(null);
            }}
          >
            <option value="">{t("choose")}</option>
            {districtList.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("taluk")}</span>
          <select
            className={select}
            value={talukId}
            disabled={!talukList.length}
            onChange={(e) => {
              setTalukId(e.target.value);
              setLocality(null);
            }}
          >
            <option value="">{talukList.length ? t("allTaluks") : "—"}</option>
            {talukList.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showLocality && districtId && (
        <div className="relative flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("locality")}</span>
          {locality ? (
            <div className="flex items-center justify-between rounded-xl border border-brand bg-brand-soft px-3 py-2">
              <span>{locality.label}</span>
              <button type="button" className="text-muted hover:text-brand" onClick={() => setLocality(null)} aria-label={t("clear")}>
                ✕
              </button>
            </div>
          ) : (
            <>
              <input className={select} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchLocality")} />
              {hitList.length > 0 && (
                <ul className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface shadow-lg">
                  {hitList.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => choose(p)} className="w-full px-3 py-2 text-left hover:bg-brand-soft">
                        {label(p)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
