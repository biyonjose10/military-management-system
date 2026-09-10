import "server-only";

import { unitScopeWhere, type Scope } from "@/lib/auth/scope";
import { prismaUnsafe } from "@/lib/db/client";

/**
 * Units, read-only, scoped.
 *
 * This exists for one reason: a create form has to offer somewhere to put the
 * new record, and offering a unit the viewer cannot command is worse than
 * useless — the insert would be rolled back by `createPersonnel`'s in-scope
 * check and the user would see "That unit is not within your command" for an
 * option the UI itself put in front of them.
 *
 * `unitScopeWhere` rather than `scopeWhere`: Units have no `deletedAt` column,
 * and the branded `Scope` is still the only way in, so a caller cannot ask for
 * the whole hierarchy by forgetting an argument.
 *
 * There is deliberately no create/update/delete here. Re-parenting a unit means
 * rewriting the materialized path of every descendant, and a half-written
 * rewrite silently widens somebody's scope — the exact failure `lib/units.ts`
 * exists to prevent. That belongs in a migration, not an HTTP endpoint.
 */

export type UnitOption = {
  id: number;
  designation: string;
  name: string;
  echelon: string;
  /** Depth below the root, so the client can indent without parsing paths. */
  depth: number;
};

export async function listUnitsInScope(scope: Scope): Promise<UnitOption[]> {
  const rows = await prismaUnsafe.unit.findMany({
    where: unitScopeWhere(scope),
    select: {
      id: true,
      designation: true,
      name: true,
      echelon: true,
      path: true,
    },
    // Path order is hierarchy order: a parent's path is a prefix of its
    // children's, so sorting on it lists each unit immediately above its
    // subtree without a recursive query.
    orderBy: { path: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    designation: row.designation,
    name: row.name,
    echelon: row.echelon,
    // "/1/4/12/" -> 3 segments; the viewer's own unit becomes depth 0 so the
    // indent is relative to what they can see, not to the brigade.
    depth: Math.max(
      0,
      row.path.split("/").filter(Boolean).length -
        scope.unitPath.split("/").filter(Boolean).length,
    ),
  }));
}
