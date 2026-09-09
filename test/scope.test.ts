import { describe, expect, it } from "vitest";

import type { Role } from "@/lib/auth/policy";
import {
  isWithinScope,
  resolveScope,
  scopeWhere,
  unitScopeWhere,
  type Viewer,
} from "@/lib/auth/scope";

/**
 * A fictional slice of the hierarchy, matching the shape the seed produces:
 *
 *   1  Brigade                     /1/
 *   4  2-14 IN (Battalion)         /1/4/
 *  12    A Company                 /1/4/12/
 *  31      1st Platoon             /1/4/12/31/
 *  32      2nd Platoon             /1/4/12/32/
 *  40  4-9 CAV (Battalion)         /1/40/   <- the prefix-collision trap
 */
const UNITS = {
  brigade: { id: 1, path: "/1/" },
  battalion2_14: { id: 4, path: "/1/4/" },
  aCompany: { id: 12, path: "/1/4/12/" },
  platoon1: { id: 31, path: "/1/4/12/31/" },
  platoon2: { id: 32, path: "/1/4/12/32/" },
  battalion4_9: { id: 40, path: "/1/40/" },
};

function viewer(role: Role, unit: { id: number; path: string }): Viewer {
  return {
    id: `user-${role}-${unit.id}`,
    email: `${role.toLowerCase()}@example.mil`,
    name: role,
    role,
    unitId: unit.id,
    unitPath: unit.path,
    unitDesignation: `UNIT-${unit.id}`,
  };
}

describe("path invariants", () => {
  it("accepts a slash-terminated numeric path", () => {
    expect(() => resolveScope(viewer("COMMANDER", UNITS.aCompany))).not.toThrow();
  });

  it.each([
    ["/1/4/12", "no trailing slash"],
    ["1/4/12/", "no leading slash"],
    ["", "empty"],
    ["/", "root only"],
    ["/1//12/", "empty segment"],
    ["/1/4/a/", "non-numeric segment"],
  ])("rejects %s (%s)", (path) => {
    const bad = { ...viewer("COMMANDER", UNITS.aCompany), unitPath: path };
    expect(() => resolveScope(bad)).toThrow(/Malformed unit path/);
  });
});

describe("subtree scoping", () => {
  const scope = resolveScope(viewer("COMMANDER", UNITS.battalion2_14));

  it("includes the viewer's own unit", () => {
    expect(isWithinScope(scope, UNITS.battalion2_14)).toBe(true);
  });

  it("includes everything below it", () => {
    expect(isWithinScope(scope, UNITS.aCompany)).toBe(true);
    expect(isWithinScope(scope, UNITS.platoon1)).toBe(true);
    expect(isWithinScope(scope, UNITS.platoon2)).toBe(true);
  });

  it("excludes everything above it", () => {
    expect(isWithinScope(scope, UNITS.brigade)).toBe(false);
  });

  it("excludes a sibling whose id merely starts with the same digits", () => {
    // "/1/4/" must not match "/1/40/". This is the entire reason paths are
    // terminated at both ends, and the failure mode is silent over-disclosure
    // of a whole neighbouring battalion.
    expect(isWithinScope(scope, UNITS.battalion4_9)).toBe(false);
    expect(UNITS.battalion4_9.path.startsWith("/1/4")).toBe(true);
  });
});

describe("own-unit-only scoping", () => {
  const scope = resolveScope(viewer("SQUAD_LEADER", UNITS.platoon1));

  it("includes the viewer's own unit", () => {
    expect(isWithinScope(scope, UNITS.platoon1)).toBe(true);
  });

  it("excludes a sibling platoon in the same company", () => {
    expect(isWithinScope(scope, UNITS.platoon2)).toBe(false);
  });

  it("excludes the parent company", () => {
    expect(isWithinScope(scope, UNITS.aCompany)).toBe(false);
  });

  it("is flagged on the scope itself", () => {
    expect(scope.ownUnitOnly).toBe(true);
    expect(resolveScope(viewer("COMMANDER", UNITS.platoon1)).ownUnitOnly).toBe(
      false,
    );
  });
});

describe("the where fragment matches the predicate", () => {
  it("filters soft-deleted rows in both modes", () => {
    for (const role of ["COMMANDER", "SQUAD_LEADER"] as const) {
      const where = scopeWhere(resolveScope(viewer(role, UNITS.platoon1)));
      expect(where.deletedAt).toBe(null);
    }
  });

  it("uses a terminated startsWith for a subtree viewer", () => {
    const where = scopeWhere(resolveScope(viewer("COMMANDER", UNITS.aCompany)));
    expect(where.unit).toEqual({ path: { startsWith: "/1/4/12/" } });
    expect(where.unitId).toBeUndefined();
  });

  it("uses an exact unit id for an own-unit-only viewer", () => {
    const where = scopeWhere(resolveScope(viewer("SQUAD_LEADER", UNITS.platoon1)));
    expect(where.unitId).toBe(31);
    expect(where.unit).toBeUndefined();
  });

  it("scopes Unit queries the same way", () => {
    expect(unitScopeWhere(resolveScope(viewer("COMMANDER", UNITS.aCompany))))
      .toEqual({ path: { startsWith: "/1/4/12/" } });
    expect(unitScopeWhere(resolveScope(viewer("SQUAD_LEADER", UNITS.platoon1))))
      .toEqual({ id: 31 });
  });
});
