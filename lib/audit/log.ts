/**
 * Audit entries — built here, written by the repository inside the same
 * transaction as the mutation they describe.
 *
 * That coupling is the point: if the audit row cannot be written, the mutation
 * rolls back. Audit availability becomes write availability, which is the
 * correct trade when audit logging is mandatory — an unaudited write must not
 * exist. The cost is one extra insert per mutation, and it is worth naming
 * rather than hiding.
 *
 * Pure module: builds plain objects, touches no database. `test/audit.test.ts`
 * covers the two things that actually go wrong — a diff that leaks values, and
 * a fabricated client IP.
 */

import type { AuditAction, Prisma } from "@prisma/client";

import type { Viewer } from "@/lib/auth/scope";

/**
 * Always excluded from a diff.
 *
 * `updatedAt` changes on every write by definition, so recording it says
 * nothing and pads every entry with noise. `id` and `createdAt` cannot change
 * at all. An entry that lists four fields when one was edited trains people to
 * stop reading the list, which costs more than the missing detail.
 */
const NEVER_INTERESTING = new Set(["id", "createdAt", "updatedAt"]);

/**
 * Field NAMES only. Never values.
 *
 * Storing "medicalNotes changed from X to Y" would make the audit viewer a
 * complete bypass of the masking layer: a Commander who may not read medical
 * detail could read every past version of it from the trail. This is the single
 * most tempting mistake in the whole design, and it looks like an improvement
 * when someone makes it.
 *
 * Only keys present in BOTH objects are compared.
 *
 * That single rule is what keeps joined relations out of the diff. The
 * repositories read `before` as a bare row and `after` with its relations
 * included, so `unit`, `assignedTo` and `maintenanceLogs` exist only on one
 * side. Comparing every key of `after` reported all three as changed on every
 * patch — an audit trail that overstates what changed cannot be trusted at
 * all, which is worse than one that is merely terse.
 *
 * Keying on presence rather than sniffing types is deliberate: an
 * `Array.isArray` or `typeof === "object"` test has to guess whether a value
 * is a to-many join or a scalar list column, and it guesses wrong the first
 * time someone adds a `String[]`.
 */
export function changedFieldNames(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return Object.keys(after)
    .filter((key) => key in before)
    .filter((key) => !NEVER_INTERESTING.has(key))
    .filter((key) => !sameValue(before[key], after[key]))
    .sort();
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;
  // Scalar list columns come back as a new array object on every read, so
  // Object.is would report an unchanged `String[]` as changed every time.
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  return Object.is(a, b);
}

/**
 * The client's address, or the string "unknown".
 *
 * Only the FIRST hop of `x-forwarded-for` is trusted, because every hop after
 * it is attacker-controlled on a request that arrived through a proxy. In local
 * development there is no proxy and no honest answer, so the value is "unknown"
 * rather than a fabricated 127.0.0.1 that would read as real evidence later.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

export type AuditInput = {
  viewer: Viewer;
  action: AuditAction;
  resource: string;
  targetId: string;
  /** Human-readable label, denormalized so the trail survives the row's deletion. */
  targetLabel: string;
  changedFields?: string[];
  headers?: Headers;
};

export function auditEntry(input: AuditInput): Prisma.AuditLogCreateInput {
  return {
    actorId: input.viewer.id,
    actorEmail: input.viewer.email,
    actorRole: input.viewer.role,
    actorUnitPath: input.viewer.unitPath,
    action: input.action,
    resource: input.resource,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    changedFields: input.changedFields ?? [],
    ip: input.headers ? clientIp(input.headers) : "unknown",
    userAgent: input.headers?.get("user-agent") ?? null,
  };
}
