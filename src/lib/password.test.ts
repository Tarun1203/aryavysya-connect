import { test } from "node:test";
import assert from "node:assert/strict";
import argon2 from "argon2";
import bcrypt from "bcryptjs";
import { hashPassword, needsRehash, verifyPassword } from "./password";

test("new hashes are argon2id with the current settings", async () => {
  const h = await hashPassword("vasavi-2026!");
  assert.match(h, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  assert.equal(needsRehash(h), false);
  assert.equal(await verifyPassword("vasavi-2026!", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
});

test("old bcrypt hashes still verify, and are due for re-hashing", async () => {
  const old = await bcrypt.hash("kanyaka-parameswari", 10);
  assert.equal(await verifyPassword("kanyaka-parameswari", old), true);
  assert.equal(await verifyPassword("wrong", old), false);
  assert.equal(needsRehash(old), true);
});

test("argon2 hashes with weaker settings are due for re-hashing", async () => {
  const weak = await argon2.hash("x", { type: argon2.argon2id, memoryCost: 4096, timeCost: 1, parallelism: 1 });
  assert.equal(needsRehash(weak), true);
  const argon2i = await argon2.hash("x", { type: argon2.argon2i, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  assert.equal(await verifyPassword("x", argon2i), true);
});

test("a malformed stored hash fails safely instead of throwing", async () => {
  assert.equal(await verifyPassword("x", "$argon2id$garbage"), false);
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
});

test("passwords in Telugu, Kannada and Tamil work", async () => {
  for (const p of ["వాసవి-౨౦౨౬", "ವಾಸವಿ-೨೦೨೬", "வாசவி-௨௦௨௬"]) assert.equal(await verifyPassword(p, await hashPassword(p)), true);
});
