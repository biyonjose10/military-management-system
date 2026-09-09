import "server-only";

import type { AuditAction, Prisma } from "@prisma/client";

import type { Scope } from "@/lib/auth/scope";
import { prismaUnsafe } from "@/lib/db/client";

/**
 * Reading the audit trail.
 *
 * There is no `create` here on purpose. Audit rows are written by the
 * repositories that make the mutations, inside the same transaction, so an
 * unaudited write cannot exist. A general-purpose "write an audit entry"
 * function would be an invitation to log something after the fact, which is
 * exactly the log entry nobody can trust.
 *
 * Scoping works differently from every other repository, because AuditLog has
 * no `unitId` and no `deletedAt` — `scopeWhere()` does not apply. Entries are
 * scoped by the ACTOR's unit path: you see what people at or below you did.
 *
 * That is sound rather than convenient: an actor can only mutate rows inside
 * their own scope, so every target in an entry you can see was already inside
 * your subtree. Scoping by target instead would need a join to a row that may
 * since have been deleted, which is the case the denormalized trail exists to
 * survive.
 */

export type AuditFilter = {
  action?: AuditAction;
  resource?: string;
  /** Free text over the actor's email and the target's label. */
  q?: string;
  take?: number;
  skip?: number;
};

function auditScopeWhere(scope: Scope): Prisma.AuditLogWhereInput {
  return scope.ownUnitOnly
    ? { actorUnitPath: scope.unitPath }
    : { actorUnitPath: { startsWith: scope.unitPath } };
}

function filterWhere(filter: AuditFilter): Prisma.AuditLogWhereInput {
  const clauses: Prisma.AuditLogWhereInput[] = [];

  if (filter.action) clauses.push({ action: filter.action });
  if (filter.resource) clauses.push({ resource: filter.resource });
  if (filter.q?.trim()) {
    const q = filter.q.trim();
    clauses.push({
      OR: [
        { actorEmail: { contains: q, mode: "insensitive" } },
        { targetLabel: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export async function listAudit(scope: Scope, filter: AuditFilter = {}) {
  return prismaUnsafe.auditLog.findMany({
    where: { AND: [auditScopeWhere(scope), filterWhere(filter)] },
    orderBy: { at: "desc" },
    take: Math.min(filter.take ?? 50, 200),
    skip: filter.skip ?? 0,
  });
}

export async function countAudit(scope: Scope, filter: AuditFilter = {}) {
  return prismaUnsafe.auditLog.count({
    where: { AND: [auditScopeWhere(scope), filterWhere(filter)] },
  });
}

/** Counts by action, for the summary strip above the trail. */
export async function auditBreakdown(scope: Scope) {
  const rows = await prismaUnsafe.auditLog.groupBy({
    by: ["action"],
    where: auditScopeWhere(scope),
    _count: { _all: true },
  });

  const counts: Partial<Record<AuditAction, number>> = {};
  for (const row of rows) counts[row.action] = row._count._all;
  return counts;
}
