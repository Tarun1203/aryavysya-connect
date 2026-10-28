import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "@noble/ciphers/utils.js";
import { CHUNK, HEADER_LEN, backupKeyFrom, createOpener, createSealer } from "./backup-crypto";

const key = randomBytes(32);
const bytes = (n: number) => new Uint8Array(Buffer.concat(Array.from({ length: Math.ceil(n / 65536) + 1 }, () => randomBytes(65536))).subarray(0, n));

/** Seal `data`, fed in pieces of `step` bytes; returns the whole file. */
function seal(data: Uint8Array, step = 10_000, k = key) {
  const s = createSealer(k);
  const parts: Uint8Array[] = [s.header];
  for (let i = 0; i < data.length; i += step) parts.push(...s.push(data.subarray(i, i + step)));
  parts.push(s.finish());
  return Buffer.concat(parts);
}

function open(file: Uint8Array, step = 7_777, k = key) {
  const o = createOpener(k);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < file.length; i += step) parts.push(...o.push(file.subarray(i, i + step)));
  o.finish();
  return Buffer.concat(parts);
}

test("round trip at every awkward size", () => {
  for (const n of [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 2 * CHUNK, 3 * CHUNK + 5]) {
    const data = bytes(n);
    assert.deepEqual(open(seal(data)), Buffer.from(data), `size ${n}`);
  }
});

test("the same input encrypts differently each time", () => {
  const data = new TextEncoder().encode("same dump");
  assert.notDeepEqual(seal(data), seal(data));
});

test("a wrong key, a flipped bit, a cut file and reordered chunks are all refused", () => {
  const data = bytes(3 * CHUNK);
  const file = seal(data);
  assert.throws(() => open(file, 7_777, randomBytes(32)), /damaged or the key is wrong/);

  const flipped = Buffer.from(file);
  flipped[HEADER_LEN + 100] ^= 1;
  assert.throws(() => open(flipped), /damaged/);

  // Cut at a chunk boundary: everything that remains still authenticates, but the end is missing
  const chunkLen = 4 + CHUNK + 16;
  assert.throws(() => open(file.subarray(0, HEADER_LEN + 2 * chunkLen)), /incomplete/);

  const swapped = Buffer.concat([
    file.subarray(0, HEADER_LEN),
    file.subarray(HEADER_LEN + chunkLen, HEADER_LEN + 2 * chunkLen),
    file.subarray(HEADER_LEN, HEADER_LEN + chunkLen),
    file.subarray(HEADER_LEN + 2 * chunkLen),
  ]);
  assert.throws(() => open(swapped), /damaged/);

  assert.throws(() => open(Buffer.concat([file, file.subarray(HEADER_LEN)])), /after its last chunk|damaged/);
  assert.throws(() => open(Buffer.from("not a backup at all, just text…………………………")), /Not a backup file/);
});

test("BACKUP_KEY must be 32 bytes", () => {
  assert.throws(() => backupKeyFrom(undefined));
  assert.throws(() => backupKeyFrom(Buffer.alloc(16).toString("base64")));
  assert.equal(backupKeyFrom(Buffer.alloc(32, 7).toString("base64")).length, 32);
});
