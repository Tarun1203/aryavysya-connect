// `npm run backup [-- <out file>]` – an encrypted dump of the database.
// Runs pg_dump (custom format) against the direct connection and seals its output with BACKUP_KEY
// as it streams, so the plain dump never touches the disk. Copy the file anywhere – it is useless
// without the key. Values under field encryption stay encrypted inside the dump too, so a restore
// also needs FIELD_ENCRYPTION_KEYS. Keep both keys somewhere other than the backups.
// Needs pg_dump from PostgreSQL 17 or newer (PG_DUMP=/path/to/pg_dump to pick one).
import "dotenv/config";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { once } from "node:events";
import { dirname } from "node:path";
import { backupKeyFrom, createSealer } from "../src/lib/backup-crypto";
import { dbUrlFromEnv } from "../src/lib/db-url";
import { libpqEnv } from "./backup-env";

async function main() {
  const key = backupKeyFrom(process.env.BACKUP_KEY);
  const url = dbUrlFromEnv("DATABASE_URL_UNPOOLED") ?? dbUrlFromEnv("DATABASE_URL");
  if (!url) throw new Error("Set DATABASE_URL_UNPOOLED (or DATABASE_URL)");
  const out = process.argv[2] ?? `backups/vamsha-${new Date().toISOString().replace(/[:.]/g, "-")}.dump.vvbk`;
  mkdirSync(dirname(out), { recursive: true });

  // Connection details go in libpq's environment variables, not the command line (which other
  // users on the machine can read)
  const dump = spawn(process.env.PG_DUMP ?? "pg_dump", ["--format=custom", "--no-owner", "--no-privileges"], {
    env: { ...process.env, ...libpqEnv(url) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const file = createWriteStream(out, { mode: 0o600 });
  const sealer = createSealer(key);
  file.write(sealer.header);
  let bytes = 0;
  for await (const data of dump.stdout) {
    bytes += data.length;
    for (const chunk of sealer.push(data)) if (!file.write(chunk)) await once(file, "drain");
  }
  // The process may already have exited while the last output was read
  const code = dump.exitCode ?? (await once(dump, "close"))[0];
  if (code !== 0) {
    file.destroy();
    throw new Error(`pg_dump exited with code ${code}; ${out} is incomplete – delete it`);
  }
  file.end(sealer.finish());
  await once(file, "finish");
  console.log(`Backed up ${(bytes / 1024 / 1024).toFixed(1)} MB to ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
