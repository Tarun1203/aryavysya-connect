import "server-only";
import { db } from "@/lib/db";
import type { PickedLocation } from "@/components/LocationPicker";

/** Keep a submitted locality id only if it exists (and lies in the district, when one is given). */
export async function validLocality(id: string | null | undefined, districtId?: string | null) {
  if (!id) return null;
  const l = await db.locality.findUnique({ where: { id }, select: { districtId: true } });
  if (!l || (districtId && l.districtId !== districtId)) return null;
  return id;
}

export async function validTaluk(id: string | null | undefined, districtId?: string | null) {
  if (!id) return null;
  const t = await db.taluk.findUnique({ where: { id }, select: { districtId: true } });
  if (!t || (districtId && t.districtId !== districtId)) return null;
  return id;
}

/** Drop picked place ids that don't exist, so a stale or tampered form can't break the save. */
export async function cleanPlaces<T extends { nativeLocalityId: string | null; birthLocalityId: string | null }>(data: T): Promise<T> {
  return {
    ...data,
    nativeLocalityId: await validLocality(data.nativeLocalityId),
    birthLocalityId: await validLocality(data.birthLocalityId),
  };
}

/** Initial values for a LocationPicker from saved ids. */
export async function pickerDefaults(localityId?: string | null, districtId?: string | null): Promise<PickedLocation> {
  if (localityId) {
    const l = await db.locality.findUnique({ where: { id: localityId }, include: { district: true } });
    if (l) {
      const kind = l.kind === "POST_OFFICE" ? `PO${l.officeType ? ` ${l.officeType}` : ""}` : "";
      return {
        state: l.district.state,
        districtId: l.districtId,
        talukId: l.talukId,
        localityId: l.id,
        localityLabel: [l.name + (l.nameLocal ? ` (${l.nameLocal})` : ""), kind, l.pincode].filter(Boolean).join(" · "),
      };
    }
  }
  if (districtId) {
    const d = await db.district.findUnique({ where: { id: districtId } });
    if (d) return { state: d.state, districtId: d.id };
  }
  return {};
}
