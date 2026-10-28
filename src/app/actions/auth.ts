"use server";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { gender, str, type FormState } from "@/lib/forms";
import { validLocality } from "@/lib/locations/resolve";
import { recordConsent } from "@/lib/consent";
import { normalizePhone } from "@/lib/otp";
import { clientIp } from "@/lib/ip";
import { blocked, clear, hit, hitAll, RULES } from "@/lib/ratelimit";
import { worst } from "@/lib/ratelimit-core";

// Checked against when the email is unknown, so a wrong email takes as long as a wrong password
let decoyHash: Promise<string> | undefined;
const decoy = () => (decoyHash ??= hashPassword("decoy-password-never-used"));
const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));

/**
 * Password sign-in. Limited per IP (all attempts) and per account (failures, cleared on success),
 * with growing blocks; the same answer and timing whether or not the email is registered.
 */
export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const email = str(fd, "email")?.toLowerCase() ?? "";
  const password = str(fd, "password");
  const ip = await clientIp();
  const limited = worst([await hit(RULES.loginIp, ip), await blocked(RULES.loginAccount, email)]);
  if (!limited.ok) return { error: t("tooManyAttempts", { minutes: minutes(limited.retryAfterSec) }) };
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  const good = await verifyPassword(password ?? "", user?.passwordHash ?? (await decoy()));
  if (!user || !password || !good) {
    await hit(RULES.loginAccount, email);
    return { error: t("invalid") };
  }
  await clear(RULES.loginAccount, email);
  await startSession(user.id);
  redirect({ href: "/", locale: await getLocale() });
}

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  phone: z.string().nullable(),
  password: z.string().min(8),
  districtId: z.string().min(1),
  givenName: z.string().min(1),
  surname: z.string().min(1),
  gender,
  fatherName: z.string().nullable(),
  motherName: z.string().nullable(),
  birthYear: z.coerce.number().int().min(1850).max(2100).nullable(),
  nativePlace: z.string().nullable(),
  gotraId: z.string().nullable(),
  note: z.string().nullable(),
});

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const parsed = registerSchema.safeParse({
    name: str(fd, "name") ?? "",
    email: str(fd, "email")?.toLowerCase() ?? "",
    phone: str(fd, "phone"),
    password: str(fd, "password") ?? "",
    districtId: str(fd, "districtId") ?? "",
    givenName: str(fd, "givenName") ?? "",
    surname: str(fd, "surname") ?? "",
    gender: str(fd, "gender"),
    fatherName: str(fd, "fatherName"),
    motherName: str(fd, "motherName"),
    birthYear: str(fd, "birthYear"),
    nativePlace: str(fd, "nativePlace") ?? str(fd, "text"),
    gotraId: str(fd, "gotraId"),
    note: str(fd, "note"),
  });
  if (!parsed.success) return { error: t("errors.required") };
  const d = parsed.data;
  const regLimit = await hitAll([
    [RULES.registerIp, await clientIp()],
    [RULES.registerGlobal, "all"],
  ]);
  if (!regLimit.ok) return { error: t("auth.tooManyRegistrations", { minutes: minutes(regLimit.retryAfterSec) }) };
  // Only adults register; children are in the tree under their parents (terms, child safety)
  if (d.birthYear && new Date().getFullYear() - d.birthYear < 18) return { error: t("auth.under18") };
  // DPDP: membership and family-tree consent, each ticked separately
  if (fd.get("consentMembership") !== "on" || fd.get("consentTree") !== "on") return { error: t("consent.requiredAtRegistration") };
  if (await db.user.findUnique({ where: { email: d.email } })) return { error: t("auth.emailTaken") };
  // Only accept a local body that really belongs to the chosen district
  const orgId = str(fd, "organizationId");
  const org = orgId ? await db.organization.findFirst({ where: { id: orgId, level: "LOCAL", districtId: d.districtId } }) : null;

  const locale = await getLocale();
  const user = await db.user.create({
    data: {
      name: d.name,
      email: d.email,
      // Stored as digits with the country code when it is a valid mobile number; verified later by a code
      phone: normalizePhone(d.phone) ?? d.phone,
      passwordHash: await hashPassword(d.password),
      districtId: d.districtId,
      organizationId: org?.id,
      locale,
      claims: {
        create: {
          districtId: d.districtId,
          organizationId: org?.id,
          givenName: d.givenName,
          surname: d.surname,
          gender: d.gender,
          fatherName: d.fatherName,
          motherName: d.motherName,
          birthYear: d.birthYear,
          nativePlace: d.nativePlace,
          nativeLocalityId: await validLocality(str(fd, "localityId"), d.districtId),
          gotraId: d.gotraId,
          note: d.note,
        },
      },
    },
  });
  for (const purpose of ["MEMBERSHIP", "FAMILY_TREE"] as const) {
    await recordConsent({ purpose, basis: "SELF", userId: user.id, givenById: user.id });
  }
  await startSession(user.id);
  redirect({ href: "/account", locale });
}

export async function logoutAction() {
  await endSession();
  redirect({ href: "/", locale: await getLocale() });
}
