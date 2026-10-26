import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminScope, audit } from "@/lib/permissions";
import { importLocationFile } from "@/lib/locations/import";

export const runtime = "nodejs";

/**
 * Super admins upload a location file (.csv or .xlsx) as the raw request body. It is streamed to a
 * temporary file (Excel needs random access to its zip directory), imported row by row, then deleted.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if ((await adminScope(user))?.kind !== "all") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!req.body) return NextResponse.json({ error: "empty upload" }, { status: 400 });

  const fileName = decodeURIComponent(req.headers.get("x-file-name") ?? "upload");
  const tmp = join(tmpdir(), `locations-${randomUUID()}`);
  try {
    await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream), createWriteStream(tmp));
    const summary = await importLocationFile(tmp);
    await audit(user, "import-locations", "Locality", "-", { fileName, ...summary, districtsCreated: summary.districtsCreated.length });
    return NextResponse.json(summary, { status: summary.error ? 422 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "import failed" }, { status: 500 });
  } finally {
    await rm(tmp, { force: true });
  }
}
