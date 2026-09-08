import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/auth/policy";
import { toPersonnelDTO, type PersonnelRow } from "@/lib/dto/personnel";

/**
 * These tests assert on the SERIALIZED payload, not on the DTO object and
 * certainly not on a component.
 *
 * The bug this catches is the one that keeps happening: a field masked in JSX
 * while the real value still rides along in the JSON body or the RSC payload.
 * `JSON.stringify(dto)` is exactly what crosses the wire, so that is what gets
 * searched for the secret.
 */

const RAW = {
  serviceId: "889-42-7731",
  phone: "+1-555-0142",
  email: "d.okonkwo@example.mil",
  emergencyContactName: "Adaeze Okonkwo",
  emergencyContactPhone: "+1-555-0199",
  medicalNotes: "Grade II ankle sprain; no ruck marches until cleared.",
} as const;

const ROW: PersonnelRow = {
  id: "pers_0001",
  serviceId: RAW.serviceId,
  lastName: "Okonkwo",
  firstName: "Daniel",
  rank: "SERGEANT",
  rankCategory: "ENLISTED",
  unitId: 31,
  readiness: "LIMITED_DUTY",
  medicalNotes: RAW.medicalNotes,
  medicalClearedUntil: new Date("2026-11-01T00:00:00.000Z"),
  lastPhysicalAt: new Date("2026-04-12T00:00:00.000Z"),
  phone: RAW.phone,
  email: RAW.email,
  dateOfBirth: new Date("1997-03-08T00:00:00.000Z"),
  emergencyContactName: RAW.emergencyContactName,
  emergencyContactPhone: RAW.emergencyContactPhone,
  enlistedAt: new Date("2018-06-04T00:00:00.000Z"),
  deployedUntil: null,
  deletedAt: null,
  createdAt: new Date("2018-06-04T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  unit: { id: 31, designation: "2-14 IN / A / 1PLT", path: "/1/4/12/31/" },
};

function payload(role: Parameters<typeof toPersonnelDTO>[1]): string {
  return JSON.stringify(toPersonnelDTO(ROW, role));
}

describe("a Quartermaster's response body", () => {
  const body = payload("QUARTERMASTER");

  it("contains no full service number", () => {
    expect(body).not.toContain(RAW.serviceId);
  });

  it("contains no phone number, in either field", () => {
    expect(body).not.toContain(RAW.phone);
    expect(body).not.toContain(RAW.emergencyContactPhone);
  });

  it("contains no email address, date of birth or next-of-kin name", () => {
    expect(body).not.toContain(RAW.email);
    expect(body).not.toContain("1997-03-08");
    expect(body).not.toContain(RAW.emergencyContactName);
  });

  it("contains no medical note", () => {
    expect(body).not.toContain(RAW.medicalNotes);
    // Nor the dates that would let someone reconstruct the timeline.
    expect(body).not.toContain("2026-11-01");
    expect(body).not.toContain("2026-04-12");
  });

  it("still shows the roster data the quartermaster is entitled to", () => {
    const dto = toPersonnelDTO(ROW, "QUARTERMASTER");
    expect(dto.lastName).toBe("Okonkwo");
    expect(dto.rank).toBe("SERGEANT");
    expect(dto.unitDesignation).toBe("2-14 IN / A / 1PLT");
    // Readiness itself is not medical detail — it is the entire point of the
    // dashboard, and hiding it would make the app useless to the role that
    // decides whether a vehicle gets a crew.
    expect(dto.readiness).toBe("LIMITED_DUTY");
  });

  it("says a field is hidden rather than pretending it is absent", () => {
    const dto = toPersonnelDTO(ROW, "QUARTERMASTER");
    expect(dto.phone.masked).toBe(true);
    if (dto.phone.masked) expect(dto.phone.reason).toMatch(/visible to/i);
    expect(dto.medical.masked).toBe(true);
  });

  it("keeps the last four of the service number, and only those", () => {
    const dto = toPersonnelDTO(ROW, "QUARTERMASTER");
    expect(dto.serviceId.value).toBe("•••••7731");
    expect(dto.serviceId.value).not.toContain("889");
  });
});

describe("a Squad Leader's response body", () => {
  it("is masked identically — own-unit access is not PII access", () => {
    const body = payload("SQUAD_LEADER");
    expect(body).not.toContain(RAW.serviceId);
    expect(body).not.toContain(RAW.phone);
    expect(body).not.toContain(RAW.medicalNotes);
  });
});

describe("the roles that may see the whole record", () => {
  it("gives a Commander the PII and the medical detail, unmasked", () => {
    const dto = toPersonnelDTO(ROW, "COMMANDER");
    expect(dto.serviceId).toEqual({ masked: false, value: RAW.serviceId });
    expect(dto.phone).toEqual({ masked: false, value: RAW.phone });
    expect(dto.medical.masked).toBe(false);
    if (!dto.medical.masked) expect(dto.medical.notes).toBe(RAW.medicalNotes);
  });

  it("gives a Medical Officer the same view", () => {
    const dto = toPersonnelDTO(ROW, "MEDICAL_OFFICER");
    expect(dto.medical.masked).toBe(false);
    expect(dto.serviceId.masked).toBe(false);
  });
});

describe("across every role", () => {
  it("never leaks a raw value on a field the DTO reports as masked", () => {
    // Guards against the subtle version of the bug: correctly setting
    // `masked: true` while still placing the real value in `value`.
    for (const role of ROLES) {
      const dto = toPersonnelDTO(ROW, role);
      for (const secret of Object.values(RAW)) {
        for (const field of [
          dto.serviceId,
          dto.phone,
          dto.email,
          dto.emergencyContactName,
          dto.emergencyContactPhone,
        ]) {
          if (field.masked) expect(field.value).not.toBe(secret);
        }
      }
    }
  });

  it("emits every field in the DTO for every role, masked or not", () => {
    // A masked field must still be present, or the client cannot distinguish
    // "hidden from you" from "this soldier has no next of kin on file".
    const keys = Object.keys(toPersonnelDTO(ROW, "COMMANDER")).sort();
    for (const role of ROLES) {
      expect(Object.keys(toPersonnelDTO(ROW, role)).sort()).toEqual(keys);
    }
  });
});
