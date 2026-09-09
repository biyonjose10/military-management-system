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

  it("lets ONLY the Medical Officer set deployability", () => {
    // `readiness` is read by everyone and written by one role. It is the field
    // the brief means by "medical readiness": a Commander may look at it and
    // may not change it, because declaring a soldier non-deployable is a
    // medical judgement rather than a command one. The login page tells users
    // the Medical Officer is the only role that may write it, so this test is
    // also what keeps that copy honest.
    expect(canWriteField("MEDICAL_OFFICER", "readiness")).toBe(true);
    expect(canWriteField("COMMANDER", "readiness")).toBe(false);
    expect(canWriteField("QUARTERMASTER", "readiness")).toBe(false);
    expect(canWriteField("SQUAD_LEADER", "readiness")).toBe(false);

    const writers = ROLES.filter((r) => canWriteField(r, "readiness"));
    expect(writers).toEqual(["MEDICAL_OFFICER"]);
  });

  it("still lets a Commander READ readiness", () => {
    // The write restriction must not leak into visibility — readiness is on
    // every roster row and is the dashboard's headline figure.
    expect(fieldGroup("readiness")).toBe(null);
  });

  it("routes an ordinary field through the personnel permission", () => {
    expect(canWriteField("COMMANDER", "rank")).toBe(true);
    expect(canWriteField("COMMANDER", "lastName")).toBe(true);
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
