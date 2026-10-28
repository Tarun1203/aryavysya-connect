"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentUser, startSession } from "@/lib/auth";
import { audit } from "@/lib/permissions";
import { str } from "@/lib/forms";
import { headers } from "next/headers";
import { checkCode, hashIp, maskPhone, normalizePhone, sendCode, type SendResult } from "@/lib/otp";

/**
 * The client's IP for the per-IP limit. Behind Render's proxy the last X-Forwarded-For entry is
 * the address the proxy saw; earlier entries can be set by the client, so they aren't trusted.
 */
async function requesterIp() {
  const h = await headers();
  const chain = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return hashIp(chain.at(-1) ?? h.get("x-real-ip") ?? "local");
}

/** Two steps: ask for the number, then for the code sent to it. `phone` is carried between them. */
export type OtpState = { step: "phone" | "code"; phone?: string; sentTo?: string; error?: string; info?: string; ok?: boolean } | undefined;

async function sendError(r: Exclude<SendResult, { ok: true }>) {
  const t = await getTranslations("otp");
  return r.reason === "wait" ? t("wait", { seconds: r.seconds ?? 30 }) : t(r.reason);
}

/**
 * Sign-in, step 1. A code goes only to a number a member has verified. Unknown numbers go through
 * the same limits and get the same answers (a failed SMS shows as sent too, and is logged), so
 * the form can't be used to find members' numbers.
 */
export async function sendLoginCodeAction(_: OtpState, fd: FormData): Promise<OtpState> {
  const t = await getTranslations("otp");
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return { step: "phone", error: t("invalidPhone") };
  const user = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } }, select: { id: true } });
  const sent = await sendCode(phone, "LOGIN", user?.id ?? null, await requesterIp());
  if (!sent.ok && sent.reason !== "sendFailed") {
    return { step: sent.reason === "wait" ? "code" : "phone", phone, sentTo: maskPhone(phone), error: await sendError(sent) };
  }
  return { step: "code", phone, sentTo: maskPhone(phone), info: t("sentIfRegistered", { phone: maskPhone(phone) }) };
}

/** Sign-in, step 2. */
export async function verifyLoginCodeAction(_: OtpState, fd: FormData): Promise<OtpState> {
  const t = await getTranslations("otp");
  const phone = normalizePhone(str(fd, "phone"));
  const code = str(fd, "code") ?? "";
  if (!phone) return { step: "phone", error: t("invalidPhone") };
  const result = await checkCode(phone, "LOGIN", code);
  if (!result.ok) return { step: "code", phone, sentTo: maskPhone(phone), error: t(result.reason) };
  const user = await db.user.findUnique({ where: { id: result.userId } });
  // The number must still belong to this member
  if (!user || user.phone !== phone || !user.phoneVerifiedAt) return { step: "phone", error: t("expired") };
  await startSession(user.id);
  await db.auditLog.create({ data: { userId: user.id, action: "login-otp", entity: "User", entityId: user.id } });
  redirect({ href: "/", locale: await getLocale() });
}

/** Verifying the signed-in member's number, step 1. */
export async function sendVerifyCodeAction(_: OtpState, fd: FormData): Promise<OtpState> {
  const t = await getTranslations("otp");
  const user = await currentUser();
  if (!user) return { step: "phone", error: t("signInFirst") };
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return { step: "phone", error: t("invalidPhone") };
  // Whether another member has this number is said only after the code proves it's yours
  // (confirmVerifyCodeAction), so this form can't be used to look up members' numbers
  const sent = await sendCode(phone, "VERIFY_PHONE", user.id, await requesterIp());
  if (!sent.ok) return { step: sent.reason === "wait" ? "code" : "phone", phone, sentTo: maskPhone(phone), error: await sendError(sent) };
  return { step: "code", phone, sentTo: maskPhone(phone), info: t("sent", { phone: maskPhone(phone) }) };
}

/** Verifying the signed-in member's number, step 2: the number is saved as verified. */
export async function confirmVerifyCodeAction(_: OtpState, fd: FormData): Promise<OtpState> {
  const t = await getTranslations("otp");
  const user = await currentUser();
  if (!user) return { step: "phone", error: t("signInFirst") };
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return { step: "phone", error: t("invalidPhone") };
  const result = await checkCode(phone, "VERIFY_PHONE", str(fd, "code") ?? "");
  if (!result.ok || result.userId !== user.id) return { step: "code", phone, sentTo: maskPhone(phone), error: t(result.ok ? "wrong" : result.reason) };
  const taken = await db.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null }, id: { not: user.id } }, select: { id: true } });
  if (taken) return { step: "phone", error: t("phoneTaken") };
  await db.user.update({ where: { id: user.id }, data: { phone, phoneVerifiedAt: new Date() } });
  await audit(user, "verify-phone", "User", user.id, { phone: maskPhone(phone) });
  revalidatePath("/", "layout");
  return { step: "phone", ok: true, info: t("verified") };
}
