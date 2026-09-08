import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The Prisma client is behind a locked door.
 *
 * Prisma has no row-level security, so the realistic way this project leaks the
 * whole roster is a route handler writing `prisma.personnel.findMany()` with no
 * `where`. That is prevented structurally rather than by review:
 *
 *   - `lib/db/client.ts` is the only module that may construct a PrismaClient,
 *     and it exports it under the name `prismaUnsafe`.
 *   - `lib/db/repositories/*` are the only modules allowed to import it. Every
 *     function they export takes a `Scope` first, so there is no way to query
 *     without having said who is asking.
 *
 * Anything else importing the client is a lint *failure*, not a review note.
 */
const prismaLockdown = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "@prisma/client",
          importNames: ["PrismaClient"],
          message:
            "Only lib/db/client.ts may construct a PrismaClient. Import a repository from lib/db/repositories instead. (Types and enums from @prisma/client are fine.)",
        },
      ],
      patterns: [
        {
          group: ["@/lib/db/client", "**/lib/db/client"],
          message:
            "prismaUnsafe is unscoped. Go through lib/db/repositories/* — those take a Scope and cannot be called without one.",
        },
      ],
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: prismaLockdown,
  },
  {
    // The data layer itself, plus the seed and migration scripts, are the
    // inside of the locked door.
    files: ["lib/db/**", "prisma/**", "scripts/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
