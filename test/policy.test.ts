import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  can,
  canWriteField,
  fieldGroup,
  MEDICAL_FIELDS,
  PII_FIELDS,
  RESOURCES,
  ROLES,
} from "@/lib/auth/policy";

/**
 * These are not coverage decoration. Each block below is a rule someone will
 * eventually be tempted to "simplify", and the test is the thing that stops it.
 */

describe("the RBAC matrix", () => {
  it("answers every role x resource x action combination without throwing", () => {
    // A missing matrix entry would surface here as a TypeError rather than as a
    // silent `undefined.includes` in a route handler at request time.
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          expect(typeof can(role, resource, action)).toBe("boolean");
        }
      }
    }
  });

  it("covers all four roles", () => {
    expect([...ROLES].sort()).toEqual([
      "COMMANDER",
      "MEDICAL_OFFICER",
      "QUARTERMASTER",
      "SQUAD_LEADER",
    ]);
  });
});

describe("rank and permission are different axes", () => {
  it("lets a Commander READ medical readiness", () => {
    expect(can("COMMANDER", "personnel.medical", "read")).toBe(true);
  });

  it("does NOT let a Commander WRITE medical readiness", () => {
    // The single most likely "bug fix" someone will submit against this
    // project. A Commander outranks a Medical Officer and still may not do
    // this. If this test is failing, the matrix was widened, not repaired.
    expect(can("COMMANDER", "personnel.medical", "update")).toBe(false);
  });

  it("makes the Medical Officer the only writer of medical data", () => {
    const writers = ROLES.filter((r) => can(r, "personnel.medical", "update"));
    expect(writers).toEqual(["MEDICAL_OFFICER"]);
  });

  it("does not let a Medical Officer edit the roster itself", () => {
    expect(can("MEDICAL_OFFICER", "personnel", "update")).toBe(false);
    expect(can("MEDICAL_OFFICER", "personnel", "delete")).toBe(false);
  });
});

describe("the Quartermaster is walled off from people data", () => {
  it("may read personnel, because equipment is issued to them", () => {
    expect(can("QUARTERMASTER", "personnel", "read")).toBe(true);
  });

  it("may not read PII", () => {
    expect(can("QUARTERMASTER", "personnel.pii", "read")).toBe(false);
  });

  it("may not read medical data at all — not even read", () => {
    expect(can("QUARTERMASTER", "personnel.medical", "read")).toBe(false);
  });

  it("owns equipment and maintenance end to end", () => {
    for (const action of ACTIONS) {
      expect(can("QUARTERMASTER", "equipment", action)).toBe(true);
      expect(can("QUARTERMASTER", "maintenance", action)).toBe(true);
    }
  });
});

describe("the audit log", () => {
  it("is readable only by a Commander", () => {
    const readers = ROLES.filter((r) => can(r, "audit", "read"));
    expect(readers).toEqual(["COMMANDER"]);
  });

  it("is append-only — no role may write it through the policy layer", () => {
    for (const role of ROLES) {
      for (const action of ["create", "update", "delete"] as const) {
        expect(can(role, "audit", action)).toBe(false);
      }
    }
  });
});

describe("nobody may hard-delete", () => {
  it("grants delete on personnel only to a Commander", () => {
    const deleters = ROLES.filter((r) => can(r, "personnel", "delete"));
    expect(deleters).toEqual(["COMMANDER"]);
  });
});

describe("field-level write permission", () => {
  it("classifies every declared PII and medical field", () => {
    for (const f of PII_FIELDS) expect(fieldGroup(f)).toBe("personnel.pii");
    for (const f of MEDICAL_FIELDS) {
      expect(fieldGroup(f)).toBe("personnel.medical");
    }
  });

  it("treats an unlisted field as ordinary roster data", () => {
    expect(fieldGroup("rank")).toBe(null);
    expect(fieldGroup("readiness")).toBe(null);
  });

  it("routes a medical field through the medical permission", () => {
    expect(canWriteField("MEDICAL_OFFICER", "medicalNotes")).toBe(true);
    expect(canWriteField("COMMANDER", "medicalNotes")).toBe(false);
  });

  it("routes an ordinary field through the personnel permission", () => {
    expect(canWriteField("COMMANDER", "rank")).toBe(true);
    // A Medical Officer has read-only access to the roster, so writing a
    // non-medical field is refused even though they may write medical ones.
    expect(canWriteField("MEDICAL_OFFICER", "rank")).toBe(false);
  });

  it("refuses PII writes from every role that cannot read PII", () => {
    for (const role of ROLES) {
      if (can(role, "personnel.pii", "read")) continue;
      for (const field of PII_FIELDS) {
        expect(canWriteField(role, field)).toBe(false);
      }
    }
  });
});
