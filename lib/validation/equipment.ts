import { z } from "zod";

/**
 * Request shapes for the equipment endpoints.
 *
 * Strict, for the same reason the personnel schemas are: an unrecognised key
 * returns 400 rather than being dropped, because a silent drop is
 * indistinguishable from a save that worked.
 *
 * Note what is NOT patchable — `status`. Equipment status is a consequence of
 * maintenance logs, not an independent field. Letting it be PATCHed directly
 * would let someone mark a deadlined vehicle operational while the fault that
 * deadlined it is still open, and the two screens showing it would disagree.
 * Status changes go through the maintenance endpoints.
 */

const CATEGORIES = ["WEAPON", "VEHICLE", "COMMS", "RATIONS"] as const;
const STATUSES = ["OPERATIONAL", "IN_MAINTENANCE", "DEADLINE"] as const;

const isoDate = z.iso
  .datetime({ offset: true })
  .or(z.iso.date())
  .transform((s) => new Date(s));

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

export const equipmentQuerySchema = z.strictObject({
  q: z.string().trim().max(120).optional(),
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  unitId: z.coerce.number().int().positive().optional(),
  overdue: boolish.optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export const equipmentCreateSchema = z.strictObject({
  serialNumber: z.string().trim().min(3).max(60),
  nsn: z.string().trim().regex(/^\d{4}-\d{2}-\d{3}-\d{4}$/, "Expected NNNN-NN-NNN-NNNN."),
  name: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES),
  unitId: z.number().int().positive(),
  acquiredAt: isoDate,
  nextServiceDueAt: isoDate.nullable().optional(),
  assignedToId: z.string().trim().min(1).nullable().optional(),
});

export const equipmentPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    nsn: z.string().trim().regex(/^\d{4}-\d{2}-\d{3}-\d{4}$/),
    category: z.enum(CATEGORIES),
    unitId: z.number().int().positive(),
    nextServiceDueAt: isoDate.nullable(),
    // Issue or return an item. Null hands it back to the unit pool.
    assignedToId: z.string().trim().min(1).nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Empty patch. Send at least one field.",
  });

export const maintenanceOpenSchema = z.strictObject({
  // OPERATIONAL is absent on purpose: opening a fault that leaves the item
  // serviceable is not a fault, it is a note, and this system does not have
  // those.
  status: z.enum(["IN_MAINTENANCE", "DEADLINE"]),
  summary: z.string().trim().min(5).max(500),
  technician: z.string().trim().min(2).max(120),
});

export const maintenanceCloseSchema = z.strictObject({
  laborHours: z.number().min(0).max(1000).optional(),
});

export type EquipmentQuery = z.infer<typeof equipmentQuerySchema>;
export type EquipmentCreate = z.infer<typeof equipmentCreateSchema>;
export type EquipmentPatch = z.infer<typeof equipmentPatchSchema>;
