import { describe, expect, it } from "vitest";

import { auditEntry, changedFieldNames, clientIp } from "@/lib/audit/log";
import type { Viewer } from "@/lib/auth/scope";

const VIEWER: Viewer = {
  id: "user_1",
  email: "cdr.reyes@example.mil",
  name: "Reyes",
  role: "COMMANDER",
  unitId: 12,
  unitPath: "/1/4/12/",
  unitDesignation: "2-14 IN / A",
};

describe("the diff records names, never values", () => {
  it("lists only the fields that changed", () => {
    const before = { rank: "SERGEANT", readiness: "DEPLOYABLE", lastName: "Okonkwo" };
    const after = { rank: "STAFF_SERGEANT", readiness: "DEPLOYABLE", lastName: "Okonkwo" };
    expect(changedFieldNames(before, after)).toEqual(["rank"]);
  });

  it("compares dates by value, not identity", () => {
    // Two Date objects for the same instant are different objects; Object.is
    // would report every timestamped update as a change and bury the real ones.
    const t = "2026-04-12T00:00:00.000Z";
    expect(changedFieldNames({ at: new Date(t) }, { at: new Date(t) })).toEqual([]);
    expect(
      changedFieldNames({ at: new Date(t) }, { at: new Date("2026-04-13") }),
    ).toEqual(["at"]);
  });

  it("puts no value anywhere in the audit entry", () => {
    const secret = "Grade II ankle sprain; no ruck marches until cleared.";
    const entry = auditEntry({
      viewer: VIEWER,
      action: "UPDATE",
      resource: "Personnel",
      targetId: "pers_1",
      targetLabel: "SERGEANT Okonkwo, Daniel",
      changedFields: changedFieldNames(
        { medicalNotes: null },
        { medicalNotes: secret },
      ),
    });

    expect(entry.changedFields).toEqual(["medicalNotes"]);
    // The serialized row is what lands in the database and what a Commander
    // reads back in the audit viewer. If the note reaches it, the audit log has
    // become a complete bypass of the masking layer.
    expect(JSON.stringify(entry)).not.toContain(secret);
  });
});

describe("client IP", () => {
  it("trusts only the first hop", () => {
    // Everything after the first entry was appended by an upstream the client
    // may control, so only the hop the trusted proxy wrote is evidence.
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1, 192.168.1.1",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("says 'unknown' rather than inventing one in local development", () => {
    // A fabricated 127.0.0.1 would read as real evidence in an investigation.
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("the entry denormalizes the actor", () => {
  it("stores the actor's email, role and unit path as plain strings", () => {
    // Not foreign keys: the trail has to survive deletion of the rows it
    // describes, and a dangling reference is useless in the moment it matters.
    const entry = auditEntry({
      viewer: VIEWER,
      action: "DELETE",
      resource: "Personnel",
      targetId: "pers_9",
      targetLabel: "PRIVATE Vance, Ada",
    });
    expect(entry.actorEmail).toBe("cdr.reyes@example.mil");
    expect(entry.actorRole).toBe("COMMANDER");
    expect(entry.actorUnitPath).toBe("/1/4/12/");
    expect(entry.targetLabel).toBe("PRIVATE Vance, Ada");
  });
});
