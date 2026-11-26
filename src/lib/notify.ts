import "server-only";
import { randomInt } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import nodemailer, { type Transporter } from "nodemailer";
import webpush from "web-push";
import { db } from "@/lib/db";
import { familyScope } from "@/lib/family";
import { isReviewer } from "@/lib/review";
import type { SessionUser } from "@/lib/auth";
import { hit, RULES } from "@/lib/ratelimit";
import { notificationsChanged } from "@/lib/realtime";
import { channelsFor, escapeHtml, outsideKey, safeLink, type Kind } from "@/lib/notify-core";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Notifications: one row per recipient for the in-app feed, then email and browser push for those
 * who want them (src/lib/notify-core.ts has the rules). Delivery runs after the response is sent,
 * so a slow mail server never slows a page. Nothing here phones home unless configured:
 *  - email: SMTP_URL (smtp(s)://user:pass@host:port) and EMAIL_FROM – our own mail account
 *  - push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…) – `npm run push:keys`
 * Email and push carry a generic sentence and a link only, never names or details.
 */

export const emailConfigured = () => !!process.env.SMTP_URL && !!process.env.EMAIL_FROM;
export const pushConfigured = () => !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY && !!process.env.VAPID_SUBJECT;

const RETENTION_DAYS = 180;

/** The site's address for links in email: SITE_URL, else the address this request came to. */
async function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : null;
}

/**
 * Notify these members (never the one who caused it). `data` fills the in-app message; `link` is a
 * path inside the site.
 */
export async function notify(userIds: (string | null | undefined)[], kind: Kind, data: Record<string, string | number | null>, link: string | null, actorId?: string | null) {
  const to = [...new Set(userIds.filter((id): id is string => !!id && id !== actorId))];
  if (!to.length) return;
  const rows = await db.notification.createManyAndReturn({
    data: to.map((userId) => ({ userId, kind, data: data as Prisma.InputJsonValue, link: safeLink(link) })),
    select: { id: true },
  });
  // Open pages update their bell straight away
  await notificationsChanged(to, actorId);
  const origin = await siteUrl();
  after(() => deliver(rows.map((r) => r.id), origin).catch((e) => console.error("notification delivery failed:", e instanceof Error ? e.message : e)));
  if (randomInt(0, 200) === 0) after(() => db.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86400e3) } } }).then(() => undefined));
}

let mailer: Transporter | null = null;
const transport = () => (mailer ??= nodemailer.createTransport(process.env.SMTP_URL!));

async function deliver(ids: string[], origin: string | null) {
  const rows = await db.notification.findMany({
    where: { id: { in: ids } },
    include: { user: { select: { email: true, locale: true, status: true, notifySettings: true, pushSubscriptions: true } } },
  });
  const available = { email: emailConfigured() && !!origin, push: pushConfigured() };
  if (available.push) webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  for (const n of rows) {
    if (n.user.status === "SUSPENDED") continue;
    const kind = n.kind as Kind;
    const ch = channelsFor(kind, n.user.notifySettings, available);
    const t = await getTranslations({ locale: n.user.locale || "en", namespace: "notify" });
    const sentence = t(outsideKey(kind));
    const url = `${origin ?? ""}/${n.user.locale || "en"}/notifications`;

    // At most 20 emails an hour to one member, whatever happens on the site
    if (ch.email && (await hit(RULES.notifyEmail, n.userId)).ok) {
      try {
        await transport().sendMail({
          from: process.env.EMAIL_FROM,
          to: n.user.email,
          subject: t("emailSubject"),
          text: `${sentence}\n\n${t("emailOpen")}: ${url}\n\n${t("emailFooter")}`,
          html: `<p>${escapeHtml(sentence)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(t("emailOpen"))}</a></p><p style="color:#777;font-size:12px">${escapeHtml(t("emailFooter"))}</p>`,
        });
        await db.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
      } catch (e) {
        // The error's code only: messages from mail servers can repeat addresses
        console.error("notification email failed:", (e as { code?: string }).code ?? "error");
      }
    }

    if (ch.push && n.user.pushSubscriptions.length) {
      const payload = JSON.stringify({ title: t("pushTitle"), body: sentence, url: `/${n.user.locale || "en"}/notifications` });
      let sent = false;
      for (const s of n.user.pushSubscriptions) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "normal" });
          sent = true;
          await db.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // Gone: the browser unsubscribed or was reset
          if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          else console.error("push failed:", status ?? "error");
        }
      }
      if (sent) await db.notification.update({ where: { id: n.id }, data: { pushedAt: new Date() } });
    }
  }
}

/* ---------------------------------------------------------------- who to tell */

/** Administrators who may endorse or decide a membership request (as claimRights in permissions.ts). */
export async function claimDeciders(claim: { districtId: string; organizationId: string | null }) {
  const district = await db.district.findUnique({ where: { id: claim.districtId }, select: { state: true, inchargeId: true } });
  const users = await db.user.findMany({
    where: {
      status: "APPROVED",
      OR: [
        { role: "SUPER_ADMIN" },
        ...(district?.inchargeId ? [{ id: district.inchargeId, role: "DISTRICT_INCHARGE" as const }] : []),
        ...(district?.state ? [{ role: "STATE_ADMIN" as const, adminOrg: { state: district.state } }] : []),
        ...(claim.organizationId ? [{ role: "LOCAL_ADMIN" as const, adminOrgId: claim.organizationId }] : []),
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Administrators who may decide a proposal about this person (review.ts isReviewer), and – for an
 * edit to a member's own unverified record – that member. */
export async function changeDeciders(personId: string, kind: string) {
  const admins = await db.user.findMany({
    where: { status: "APPROVED", role: { not: "MEMBER" } },
    include: { district: true, organization: true, adminOrg: true, inchargeOf: true },
  });
  const ids: string[] = [];
  for (const a of admins) if (await isReviewer(a as SessionUser, personId)) ids.push(a.id);
  if (kind === "EDIT") {
    const p = await db.person.findUnique({ where: { id: personId }, select: { verifiedAt: true, user: { select: { id: true } } } });
    if (p && !p.verifiedAt && p.user) ids.push(p.user.id);
  }
  return ids;
}

/** Members who may answer for this person: themself and their family within the editing scope. */
export async function familyOf(personId: string) {
  const scope = await familyScope(personId);
  const users = await db.user.findMany({ where: { status: "APPROVED", personId: { in: [...scope.keys(), personId] } }, select: { id: true } });
  return users.map((u) => u.id);
}
