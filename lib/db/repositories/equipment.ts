import "server-only";

import type {
  EquipmentCategory,
  EquipmentStatus,
  Prisma,
} from "@prisma/client";

import { auditEntry, changedFieldNames } from "@/lib/audit/log";
import { scopeWhere, type Scope } from "@/lib/auth/scope";
import { prismaUnsafe } from "@/lib/db/client";
import { NotFoundError } from "@/lib/errors";

/**
 * Every equipment query in the application, scoped the same way personnel are.
 *
 * The assignee join is the thing to be careful with here. `assignedTo` is
 * selected narrowly — the five fields the DTO needs and nothing else — because
 * `include: { assignedTo: true }` would pull medical notes, phone numbers and
 * dates of birth into a logistics query, where a careless spread would ship
 * them to a quartermaster who may not read any of it.
 */

export type EquipmentFilter = {
  /** Free text over serial number, NSN and item name. */
  q?: string;
  status?: EquipmentStatus;
  category?: EquipmentCategory;
  unitId?: number;
  /** Only items whose next service date has passed. */
  overdue?: boolean;
  take?: number;
  skip?: number;
};

/**
 * Exactly the assignee fields the DTO renders. Never `assignedTo: true`.
 * serviceId is here because the DTO masks it; it must not reach a response
 * unmasked, and it does not — see lib/dto/equipment.ts.
 */
const ASSIGNEE_SELECT = {
  select: {
    id: true,
    lastName: true,
    firstName: true,
    rank: true,
    serviceId: true,
  },
} satisfies Prisma.Equipment$assignedToArgs;

const WITH_RELATIONS = {
  unit: { select: { id: true, designation: true, path: true } },
  assignedTo: ASSIGNEE_SELECT,
} satisfies Prisma.EquipmentInclude;

