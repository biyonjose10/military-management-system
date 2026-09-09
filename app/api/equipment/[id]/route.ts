import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { resolveScope } from "@/lib/auth/scope";
import { requirePermission, requireViewer } from "@/lib/auth/session";
import {
  getEquipment,
  softDeleteEquipment,
  updateEquipment,
} from "@/lib/db/repositories/equipment";
import { toEquipmentDTO } from "@/lib/dto/equipment";
import { NotFoundError } from "@/lib/errors";
import { equipmentPatchSchema } from "@/lib/validation/equipment";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Context) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "equipment", "read");
    const scope = resolveScope(viewer);

    const { id } = await ctx.params;
    const row = await getEquipment(scope, id);
    if (!row) throw new NotFoundError("Equipment not found.");

    return NextResponse.json(toEquipmentDTO(row, viewer.role));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "equipment", "update");
    const scope = resolveScope(viewer);

    const { id } = await ctx.params;
    const patch = equipmentPatchSchema.parse(await request.json());

    const { unitId, assignedToId, ...rest } = patch;

    const updated = await updateEquipment(
      scope,
      id,
      {
        ...rest,
        ...(unitId !== undefined ? { unit: { connect: { id: unitId } } } : {}),
        ...(assignedToId !== undefined
          ? {
              assignedTo: assignedToId
                ? { connect: { id: assignedToId } }
                : { disconnect: true },
            }
          : {}),
      },
      { headers: request.headers },
    );

    return NextResponse.json(toEquipmentDTO(updated, viewer.role));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Context) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "equipment", "delete");
    const scope = resolveScope(viewer);

    const { id } = await ctx.params;
    await softDeleteEquipment(scope, id, { headers: request.headers });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
