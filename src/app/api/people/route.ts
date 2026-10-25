import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { lifeSpan } from "@/lib/reference";

/** Name autocomplete for the person pickers (verified members only). */
export async function GET(req: NextRequest) {
  if (!canView(await currentUser())) return NextResponse.json([], { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const words = q.split(/\s+/).slice(0, 3);
  const people = await db.person.findMany({
    where: {
      AND: words.map((w) => ({
        OR: [
          { givenName: { contains: w, mode: "insensitive" as const } },
          { surname: { contains: w, mode: "insensitive" as const } },
          { givenNameLocal: { contains: w } },
          { surnameLocal: { contains: w } },
        ],
      })),
    },
    include: { gotra: true },
    take: 15,
    orderBy: [{ surname: "asc" }, { givenName: "asc" }],
  });
  return NextResponse.json(
    people.map((p) => ({
      id: p.id,
      label: `${p.givenName} ${p.surname}`,
      detail: [lifeSpan(p), p.gotra?.name, p.nativePlace].filter(Boolean).join(" · "),
    }))
  );
}