function filterWhere(
  filter: EquipmentFilter,
  now: Date,
): Prisma.EquipmentWhereInput {
  const clauses: Prisma.EquipmentWhereInput[] = [];

  if (filter.status) clauses.push({ status: filter.status });
  if (filter.category) clauses.push({ category: filter.category });
  if (filter.unitId !== undefined) clauses.push({ unitId: filter.unitId });
  if (filter.overdue) clauses.push({ nextServiceDueAt: { lt: now } });

  if (filter.q?.trim()) {
    const q = filter.q.trim();
    clauses.push({
      OR: [
        { serialNumber: { contains: q, mode: "insensitive" } },
        { nsn: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export async function listEquipment(
  scope: Scope,
  filter: EquipmentFilter = {},
  now: Date = new Date(),
) {
  return prismaUnsafe.equipment.findMany({
    // AND, never a spread: a caller-supplied unitId must intersect the scope,
    // not replace it.
    where: { AND: [scopeWhere(scope), filterWhere(filter, now)] },
    include: WITH_RELATIONS,
    // Deadlined first, then in maintenance, then operational — enum members
    // are ordered by declaration in schema.prisma, so `desc` puts the items
    // needing attention at the top, which is what this screen is for.
    orderBy: [{ status: "desc" }, { name: "asc" }, { serialNumber: "asc" }],
    take: Math.min(filter.take ?? 50, 200),
    skip: filter.skip ?? 0,
  });
}

export async function countEquipment(
  scope: Scope,
  filter: EquipmentFilter = {},
  now: Date = new Date(),
) {
  return prismaUnsafe.equipment.count({
    where: { AND: [scopeWhere(scope), filterWhere(filter, now)] },
  });
}

/** Detail read. Out-of-scope ids return null, exactly as missing ones do. */
export async function getEquipment(scope: Scope, id: string) {
  return prismaUnsafe.equipment.findFirst({
    where: { AND: [scopeWhere(scope), { id }] },
    include: {
      ...WITH_RELATIONS,
      maintenanceLogs: { orderBy: { openedAt: "desc" }, take: 20 },
    },
  });
}

/** Status rollup for the viewer's scope. */
export async function equipmentBreakdown(scope: Scope) {
  const rows = await prismaUnsafe.equipment.groupBy({
    by: ["status"],
    where: scopeWhere(scope),
    _count: { _all: true },
  });

  const counts: Record<EquipmentStatus, number> = {
    OPERATIONAL: 0,
    IN_MAINTENANCE: 0,
    DEADLINE: 0,
  };
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

export type MutationContext = { headers?: Headers };

function label(item: { name: string; serialNumber: string }): string {
  return `${item.name} (${item.serialNumber})`;
}

export async function createEquipment(
  scope: Scope,
  data: Prisma.EquipmentCreateInput,
  ctx: MutationContext = {},
) {
  return prismaUnsafe.$transaction(async (tx) => {
    const created = await tx.equipment.create({
      data,
      include: WITH_RELATIONS,
    });

    // The unit the caller named has to be one they can see. Checked inside the
    // transaction so a refusal rolls the insert back rather than leaving an
    // orphan in someone else's formation.
    const inScope = await tx.equipment.findFirst({
      where: { AND: [scopeWhere(scope), { id: created.id }] },
      select: { id: true },
    });
    if (!inScope) throw new NotFoundError("That unit is not within your command.");

    await tx.auditLog.create({
      data: auditEntry({
        viewer: scope.viewer,
        action: "CREATE",
        resource: "Equipment",
        targetId: created.id,
        targetLabel: label(created),
        headers: ctx.headers,
      }),
    });

    return created;
  });
}

export async function updateEquipment(
  scope: Scope,
  id: string,
  patch: Prisma.EquipmentUpdateInput,
  ctx: MutationContext = {},
) {
  return prismaUnsafe.$transaction(async (tx) => {
    const before = await tx.equipment.findFirst({
      where: { AND: [scopeWhere(scope), { id }] },
    });
    if (!before) throw new NotFoundError("Equipment not found.");

    const after = await tx.equipment.update({
      where: { id },
      data: patch,
      include: WITH_RELATIONS,
    });

    await tx.auditLog.create({
      data: auditEntry({
        viewer: scope.viewer,
        action: "UPDATE",
        resource: "Equipment",
        targetId: id,
        targetLabel: label(after),
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

export async function softDeleteEquipment(
  scope: Scope,
  id: string,
  ctx: MutationContext = {},
) {
  return prismaUnsafe.$transaction(async (tx) => {
    const row = await tx.equipment.findFirst({
      where: { AND: [scopeWhere(scope), { id }] },
    });
    if (!row) throw new NotFoundError("Equipment not found.");

    const deleted = await tx.equipment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await tx.auditLog.create({
      data: auditEntry({
        viewer: scope.viewer,
        action: "DELETE",
        resource: "Equipment",
        targetId: id,
        targetLabel: label(row),
        changedFields: ["deletedAt"],
        headers: ctx.headers,
      }),
    });

    return deleted;
  });
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/**
 * Opening a fault is two writes that must not come apart: the log is created
 * and the item's status changes to match it. An item sitting OPERATIONAL with
 * an open fault log against it is worse than either state alone, because both
 * screens that show it would disagree.
 */
export async function openMaintenance(
  scope: Scope,
  equipmentId: string,
  input: {
    status: "IN_MAINTENANCE" | "DEADLINE";
    summary: string;
    technician: string;
  },
  ctx: MutationContext = {},
) {
  return prismaUnsafe.$transaction(async (tx) => {
    const item = await tx.equipment.findFirst({
      where: { AND: [scopeWhere(scope), { id: equipmentId }] },
    });
    if (!item) throw new NotFoundError("Equipment not found.");

    const log = await tx.maintenanceLog.create({
      data: {
        equipmentId,
        status: input.status,
        summary: input.summary,
        technician: input.technician,
      },
    });

    await tx.equipment.update({
      where: { id: equipmentId },
      data: { status: input.status },
    });

    await tx.auditLog.create({
      data: auditEntry({
        viewer: scope.viewer,
        action: "CREATE",
        resource: "MaintenanceLog",
        targetId: log.id,
        targetLabel: label(item),
        changedFields: ["status"],
        headers: ctx.headers,
      }),
    });

    return log;
  });
}

/**
 * Closing one returns the item to service only when nothing else is open
 * against it. An item can be deadlined for two reasons at once, and clearing
 * one of them must not quietly declare the whole thing serviceable.
 */
export async function closeMaintenance(
  scope: Scope,
  logId: string,
  input: { laborHours?: number },
  ctx: MutationContext = {},
) {
  return prismaUnsafe.$transaction(async (tx) => {
    const log = await tx.maintenanceLog.findFirst({
      where: {
        id: logId,
        closedAt: null,
        equipment: { AND: [scopeWhere(scope)] },
      },
      include: { equipment: true },
    });
    if (!log) throw new NotFoundError("Open maintenance log not found.");

    const now = new Date();

    const closed = await tx.maintenanceLog.update({
      where: { id: logId },
      data: { closedAt: now, laborHours: input.laborHours ?? log.laborHours },
    });

    const stillOpen = await tx.maintenanceLog.count({
      where: { equipmentId: log.equipmentId, closedAt: null },
    });

    if (stillOpen === 0) {
      await tx.equipment.update({
        where: { id: log.equipmentId },
        data: { status: "OPERATIONAL", lastServicedAt: now },
      });
    }

    await tx.auditLog.create({
      data: auditEntry({
        viewer: scope.viewer,
        action: "UPDATE",
        resource: "MaintenanceLog",
        targetId: logId,
        targetLabel: label(log.equipment),
        changedFields:
          stillOpen === 0
            ? ["closedAt", "status", "lastServicedAt"]
            : ["closedAt"],
        headers: ctx.headers,
      }),
    });

    return closed;
  });
}
