import "server-only";
import { db } from "@/lib/db";

export type Option = { id: string; label: string };

type GotraNames = { name: string; nameTe: string | null; nameKn: string | null; nameTa: string | null };

/** Gotra name in the viewer's language, falling back to the English transliteration. */
export function gotraLabel(g: GotraNames | null | undefined, locale: string) {
  if (!g) return null;
  const local = { te: g.nameTe, kn: g.nameKn, ta: g.nameTa }[locale];
  return local ? `${local} (${g.name})` : g.name;
}

export async function gotraOptions(locale: string): Promise<Option[]> {
  const gotras = await db.gotra.findMany({ orderBy: { name: "asc" } });
  return gotras.map((g) => ({ id: g.id, label: gotraLabel(g, locale)! }));
}

export async function districtOptions(): Promise<Option[]> {
  const districts = await db.district.findMany({ orderBy: [{ state: "asc" }, { name: "asc" }] });
  return districts.map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` }));
}

export async function localOrgOptions() {
  const orgs = await db.organization.findMany({ where: { level: "LOCAL" }, orderBy: { name: "asc" } });
  return orgs.map((o) => ({ id: o.id, label: o.town ? `${o.name} (${o.town})` : o.name, districtId: o.districtId }));
}

export const fullName = (p: { givenName: string; surname: string }) => `${p.givenName} ${p.surname}`;

export const lifeSpan = (p: { birthDate: string | null; deathDate: string | null; isLiving: boolean }) => {
  const b = p.birthDate?.slice(0, 4) ?? "?";
  if (p.isLiving) return p.birthDate ? `b. ${b}` : "";
  return `${b} – ${p.deathDate?.slice(0, 4) ?? "?"}`;
};
