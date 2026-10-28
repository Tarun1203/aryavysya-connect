import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { deviceLabel } from "./device";
import { openSession, sealSession, sessionKey } from "./session-token";

// Password hashing lives in password.ts (argon2id, bcrypt still verified), shared with the seed
export { hashPassword, needsRehash, verifyPassword } from "./password";

/**
 * Sessions: the cookie is an encrypted token holding only a session id (session-token.ts); the
 * Session row says whether it is still live, so it can be ended before it expires – on sign-out,
 * from the account page's device list, or by an administrator.
 */
const COOKIE = "vamsha_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const TOUCH_EVERY_MS = 5 * 60 * 1000; // "last seen" is written at most every 5 minutes

const key = () => sessionKey(process.env.AUTH_SECRET);
const userInclude = { district: true, organization: true, adminOrg: true, inchargeOf: true } as const;

export async function startSession(userId: string) {
  const id = randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent");
  await db.session.create({ data: { id, userId, device: deviceLabel(ua), expiresAt: new Date(Date.now() + MAX_AGE * 1000) } });
  (await cookies()).set(COOKIE, await sealSession(id, key(), MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  // Now and then, clear out sessions that ended more than a month ago
  if (Math.random() < 0.02) {
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600e3);
    void db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: monthAgo } }, { revokedAt: { lt: monthAgo } }] } }).catch(() => {});
  }
}

export async function endSession() {
  const sid = await currentSessionId();
  if (sid) await db.session.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "signed-out" } });
  (await cookies()).delete(COOKIE);
}

/** The id of this request's session, if the cookie is valid (it may still have been revoked). */
export const currentSessionId = cache(async () => openSession((await cookies()).get(COOKIE)?.value, key()));

/**
 * The signed-in user: the session must exist, not be revoked or expired, and the user is re-read
 * with it on every request so role and status changes apply at once. One query; cached per request.
 */
export const currentUser = cache(async () => {
  const sid = await currentSessionId();
  if (!sid) return null;
  const session = await db.session.findUnique({ where: { id: sid }, include: { user: { include: userInclude } } });
  const now = Date.now();
  if (!session || session.revokedAt || session.expiresAt.getTime() < now) return null;
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.session.update({ where: { id: sid }, data: { lastSeenAt: new Date(now) } }).catch(() => {});
  }
  return session.user;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
