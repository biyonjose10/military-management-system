/**
 * The serialization boundary — where PII masking actually happens.
 *
 * Route handlers may return `PersonnelDTO`, never a raw Prisma row. That rule
 * exists because the obvious alternative, masking in JSX, does not work: the
 * unmasked value still ships inside the RSC payload or the JSON response and is
 * one devtools tab away. Masking has to happen before the value crosses the
 * wire, which means here.
 *
 * A masked field is not deleted. It is replaced with a placeholder and carries
 * `masked: true` plus a `reason`, so the UI can render "hidden, and here is
 * why" rather than pretending the soldier has no phone number. A field that
 * silently disappears reads as missing data and gets "fixed" by someone.
 *
 * Pure: no database, no request. `test/masking.test.ts` asserts on the
 * serialized JSON of the output, not on the component that renders it.
 */

import type { Personnel, Rank, RankCategory, ReadinessStatus } from "@prisma/client";

import { can, type Role } from "@/lib/auth/policy";
import {
  hidden,
  iso,
  maskServiceId,
  MEDICAL_REASON,
  PII_REASON,
  REDACTED,
  visible,
  type Field,
} from "@/lib/dto/mask";

// Re-exported so existing importers of the personnel DTO keep working; the
// definition itself lives in mask.ts, next to the functions that build one.
export type { Field };

export type MedicalBlock =
  | {
      masked: false;
      notes: string | null;
      clearedUntil: string | null;
      lastPhysicalAt: string | null;
    }
  | { masked: true; reason: string };

export type PersonnelDTO = {
  id: string;
  serviceId: Field<string>;
  lastName: string;
  firstName: string;
  rank: Rank;
  rankCategory: RankCategory;
  unitId: number;
  unitDesignation: string | null;
  readiness: ReadinessStatus;
  medical: MedicalBlock;
  phone: Field<string | null>;
  email: Field<string | null>;
  dateOfBirth: Field<string>;
  emergencyContactName: Field<string | null>;
  emergencyContactPhone: Field<string | null>;
  enlistedAt: string;
  deployedUntil: string | null;
};

export type PersonnelRow = Personnel & {
  unit?: { id: number; designation: string; path: string } | null;
};

export function toPersonnelDTO(row: PersonnelRow, role: Role): PersonnelDTO {
  const seePii = can(role, "personnel.pii", "read");
  const seeMedical = can(role, "personnel.medical", "read");

  return {
    id: row.id,
    // Never the raw value on the masked branch — `maskServiceId` runs first and
    // its result is what gets serialized.
    serviceId: seePii
      ? visible(row.serviceId)
      : hidden(maskServiceId(row.serviceId), PII_REASON),

    lastName: row.lastName,
    firstName: row.firstName,
    rank: row.rank,
    rankCategory: row.rankCategory,

    unitId: row.unitId,
    unitDesignation: row.unit?.designation ?? null,

    readiness: row.readiness,

    // Readiness status itself is roster data everyone with personnel:read can
    // see — it is what the whole dashboard is for. The clinical detail behind
    // it is not.
    medical: seeMedical
      ? {
          masked: false,
          notes: row.medicalNotes,
          clearedUntil: iso(row.medicalClearedUntil),
          lastPhysicalAt: iso(row.lastPhysicalAt),
        }
      : { masked: true, reason: MEDICAL_REASON },

    phone: seePii ? visible(row.phone) : hidden(REDACTED, PII_REASON),
    email: seePii ? visible(row.email) : hidden(REDACTED, PII_REASON),
    dateOfBirth: seePii
      ? visible(row.dateOfBirth.toISOString())
      : hidden("••••-••-••", PII_REASON),
    emergencyContactName: seePii
      ? visible(row.emergencyContactName)
      : hidden(REDACTED, PII_REASON),
    emergencyContactPhone: seePii
      ? visible(row.emergencyContactPhone)
      : hidden(REDACTED, PII_REASON),

    enlistedAt: row.enlistedAt.toISOString(),
    deployedUntil: iso(row.deployedUntil),
  };
}
