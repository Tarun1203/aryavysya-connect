import { z } from "zod";

/** Trimmed string field, or null when empty. */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** Comma-separated list field ("Lakshmi, Laxmi Devi"), trimmed and de-duplicated. */
export const splitList = (v: string | null) => [...new Set((v ?? "").split(",").map((s) => s.trim().replace(/s+/g, " ")).filter(Boolean))];

export const partialDate = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
  .nullable();

export const gender = z.enum(["MALE", "FEMALE", "OTHER"]);

export type FormState = { error?: string; ok?: boolean } | undefined;

/** Fields shared by the create-person and edit-person forms. */
export function personFields(fd: FormData) {
  return z
    .object({
      givenName: z.string().min(1),
      surname: z.string().min(1),
      givenNameLocal: z.string().nullable(),
      surnameLocal: z.string().nullable(),
      aliases: z.array(z.string()),
      gender,
      gotraId: z.string().nullable(),
      isLiving: z.boolean(),
      birthDate: partialDate,
      birthPlace: z.string().nullable(),
      deathDate: partialDate,
      deathTithi: z.string().nullable(),
      nativePlace: z.string().nullable(),
      nakshatra: z.string().nullable(),
      rasi: z.string().nullable(),
      kuladevata: z.string().nullable(),
      occupation: z.string().nullable(),
      currentCity: z.string().nullable(),
      notes: z.string().nullable(),
      districtId: z.string().nullable(),
      nativeLocalityId: z.string().nullable(),
      birthLocalityId: z.string().nullable(),
    })
    .safeParse({
      givenName: str(fd, "givenName") ?? "",
      surname: str(fd, "surname") ?? "",
      givenNameLocal: str(fd, "givenNameLocal"),
      surnameLocal: str(fd, "surnameLocal"),
      aliases: splitList(str(fd, "aliases")),
      gender: str(fd, "gender"),
      gotraId: str(fd, "gotraId"),
      isLiving: fd.get("isLiving") === "on",
      birthDate: str(fd, "birthDate"),
      // Typed text wins; otherwise use the place picked in the location directory
      birthPlace: str(fd, "birthPlace") ?? str(fd, "birthText"),
      deathDate: str(fd, "deathDate"),
      deathTithi: str(fd, "deathTithi"),
      nativePlace: str(fd, "nativePlace") ?? str(fd, "nativeText"),
      nakshatra: str(fd, "nakshatra"),
      rasi: str(fd, "rasi"),
      kuladevata: str(fd, "kuladevata"),
      occupation: str(fd, "occupation"),
      currentCity: str(fd, "currentCity"),
      notes: str(fd, "notes"),
      // The person's district is the district of their native place
      districtId: str(fd, "nativeDistrictId") ?? str(fd, "districtId"),
      nativeLocalityId: str(fd, "nativeLocalityId"),
      birthLocalityId: str(fd, "birthLocalityId"),
    });
}
