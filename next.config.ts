import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { staticSecurityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Don't advertise the framework
  poweredByHeader: false,
  // Security headers on every response (the Content-Security-Policy is set per request in src/proxy.ts)
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders(process.env.NODE_ENV === "production") }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
