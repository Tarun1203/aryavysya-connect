import "server-only";
import { headers } from "next/headers";

/**
 * The client's IP address, for rate limits. Behind Render's proxy the last X-Forwarded-For entry
 * is the address the proxy saw; earlier entries can be written by the client, so they aren't
 * trusted. Used only as a rate-limit subject (stored as an HMAC), never logged.
 */
export async function clientIp() {
  const h = await headers();
  const chain = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain.at(-1) ?? h.get("x-real-ip") ?? "local";
}
