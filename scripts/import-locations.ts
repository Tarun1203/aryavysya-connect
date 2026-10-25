// Load location CSVs (India Post pincode directory, LGD sub-districts, LGD villages) into the database.
//   npm run locations:import -- <file.csv> [more.csv …] [--yes]
// Import LGD sub-districts first, then LGD villages, then India Post, so pincodes link to villages.
import "dotenv/config";
import { createReadStream } from "node:fs";
import { db } from "../src/lib/db";
import { dbUrlFromEnv } from "../src/lib/db-url";
import { importLocations } from "../src/lib/locations/import";

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    console.error("Usage: npm run locations:import -- <file.csv> [more.csv …] [--yes]");
    process.exit(1);
  }
  const host = new URL(dbUrlFromEnv("DATABASE_URL")!).host;
  console.log(`Target database: ${host}`);
  if (!/^(localhost|127\.0\.0\.1)(:|$)/.test(host) && !args.includes("--yes")) {
    console.error("This is not a local database. Re-run with --yes to import into it.");
    process.exit(1);
  }

  for (const file of files) {
    console.log(`\n▶ ${file}`);
    const started = Date.now();
    const summary = await importLocations(createReadStream(file), (rows) => process.stdout.write(`\r  ${rows.toLocaleString("en-IN")} rows…`));
    process.stdout.write("\n");
    if (summary.error) {
      console.error(`  ✖ ${summary.error}`);
      continue;
    }
    console.log(`  format: ${summary.format}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    console.log(`  rows: ${summary.rows}  skipped: ${summary.skipped}  new taluks: ${summary.taluks}  localities written: ${summary.localities}`);
    console.log(`  villages given a pincode: ${summary.villagesGivenPincode}  post offices given a taluk: ${summary.postOfficesGivenTaluk}`);
    if (summary.districtsCreated.length)
      console.log(`  new districts (${summary.districtsCreated.length}): ${summary.districtsCreated.slice(0, 40).join("; ")}${summary.districtsCreated.length > 40 ? " …" : ""}`);
  }
}

main().finally(() => db.$disconnect());
