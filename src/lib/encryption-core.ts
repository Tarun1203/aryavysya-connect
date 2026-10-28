import { gcm, gcmsiv } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Field encryption (no database here, so it can be unit-tested). Two modes:
 *  - "randomized": AES-256-GCM with a random nonce – reveals nothing, can't be searched.
 *  - "deterministic": AES-256-GCM-SIV with a nonce derived from the value (HMAC), so equal values
 *    encrypt equally and can still be looked up by equality. GCM-SIV stays safe with a derived
 *    nonce; the only thing revealed is which rows share a value.
 * Each field and mode gets its own key, derived with HKDF from a master key, and the field name is
 * bound in as associated data – so a value can't be copied into another column, and tampering is
 * detected. Master keys are versioned ("k1", "k2"…): every value carries the id of its key, old keys
 * keep decrypting after a rotation, and new writes use the current key.
 *
 * Stored form: enc:<keyId>:<r|d>:<base64url(nonce ‖ ciphertext ‖ tag)>
 */

export type Mode = "randomized" | "deterministic";
export type Keyring = { current: string; keys: Map<string, Uint8Array> };

const PREFIX = "enc:";
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

/**
 * Keys from the environment: FIELD_ENCRYPTION_KEYS="k1:<base64 32 bytes>,k2:<…>" and
 * FIELD_ENCRYPTION_CURRENT="k2" (default: the last one listed). Null when none are set.
 */
export function keyringFrom(keysVar: string | undefined, currentVar: string | undefined): Keyring | null {
  if (!keysVar?.trim()) return null;
  const keys = new Map<string, Uint8Array>();
  for (const part of keysVar.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [id, value] = part.split(":");
    if (!/^[A-Za-z0-9]+$/.test(id ?? "")) throw new Error("FIELD_ENCRYPTION_KEYS: key ids must be letters and digits");
    const bytes = new Uint8Array(Buffer.from(value ?? "", "base64"));
    if (bytes.length !== 32) throw new Error(`FIELD_ENCRYPTION_KEYS: key ${id} must be 32 bytes, base64-encoded`);
    keys.set(id, bytes);
  }
  const current = currentVar?.trim() || [...keys.keys()].at(-1)!;
  if (!keys.has(current)) throw new Error(`FIELD_ENCRYPTION_CURRENT: no key "${current}"`);
  return { current, keys };
}

/** The per-field, per-mode keys derived from one master key. */
function subkeys(master: Uint8Array, field: string, mode: Mode) {
  const okm = hkdf(sha256, master, undefined, enc.encode(`aryavysya:field:${field}:${mode}`), 64);
  return { key: okm.slice(0, 32), mac: okm.slice(32) };
}

export const isEncrypted = (v: unknown): v is string => typeof v === "string" && v.startsWith(PREFIX);

/** Encrypt a value for `field` ("Model.field") with a given key id (default: the current one). */
export function encryptValue(ring: Keyring, field: string, mode: Mode, plaintext: string, keyId = ring.current): string {
  const master = ring.keys.get(keyId);
  if (!master) throw new Error(`No encryption key "${keyId}"`);
  const { key, mac } = subkeys(master, field, mode);
  const aad = enc.encode(field);
  const pt = enc.encode(plaintext);
  if (mode === "randomized") {
    const nonce = randomBytes(12);
    return `${PREFIX}${keyId}:r:${b64(concat(nonce, gcm(key, nonce, aad).encrypt(pt)))}`;
  }
  const nonce = hmac(sha256, mac, concat(aad, pt)).slice(0, 12);
  return `${PREFIX}${keyId}:d:${b64(concat(nonce, gcmsiv(key, nonce, aad).encrypt(pt)))}`;
}

/** Decrypt a stored value; anything not in the encrypted form (a value from before encryption) is returned as it is. */
export function decryptValue(ring: Keyring | null, field: string, stored: unknown): unknown {
  if (!isEncrypted(stored)) return stored;
  if (!ring) throw new Error(`Encrypted value in ${field} but no FIELD_ENCRYPTION_KEYS`);
  const [, keyId, m, payload] = stored.split(":");
  const master = ring.keys.get(keyId);
  if (!master) throw new Error(`${field} was encrypted with key "${keyId}", which is no longer configured`);
  const mode: Mode = m === "d" ? "deterministic" : "randomized";
  const { key } = subkeys(master, field, mode);
  const bytes = unb64(payload);
  const nonce = bytes.slice(0, 12);
  const cipher = mode === "deterministic" ? gcmsiv(key, nonce, enc.encode(field)) : gcm(key, nonce, enc.encode(field));
  return dec.decode(cipher.decrypt(bytes.slice(12)));
}

/** The key id a stored value was encrypted with, or null for a plain value. */
export const keyIdOf = (stored: unknown) => (isEncrypted(stored) ? stored.split(":")[1] : null);

/**
 * Everything an equality lookup on a deterministic field must match: the value encrypted with
 * every configured key (so rows not yet re-encrypted after a rotation are still found), and the
 * plain value (rows from before encryption was switched on, until the backfill has run).
 */
export function lookupCandidates(ring: Keyring, field: string, plaintext: string): string[] {
  return [plaintext, ...[...ring.keys.keys()].map((id) => encryptValue(ring, field, "deterministic", plaintext, id))];
}

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
