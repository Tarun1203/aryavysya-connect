import "server-only";
import { redirect } from "@/i18n/navigation";
import { currentUser, type SessionUser } from "@/lib/auth";
import { canView, isAdmin } from "@/lib/permissions";

/** Verified members only: signed-out visitors go to login, pending users to their account page. */
export async function requireViewer(locale: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect({ href: "/login", locale });
  if (!canView(user)) redirect({ href: "/account", locale });
  return user!;
}

export async function requireAdmin(locale: string): Promise<SessionUser> {
  const user = await requireViewer(locale);
  if (!isAdmin(user)) redirect({ href: "/", locale });
  return user;
}
