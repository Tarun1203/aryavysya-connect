"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/permissions";
import { deviceLabel } from "@/lib/device";
import { safeLink } from "@/lib/notify-core";
import { notificationsChanged } from "@/lib/realtime";
import type { FormState } from "@/lib/forms";

/** Open a notification: mark it read and go where it leads (or stay on the list). */
export async function openNotificationAction(id: string) {
  const user = await currentUser();
  if (!user) return;
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return;
  if (!n.readAt) {
    await db.notification.update({ where: { id }, data: { readAt: new Date() } });
    // The member's other tabs and devices update their bell too
    await notificationsChanged([user.id], user.id);
  }
  revalidatePath("/", "layout");
  redirect({ href: safeLink(n.link) ?? "/notifications", locale: await getLocale() });
}

export async function markAllReadAction() {
  const user = await currentUser();
  if (!user) return;
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  await notificationsChanged([user.id], user.id);
  revalidatePath("/", "layout");
}

export async function saveNotifySettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) return { error: "-" };
  const on = (k: string) => fd.get(k) === "on";
  const data = { emailRequests: on("emailRequests"), emailDecisions: on("emailDecisions"), pushRequests: on("pushRequests"), pushDecisions: on("pushDecisions") };
  await db.notificationSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  await audit(user, "notify-settings", "User", user.id, data);
  revalidatePath("/", "layout");
  return { ok: true };
}

const subscription = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** This browser agreed to push notifications: keep its subscription (encrypted at rest). */
export async function savePushSubscriptionAction(json: string): Promise<{ ok: boolean }> {
  const user = await currentUser();
  if (!user) return { ok: false };
  let parsed: z.infer<typeof subscription>;
  try {
    parsed = subscription.parse(JSON.parse(json));
  } catch {
    return { ok: false };
  }
  const device = deviceLabel((await headers()).get("user-agent"));
  const data = { userId: user.id, p256dh: parsed.keys.p256dh, auth: parsed.keys.auth, device };
  await db.pushSubscription.upsert({ where: { endpoint: parsed.endpoint }, create: { endpoint: parsed.endpoint, ...data }, update: data });
  await audit(user, "push-subscribe", "User", user.id, { device });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Stop push to this browser (or to one listed on the account page). */
export async function removePushSubscriptionAction(endpointOrId: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const removed = await db.pushSubscription.deleteMany({ where: { userId: user.id, OR: [{ id: endpointOrId }, { endpoint: endpointOrId }] } });
  if (removed.count) await audit(user, "push-unsubscribe", "User", user.id);
  revalidatePath("/", "layout");
}
