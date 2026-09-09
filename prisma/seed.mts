/**
 * Seed — 160 units, 1,128 personnel, ~640 equipment items, 8 demo users.
 *
 * Run with `npm run db:seed`. Uses DIRECT_URL, the unpooled Neon endpoint,
 * because a few thousand inserts is the wrong shape of traffic for PgBouncer.
 *
 * IDEMPOTENT. Units and users upsert on their unique keys; personnel and
 * equipment insert with `skipDuplicates`. Running it twice leaves the database
 * exactly as the first run left it, so it is safe against a populated database.
 *
 * The rows themselves are built in fixtures.mts, which has no database
 * dependency and is covered by test/seed-fixtures.test.ts. All data is
 * fictional; see the header there.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { loadEnv } from "../lib/load-env";
import { childPath } from "../lib/units";
import {
  buildEquipment,
  buildMaintenanceLogs,
  buildPersonnel,
  DEMO_PASSWORD,
  DEMO_USERS,
  UNIT_TREE,
  type SeededUnit,
  type UnitNode,
} from "./fixtures.mjs";

loadEnv();

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "\nNo DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local and fill in\n" +
      "the two Neon connection strings before seeding.\n",
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ["warn", "error"],
});

/**
 * Units are upserted one at a time rather than in a `createMany`, because a
 * child's `path` needs its parent's database-assigned id. The tree is 160 rows
 * — small enough that the round-trips do not matter, and the alternative
 * (predicting ids from the sequence) breaks the moment the seed is re-run.
 *
 * The shape comes from UNIT_TREE in fixtures.mts so that this walk and the test
 * that checks the order of battle are reading the same description.
 */
async function seedUnits(): Promise<SeededUnit[]> {
  const all: SeededUnit[] = [];

  async function walk(node: UnitNode, parent: SeededUnit | null): Promise<void> {
    const row = await prisma.unit.upsert({
      where: { designation: node.designation },
      update: {
        name: node.name,
        echelon: node.echelon,
        parentId: parent?.id ?? null,
      },
      create: {
        designation: node.designation,
        name: node.name,
        echelon: node.echelon,
        parentId: parent?.id ?? null,
        // Placeholder. The real path needs the id this insert is about to
        // assign, so it is written back on the next line.
        path: "/",
      },
      select: { id: true },
    });

    const path = childPath(parent?.path ?? null, row.id);
    await prisma.unit.update({ where: { id: row.id }, data: { path } });

    const unit: SeededUnit = {
      id: row.id,
      designation: node.designation,
      echelon: node.echelon,
      path,
    };
    all.push(unit);

    for (const child of node.children) await walk(child, unit);
  }

  await walk(UNIT_TREE, null);
  return all;
}

async function main(): Promise<void> {
  console.log("\nSeeding MMS. All data is fictional.\n");

  const units = await seedUnits();
  console.log(`  units        ${units.length}`);

  const personnel = buildPersonnel(units);
  const newPersonnel = await prisma.personnel.createMany({
    data: personnel,
    skipDuplicates: true,
  });
  console.log(`  personnel    ${personnel.length} built, ${newPersonnel.count} new`);

  const equipment = buildEquipment(units);
  const newEquipment = await prisma.equipment.createMany({
    data: equipment,
    skipDuplicates: true,
  });
  console.log(`  equipment    ${equipment.length} built, ${newEquipment.count} new`);

  // Maintenance logs hang off whatever is not currently operational, so they
  // are written after the equipment rather than alongside it. They are replaced
  // rather than skipped, because a log has no natural unique key to dedupe on
  // and re-running the seed would otherwise stack duplicates.
  const needingWork = await prisma.equipment.findMany({
    where: { status: { not: "OPERATIONAL" } },
    select: { id: true, status: true },
  });
  await prisma.maintenanceLog.deleteMany({
    where: { equipmentId: { in: needingWork.map((e) => e.id) } },
  });
  await prisma.maintenanceLog.createMany({
    data: buildMaintenanceLogs(
      needingWork as { id: string; status: "IN_MAINTENANCE" | "DEADLINE" }[],
    ),
  });
  console.log(`  maintenance  ${needingWork.length}`);

  // Individual weapons are signed for by name; vehicles and rations stay in the
  // unit pool. Without this the property book shows "Unit pool" on every row and
  // the assignee-masking path — the whole reason the equipment DTO is
  // interesting — is never exercised by real data.
  //
  // Deterministic by construction: both sides are ordered by a unique column
  // and zipped, so a re-run pairs the same rifle with the same soldier. Only
  // unassigned items are touched, which is what keeps it idempotent.
  let issued = 0;
  for (const unit of units.filter((u) => u.echelon === "SQUAD")) {
    const [soldiers, weapons] = await Promise.all([
      prisma.personnel.findMany({
        where: { unitId: unit.id, deletedAt: null },
        orderBy: { serviceId: "asc" },
        select: { id: true },
      }),
      prisma.equipment.findMany({
        where: { unitId: unit.id, category: "WEAPON", assignedToId: null },
        orderBy: { serialNumber: "asc" },
        select: { id: true },
      }),
    ]);

    for (let i = 0; i < weapons.length && i < soldiers.length; i += 1) {
      await prisma.equipment.update({
        where: { id: weapons[i].id },
        data: { assignedToId: soldiers[i].id },
      });
      issued += 1;
    }
  }
  console.log(`  issued       ${issued} weapons signed for by name`);

  const byDesignation = new Map(units.map((u) => [u.designation, u]));
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const demo of DEMO_USERS) {
    const unit = byDesignation.get(demo.unit);
    if (!unit) {
      throw new Error(`Demo user ${demo.email} references unknown unit ${demo.unit}`);
    }

    await prisma.user.upsert({
      where: { email: demo.email },
      // The password is NOT reset on re-seed: an existing demo account keeps
      // whatever it has, so re-running the seed cannot silently undo a
      // credential change made for a live demo.
      update: {
        name: demo.name,
        role: demo.role,
        unitId: unit.id,
        unitPath: unit.path,
        active: true,
      },
      create: {
        email: demo.email,
        name: demo.name,
        role: demo.role,
        unitId: unit.id,
        unitPath: unit.path,
        passwordHash,
      },
    });
  }
  console.log(`  users        ${DEMO_USERS.length}\n`);

  console.log(`Demo sign-ins — password for all of them: ${DEMO_PASSWORD}\n`);
  for (const demo of DEMO_USERS) {
    console.log(`  ${demo.email.padEnd(30)} ${demo.role.padEnd(16)} ${demo.unit}`);
    console.log(`  ${" ".repeat(30)} ${demo.demonstrates}`);
  }
  console.log("");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
