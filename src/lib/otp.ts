import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import type { OtpPurpose } from "@/generated/prisma/client";

/**
 * One-time codes by SMS. The app makes and checks the codes itself; MSG91 only delivers them, so
 * a code is never trusted from the provider. Only an HMAC of each code is stored. Limits: a code
 * lasts 10 minutes and allows 5 guesses; a number gets a new code at most every 30 seconds, 5 an
 * hour and 10 a day; one IP address may ask 10 times an hour and 30 a day; and at most
 * OTP_DAILY_LIMIT (default 500) SMS go out a day in all, so a run of requests can't run up the bill.
 *
 * MSG91 needs MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID (a DLT-approved OTP template containing
 * ##OTP##). Without them, development prints the code to the server log and production refuses.
 */
const CODE_LENGTH = 6;
const EXPIRY_MIN = 10;
const MAX_ATTEMPTS = 5;
const COOLDOWN_S = 30;
const PER_HOUR = 5;
const PER_DAY = 10;
const IP_PER_HOUR = 10;
const IP_PER_DAY = 30;
const dailyLimit = () => Number(process.env.OTP_DAILY_LIMIT) || 500;

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
 * verified) the request is logged and limited the same way but nothing is sent, so the reply and
 * the limits don't tell a stranger whether the number belongs to a member.
 */
export async function sendCode(phone: string, purpose: OtpPurpose, userId: string | null, ipHash: string): Promise<SendResult> {
  if (!otpAvailable()) return { ok: false, reason: "notConfigured" };
  const now = Date.now();
  const day = new Date(now - 24 * 3600e3);
  const [recent, fromIp, sentToday] = await Promise.all([
    db.otpChallenge.findMany({ where: { phone, createdAt: { gte: day } }, select: { createdAt: true }, orderBy: { createdAt: "desc" } }),
    db.otpChallenge.findMany({ where: { ipHash, createdAt: { gte: day } }, select: { createdAt: true } }),
    db.otpChallenge.count({ where: { userId: { not: null }, createdAt: { gte: day } } }),
  ]);
  const last = recent[0]?.createdAt.getTime();
  if (last && now - last < COOLDOWN_S * 1000) return { ok: false, reason: "wait", seconds: Math.ceil((COOLDOWN_S * 1000 - (now - last)) / 1000) };
  const inHour = (r: { createdAt: Date }) => now - r.createdAt.getTime() < 3600e3;
  if (recent.filter(inHour).length >= PER_HOUR || recent.length >= PER_DAY) return { ok: false, reason: "tooMany" };
  if (fromIp.filter(inHour).length >= IP_PER_HOUR || fromIp.length >= IP_PER_DAY) return { ok: false, reason: "tooMany" };
  if (userId && sentToday >= dailyLimit()) {
    console.error(`OTP daily limit (${dailyLimit()}) reached`);
    return { ok: false, reason: "sendFailed" };
  }

  if (!userId) {
    // Logged for the limits only: no code, nothing sent. A short wait stands in for the SMS call.
    await db.otpChallenge.create({ data: { phone, purpose, ipHash, codeHash: "", expiresAt: new Date(now), consumedAt: new Date(now) } });
    await new Promise((r) => setTimeout(r, 250 + randomInt(0, 500)));
    return { ok: true };
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

/** Check a code against the latest one sent to this number for this purpose; a match uses it up. */
export async function checkCode(phone: string, purpose: OtpPurpose, code: string): Promise<CheckResult> {
  const c = await db.otpChallenge.findFirst({ where: { phone, purpose, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!c || c.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (c.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  const given = code.replace(/\D/g, "");
  const a = Buffer.from(hash(c.id, given));
  const b = Buffer.from(c.codeHash);
  const match = given.length === CODE_LENGTH && a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    const { attempts } = await db.otpChallenge.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? "locked" : "wrong" };
  }
  // Use it once, even if two requests race
  const used = await db.otpChallenge.updateMany({ where: { id: c.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return used.count && c.userId ? { ok: true, userId: c.userId } : { ok: false, reason: "expired" };
}
