import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * The one and only PrismaClient in the application.
 *
 * It is exported as `prismaUnsafe` because that is what it is: a handle with no
 * unit scoping, no soft-delete filter and no PII masking on it. Prisma has no
 * row-level security, so `prismaUnsafe.personnel.findMany()` returns the entire
 * roster of every unit in the brigade, including soft-deleted rows.
 *
 * Nothing outside `lib/db/**` may import this module — `eslint.config.mjs`
 * turns an attempt into a lint error, and `test/no-direct-prisma.test.ts` fails
 * the build if a route handler slips one past lint. Callers go through
 * `lib/db/repositories/*`, whose every function takes a `Scope` and therefore
 * cannot be invoked without saying who is asking.
 *
 * Prisma 7 requires an explicit driver adapter; there is no implicit
 * DATABASE_URL pickup any more. The URL read here is the POOLED one — Neon's
 * `-pooler` endpoint — because serverless invocations open far more connections
 * than a Postgres instance will accept directly. Migrations use DIRECT_URL
 * instead; see prisma.config.ts.
 */

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in the " +
        "pooled Neon connection string.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Queries are noisy and can contain PII in their parameters; never log them.
    log: ["warn", "error"],
  });
}

// Next's dev server re-evaluates modules on every edit. Without this the
// connection count climbs until Neon starts refusing new ones, which surfaces
// as an unrelated-looking timeout twenty edits later.
const globalForPrisma = globalThis as unknown as {
  prismaUnsafe?: PrismaClient;
};

export const prismaUnsafe: PrismaClient =
  globalForPrisma.prismaUnsafe ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaUnsafe = prismaUnsafe;
}
