import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { dbUrlFromEnv } from "./db-url";
import { createFieldCrypto, envKeyring } from "./encryption";

/** The Prisma client with field encryption (fields marked @encrypted in schema.prisma, see encryption.ts). */
function createClient() {
  const adapter = new PrismaPg({ connectionString: dbUrlFromEnv("DATABASE_URL")! });
  const crypto = createFieldCrypto(envKeyring());
  return new PrismaClient({ adapter }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(crypto.encryptArgs(model, operation, args) as typeof args);
          return crypto.decryptResult(model, result);
        },
      },
    },
  });
}

type Client = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma?: Client };

// Reuse one client across hot reloads in development
export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
