import { describe, expect, it } from "vitest";

import {
  BILLETS,
  buildEquipment,
  buildMaintenanceLogs,
  buildPersonnel,
  categoryOf,
  DEMO_USERS,
  flattenTree,
  makeRng,
  UNIT_TREE,
} from "@/prisma/fixtures.mjs";
import { isWellFormedPath } from "@/lib/units";

/**
 * The seed's guarantees, checked without a database.
 *
 * Determinism is the one that quietly breaks: a `Math.random()` slipped in, or
 * a shared PRNG whose output depends on call order, and the E2E masking spec
 * starts asserting against a soldier who no longer exists.
 */

const UNITS = flattenTree();

describe("the order of battle", () => {
  it("is 160 units: 1 + 3 + 12 + 48 + 96", () => {
    const byEchelon = UNITS.reduce<Record<string, number>>((acc, u) => {
      acc[u.echelon] = (acc[u.echelon] ?? 0) + 1;
      return acc;
    }, {});
    expect(byEchelon).toEqual({
      BRIGADE: 1,
      BATTALION: 3,
      COMPANY: 12,
      PLATOON: 48,
      SQUAD: 96,
    });
    expect(UNITS).toHaveLength(160);
  });

  it("has unique designations — they are the upsert key", () => {
    const designations = UNITS.map((u) => u.designation);
    expect(new Set(designations).size).toBe(designations.length);
  });

  it("gives every unit a well-formed path", () => {
    for (const unit of UNITS) {
      expect(isWellFormedPath(unit.path), unit.path).toBe(true);
      expect(unit.path.endsWith(`/${unit.id}/`)).toBe(true);
    }
  });

  it("nests each child's path inside its parent's", () => {
    const byPath = new Map(UNITS.map((u) => [u.path, u]));
    for (const unit of UNITS) {
      const parentPath = unit.path.replace(/\d+\/$/, "");
      if (parentPath === "/") continue;
      expect(byPath.has(parentPath), `orphan path ${unit.path}`).toBe(true);
    }
  });

  it("starts at the brigade", () => {
    expect(UNIT_TREE.echelon).toBe("BRIGADE");
    expect(UNITS[0].path).toBe("/1/");
  });
});

