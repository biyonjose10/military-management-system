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

/**
 * Constructed on first use, not at import.
 *
 * `next build` imports every route module to collect page data, so an eager
 * client turns a missing DATABASE_URL into a build failure on a machine that
 * was never going to connect to anything. Deferring it means the variable is
 * required when a query is actually made, which is when its absence is a real
 * problem — and the error then names the route that needed it.
 */
export const prismaUnsafe: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    globalForPrisma.prismaUnsafe ??= createClient();
    const client = globalForPrisma.prismaUnsafe;
    const value = Reflect.get(client, property);
    // Methods are bound to the real client, never to the proxy. `$transaction`
    // and friends call other methods through `this`; left unbound they would
    // re-enter this trap with the wrong receiver.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
