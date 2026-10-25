import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminScope, audit } from "@/lib/permissions";
import { importLocations } from "@/lib/locations/import";

export const runtime = "nodejs";

/** Super admins upload a location CSV as the raw request body; it is parsed as a stream. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if ((await adminScope(user))?.kind !== "all") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!req.body) return NextResponse.json({ error: "empty upload" }, { status: 400 });

  const fileName = req.headers.get("x-file-name") ?? "upload.csv";
  try {
    const summary = await importLocations(Readable.fromWeb(req.body as unknown as WebReadableStream));
    await audit(user, "import-locations", "Locality", "-", { fileName, ...summary, districtsCreated: summary.districtsCreated.length });
    return NextResponse.json(summary, { status: summary.error ? 422 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "import failed" }, { status: 500 });
  }
}
