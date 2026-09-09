import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { resolveScope } from "@/lib/auth/scope";
import { requirePermission, requireViewer } from "@/lib/auth/session";
import { openMaintenance } from "@/lib/db/repositories/equipment";
import { maintenanceOpenSchema } from "@/lib/validation/equipment";

/**
 * Opening a fault. This is the ONLY way an item's status changes — the patch
 * schema deliberately has no `status` field, because status is a consequence
 * of open maintenance logs rather than an independent value someone sets.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "maintenance", "create");
    const scope = resolveScope(viewer);

    const { id } = await ctx.params;
    const input = maintenanceOpenSchema.parse(await request.json());

    const log = await openMaintenance(scope, id, input, {
      headers: request.headers,
    });

    return NextResponse.json(
      {
        id: log.id,
        equipmentId: log.equipmentId,
        openedAt: log.openedAt.toISOString(),
        status: log.status,
        summary: log.summary,
        technician: log.technician,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
