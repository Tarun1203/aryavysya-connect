// `npm run encryption:backfill` – bring every @encrypted field up to the current key:
//  - plain values (stored before encryption was switched on) are encrypted;
//  - values encrypted with an older key (after a rotation) are re-encrypted with the current one.
// Safe to run again and again; prints counts only, never a value. Run with the same
// FIELD_ENCRYPTION_KEYS / FIELD_ENCRYPTION_CURRENT and DATABASE_URL as the app.
//
// Rotating a key: add the new key to FIELD_ENCRYPTION_KEYS (keep the old one), set
// FIELD_ENCRYPTION_CURRENT to it, deploy, run this script, then remove the old key.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { dbUrlFromEnv } from "../src/lib/db-url";
import { decryptValue, encryptValue, keyIdOf, keyringFrom } from "../src/lib/encryption-core";
import { FIELD_MAP } from "../src/lib/encrypted-fields.generated";

const BATCH = 500;

async function main() {
  const ring = keyringFrom(process.env.FIELD_ENCRYPTION_KEYS, process.env.FIELD_ENCRYPTION_CURRENT);
  if (!ring) throw new Error("Set FIELD_ENCRYPTION_KEYS first");
  // A plain client: this script reads and writes the stored form itself
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrlFromEnv("DATABASE_URL")! }) });
  for (const [model, fields] of Object.entries(FIELD_MAP.fields)) {
    type Delegate = { findMany: (a: object) => Promise<Record<string, unknown>[]>; update: (a: object) => Promise<unknown> };
    const delegate = (db as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)];
    let cursor: string | undefined;
    let changed = 0;
    let seen = 0;
    for (;;) {
      const rows = await delegate.findMany({
        select: { id: true, ...Object.fromEntries(Object.keys(fields).map((f) => [f, true])) },
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const row of rows) {
        const data: Record<string, string> = {};
        for (const [field, mode] of Object.entries(fields)) {
          const v = row[field];
          if (typeof v !== "string" || keyIdOf(v) === ring.current) continue;
          const plain = decryptValue(ring, `${model}.${field}`, v) as string;
          data[field] = encryptValue(ring, `${model}.${field}`, mode, plain);
        }
        if (Object.keys(data).length) {
          await delegate.update({ where: { id: row.id }, data });
          changed++;
        }
      }
      seen += rows.length;
      cursor = rows.at(-1)!.id as string;
    }
    console.log(`${model}: ${changed} of ${seen} rows updated (${Object.keys(fields).join(", ")})`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
