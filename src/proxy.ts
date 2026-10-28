import { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { buildCsp, newNonce } from "./lib/security-headers";

const handleI18nRouting = createMiddleware(routing);

/**
 * Language routing (next-intl), plus a Content-Security-Policy with a fresh nonce per request.
 * The nonce and policy go on the request too, so Next.js puts the nonce on the scripts it renders;
 * next-intl passes the request's headers on.
 */
export default function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = handleI18nRouting(new NextRequest(request, { headers }));
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except API routes, Next internals and static files; prefetches don't need a policy
  matcher: [
    {
      source: "/((?!api|_next|_vercel|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
