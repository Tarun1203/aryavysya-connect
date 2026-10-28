import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, newNonce, staticSecurityHeaders } from "./security-headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(name + " "));

test("production policy: nonce-only scripts, nothing from other origins, no eval", () => {
  const csp = buildCsp({ nonce: "abc123==", dev: false });
  assert.equal(directive(csp, "script-src"), "script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
  assert.ok(!csp.includes("unsafe-eval"));
  assert.ok(!/https?:/.test(csp), "no other origin is allowed");
  assert.equal(directive(csp, "object-src"), "object-src 'none'");
  assert.equal(directive(csp, "frame-ancestors"), "frame-ancestors 'none'");
  assert.equal(directive(csp, "form-action"), "form-action 'self'");
  assert.ok(csp.endsWith("upgrade-insecure-requests"));
});

test("development adds only what hot reloading needs", () => {
  const csp = buildCsp({ nonce: "n", dev: true });
  assert.ok(directive(csp, "script-src")?.includes("'unsafe-eval'"));
  assert.ok(directive(csp, "connect-src")?.includes("ws:"));
  assert.ok(!csp.includes("upgrade-insecure-requests"));
});

test("nonces are fresh and unguessable", () => {
  const seen = new Set(Array.from({ length: 1000 }, newNonce));
  assert.equal(seen.size, 1000);
  assert.equal(Buffer.from(newNonce(), "base64").length, 16);
});

test("static headers: HSTS only in production; the rest always", () => {
  const prod = Object.fromEntries(staticSecurityHeaders(true).map((h) => [h.key, h.value]));
  const dev = Object.fromEntries(staticSecurityHeaders(false).map((h) => [h.key, h.value]));
  assert.match(prod["Strict-Transport-Security"], /max-age=63072000/);
  assert.equal(dev["Strict-Transport-Security"], undefined);
  for (const h of [prod, dev]) {
    assert.equal(h["X-Content-Type-Options"], "nosniff");
    assert.equal(h["X-Frame-Options"], "DENY");
    assert.match(h["Permissions-Policy"], /camera=\(\).*fullscreen=\(self\)/);
  }
});
