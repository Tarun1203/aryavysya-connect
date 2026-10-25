import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` runs at image build time without a database, so don't require the URL there
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/unset",
  },
});
