/**
 * Notification rules (no I/O, so they can be unit-tested): which group each kind belongs to, which
 * channels a member's settings allow for it, and the words that may leave the site.
 *
 * Two groups, each with its own email and push switch:
 *  - "requests": something waits for this member's decision (a membership request, a proposed edit
 *    or dispute, a marriage proposed by another family)
 *  - "decisions": the answer to something they asked for
 * The in-app feed always shows everything.
 *
 * Email and push go through outside services (the mail server, the browser's push service), so they
 * carry only a generic sentence and a link: never a name, a gotra or any other detail. The details
 * are shown inside the site, to the signed-in member.
 */

export const KINDS = [
  "CLAIM_SUBMITTED",
  "CLAIM_ENDORSED",
  "CLAIM_APPROVED",
  "CLAIM_REJECTED",
  "CHANGE_PROPOSED",
  "CHANGE_APPROVED",
  "CHANGE_REJECTED",
  "MARRIAGE_PROPOSED",
  "MARRIAGE_ACCEPTED",
  "MARRIAGE_DECLINED",
  "GRIEVANCE_RESPONDED",
] as const;
export type Kind = (typeof KINDS)[number];
export type Group = "requests" | "decisions";

const REQUESTS = new Set<Kind>(["CLAIM_SUBMITTED", "CHANGE_PROPOSED", "MARRIAGE_PROPOSED"]);
export const groupOf = (kind: Kind): Group => (REQUESTS.has(kind) ? "requests" : "decisions");

export type Settings = { emailRequests: boolean; emailDecisions: boolean; pushRequests: boolean; pushDecisions: boolean };
export const DEFAULT_SETTINGS: Settings = { emailRequests: false, emailDecisions: true, pushRequests: true, pushDecisions: true };

/** The channels to use for one notification, given the member's settings and what is set up. */
export function channelsFor(kind: Kind, s: Settings | null, available: { email: boolean; push: boolean }) {
  const settings = s ?? DEFAULT_SETTINGS;
  const g = groupOf(kind);
  return {
    email: available.email && (g === "requests" ? settings.emailRequests : settings.emailDecisions),
    push: available.push && (g === "requests" ? settings.pushRequests : settings.pushDecisions),
  };
}

/** Only paths inside the site, so a notification can never send someone elsewhere */
export function safeLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || /[\s\\]/.test(link)) return null;
  return link;
}

/** The message key for the in-app feed (with names) and for email/push (without) */
export const feedKey = (kind: Kind) => `feed_${kind}`;
export const outsideKey = (kind: Kind) => `outside_${kind}`;

/** Plain text to HTML, for the email body */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
