import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { SCRIPTS, type Script } from "@/lib/translit";
import { suggestSpelling } from "@/lib/translit-db";

/** Spellings in Telugu, Kannada or Tamil for names typed in English (members only; computed here). */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!canView(user)) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const script = req.nextUrl.searchParams.get("script") as Script;
  if (!SCRIPTS.includes(script)) return NextResponse.json({ error: "script must be te, kn or ta" }, { status: 400 });
  const texts = req.nextUrl.searchParams.getAll("text").slice(0, 4).map((t) => t.slice(0, 120));
  return NextResponse.json(await Promise.all(texts.map((t) => suggestSpelling(t, script))));
}
