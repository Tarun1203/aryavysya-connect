import "dotenv/config";
import { defineConfig } from "prisma/config";
import { dbUrlFromEnv } from "./src/lib/db-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection on Neon; the app itself uses the pooled DATABASE_URL.
    // `prisma generate` runs at image build time without a database, so don't require the URL there.
    url: dbUrlFromEnv("DATABASE_URL_UNPOOLED") ?? dbUrlFromEnv("DATABASE_URL") ?? "postgresql://localhost:5432/unset",
  },
});
