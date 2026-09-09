import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/auth/policy";
import { toEquipmentDTO, type EquipmentRow } from "@/lib/dto/equipment";

/**
 * The equipment DTO's one real risk: an item is issued to a person, so a
 * logistics response carries somebody's identity. The quartermaster is exactly
 * the role that reads this screen constantly and is exactly the role forbidden
 * to see PII, which makes this the most likely place in the whole application
 * for a service number to escape.
 *
 * As with masking.test.ts, the assertions are on the SERIALIZED payload.
 */

const RAW_SERVICE_ID = "889-42-7731";
const NOW = new Date("2026-09-01T00:00:00.000Z");

const ROW: EquipmentRow = {
  id: "eq_0001",
  serialNumber: "SN-100042",
  nsn: "1005-01-231-0973",
  name: "Rifle, 5.56mm, M-series",
  category: "WEAPON",
  status: "IN_MAINTENANCE",
  unitId: 31,
  assignedToId: "pers_0001",
  acquiredAt: new Date("2021-03-02T00:00:00.000Z"),
  lastServicedAt: new Date("2026-02-01T00:00:00.000Z"),
  nextServiceDueAt: new Date("2026-08-01T00:00:00.000Z"),
  deletedAt: null,
  createdAt: new Date("2021-03-02T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  unit: { id: 31, designation: "2-14 IN / A / 1PLT", path: "/1/4/12/31/" },
  assignedTo: {
    id: "pers_0001",
    lastName: "Okonkwo",
    firstName: "Daniel",
    rank: "SERGEANT",
    serviceId: RAW_SERVICE_ID,
  },
  maintenanceLogs: [],
};

describe("the assignee travels under the same PII rules", () => {
  it("masks the service number for a quartermaster", () => {
    const dto = toEquipmentDTO(ROW, "QUARTERMASTER", NOW);
    expect(dto.assignedTo?.serviceId.masked).toBe(true);
    expect(dto.assignedTo?.serviceId.value).toBe("•••••7731");
    expect(JSON.stringify(dto)).not.toContain(RAW_SERVICE_ID);
  });

  it("masks it for a squad leader too", () => {
    expect(JSON.stringify(toEquipmentDTO(ROW, "SQUAD_LEADER", NOW))).not.toContain(
      RAW_SERVICE_ID,
    );
  });

  it("shows it to a commander", () => {
    const dto = toEquipmentDTO(ROW, "COMMANDER", NOW);
    expect(dto.assignedTo?.serviceId).toEqual({
      masked: false,
      value: RAW_SERVICE_ID,
    });
  });

  it("never leaks it for any role that cannot read PII", () => {
    for (const role of ROLES) {
      const dto = toEquipmentDTO(ROW, role, NOW);
      const field = dto.assignedTo!.serviceId;
      if (field.masked) expect(field.value).not.toBe(RAW_SERVICE_ID);
    }
  });

  it("still names the holder, because accountability needs a name", () => {
    // Masking the service number is not the same as hiding who signed for the
    // rifle. A property book that cannot say who holds an item is useless.
    const dto = toEquipmentDTO(ROW, "QUARTERMASTER", NOW);
    expect(dto.assignedTo?.lastName).toBe("Okonkwo");
    expect(dto.assignedTo?.rank).toBe("SERGEANT");
  });

  it("carries no other personnel field at all", () => {
    // The repository selects five assignee columns. If someone widens that to
    // `assignedTo: true`, medical notes and phone numbers arrive here and a
    // spread would ship them. The DTO shape is the second line of defence.
    const dto = toEquipmentDTO(ROW, "COMMANDER", NOW);
    expect(Object.keys(dto.assignedTo!).sort()).toEqual([
      "firstName",
      "id",
      "lastName",
      "rank",
      "serviceId",
    ]);
  });
});

describe("unassigned items", () => {
  it("report null rather than an empty assignee object", () => {
    const dto = toEquipmentDTO(
      { ...ROW, assignedToId: null, assignedTo: null },
      "QUARTERMASTER",
      NOW,
    );
    expect(dto.assignedTo).toBe(null);
  });
});

describe("service dates", () => {
  it("flags an item whose service date has passed", () => {
    expect(toEquipmentDTO(ROW, "QUARTERMASTER", NOW).serviceOverdue).toBe(true);
  });

  it("does not flag one that is still in date", () => {
    const future = { ...ROW, nextServiceDueAt: new Date("2027-01-01T00:00:00.000Z") };
    expect(toEquipmentDTO(future, "QUARTERMASTER", NOW).serviceOverdue).toBe(false);
  });

  it("does not flag an item with no scheduled service", () => {
    // `null < now` is false in JS only because null coerces to 0, which would
    // be an accident rather than a decision. The check is explicit.
    const none = { ...ROW, nextServiceDueAt: null };
    expect(toEquipmentDTO(none, "QUARTERMASTER", NOW).serviceOverdue).toBe(false);
  });

  it("uses the caller's clock, so a list and its rollup agree", () => {
    const earlier = new Date("2026-07-01T00:00:00.000Z");
    expect(toEquipmentDTO(ROW, "QUARTERMASTER", earlier).serviceOverdue).toBe(false);
  });
});
