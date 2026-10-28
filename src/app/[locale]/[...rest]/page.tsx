import { notFound } from "next/navigation";

/**
 * Any unknown path under a language shows our own 404 (./not-found.tsx) inside the normal layout,
 * rendered per request – so it carries the CSP nonce like every other page.
 */
export default function CatchAll() {
  notFound();
}
