import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { db } from "./db";
import { decide, worst, type Decision, type Rule } from "./ratelimit-core";

export type { Decision, Rule } from "./ratelimit-core";

/**
 * Rate limiting on our own Postgres (no external service). Each rule counts requests per subject
 * (a phone number, an IP address, an account, or "all") in fixed windows; going over blocks the
 * subject, for longer each time it happens again (see ratelimit-core.ts). Keys are HMACs, so the
 * table holds no phone numbers, emails or IP addresses.
 *
 * Counting is a single INSERT … ON CONFLICT, so concurrent requests can't both slip under a limit.
 */

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;
const steady = { baseSec: 15 * MIN, maxSec: DAY, decaySec: DAY };

/** The limits used across the site, in one place. */
export const RULES = {
  // SMS codes: per number (a 30-second gap, then hourly/daily caps), per IP, and in all
  otpPhoneGap: { name: "otp:phone:gap", limit: 1, windowSec: 30 },
  otpPhoneHour: { name: "otp:phone:hour", limit: 5, windowSec: HOUR, backoff: { baseSec: HOUR, maxSec: DAY, decaySec: DAY } },
  otpPhoneDay: { name: "otp:phone:day", limit: 10, windowSec: DAY },
  otpIpHour: { name: "otp:ip:hour", limit: 10, windowSec: HOUR, backoff: steady },
  otpIpDay: { name: "otp:ip:day", limit: 30, windowSec: DAY },
  otpGlobalDay: { name: "otp:all:day", limit: Number(process.env.OTP_DAILY_LIMIT) || 500, windowSec: DAY },
  // Wrong codes from one IP, across all numbers (guessing codes for many members)
  otpVerifyIp: { name: "otp:verify:ip", limit: 20, windowSec: HOUR, backoff: steady },
  // Password sign-in: attempts per IP, and failures per account (cleared on success)
  loginIp: { name: "login:ip", limit: 20, windowSec: 15 * MIN, backoff: steady },
  loginAccount: { name: "login:account", limit: 5, windowSec: 15 * MIN, backoff: steady },
  // Registration: per IP, and in all
  registerIp: { name: "register:ip", limit: 5, windowSec: HOUR, backoff: { baseSec: HOUR, maxSec: DAY, decaySec: DAY } },
  registerGlobal: { name: "register:all", limit: 200, windowSec: HOUR },
  // Family-tree downloads per account (a whole lineage each – generous for a family, not a scraper)
  gedcomExport: { name: "gedcom:export", limit: 20, windowSec: HOUR, backoff: steady },
} satisfies Record<string, Rule>;

function keyFor(rule: Rule, subject: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256", secret).update(`rl:${rule.name}:${subject}`).digest("hex");
}

type Row = { points: number; windowEndsAt: Date; strikes: number; blockedUntil: Date | null };

/** Count one request for this subject under this rule, and decide on it. */
export async function hit(rule: Rule, subject: string): Promise<Decision> {
  const key = keyFor(rule, subject);
  const [row] = await db.$queryRaw<Row[]>`
    INSERT INTO "RateLimit" ("key", "points", "windowEndsAt", "updatedAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${rule.windowSec}), now())
    ON CONFLICT ("key") DO UPDATE SET
      "points" = CASE WHEN "RateLimit"."windowEndsAt" <= now() THEN 1 ELSE "RateLimit"."points" + 1 END,
      "windowEndsAt" = CASE WHEN "RateLimit"."windowEndsAt" <= now() THEN now() + make_interval(secs => ${rule.windowSec}) ELSE "RateLimit"."windowEndsAt" END,
      "updatedAt" = now()
    RETURNING "points", "windowEndsAt", "strikes", "blockedUntil"`;
  const decision = decide(rule, row, new Date());
  if (!decision.ok && decision.block) {
    await db.rateLimit.update({ where: { key }, data: { strikes: decision.block.strikes, blockedUntil: decision.block.until } });
  }
  if (randomInt(0, 200) === 0) void sweep();
  return decision;
}

/** Count one request under several rules at once; refused if any refuses (the longest wait wins). */
export async function hitAll(checks: [Rule, string][]): Promise<Decision> {
  return worst(await Promise.all(checks.map(([rule, subject]) => hit(rule, subject))));
}

/** Whether a subject is refused right now, without counting a request (e.g. before checking a password). */
export async function blocked(rule: Rule, subject: string): Promise<Decision> {
  const row = await db.rateLimit.findUnique({ where: { key: keyFor(rule, subject) } });
  const now = new Date();
  if (!row) return { ok: true };
  if (row.blockedUntil && row.blockedUntil > now) return { ok: false, retryAfterSec: Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000) };
  if (row.windowEndsAt > now && row.points >= rule.limit) return { ok: false, retryAfterSec: Math.ceil((row.windowEndsAt.getTime() - now.getTime()) / 1000) };
  return { ok: true };
}

/** Forget a subject's count (e.g. an account's failed sign-ins, after a successful one). */
export async function clear(rule: Rule, subject: string) {
  await db.rateLimit.deleteMany({ where: { key: keyFor(rule, subject) } });
}

/** Drop rows whose window and block ended more than a day ago. */
async function sweep() {
  const dayAgo = new Date(Date.now() - DAY * 1000);
  await db.rateLimit
    .deleteMany({ where: { windowEndsAt: { lt: dayAgo }, OR: [{ blockedUntil: null }, { blockedUntil: { lt: dayAgo } }] } })
    .catch(() => {});
}
