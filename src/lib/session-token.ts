import { hkdfSync } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

/**
 * The session cookie's contents: an encrypted JWT (JWE, "dir" + A256GCM) holding only the
 * session id. Encrypted, not just signed, so nothing in the cookie can be read, and any change is
 * detected. The key is derived from AUTH_SECRET with HKDF, so it is never the secret itself;
 * changing AUTH_SECRET signs everyone out. No Next.js imports, so it can be unit-tested.
 */

export function sessionKey(secret: string | undefined) {
  if (!secret || secret === "change-me") throw new Error("AUTH_SECRET is not configured");
  return new Uint8Array(hkdfSync("sha256", secret, "aryavysya", "session-cookie:v1", 32));
}

export async function sealSession(sid: string, key: Uint8Array, maxAgeSec: number) {
  return new EncryptJWT({ sid })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .encrypt(key);
}

/** The session id in a cookie, or null if it is missing, expired, altered or not one of ours. */
export async function openSession(token: string | undefined, key: Uint8Array): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key, { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}
