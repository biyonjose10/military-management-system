/**
 * The RBAC matrix — one exhaustive table, not `if` statements scattered through
 * route handlers.
 *
 * This module is deliberately **pure**: no database, no request, no Prisma
 * runtime (the Role type is a type-only import, so it erases at compile time).
 * That is what lets `test/policy.test.ts` assert the entire role x resource x
 * action grid without a connection string, and what lets `proxy.ts` import it
 * on a request path that must never touch the database.
 *
 * What this module does NOT do: row-level scoping. Whether a viewer may read
 * *this particular soldier* is `lib/auth/scope.ts` plus the repository. `can()`
 * answers only "is this kind of action available to this role at all".
 */

import type { Role } from "@prisma/client";

export type { Role };

/**
 * Resources are split finer than tables, because the interesting rules in this
 * system are field-level. `personnel.medical` and `personnel.pii` are subsets
 * of a Personnel row, not separate entities.
 */
export type Resource =
  | "personnel"
  | "personnel.medical"
  | "personnel.pii"
  | "equipment"
  | "maintenance"
  | "audit";

export type Action = "read" | "create" | "update" | "delete";

/**
 * `Record<Role, Record<Resource, ...>>` rather than a partial map: adding a role
 * to the Prisma enum, or a resource to the union above, breaks the build here
 * until it is answered explicitly. A missing entry defaulting to `false` would
 * be the wrong kind of safe — it would fail silently at 3am instead of loudly
 * at compile time.
 */
type Matrix = Record<Role, Record<Resource, readonly Action[]>>;

const NONE = [] as const;
const READ = ["read"] as const;
const CRUD = ["read", "create", "update", "delete"] as const;

const MATRIX: Matrix = {
  /**
   * Owns the formation and everything in it, within their own subtree.
   *
   * The sharp edge of this whole module: a Commander outranks a Medical
   * Officer and may READ medical readiness, but may not WRITE it. Rank and
   * permission are different axes. Anyone "fixing" this line has misunderstood
   * the point of the exercise.
   */
  COMMANDER: {
    personnel: CRUD,
    "personnel.medical": READ,
    "personnel.pii": READ,
    equipment: READ,
    maintenance: READ,
    audit: READ,
  },

  /**
   * The only role that may write medical readiness. Sees the whole subtree but
   * cannot alter a roster, and has no visibility into logistics at all.
   */
  MEDICAL_OFFICER: {
    personnel: READ,
    "personnel.medical": ["read", "update"],
    "personnel.pii": READ,
    equipment: NONE,
    maintenance: NONE,
    audit: NONE,
  },

  /**
   * Owns equipment end to end. Needs to know who an item is issued to, so they
   * read personnel — but with PII masked, and with no access to medical data
   * whatsoever. Not even read.
   */
  QUARTERMASTER: {
    personnel: READ,
    "personnel.medical": NONE,
    "personnel.pii": NONE,
    equipment: CRUD,
    maintenance: CRUD,
    audit: NONE,
  },

  /**
   * Own unit only — enforced in `lib/auth/scope.ts`, not here; `can()` cannot
   * see rows. PII stays masked: a squad leader knows their soldiers in person
   * and does not need service numbers rendered into a browser tab.
   */
  SQUAD_LEADER: {
    personnel: READ,
    "personnel.medical": NONE,
    "personnel.pii": NONE,
    equipment: READ,
    maintenance: READ,
    audit: NONE,
  },
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  return MATRIX[role][resource].includes(action);
}

/** Every role in the matrix. Exported so tests can walk the full grid. */
export const ROLES = Object.keys(MATRIX) as readonly Role[];

export const RESOURCES: readonly Resource[] = [
  "personnel",
  "personnel.medical",
  "personnel.pii",
  "equipment",
  "maintenance",
  "audit",
];

export const ACTIONS: readonly Action[] = [
  "read",
  "create",
  "update",
  "delete",
];

// ---------------------------------------------------------------------------
// Field groups
// ---------------------------------------------------------------------------

/**
 * Which Personnel columns belong to which restricted group.
 *
 * These live next to the matrix rather than in the DTO so that there is exactly
 * one place to edit when a column is added. A new PII column that nobody adds
 * to this list is invisible to the masking layer and ships in the clear — so
 * `test/masking.test.ts` asserts on the serialized payload rather than on this
 * list, and would catch the omission.
 */
export const PII_FIELDS = [
  "serviceId",
  "phone",
  "email",
  "dateOfBirth",
  "emergencyContactName",
  "emergencyContactPhone",
] as const;

export const MEDICAL_FIELDS = [
  "medicalNotes",
  "medicalClearedUntil",
  "lastPhysicalAt",
] as const;

export type PiiField = (typeof PII_FIELDS)[number];
export type MedicalField = (typeof MEDICAL_FIELDS)[number];

/** The resource group a Personnel field belongs to, or null if it is public. */
export function fieldGroup(
  field: string,
): "personnel.pii" | "personnel.medical" | null {
  if ((PII_FIELDS as readonly string[]).includes(field)) return "personnel.pii";
  if ((MEDICAL_FIELDS as readonly string[]).includes(field)) {
    return "personnel.medical";
  }
  return null;
}

/**
 * May this role write this specific Personnel field?
 *
 * Used by the PATCH route before anything is written. A field in a restricted
 * group needs permission on that group; everything else falls back to the
 * `personnel` row permission — which is why a Medical Officer, who has only
 * `read` on `personnel`, cannot rename a soldier while updating their profile.
 */
export function canWriteField(role: Role, field: string): boolean {
  const group = fieldGroup(field);
  return group ? can(role, group, "update") : can(role, "personnel", "update");
}
