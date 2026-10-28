import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Encrypted backup files (no I/O here, so it can be unit-tested). A database dump can be large, so
 * it is sealed in chunks – the STREAM construction: XChaCha20-Poly1305, each chunk's nonce is a
 * random per-file prefix plus the chunk's counter, and the header, counter and a "last chunk" flag
 * are bound in as associated data. Chunks can't be reordered, dropped, or the file cut short
 * without decryption failing. The key is derived with HKDF from BACKUP_KEY and the file's random
 * salt, so no two files share a key.
 *
 * File: "VVBK" ‖ version(1) ‖ salt(16) ‖ nonce prefix(16) ‖ chunks…
 * Chunk: length(4, big-endian, of the ciphertext) ‖ ciphertext ‖ tag(16)
 */

const MAGIC = new TextEncoder().encode("VVBK");
const VERSION = 1;
export const HEADER_LEN = MAGIC.length + 1 + 16 + 16;
export const CHUNK = 64 * 1024;
const TAG = 16;

/** BACKUP_KEY: 32 random bytes, base64 – kept apart from the field-encryption and session keys. */
export function backupKeyFrom(value: string | undefined): Uint8Array {
  const key = new Uint8Array(Buffer.from(value?.trim() ?? "", "base64"));
  if (key.length !== 32) throw new Error("BACKUP_KEY must be 32 random bytes, base64 (openssl rand -base64 32)");
  return key;
}

const fileKey = (master: Uint8Array, salt: Uint8Array) => hkdf(sha256, master, salt, new TextEncoder().encode("vamsha-backup-v1"), 32);

function nonceFor(prefix: Uint8Array, counter: number) {
  const n = new Uint8Array(24);
  n.set(prefix);
  new DataView(n.buffer).setBigUint64(16, BigInt(counter));
  return n;
}

function aadFor(header: Uint8Array, counter: number, last: boolean) {
  const a = new Uint8Array(header.length + 9);
  a.set(header);
  new DataView(a.buffer).setBigUint64(header.length, BigInt(counter));
  a[a.length - 1] = last ? 1 : 0;
  return a;
}

/** Seals a stream chunk by chunk. Call `push` with plaintext as it arrives, then `finish` once. */
export function createSealer(master: Uint8Array) {
  const salt = randomBytes(16);
  const prefix = randomBytes(16);
  const header = new Uint8Array(HEADER_LEN);
  header.set(MAGIC);
  header[MAGIC.length] = VERSION;
  header.set(salt, MAGIC.length + 1);
  header.set(prefix, MAGIC.length + 17);
  const key = fileKey(master, salt);
  let counter = 0;
  let pending = new Uint8Array(0);

  const seal = (plain: Uint8Array, last: boolean) => {
    const ct = xchacha20poly1305(key, nonceFor(prefix, counter), aadFor(header, counter, last)).encrypt(plain);
    counter++;
    const out = new Uint8Array(4 + ct.length);
    new DataView(out.buffer).setUint32(0, ct.length);
    out.set(ct, 4);
    return out;
  };

  return {
    header,
    /** Sealed chunks for every full chunk now available (one is always held back for `finish`). */
    push(data: Uint8Array): Uint8Array[] {
      const joined = new Uint8Array(pending.length + data.length);
      joined.set(pending);
      joined.set(data, pending.length);
      const out: Uint8Array[] = [];
      let at = 0;
      // Keep at least one byte back, so the last chunk is always sealed as the last
      while (joined.length - at > CHUNK) {
        out.push(seal(joined.subarray(at, at + CHUNK), false));
        at += CHUNK;
      }
      pending = joined.slice(at);
      return out;
    },
    finish(): Uint8Array {
      return seal(pending, true);
    },
  };
}

/** Opens a sealed stream. `push` returns plaintext as chunks complete; `finish` checks the end. */
export function createOpener(master: Uint8Array) {
  let buf = new Uint8Array(0);
  let header: Uint8Array | null = null;
  let key: Uint8Array | null = null;
  let prefix: Uint8Array | null = null;
  let counter = 0;
  let done = false;

  const take = (): Uint8Array[] => {
    const out: Uint8Array[] = [];
    if (!header) {
      if (buf.length < HEADER_LEN) return out;
      header = buf.slice(0, HEADER_LEN);
      if (MAGIC.some((b, i) => header![i] !== b)) throw new Error("Not a backup file");
      if (header[MAGIC.length] !== VERSION) throw new Error(`Unsupported backup version ${header[MAGIC.length]}`);
      key = fileKey(master, header.subarray(MAGIC.length + 1, MAGIC.length + 17));
      prefix = header.slice(MAGIC.length + 17);
      buf = buf.slice(HEADER_LEN);
    }
    for (;;) {
      if (buf.length < 4) return out;
      const len = new DataView(buf.buffer, buf.byteOffset).getUint32(0);
      if (len < TAG || len > CHUNK + TAG) throw new Error("Backup file is damaged");
      if (buf.length < 4 + len) return out;
      if (done) throw new Error("Backup file has data after its last chunk");
      const ct = buf.subarray(4, 4 + len);
      const open = (last: boolean) => {
        try {
          return xchacha20poly1305(key!, nonceFor(prefix!, counter), aadFor(header!, counter, last)).decrypt(ct);
        } catch {
          return null;
        }
      };
      // A short chunk can only be the last; a full one is either (the "last" flag in the
      // associated data decides which opens)
      let plain = len < CHUNK + TAG ? null : open(false);
      if (plain) done = false;
      else {
        plain = open(true);
        done = true;
      }
      if (!plain) throw new Error("Backup file is damaged or the key is wrong");
      counter++;
      out.push(plain);
      buf = buf.slice(4 + len);
    }
  };

  return {
    push(data: Uint8Array): Uint8Array[] {
      const joined = new Uint8Array(buf.length + data.length);
      joined.set(buf);
      joined.set(data, buf.length);
      buf = joined;
      return take();
    },
    finish() {
      if (!done || buf.length) throw new Error("Backup file is incomplete");
    },
  };
}
