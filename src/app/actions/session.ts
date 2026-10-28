"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { currentSessionId, currentUser } from "@/lib/auth";
import { adminScope, audit, districtWhere } from "@/lib/permissions";

/** Sign one of your own devices out (from "Where you're signed in"). */
export async function endDeviceSessionAction(sessionId: string) {
  const user = await currentUser();
  if (!user) return;
  const { count } = await db.session.updateMany({ where: { id: sessionId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "by-member" } });
  if (!count) return;
  await audit(user, "end-session", "User", user.id);
  if (sessionId === (await currentSessionId())) {
    (await cookies()).delete("vamsha_session");
    redirect({ href: "/login", locale: await getLocale() });
  }
  revalidatePath("/", "layout");
}

/** Sign out everywhere except this device. */
export async function endOtherSessionsAction() {
  const user = await currentUser();
  const sid = await currentSessionId();
  if (!user || !sid) return;
  const { count } = await db.session.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: sid } }, data: { revokedAt: new Date(), revokedReason: "by-member" } });
  await audit(user, "end-other-sessions", "User", user.id, { count });
  revalidatePath("/", "layout");
}

/**
 * An administrator signs a member out of every device (a lost phone, a shared computer, a
 * suspected break-in). Same reach as suspending: their area, never a super admin, never yourself.
 */
export async function adminEndUserSessionsAction(userId: string) {
  const u = await currentUser();
  const scope = await adminScope(u);
  if (!u || !scope || scope.kind === "local") return;
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.role === "SUPER_ADMIN" || target.id === u.id) return;
  if (scope.kind !== "all") {
    const where = districtWhere(scope);
    const inScope = where && target.districtId && (await db.district.findFirst({ where: { id: target.districtId, ...where } }));
    if (!inScope) return;
  }
  const { count } = await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "by-admin" } });
  await audit(u, "end-all-sessions", "User", userId, { count });
  revalidatePath("/", "layout");
}
