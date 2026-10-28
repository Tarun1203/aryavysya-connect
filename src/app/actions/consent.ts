"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/permissions";
import { str, type FormState } from "@/lib/forms";
import { CONSENT_NOTICE_VERSION, consentPanel, recordConsent, withdrawConsent } from "@/lib/consent";

const done = (): FormState => {
  revalidatePath("/", "layout");
  return { ok: true };
};

/** A parent gives family-tree consent for their minor child, through their own verified account. */
export async function giveGuardianConsentAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("consent");
  const user = await currentUser();
  const panel = await consentPanel(user, personId);
  if (!user || !panel?.canGiveAsGuardian) return { error: t("notAllowed") };
  if (fd.get("confirm") !== "on") return { error: t("confirmRequired") };
  await recordConsent({ purpose: "FAMILY_TREE", basis: "GUARDIAN", personId, givenById: user.id, guardianName: user.name, guardianRelation: "parent" });
  await audit(user, "consent-guardian", "Person", personId, { purpose: "FAMILY_TREE" });
  return done();
}

/** An administrator records a guardian's signed paper consent form for a minor. */
export async function recordFormConsentAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("consent");
  const user = await currentUser();
  const panel = await consentPanel(user, personId);
  if (!user || !panel?.canRecordForm) return { error: t("notAllowed") };
  const guardianName = str(fd, "guardianName");
  const guardianRelation = str(fd, "guardianRelation");
  if (!guardianName || !guardianRelation) return { error: t("guardianRequired") };
  if (fd.get("confirm") !== "on") return { error: t("confirmRequired") };
  await recordConsent({ purpose: "FAMILY_TREE", basis: "OFFLINE_FORM", personId, givenById: user.id, guardianName, guardianRelation });
  await audit(user, "consent-form", "Person", personId, { purpose: "FAMILY_TREE", guardianRelation });
  return done();
}

/** A registered adult gives family-tree consent for themselves (again, after withdrawing). */
export async function giveSelfConsentAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("consent");
  const user = await currentUser();
  const panel = await consentPanel(user, personId);
  if (!user || !panel?.canGiveSelf) return { error: t("notAllowed") };
  if (fd.get("confirm") !== "on") return { error: t("confirmRequired") };
  await recordConsent({ purpose: "FAMILY_TREE", basis: "SELF", personId, userId: user.id, givenById: user.id });
  await audit(user, "consent-self", "Person", personId, { purpose: "FAMILY_TREE" });
  return done();
}

/**
 * Withdraw family-tree consent: the person becomes private outside their family. When nothing was
 * ever recorded (an adult added by their family), the withdrawal is recorded on its own.
 */
export async function withdrawTreeConsentAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("consent");
  const user = await currentUser();
  const panel = await consentPanel(user, personId);
  if (!user || !panel?.canWithdraw) return { error: t("notAllowed") };
  if (fd.get("confirm") !== "on") return { error: t("confirmRequired") };
  const { count } = await withdrawConsent(personId, "FAMILY_TREE", user.id);
  if (!count) {
    const self = panel.canGiveSelf;
    await db.consent.create({
      data: {
        purpose: "FAMILY_TREE",
        basis: self ? "SELF" : panel.minor && panel.canGiveAsGuardian ? "GUARDIAN" : "OFFLINE_FORM",
        personId,
        givenById: user.id,
        noticeVersion: CONSENT_NOTICE_VERSION,
        withdrawnAt: new Date(),
        withdrawnById: user.id,
      },
    });
  }
  await audit(user, "consent-withdraw", "Person", personId, { purpose: "FAMILY_TREE" });
  return done();
}
