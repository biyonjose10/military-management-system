import "server-only";

import type { EquipmentCategory, EquipmentStatus, ReadinessStatus } from "@prisma/client";

import { scopeWhere, unitScopeWhere, type Scope } from "@/lib/auth/scope";
import { prismaUnsafe } from "@/lib/db/client";

/**
 * Aggregations for the command dashboard.
 *
 * Every one of these goes through `scopeWhere`, so a rollup can never describe
 * a population the viewer could not list row by row. A dashboard that counts
 * more than its own drill-down would be a disclosure in aggregate — "you may
 * not see these soldiers, but there are 47 of them and 6 are non-deployable"
 * is still information about a unit outside the viewer's command.
 */

export type UnitReadiness = {
  unitId: number;
  designation: string;
  DEPLOYABLE: number;
  LIMITED_DUTY: number;
  NON_DEPLOYABLE: number;
  total: number;
};

/**
 * Readiness broken down by the viewer's immediate subordinate units.
 *
 * Two queries, not one per unit: personnel are grouped by unit in the database,
 * then rolled up in memory by matching each unit's materialized path against
 * the subordinate's. The path prefix is the same comparison `scopeWhere` makes,
 * so the grouping cannot disagree with the scoping.
 */
export async function readinessBySubordinate(
  scope: Scope,
): Promise<UnitReadiness[]> {
  const [unitsInScope, grouped] = await Promise.all([
    prismaUnsafe.unit.findMany({
      where: unitScopeWhere(scope),
      select: { id: true, designation: true, path: true, parentId: true },
      orderBy: { designation: "asc" },
    }),
    prismaUnsafe.personnel.groupBy({
      by: ["unitId", "readiness"],
      where: scopeWhere(scope),
      _count: { _all: true },
    }),
  ]);

  const self = unitsInScope.find((u) => u.id === scope.unitId);
  if (!self) return [];

  const subordinates = unitsInScope.filter((u) => u.parentId === self.id);

  // The viewer's own unit is always a bucket, ordered LAST.
  //
  // Matching below takes the first bucket whose path is a prefix, and the
  // viewer's own path is a prefix of every subordinate's — so it has to come
  // last to act as the fallback. Without this bucket the staff attached
  // directly to a headquarters are simply dropped, and the chart quietly sums
  // to fewer people than the page above it reports. That is the kind of error
  // nobody notices until someone adds the bars up.
  const buckets =
    subordinates.length > 0
      ? [
          ...subordinates.map((u) => ({ unit: u, label: u.designation })),
          { unit: self, label: `${self.designation} (HQ)` },
        ]
      : [{ unit: self, label: self.designation }];

  const pathById = new Map(unitsInScope.map((u) => [u.id, u.path]));

  const rows: UnitReadiness[] = buckets.map(({ unit, label }) => ({
    unitId: unit.id,
    designation: label,
    DEPLOYABLE: 0,
    LIMITED_DUTY: 0,
    NON_DEPLOYABLE: 0,
    total: 0,
  }));
  const rowByPath = new Map(buckets.map((b, i) => [b.unit.path, rows[i]]));

  for (const group of grouped) {
    const path = pathById.get(group.unitId);
    if (!path) continue;

    // First matching prefix wins, and insertion order is load-bearing:
    // subordinates are checked before the headquarters fallback.
    for (const [bucketPath, row] of rowByPath) {
      if (path.startsWith(bucketPath)) {
        row[group.readiness as ReadinessStatus] += group._count._all;
        row.total += group._count._all;
        break;
      }
    }
  }

  // An empty headquarters bucket is dropped; an axis label with no bar reads
  // as a rendering failure rather than as "nobody is posted here".
  return rows.filter((row) => row.total > 0);
}

export type CategoryStatus = {
  category: EquipmentCategory;
  OPERATIONAL: number;
  IN_MAINTENANCE: number;
  DEADLINE: number;
  total: number;
};

export async function equipmentByCategory(
  scope: Scope,
): Promise<CategoryStatus[]> {
  const grouped = await prismaUnsafe.equipment.groupBy({
    by: ["category", "status"],
    where: scopeWhere(scope),
    _count: { _all: true },
  });

  const order: EquipmentCategory[] = ["WEAPON", "VEHICLE", "COMMS", "RATIONS"];
  const rows: CategoryStatus[] = order.map((category) => ({
    category,
    OPERATIONAL: 0,
    IN_MAINTENANCE: 0,
    DEADLINE: 0,
    total: 0,
  }));
  const byCategory = new Map(rows.map((r) => [r.category, r]));

  for (const group of grouped) {
    const row = byCategory.get(group.category);
    if (!row) continue;
    row[group.status as EquipmentStatus] += group._count._all;
    row.total += group._count._all;
  }

  // Categories the viewer holds none of are dropped rather than drawn as empty
  // rows — an axis label with no bar reads as a rendering failure.
  return rows.filter((row) => row.total > 0);
}

/** Items whose scheduled service date has passed, worst first. */
export async function overdueService(scope: Scope, now: Date = new Date()) {
  return prismaUnsafe.equipment.findMany({
    where: {
      AND: [scopeWhere(scope), { nextServiceDueAt: { lt: now } }],
    },
    select: {
      id: true,
      serialNumber: true,
      name: true,
      status: true,
      nextServiceDueAt: true,
      unit: { select: { designation: true } },
    },
    orderBy: { nextServiceDueAt: "asc" },
    take: 8,
  });
}
