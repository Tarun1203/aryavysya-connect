// Local-only Postgres for development when Docker/Postgres isn't installed.
// In the cloud, point DATABASE_URL at a managed Postgres instead.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import pg from "pg";

const dataDir = "./.pgdata";
const DB = "vamsha_utf8";
const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "vysya",
  password: "vysya",
  port: 5433,
  persistent: true,
  // Windows defaults to WIN1252, which cannot store Telugu / Kannada / Tamil text
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

async function main() {
  if (!existsSync(`${dataDir}/PG_VERSION`)) await server.initialise();
  await server.start();

  const admin = new pg.Client({ connectionString: "postgresql://vysya:vysya@localhost:5433/postgres" });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB]);
  // Explicit UTF8 so the database works even inside an older WIN1252 cluster
  if (!rowCount) await admin.query(`CREATE DATABASE ${DB} ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
  await admin.end();

  console.log(`Postgres ready: postgresql://vysya:vysya@localhost:5433/${DB}`);
  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main();
