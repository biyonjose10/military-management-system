import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The lock on the Prisma client, checked a second time.
 *
 * `eslint.config.mjs` already forbids these imports. This test exists because
 * lint is skippable — `// eslint-disable-next-line`, a stray override in a
 * future config, a pre-commit hook someone bypasses with `--no-verify` — and
 * the consequence of a route handler holding an unscoped client is the entire
 * roster of every unit in the brigade. Two independent checks for one rule is
 * the right ratio when that is what is on the other side.
 *
 * Scanning source text rather than the module graph is deliberate: it catches
 * the import even in a file that never runs, and it cannot be defeated by a
 * lint directive.
 */

const ROOT = path.resolve(import.meta.dirname, "..");

/** Directories that are on the inside of the locked door. */
const ALLOWED = ["lib/db", "prisma", "scripts"].map((p) =>
  path.join(ROOT, ...p.split("/")),
);

const SKIP = new Set([
  "node_modules",
  ".next",
  ".git",
  "out",
  "build",
  "test",
  "e2e",
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|mts)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

function isAllowed(file: string): boolean {
  return ALLOWED.some((dir) => file.startsWith(dir + path.sep));
}

/**
 * Matches a value import of PrismaClient. `import type { ... }` is fine — it
 * erases at compile time and cannot construct anything — and so are the model
 * and enum types, which the DTO and policy layers legitimately need.
 */
const CONSTRUCTS_CLIENT =
  /import\s+(?!type\s)(?:[\s\S]*?)\bPrismaClient\b[\s\S]*?from\s+["']@prisma\/client["']/;

const IMPORTS_THE_CLIENT_MODULE =
  /from\s+["'](?:@\/lib\/db\/client|(?:\.\.?\/)+lib\/db\/client|\.\/client)["']/;

describe("nothing outside the data layer touches Prisma directly", () => {
  const files = sourceFiles(ROOT).filter((f) => !isAllowed(f));

  it("finds source files to check at all", () => {
    // A broken walker that returns [] would make every assertion below pass
    // vacuously — the classic way a security test stops testing anything.
    expect(files.length).toBeGreaterThan(0);
  });

  it("never constructs a PrismaClient", () => {
    const offenders = files.filter((f) =>
      CONSTRUCTS_CLIENT.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("never imports lib/db/client", () => {
    const offenders = files.filter((f) =>
      IMPORTS_THE_CLIENT_MODULE.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("catches a violation when one is present", () => {
    // Proves the regexes above actually match, so a green run means "no
    // offenders" rather than "the pattern never matches anything".
    const bad = `import { PrismaClient } from "@prisma/client";\nnew PrismaClient();`;
    expect(CONSTRUCTS_CLIENT.test(bad)).toBe(true);
    expect(
      IMPORTS_THE_CLIENT_MODULE.test(
        `import { prismaUnsafe } from "@/lib/db/client";`,
      ),
    ).toBe(true);
  });

  it("still allows type-only imports of the generated model types", () => {
    const fine = `import type { Personnel, PrismaClient } from "@prisma/client";`;
    expect(CONSTRUCTS_CLIENT.test(fine)).toBe(false);
  });
});
