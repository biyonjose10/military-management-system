import { z } from "zod";

/**
 * Request shapes for the personnel endpoints.
 *
 * Every object schema here is **strict**: an unrecognised key is an error, not
 * something to drop. The permissive alternative is worse than it looks — a
 * Commander PATCHing `medicalReadiness` would get 200 OK and a record that
 * never changed, which reads as a save that silently failed. Strict parsing
 * turns that into a 403 that names the field.
 *
 * Field-level authorization is NOT here. `canWriteField()` in lib/auth/policy.ts
 * decides who may write what; this layer only decides what is well-formed.
 * Keeping them apart means the schema can be reused for a role with different
 * rights without being rewritten.
 */

const RANKS = [
  "PRIVATE", "PRIVATE_FIRST_CLASS", "SPECIALIST", "CORPORAL", "SERGEANT",
  "STAFF_SERGEANT", "SERGEANT_FIRST_CLASS", "MASTER_SERGEANT", "FIRST_SERGEANT",
  "SERGEANT_MAJOR", "WARRANT_OFFICER_1", "CHIEF_WARRANT_OFFICER_2",
  "CHIEF_WARRANT_OFFICER_3", "CHIEF_WARRANT_OFFICER_4", "CHIEF_WARRANT_OFFICER_5",
  "SECOND_LIEUTENANT", "FIRST_LIEUTENANT", "CAPTAIN", "MAJOR",
  "LIEUTENANT_COLONEL", "COLONEL",
] as const;

const READINESS = ["DEPLOYABLE", "LIMITED_DUTY", "NON_DEPLOYABLE"] as const;

/** ISO date string in, Date out. The DTO serializes back to ISO on the way out. */
const isoDate = z.iso.datetime({ offset: true }).or(z.iso.date()).transform((s) => new Date(s));

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const personnelQuerySchema = z.strictObject({
  q: z.string().trim().max(120).optional(),
  readiness: z.enum(READINESS).optional(),
  unitId: z.coerce.number().int().positive().optional(),
  // Capped here as well as in the repository: an uncapped `take` is a cheap way
  // to turn a paginated endpoint into a full-roster export.
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export const personnelCreateSchema = z.strictObject({
  serviceId: z.string().trim().regex(/^\d{3}-\d{2}-\d{4}$/, "Expected NNN-NN-NNNN."),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  rank: z.enum(RANKS),
  unitId: z.number().int().positive(),
  readiness: z.enum(READINESS).default("DEPLOYABLE"),
  dateOfBirth: isoDate,
  enlistedAt: isoDate,
  phone: nullableText(40).optional(),
  email: z.email().nullable().optional(),
  emergencyContactName: nullableText(120).optional(),
  emergencyContactPhone: nullableText(40).optional(),
});

/**
 * Patches carry only what changed.
 *
 * `.strict()` plus the field-level check in the route means a request that
 * touches a forbidden field is refused whole rather than partially applied —
 * there is no state in which half a patch landed.
 */
export const personnelPatchSchema = z
  .strictObject({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    rank: z.enum(RANKS),
    unitId: z.number().int().positive(),
    readiness: z.enum(READINESS),
    medicalNotes: nullableText(2000),
    medicalClearedUntil: isoDate.nullable(),
    lastPhysicalAt: isoDate.nullable(),
    phone: nullableText(40),
    email: z.email().nullable(),
    emergencyContactName: nullableText(120),
    emergencyContactPhone: nullableText(40),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Empty patch. Send at least one field.",
  });

export type PersonnelQuery = z.infer<typeof personnelQuerySchema>;
export type PersonnelCreate = z.infer<typeof personnelCreateSchema>;
export type PersonnelPatch = z.infer<typeof personnelPatchSchema>;
