import "server-only";
import { db } from "@/lib/db";

export type Option = { id: string; label: string };
export type GotraOption = Option & { kulas: string[] };

type GotraNames = { name: string; nameTe: string | null; nameKn: string | null; nameTa: string | null };

/** Gotra name in the viewer's language, falling back to the English transliteration. */
export function gotraLabel(g: GotraNames | null | undefined, locale: string) {
  if (!g) return null;
  const local = { te: g.nameTe, kn: g.nameKn, ta: g.nameTa }[locale];
  return local ? `${local} (${g.name})` : g.name;
}

type KulaScripts = Record<string, { te?: string; kn?: string; ta?: string }>;

/** Kula names in the viewer's script, with the English spelling alongside ("అరసకుల (Arasakula)"). */
export function kulaLabels(g: { kulas: string[]; kulaNames: unknown }, locale: string) {
  const local = (g.kulaNames ?? {}) as KulaScripts;
  return g.kulas.map((k) => {
    const s = locale === "te" || locale === "kn" || locale === "ta" ? local[k]?.[locale] : undefined;
    return s ? `${s} (${k})` : k;
  });
}

/** Gotras in the master list order, with their kula names (sankethanamams) – in both scripts, so either can be typed to find one. */
export async function gotraOptions(locale: string): Promise<GotraOption[]> {
  const gotras = await db.gotra.findMany({ orderBy: [{ no: { sort: "asc", nulls: "last" } }, { name: "asc" }] });
  return gotras.map((g) => ({ id: g.id, label: gotraLabel(g, locale)!, kulas: kulaLabels(g, locale) }));
}

export async function districtOptions(): Promise<Option[]> {
  const districts = await db.district.findMany({ orderBy: [{ state: "asc" }, { name: "asc" }] });
  return districts.map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` }));
}

export async function localOrgOptions() {
  const orgs = await db.organization.findMany({ where: { level: "LOCAL" }, orderBy: { name: "asc" } });
  return orgs.map((o) => ({ id: o.id, label: o.town ? `${o.name} (${o.town})` : o.name, districtId: o.districtId }));
}

/** Human-facing member code – a label for display and support, never the identity. */
export const memberCode = (memberNo: number) => `AVC-${String(memberNo).padStart(6, "0")}`;

export const fullName = (p: { givenName: string; surname: string }) => `${p.givenName} ${p.surname}`;

export const lifeSpan = (p: { birthDate: string | null; deathDate: string | null; isLiving: boolean }) => {
  const b = p.birthDate?.slice(0, 4) ?? "?";
  if (p.isLiving) return p.birthDate ? `b. ${b}` : "";
  return `${b} – ${p.deathDate?.slice(0, 4) ?? "?"}`;
};
