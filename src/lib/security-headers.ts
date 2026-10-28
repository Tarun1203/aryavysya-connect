/**
 * Security headers (pure, so they can be unit-tested). The Content-Security-Policy is built per
 * request in src/proxy.ts with a fresh nonce, so only scripts Next.js itself rendered can run
 * ('strict-dynamic' then lets those load their chunks). The other headers are static and set on
 * every response in next.config.ts, API routes and files included.
 *
 * Styles allow 'unsafe-inline': React and Motion set inline style attributes, which a nonce can't
 * cover. Everything else is self-hosted (next/font serves the fonts, photos come from /api/photo),
 * so no other origin is allowed anywhere.
 */
export function buildCsp({ nonce, dev }: { nonce: string; dev: boolean }) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? ["ws:", "wss:"] : [])],
    "media-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** A fresh, unguessable nonce for each request (16 random bytes, base64). */
export function newNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Headers for every response. HSTS only in production (it would pin localhost to HTTPS). */
export function staticSecurityHeaders(production: boolean) {
  return [
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The tree uses full screen; nothing else needs a device feature
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=(), fullscreen=(self)" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
}
