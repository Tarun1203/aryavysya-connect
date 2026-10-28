// `npm run backup:open -- <file.vvbk> <out.dump>` – decrypts a backup made by `npm run backup`
// and checks it is whole. Then restore it into an EMPTY database (a new Neon branch, say):
//   pg_restore --no-owner --no-privileges --dbname "<direct connection string>" <out.dump>
// The plain dump holds personal data: restore it, then delete it.
import "dotenv/config";
import { createReadStream, createWriteStream } from "node:fs";
import { once } from "node:events";
import { backupKeyFrom, createOpener } from "../src/lib/backup-crypto";

async function main() {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error("Usage: npm run backup:open -- <file.vvbk> <out.dump>");
  const opener = createOpener(backupKeyFrom(process.env.BACKUP_KEY));
  const file = createWriteStream(to, { mode: 0o600 });
  try {
    for await (const data of createReadStream(from)) {
      for (const chunk of opener.push(data)) if (!file.write(chunk)) await once(file, "drain");
    }
    opener.finish();
  } catch (e) {
    file.destroy();
    throw e;
  }
  file.end();
  await once(file, "finish");
  console.log(`Decrypted and verified: ${to}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
