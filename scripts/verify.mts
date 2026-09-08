/**
 * Invariant gate. `npm run verify`.
 *
 * These are the checks that cannot be expressed as a unit test because they
 * compare two artefacts that are meant to agree — the Prisma schema against the
 * masking layer, the materialized paths against the parent pointers. Each one
 * has a specific failure it is here to catch, named at the check.
 *
 * The database checks are skipped, loudly, when DATABASE_URL is absent, so the
 * script is still useful on a machine with no connection string. A skip is
 * reported as a skip and never as a pass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { MEDICAL_FIELDS, PII_FIELDS } from "../lib/auth/policy";
import { loadEnv } from "../lib/load-env";

loadEnv();

const ROOT = path.resolve(import.meta.dirname, "..");

let failures = 0;
let skipped = 0;

function check(name: string, run: () => string | null): void {
  const problem = run();
  if (problem === null) {
    console.log(`  ok    ${name}`);
  } else {
    console.error(`  FAIL  ${name}\n        ${problem}`);
    failures += 1;
  }
}

function skip(name: string, why: string): void {
  console.log(`  skip  ${name}\n        ${why}`);
  skipped += 1;
}

// ---------------------------------------------------------------------------
// Static invariants
// ---------------------------------------------------------------------------

/**
 * Personnel columns that are deliberately public to anyone with
 * `personnel:read`. Every other column must be classified as PII or medical in
 * lib/auth/policy.ts.
 *
 * Adding a column to the Personnel model therefore breaks `verify` until
 * someone decides, in writing, which side of the masking boundary it sits on.
 * That is the whole point: a new `homeAddress` column that nobody classifies
 * would otherwise ship in the clear to every role.
 */
const PUBLIC_PERSONNEL_FIELDS = new Set([
  "id",
  "lastName",
  "firstName",
  "rank",
  "rankCategory",
  "unitId",
  "unit",
  "readiness",
  "enlistedAt",
  "deployedUntil",
  "deletedAt",
  "assignedEquipment",
  "createdAt",
  "updatedAt",
]);

function personnelFieldsFromSchema(): string[] {
  const schema = readFileSync(
    path.join(ROOT, "prisma", "schema.prisma"),
    "utf8",
  );
  const model = schema.match(/\nmodel Personnel \{([\s\S]*?)\n\}/);
  if (!model) throw new Error("Could not find `model Personnel` in schema.prisma");

  return model[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[0])
    .filter((name) => /^[a-z]\w*$/.test(name));
}

console.log("\nStatic invariants");

check(
  "every Personnel column is classified as public, PII or medical",
  () => {
    const classified = new Set<string>([
      ...PUBLIC_PERSONNEL_FIELDS,
      ...PII_FIELDS,
      ...MEDICAL_FIELDS,
    ]);
    const unclassified = personnelFieldsFromSchema().filter(
      (f) => !classified.has(f),
    );
    return unclassified.length === 0
      ? null
      : `Unclassified Personnel column(s): ${unclassified.join(", ")}. ` +
          `Add each to PII_FIELDS or MEDICAL_FIELDS in lib/auth/policy.ts, or to ` +
          `PUBLIC_PERSONNEL_FIELDS in this script if it is genuinely public.`;
  },
);

check("no field is classified as both PII and medical", () => {
  const overlap = PII_FIELDS.filter((f) =>
    (MEDICAL_FIELDS as readonly string[]).includes(f),
  );
  return overlap.length === 0 ? null : `Both: ${overlap.join(", ")}`;
});

check("every classified field actually exists on the model", () => {
  const actual = new Set(personnelFieldsFromSchema());
  const ghosts = [...PII_FIELDS, ...MEDICAL_FIELDS].filter(
    (f) => !actual.has(f),
  );
  // A renamed column leaves a stale entry behind, and a stale entry protects
  // nothing while looking exactly like protection.
  return ghosts.length === 0
    ? null
    : `Classified but not present in schema.prisma: ${ghosts.join(", ")}`;
});

// ---------------------------------------------------------------------------
// Database invariants
// ---------------------------------------------------------------------------

console.log("\nDatabase invariants");

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  const why =
    "No DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local to run these.";
  skip("Unit.path agrees with Unit.parentId", why);
  skip("every Unit.path is slash-terminated at both ends", why);
  skip("no two units share a path", why);
  skip("User.unitPath agrees with its unit", why);
  skip("no equipment is signed out to a soft-deleted person", why);
} else {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["warn", "error"],
  });

  try {
    const units = await prisma.unit.findMany({
      select: { id: true, parentId: true, path: true },
    });
    const byId = new Map(units.map((u) => [u.id, u]));

    check("Unit.path agrees with Unit.parentId", () => {
      // `path` is denormalized from `parentId`. If a unit is ever re-parented
      // without rebuilding paths, scoping silently reads the OLD hierarchy —
      // a soldier moves between battalions and their old commander keeps
      // seeing them. Nothing else in the system would notice.
      const wrong: string[] = [];
      for (const unit of units) {
        const parent = unit.parentId === null ? null : byId.get(unit.parentId);
        if (unit.parentId !== null && !parent) {
          wrong.push(`unit ${unit.id} has missing parent ${unit.parentId}`);
          continue;
        }
        const expected = `${parent ? parent.path : "/"}${unit.id}/`;
        if (unit.path !== expected) {
          wrong.push(`unit ${unit.id}: path ${unit.path} !== ${expected}`);
        }
      }
      return wrong.length === 0 ? null : wrong.slice(0, 10).join("; ");
    });

    check("every Unit.path is slash-terminated at both ends", () => {
      const bad = units.filter((u) => !/^\/(\d+\/)+$/.test(u.path));
      return bad.length === 0
        ? null
        : `Malformed: ${bad.slice(0, 10).map((u) => u.path).join(", ")}`;
    });

    check("no two units share a path", () => {
      // Two rows with the same path merge two subtrees into one scope without
      // any foreign key noticing.
      const seen = new Map<string, number>();
      const clashes: string[] = [];
      for (const unit of units) {
        const first = seen.get(unit.path);
        if (first !== undefined) clashes.push(`${first} and ${unit.id}: ${unit.path}`);
        else seen.set(unit.path, unit.id);
      }
      return clashes.length === 0 ? null : clashes.slice(0, 10).join("; ");
    });

    const users = await prisma.user.findMany({
      select: { id: true, email: true, unitId: true, unitPath: true },
    });

    check("User.unitPath agrees with its unit", () => {
      // The JWT is minted from this column. A stale copy hands a viewer the
      // wrong subtree for the lifetime of their token.
      const wrong = users.filter((u) => byId.get(u.unitId)?.path !== u.unitPath);
      return wrong.length === 0
        ? null
        : wrong.map((u) => `${u.email}: ${u.unitPath}`).join("; ");
    });

    const strandedEquipment = await prisma.equipment.findMany({
      where: { deletedAt: null, assignedTo: { deletedAt: { not: null } } },
      select: { serialNumber: true },
      take: 10,
    });

    check("no equipment is signed out to a soft-deleted person", () =>
      // A soft-deleted soldier vanishes from every scoped roster read, so an
      // item still assigned to them disappears from accountability while
      // remaining formally issued. That is exactly the row that turns up
      // missing at a layout inspection.
      strandedEquipment.length === 0
        ? null
        : `Assigned to deleted personnel: ${strandedEquipment
            .map((e) => e.serialNumber)
            .join(", ")}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} invariant(s) failed.\n`);
  process.exit(1);
}
console.log(
  skipped > 0
    ? `All run invariants hold. ${skipped} skipped — see above.\n`
    : "All invariants hold.\n",
);
