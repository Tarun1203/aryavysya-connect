import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { openSession, sealSession, sessionKey } from "./session-token";
import { deviceLabel } from "./device";

const key = sessionKey("test-secret-for-sessions");

test("a sealed session opens to its id", async () => {
  const token = await sealSession("sid-123", key, 3600);
  assert.equal(await openSession(token, key), "sid-123");
});

test("the cookie is encrypted: the session id can't be read from it", async () => {
  const token = await sealSession("sid-visible?", key, 3600);
  assert.equal(token.split(".").length, 5); // JWE compact form
  const decoded = token.split(".").map((p) => Buffer.from(p, "base64url").toString("latin1")).join("");
  assert.ok(!decoded.includes("sid-visible?"));
});

test("an altered, wrongly keyed, expired or missing cookie is refused", async () => {
  const token = await sealSession("sid-123", key, 3600);
  const parts = token.split(".");
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
  assert.equal(await openSession(parts.join("."), key), null);
  assert.equal(await openSession(token, sessionKey("another-secret")), null);
  assert.equal(await openSession(await sealSession("sid-123", key, -10), key), null);
  assert.equal(await openSession(undefined, key), null);
  assert.equal(await openSession("not-a-token", key), null);
});

test("an old signed (not encrypted) session cookie is not accepted", async () => {
  const old = await new SignJWT({ sid: "sid-123" }).setProtectedHeader({ alg: "HS256" }).setSubject("user").sign(new TextEncoder().encode("test-secret-for-sessions"));
  assert.equal(await openSession(old, key), null);
});

test("the key is derived from AUTH_SECRET, and an unset secret is refused", () => {
  assert.equal(key.length, 32);
  assert.notDeepEqual(Buffer.from(key), Buffer.from("test-secret-for-sessions"));
  assert.throws(() => sessionKey(undefined));
  assert.throws(() => sessionKey("change-me"));
});

test("devices get a short, plain label", () => {
  const cases: [string, string][] = [
    ["Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36", "Chrome on Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1", "Safari on iPhone"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0", "Edge on Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox on Mac"],
    ["Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", "Samsung Internet on Android"],
  ];
  for (const [ua, label] of cases) assert.equal(deviceLabel(ua), label);
  assert.equal(deviceLabel(null), null);
  assert.equal(deviceLabel("curl/8.0"), "Browser");
});
