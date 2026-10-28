import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { photoRights } from "@/lib/photo";
import { isPrivateFor } from "@/lib/consent";

/**
 * A person's photo, for verified members only. A hidden photo is served only to those who manage
 * it (lib/photo.ts). Never cached by shared caches; the ?v= in the URL changes on every upload.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!canView(user)) return new NextResponse(null, { status: 401 });
  const photo = await db.personPhoto.findUnique({ where: { personId: id } });
  if (!photo) return new NextResponse(null, { status: 404 });
  if (!photo.visible && !(await photoRights(user, id)).seeHidden) return new NextResponse(null, { status: 404 });
  // A private person's photo is served only to their family and administrators
  if (await isPrivateFor(user, id)) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
