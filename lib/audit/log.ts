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
 * Field NAMES only. Never values.
 *
 * Storing "medicalNotes changed from X to Y" would make the audit viewer a
 * complete bypass of the masking layer: a Commander who may not read medical
 * detail could read every past version of it from the trail. This is the single
 * most tempting mistake in the whole design, and it looks like an improvement
 * when someone makes it.
 */
export function changedFieldNames(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return Object.keys(after)
    .filter((key) => !sameValue(before[key], after[key]))
    .sort();
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;
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
