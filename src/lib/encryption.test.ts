import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decryptValue, encryptValue, isEncrypted, keyIdOf, keyringFrom, lookupCandidates } from "./encryption-core";
import { parseEncryptedFields } from "./encrypted-fields";
import { FIELD_MAP } from "./encrypted-fields.generated";
import { createFieldCrypto } from "./encryption";

const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");
const ring1 = keyringFrom(`k1:${k1}`, undefined)!;
const ring2 = keyringFrom(`k1:${k1},k2:${k2}`, "k2")!;

test("randomized: round-trips, and the same value encrypts differently each time", () => {
  const a = encryptValue(ring1, "Grievance.message", "randomized", "Please correct my record");
  const b = encryptValue(ring1, "Grievance.message", "randomized", "Please correct my record");
  assert.ok(isEncrypted(a) && a !== b);
  assert.equal(decryptValue(ring1, "Grievance.message", a), "Please correct my record");
});

test("deterministic: the same value encrypts the same way, and round-trips (Telugu too)", () => {
  const a = encryptValue(ring1, "User.phone", "deterministic", "919876543210");
  assert.equal(a, encryptValue(ring1, "User.phone", "deterministic", "919876543210"));
  assert.notEqual(a, encryptValue(ring1, "User.phone", "deterministic", "919876543211"));
  assert.equal(decryptValue(ring1, "User.phone", encryptValue(ring1, "User.phone", "deterministic", "శ్రీనివాస్")), "శ్రీనివాస్");
});

test("a value is bound to its field: copied into another column it won't decrypt", () => {
  const a = encryptValue(ring1, "User.phone", "deterministic", "919876543210");
  assert.throws(() => decryptValue(ring1, "OtpChallenge.phone", a));
  assert.notEqual(a, encryptValue(ring1, "OtpChallenge.phone", "deterministic", "919876543210"));
});

test("tampering is detected", () => {
  const a = encryptValue(ring1, "Grievance.message", "randomized", "hello");
  const flipped = a.slice(0, -2) + (a.at(-2) === "A" ? "B" : "A") + a.at(-1);
  assert.throws(() => decryptValue(ring1, "Grievance.message", flipped));
});

test("rotation: old values still decrypt, new ones use the current key, lookups match both", () => {
  const old = encryptValue(ring1, "User.phone", "deterministic", "919876543210");
  assert.equal(keyIdOf(old), "k1");
  assert.equal(decryptValue(ring2, "User.phone", old), "919876543210");
  assert.equal(keyIdOf(encryptValue(ring2, "User.phone", "deterministic", "919876543210")), "k2");
  const candidates = lookupCandidates(ring2, "User.phone", "919876543210");
  assert.ok(candidates.includes("919876543210") && candidates.includes(old) && candidates.length === 3);
});

test("plain values from before encryption pass through", () => {
  assert.equal(decryptValue(ring1, "User.phone", "919876543210"), "919876543210");
  assert.equal(decryptValue(ring1, "User.phone", null), null);
});

test("bad keys are refused", () => {
  assert.throws(() => keyringFrom("k1:short", undefined));
  assert.throws(() => keyringFrom(`k1:${k1}`, "k9"));
  assert.equal(keyringFrom("", undefined), null);
});

test("the generated field map matches the @encrypted comments in schema.prisma", () => {
  assert.deepEqual(parseEncryptedFields(readFileSync("prisma/schema.prisma", "utf8")), FIELD_MAP);
});

test("schema markers: modes, and only String fields", () => {
  const map = parseEncryptedFields(`model A {\n  id String @id\n  /// @encrypted(deterministic)\n  x String?\n  /// @encrypted\n  y String\n  b B?\n}\nmodel B {\n  id String @id\n}\n`);
  assert.deepEqual(map.fields, { A: { x: "deterministic", y: "randomized" } });
  assert.deepEqual(map.relations, { A: { b: "B" } });
  assert.throws(() => parseEncryptedFields(`model A {\n  /// @encrypted\n  n Int\n}\n`));
});

test("the extension: writes encrypted, lookups rewritten, unsupported filters refused, results decrypted", () => {
  const c = createFieldCrypto(ring2, FIELD_MAP);
  const args = c.encryptArgs("User", "create", { data: { name: "A", phone: "919876543210" } }) as { data: { phone: string; name: string } };
  assert.ok(isEncrypted(args.data.phone) && args.data.name === "A");
  const where = c.encryptArgs("User", "findFirst", { where: { phone: "919876543210", phoneVerifiedAt: { not: null } } }) as { where: { phone: { in: string[] } } };
  assert.equal(where.where.phone.in.length, 3);
  assert.throws(() => c.encryptArgs("User", "findMany", { where: { phone: { contains: "98765" } } }));
  assert.throws(() => c.encryptArgs("Grievance", "findMany", { where: { message: "x" } }));
  // Nested: a district with its users, including a user's phone
  const row = { name: "Guntur", users: [{ name: "A", phone: args.data.phone }] };
  assert.deepEqual(c.decryptResult("District", row), { name: "Guntur", users: [{ name: "A", phone: "919876543210" }] });
});

test("without keys nothing is encrypted and lookups are untouched", () => {
  const c = createFieldCrypto(null, FIELD_MAP);
  assert.deepEqual(c.encryptArgs("User", "update", { where: { phone: "9198" }, data: { phone: "9198" } }), { where: { phone: "9198" }, data: { phone: "9198" } });
});
