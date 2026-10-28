import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { lifeSpan } from "@/lib/reference";
import { privateIds, privateViewer } from "@/lib/consent";
import { idsMatchingScriptWord } from "@/lib/translit-db";

/** Name autocomplete for the person pickers (verified members only). */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!canView(user)) return NextResponse.json([], { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const words = q.split(/\s+/).slice(0, 3);
  // A word typed in Telugu, Kannada or Tamil also finds people entered only in English
  const viaScript = await Promise.all(words.map((w) => idsMatchingScriptWord(w)));
  const people = await db.person.findMany({
    where: {
      // A merged record is shown through the one it was merged into
      status: { not: "MERGED" },
      AND: words.map((w, i) => ({
        OR: [
          { givenName: { contains: w, mode: "insensitive" as const } },
          { surname: { contains: w, mode: "insensitive" as const } },
          { givenNameLocal: { contains: w } },
          { surnameLocal: { contains: w } },
          ...(viaScript[i].length ? [{ id: { in: viaScript[i] } }] : []),
        ],
      })),
    },
    include: { gotra: true },
    take: 15,
    orderBy: [{ surname: "asc" }, { givenName: "asc" }],
  });
  const [hidden, sees] = await Promise.all([privateIds(people), privateViewer(user)]);
  return NextResponse.json(
    people.filter((p) => !hidden.has(p.id) || sees(p.id)).map((p) => ({
      id: p.id,
      label: `${p.givenName} ${p.surname}`,
      detail: [lifeSpan(p), p.gotra?.name, p.nativePlace].filter(Boolean).join(" · "),
    }))
  );
}