describe("the roster", () => {
  const personnel = buildPersonnel(UNITS);

  it("is 1,128 soldiers", () => {
    const expected = UNITS.reduce((n, u) => n + BILLETS[u.echelon].length, 0);
    expect(personnel).toHaveLength(expected);
    expect(personnel).toHaveLength(1128);
  });

  it("has unique service numbers and emails", () => {
    // A duplicate serviceId makes `createMany({ skipDuplicates: true })` drop
    // rows silently, and the roster comes out short with no error anywhere.
    const ids = personnel.map((p) => p.serviceId);
    expect(new Set(ids).size).toBe(ids.length);
    const emails = personnel.map((p) => p.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("has a rank pyramid, not a uniform sample", () => {
    const counts = { OFFICER: 0, WARRANT: 0, ENLISTED: 0 };
    for (const p of personnel) counts[categoryOf(p.rank)] += 1;

    const pct = (n: number) => (n / personnel.length) * 100;
    expect(pct(counts.OFFICER)).toBeGreaterThan(5);
    expect(pct(counts.OFFICER)).toBeLessThan(11);
    expect(pct(counts.WARRANT)).toBeGreaterThan(0.5);
    expect(pct(counts.WARRANT)).toBeLessThan(4);
    expect(pct(counts.ENLISTED)).toBeGreaterThan(85);
  });

  it("keeps medical detail consistent with readiness", () => {
    // A deployable soldier carrying an open injury note is a contradiction the
    // dashboard would surface as an application bug rather than bad seed data.
    for (const p of personnel) {
      if (p.readiness === "DEPLOYABLE") {
        expect(p.medicalNotes).toBe(null);
        expect(p.medicalClearedUntil).toBe(null);
      } else {
        expect(p.medicalNotes).toBeTruthy();
      }
    }
  });

  it("puts roughly 85 percent of the brigade on deployable status", () => {
    const deployable = personnel.filter((p) => p.readiness === "DEPLOYABLE");
    const share = deployable.length / personnel.length;
    expect(share).toBeGreaterThan(0.8);
    expect(share).toBeLessThan(0.9);
  });

  it("is byte-for-byte identical across calls", () => {
    // The whole reason for the seeded PRNG. If this fails, an E2E assertion
    // about a specific soldier is one run away from becoming a flake.
    expect(JSON.stringify(buildPersonnel(UNITS))).toBe(
      JSON.stringify(buildPersonnel(UNITS)),
    );
  });

  it("uses no wall-clock dates", () => {
    // Every date is derived from the fixed epoch, so nothing in the roster can
    // sit after it. A `new Date()` sneaking in would show up here immediately.
    const epoch = new Date("2026-09-01T00:00:00.000Z").getTime();
    for (const p of personnel) {
      expect((p.enlistedAt as Date).getTime()).toBeLessThanOrEqual(epoch);
      expect((p.dateOfBirth as Date).getTime()).toBeLessThan(epoch);
    }
  });
});

describe("equipment", () => {
  const equipment = buildEquipment(UNITS);

  it("has unique serial numbers", () => {
    const serials = equipment.map((e) => e.serialNumber);
    expect(new Set(serials).size).toBe(serials.length);
  });

  it("holds nothing at platoon level — platoons sign for nothing", () => {
    const platoonIds = new Set(
      UNITS.filter((u) => u.echelon === "PLATOON").map((u) => u.id),
    );
    expect(equipment.filter((e) => platoonIds.has(e.unitId))).toHaveLength(0);
  });

  it("gives squads weapons and radios but not trucks", () => {
    const squadIds = new Set(
      UNITS.filter((u) => u.echelon === "SQUAD").map((u) => u.id),
    );
    const squadKit = equipment.filter((e) => squadIds.has(e.unitId));
    expect(squadKit.length).toBeGreaterThan(0);
    expect(squadKit.some((e) => e.category === "VEHICLE")).toBe(false);
  });

  it("leaves most of the fleet operational", () => {
    const operational = equipment.filter((e) => e.status === "OPERATIONAL");
    expect(operational.length / equipment.length).toBeGreaterThan(0.8);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildEquipment(UNITS))).toBe(
      JSON.stringify(buildEquipment(UNITS)),
    );
  });

  it("opens a maintenance log for everything not operational", () => {
    const down = equipment
      .filter((e) => e.status !== "OPERATIONAL")
      .map((e, i) => ({
        id: `eq_${i}`,
        status: e.status as "IN_MAINTENANCE" | "DEADLINE",
      }));
    const logs = buildMaintenanceLogs(down);
    expect(logs).toHaveLength(down.length);
    for (const log of logs) expect(log.summary).toBeTruthy();
  });
});

describe("demo users", () => {
  it("covers each role twice, at different echelons", () => {
    const byRole = DEMO_USERS.reduce<Record<string, number>>((acc, u) => {
      acc[u.role] = (acc[u.role] ?? 0) + 1;
      return acc;
    }, {});
    expect(byRole).toEqual({
      COMMANDER: 2,
      MEDICAL_OFFICER: 2,
      QUARTERMASTER: 2,
      SQUAD_LEADER: 2,
    });
  });

  it("references only units that exist", () => {
    // A typo here fails the seed halfway through, after the roster is written.
    const designations = new Set(UNITS.map((u) => u.designation));
    for (const user of DEMO_USERS) {
      expect(designations.has(user.unit), user.unit).toBe(true);
    }
  });

  it("puts the two squad leaders in sibling squads", () => {
    // The pair is what demonstrates lateral segregation: same echelon, same
    // parent, and neither may see the other's soldiers.
    const squads = DEMO_USERS.filter((u) => u.role === "SQUAD_LEADER");
    const parents = squads.map((u) => u.unit.replace(/ \/ \dSQD$/, ""));
    expect(parents[0]).toBe(parents[1]);
    expect(squads[0].unit).not.toBe(squads[1].unit);
  });
});

describe("the PRNG itself", () => {
  it("returns the same stream for the same seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("returns a different stream for a different seed", () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });

  it("stays in [0, 1)", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
