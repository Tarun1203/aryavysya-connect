import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * Public, read-only location directory for the address pickers (registration is used signed-out).
 *   ?type=states
 *   ?type=districts&state=Andhra Pradesh
 *   ?type=taluks&districtId=…
 *   ?type=localities&districtId=…[&talukId=…][&q=ten]
 *   ?type=pincode&pin=522201
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const type = p.get("type");
  const cache = { headers: { "Cache-Control": "public, max-age=3600" } };

  if (type === "states") {
    const rows = await db.district.findMany({ distinct: ["state"], select: { state: true }, orderBy: { state: "asc" } });
    return NextResponse.json(rows.map((r) => r.state), cache);
  }
  if (type === "districts") {
    const state = p.get("state") ?? "";
    const rows = await db.district.findMany({ where: { state }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    return NextResponse.json(rows, cache);
  }
  if (type === "taluks") {
    const districtId = p.get("districtId") ?? "";
    const rows = await db.taluk.findMany({ where: { districtId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    return NextResponse.json(rows, cache);
  }
  if (type === "localities") {
    const districtId = p.get("districtId") ?? "";
    const talukId = p.get("talukId") || undefined;
    const q = (p.get("q") ?? "").trim();
    const rows = await db.locality.findMany({
      where: {
        districtId,
        ...(talukId ? { talukId } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { nameLocal: { contains: q } }, { pincode: { startsWith: q } }] } : {}),
      },
      select: { id: true, name: true, nameLocal: true, kind: true, pincode: true, officeType: true, talukId: true },
      orderBy: [{ name: "asc" }, { kind: "asc" }],
      take: 60,
    });
    return NextResponse.json(rows);
  }
  if (type === "pincode") {
    const pin = (p.get("pin") ?? "").replace(/\D/g, "");
    if (pin.length !== 6) return NextResponse.json([]);
    const rows = await db.locality.findMany({
      where: { pincode: pin },
      select: {
        id: true, name: true, nameLocal: true, kind: true, pincode: true, officeType: true, talukId: true, districtId: true,
        taluk: { select: { name: true } },
        district: { select: { name: true, state: true } },
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      take: 60,
    });
    return NextResponse.json(rows, cache);
  }
  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}
