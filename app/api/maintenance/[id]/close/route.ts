import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { resolveScope } from "@/lib/auth/scope";
import { requirePermission, requireViewer } from "@/lib/auth/session";
import { closeMaintenance } from "@/lib/db/repositories/equipment";
import { maintenanceCloseSchema } from "@/lib/validation/equipment";

/**
 * Closing a fault. Returns the item to service only when nothing else is open
 * against it — see closeMaintenance().
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "maintenance", "update");
    const scope = resolveScope(viewer);

    const { id } = await ctx.params;
    const input = maintenanceCloseSchema.parse(await request.json().catch(() => ({})));

    const log = await closeMaintenance(scope, id, input, {
      headers: request.headers,
    });

    return NextResponse.json({
      id: log.id,
      closedAt: log.closedAt?.toISOString() ?? null,
      laborHours: log.laborHours,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
