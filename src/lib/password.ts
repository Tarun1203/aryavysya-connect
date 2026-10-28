import argon2 from "argon2";
import bcrypt from "bcryptjs";

/**
 * Password hashing: argon2id for every new hash, with OWASP's recommended settings (19 MiB of
 * memory, 2 passes, 1 lane) – safe to run several at once on a small server. Older bcrypt hashes
 * still verify, and any hash that isn't current (bcrypt, or argon2 with older settings) is
 * replaced on the member's next successful sign-in (see loginAction), so nobody has to reset a
 * password. Raising these settings later upgrades everyone the same way.
 *
 * No Next.js imports, so the seed script can use it too.
 */
export const ARGON2 = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return argon2.hash(password, ARGON2);
}

const isArgon2 = (hash: string) => hash.startsWith("$argon2");

/** Check a password against a stored hash of either kind. */
export async function verifyPassword(password: string, hash: string) {
  try {
    return isArgon2(hash) ? await argon2.verify(hash, password) : await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Whether a stored hash should be replaced with a current argon2id one. */
export function needsRehash(hash: string) {
  return !isArgon2(hash) || argon2.needsRehash(hash, ARGON2);
}
