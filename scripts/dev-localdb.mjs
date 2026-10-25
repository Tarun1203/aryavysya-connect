// `npm run dev:localdb` – Next.js dev server against the local test database in .env.localdb,
// even when .env points at Neon. Both URLs are set so nothing falls back to the Neon values in .env.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const line = readFileSync(".env.localdb", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="));
if (!line) {
  console.error(".env.localdb has no DATABASE_URL");
  process.exit(1);
}
const url = line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };
const port = process.env.PORT ?? "3000";
const child = spawn("npx", ["next", "dev", "-p", port], { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
