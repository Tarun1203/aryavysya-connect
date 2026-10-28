import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { currentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { isPrivateFor } from "@/lib/consent";
import { exportLineage } from "@/lib/gedcom-db";
import { hit, RULES } from "@/lib/ratelimit";
import { routing } from "@/i18n/routing";

/** The lineage on a person's tree page as a GEDCOM file, for members who can see that tree. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || !canView(user)) return new NextResponse("Sign in first", { status: 401 });
  if (await isPrivateFor(user, id)) return new NextResponse("Not found", { status: 404 });
  const limit = await hit(RULES.gedcomExport, user.id);
  if (!limit.ok) return new NextResponse("Too many downloads – try again later", { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });

  const asked = req.nextUrl.searchParams.get("locale") ?? "";
  const locale = (routing.locales as readonly string[]).includes(asked) ? asked : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "consent" });
  const file = await exportLineage(user, id, t("privateLabel"));
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(file.text, {
    headers: {
      "Content-Type": "text/vnd.familysearch.gedcom; charset=utf-8",
      "Content-Disposition": `attachment; filename="family.ged"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
