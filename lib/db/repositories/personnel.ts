import "server-only";

import type { Prisma, ReadinessStatus } from "@prisma/client";

import { auditEntry, changedFieldNames } from "@/lib/audit/log";
import { scopeWhere, type Scope } from "@/lib/auth/scope";
import { prismaUnsafe } from "@/lib/db/client";
import { NotFoundError } from "@/lib/errors";

/**
 * Every personnel query in the application.
 *
 * The first argument is always a `Scope`, whose only constructor is
 * `resolveScope(viewer)`. That is what makes an unscoped read a compile error
 * rather than a code-review note: there is no way to call anything here without
 * having produced a verified identity first.
 *
 * `scopeWhere(scope)` carries both the unit restriction and the soft-delete
 * filter, and every function below composes it with `AND` rather than spreading
 * it — a spread lets a caller-supplied `unitId` silently overwrite the scope's
 * own, which is precisely the bug the whole layer exists to prevent.
 */

export type PersonnelFilter = {
  /** Free text over name and service number. */
  q?: string;
  readiness?: ReadinessStatus;
  /** Narrow to one unit. Intersected with the scope, never substituted for it. */
  unitId?: number;
  take?: number;
  skip?: number;
};

const WITH_UNIT = {
  unit: { select: { id: true, designation: true, path: true } },
} satisfies Prisma.PersonnelInclude;

function filterWhere(filter: PersonnelFilter): Prisma.PersonnelWhereInput {
  const clauses: Prisma.PersonnelWhereInput[] = [];

  if (filter.readiness) clauses.push({ readiness: filter.readiness });
  if (filter.unitId !== undefined) clauses.push({ unitId: filter.unitId });
  if (filter.q?.trim()) {
    const q = filter.q.trim();
    clauses.push({
      OR: [
        { lastName: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        // Service numbers are searchable by anyone who can already read the
        // roster. Matching one does not disclose it: the response still goes
        // through toPersonnelDTO, which masks it for roles that may not see it.
        { serviceId: { contains: q } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export async function listPersonnel(scope: Scope, filter: PersonnelFilter = {}) {
  return prismaUnsafe.personnel.findMany({
    where: { AND: [scopeWhere(scope), filterWhere(filter)] },
    include: WITH_UNIT,
    // Enum members are ordered by declaration in schema.prisma, which lists
    // enlisted ranks before warrant before officer. `desc` therefore puts the
    // senior soldier at the top of the roster, which is how these lists read.
    orderBy: [{ rank: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    take: Math.min(filter.take ?? 50, 200),
    skip: filter.skip ?? 0,
  });
}

export async function countPersonnel(scope: Scope, filter: PersonnelFilter = {}) {
  return prismaUnsafe.personnel.count({
    where: { AND: [scopeWhere(scope), filterWhere(filter)] },
  });
}

/**
 * The detail read — the half that teams forget after scoping the list.
 *
 * `findFirst` with the scope in the `where`, not `findUnique` by id and a check
 * afterwards. An out-of-scope id returns null, indistinguishable from an id
 * that does not exist, so the endpoint cannot be used to enumerate which
 * service numbers are real.
 */
export async function getPersonnel(scope: Scope, id: string) {
  return prismaUnsafe.personnel.findFirst({
    where: { AND: [scopeWhere(scope), { id }] },
    include: WITH_UNIT,
  });
}

/** Readiness rollup for the viewer's scope. Used by the dashboard. */
export async function readinessBreakdown(scope: Scope) {
  const rows = await prismaUnsafe.personnel.groupBy({
    by: ["readiness"],
    where: scopeWhere(scope),
    _count: { _all: true },
  });

  const counts: Record<ReadinessStatus, number> = {
    DEPLOYABLE: 0,
    LIMITED_DUTY: 0,
    NON_DEPLOYABLE: 0,
  };
  for (const row of rows) counts[row.readiness] = row._count._all;
  return counts;
}

export type MutationContext = {
  headers?: Headers;
};

/**
 * Update, audit, or neither.
 *
 * The read that proves the row is in scope, the write, and the audit insert all
 * happen inside one interactive transaction. If the audit row fails to insert,
 * the update rolls back — an unaudited change to a personnel record must not
 * exist.
 */
export async function updatePersonnel(
  scope: Scope,
  id: string,
  patch: Prisma.PersonnelUpdateInput,
  ctx: MutationContext = {},
) {
  return prismaUnsafe.$transaction(async (tx) => {
    const before = await tx.personnel.findFirst({
      where: { AND: [scopeWhere(scope), { id }] },
    });
    if (!before) throw new NotFoundError("Personnel record not found.");

    const after = await tx.personnel.update({
      where: { id },
      data: patch,
      include: WITH_UNIT,
    });

    await tx.auditLog.create({
      data: auditEntry({
        viewer: scope.viewer,
        action: "UPDATE",
        resource: "Personnel",
        targetId: id,
        targetLabel: `${after.rank} ${after.lastName}, ${after.firstName}`,
        // Names only. The values are deliberately not recorded — see
        // lib/audit/log.ts.
        changedFields: changedFieldNames(
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
        ),
        headers: ctx.headers,
      }),
    });

    return after;
  });
}

export async function createPersonnel(
  scope: Scope,
  data: Prisma.PersonnelCreateInput,
  ctx: MutationContext = {},
) {
  return prismaUnsafe.$transaction(async (tx) => {
    const created = await tx.personnel.create({ data, include: WITH_UNIT });

    // The scope check happens after the insert, inside the transaction: the
    // unit the caller asked for has to be one they can see, and a rollback is
    // cheaper than duplicating the path lookup outside.
    const inScope = await tx.personnel.findFirst({
      where: { AND: [scopeWhere(scope), { id: created.id }] },
      select: { id: true },
    });
    if (!inScope) {
      throw new NotFoundError("That unit is not within your command.");
    }

    await tx.auditLog.create({
      data: auditEntry({
        viewer: scope.viewer,
        action: "CREATE",
        resource: "Personnel",
        targetId: created.id,
        targetLabel: `${created.rank} ${created.lastName}, ${created.firstName}`,
        headers: ctx.headers,
      }),
    });

    return created;
  });
}

/**
 * Soft delete only. The row stays so the audit entries that reference it keep
 * meaning something, and so equipment signed out to the person can still be
 * traced — `npm run verify` fails if any is left stranded.
 */
export async function softDeletePersonnel(
  scope: Scope,
  id: string,
  ctx: MutationContext = {},
) {
  return prismaUnsafe.$transaction(async (tx) => {
    const row = await tx.personnel.findFirst({
      where: { AND: [scopeWhere(scope), { id }] },
    });
    if (!row) throw new NotFoundError("Personnel record not found.");

    const deleted = await tx.personnel.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await tx.auditLog.create({
      data: auditEntry({
        viewer: scope.viewer,
        action: "DELETE",
        resource: "Personnel",
        targetId: id,
        targetLabel: `${row.rank} ${row.lastName}, ${row.firstName}`,
        changedFields: ["deletedAt"],
        headers: ctx.headers,
      }),
    });

    return deleted;
  });
}
