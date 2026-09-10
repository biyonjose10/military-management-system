import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { resolveScope } from "@/lib/auth/scope";
import { requireViewer } from "@/lib/auth/session";
import { listUnitsInScope } from "@/lib/db/repositories/units";

/**
 * The units the viewer commands. Feeds the unit picker on the create forms.
 *
 * Why this checks `requireViewer()` and a scope but no `requirePermission()`:
 * "unit" is not a row in the RBAC matrix, and adding one would mean a resource
 * every role reads with identical rights — a line that answers nothing. The
 * data is already disclosed to every authenticated role through
 * `PersonnelDTO.unitDesignation`, `EquipmentDTO.unitDesignation` and the
 * viewer's own `scope` on /api/personnel. A unit designation inside your own
 * command is not a secret; being able to enumerate units *outside* it would be,
 * and `unitScopeWhere` is what prevents that.
 *
 * Consequently this returns no counts and no personnel — only the labels needed
 * to fill a dropdown. A rollup here would be a second, unscoped path to numbers
 * that `lib/db/repositories/rollups.ts` already serves correctly.
 */
export async function GET() {
  try {
    const viewer = await requireViewer();
    const scope = resolveScope(viewer);

    const units = await listUnitsInScope(scope);

    return NextResponse.json({ units });
  } catch (error) {
    return errorResponse(error);
  }
}
