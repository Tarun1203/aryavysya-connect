import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { blocked, hit, hitAll, RULES } from "./ratelimit";
import type { OtpPurpose } from "@/generated/prisma/client";

/**
 * One-time codes by SMS. The app makes and checks the codes itself; MSG91 only delivers them, so
 * a code is never trusted from the provider. Only an HMAC of each code is stored. A code lasts 10
 * minutes and allows 5 guesses. Sending is limited per number, per IP and in all, with growing
 * blocks for repeat offenders, and wrong codes are limited per IP across all numbers – see the
 * otp* rules in src/lib/ratelimit.ts.
 *
 * MSG91 needs MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID (a DLT-approved OTP template containing
 * ##OTP##). Without them, development prints the code to the server log and production refuses.
 */
const CODE_LENGTH = 6;
const EXPIRY_MIN = 10;
const MAX_ATTEMPTS = 5;

export type SendResult = { ok: true } | { ok: false; reason: "wait" | "tooMany" | "notConfigured" | "sendFailed"; seconds?: number };
export type CheckResult = { ok: true; userId: string } | { ok: false; reason: "wrong" | "expired" | "locked" };

/** Indian mobile numbers to digits with the country code: "098765 43210" → "919876543210". */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const national = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? `91${national}` : null;
}

/** "919876543210" → "+91 98•••••210", for showing where a code went. */
export const maskPhone = (phone: string) => `+${phone.slice(0, 2)} ${phone.slice(2, 4)}${"•".repeat(5)}${phone.slice(-3)}`;

const configured = () => !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID);
/** Whether codes can be sent at all (MSG91 is set up, or this is a development machine). */
export const otpAvailable = () => configured() || process.env.NODE_ENV !== "production";

function hmac(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256", secret).update(value).digest("hex");
}
const hash = (challengeId: string, code: string) => hmac(`${challengeId}:${code}`);
/** The requester's IP is kept only as an HMAC, for the per-IP limit. */
export const hashIp = (ip: string) => hmac(`ip:${ip}`);

async function deliver(phone: string, code: string): Promise<boolean> {
  if (!configured()) {
    if (process.env.NODE_ENV === "production") return false;
    console.log(`[dev OTP] +${phone}: ${code}`);
    return true;
  }
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.search = new URLSearchParams({
    template_id: process.env.MSG91_OTP_TEMPLATE_ID!,
    mobile: phone,
    otp: code,
    otp_length: String(CODE_LENGTH),
    otp_expiry: String(EXPIRY_MIN),
    realTimeResponse: "1",
  }).toString();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authkey: process.env.MSG91_AUTH_KEY!, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    // MSG91 can answer 200 with an error body, so the body decides
    const body = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
    if (res.ok && body?.type === "success") return true;
    console.error("MSG91 send failed", res.status, body?.message ?? "");
    return false;
  } catch (e) {
    console.error("MSG91 send failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Send a new code to this number, within the limits. With no user (a number no member has
 * verified) the request is counted against the same limits but nothing is sent, so neither the
 * reply nor the limits tell a stranger whether the number belongs to a member.
 */
export async function sendCode(phone: string, purpose: OtpPurpose, userId: string | null, ipHash: string): Promise<SendResult> {
  if (!otpAvailable()) return { ok: false, reason: "notConfigured" };
  const now = Date.now();
  // Request logs are kept for 30 days only (privacy notice, "How long we keep it")
  await db.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(now - 30 * 24 * 3600e3) } } });

  // The 30-second gap first: a quick second request is told to wait, not counted as abuse
  const gap = await hit(RULES.otpPhoneGap, phone);
  if (!gap.ok) return { ok: false, reason: "wait", seconds: gap.retryAfterSec };
  const limited = await hitAll([
    [RULES.otpPhoneHour, phone],
    [RULES.otpPhoneDay, phone],
    [RULES.otpIpHour, ipHash],
    [RULES.otpIpDay, ipHash],
  ]);
  if (!limited.ok) return { ok: false, reason: "tooMany", seconds: limited.retryAfterSec };

  if (!userId) {
    // Nothing to send. A short wait stands in for the SMS call, so timing doesn't tell either.
    await new Promise((r) => setTimeout(r, 250 + randomInt(0, 500)));
    return { ok: true };
  }
  // The overall daily cap counts real SMS only
  if (!(await hit(RULES.otpGlobalDay, "all")).ok) {
    console.error("OTP daily SMS limit reached");
    return { ok: false, reason: "sendFailed" };
  }

  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
  // Earlier unused codes for the same purpose stop working once a new one is sent
  await db.otpChallenge.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
  const challenge = await db.otpChallenge.create({
    data: { phone, purpose, userId, ipHash, codeHash: "pending", expiresAt: new Date(now + EXPIRY_MIN * 60e3) },
  });
  await db.otpChallenge.update({ where: { id: challenge.id }, data: { codeHash: hash(challenge.id, code) } });
  if (!(await deliver(phone, code))) {
    await db.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    return { ok: false, reason: "sendFailed" };
  }
  return { ok: true };
}

/**
 * Check a code against the latest one sent to this number for this purpose; a match uses it up.
 * Wrong codes also count against the requester's IP, so codes can't be guessed across many numbers.
 */
export async function checkCode(phone: string, purpose: OtpPurpose, code: string, ipHash: string): Promise<CheckResult> {
  if (!(await blocked(RULES.otpVerifyIp, ipHash)).ok) return { ok: false, reason: "locked" };
  const c = await db.otpChallenge.findFirst({ where: { phone, purpose, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!c || c.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (c.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  const given = code.replace(/\D/g, "");
  const a = Buffer.from(hash(c.id, given));
  const b = Buffer.from(c.codeHash);
  const match = given.length === CODE_LENGTH && a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    await hit(RULES.otpVerifyIp, ipHash);
    const { attempts } = await db.otpChallenge.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? "locked" : "wrong" };
  }
  // Use it once, even if two requests race
  const used = await db.otpChallenge.updateMany({ where: { id: c.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return used.count && c.userId ? { ok: true, userId: c.userId } : { ok: false, reason: "expired" };
}
