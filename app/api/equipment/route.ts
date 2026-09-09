import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { resolveScope } from "@/lib/auth/scope";
import { requirePermission, requireViewer } from "@/lib/auth/session";
import {
  countEquipment,
  createEquipment,
  listEquipment,
} from "@/lib/db/repositories/equipment";
import { toEquipmentDTO } from "@/lib/dto/equipment";
import {
  equipmentCreateSchema,
  equipmentQuerySchema,
} from "@/lib/validation/equipment";

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "equipment", "read");
    const scope = resolveScope(viewer);

    const query = equipmentQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    // One "now" for the query and the serialization, so an item cannot be
    // filtered as overdue and then rendered as not overdue a millisecond later.
    const now = new Date();

    const [rows, total] = await Promise.all([
      listEquipment(scope, query, now),
      countEquipment(scope, query, now),
    ]);

    return NextResponse.json({
      equipment: rows.map((row) => toEquipmentDTO(row, viewer.role, now)),
      total,
      take: query.take,
      skip: query.skip,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "equipment", "create");
    const scope = resolveScope(viewer);

    const input = equipmentCreateSchema.parse(await request.json());

    const created = await createEquipment(
      scope,
      {
        serialNumber: input.serialNumber,
        nsn: input.nsn,
        name: input.name,
        category: input.category,
        acquiredAt: input.acquiredAt,
        nextServiceDueAt: input.nextServiceDueAt ?? null,
        unit: { connect: { id: input.unitId } },
        ...(input.assignedToId
          ? { assignedTo: { connect: { id: input.assignedToId } } }
          : {}),
      },
      { headers: request.headers },
    );

    return NextResponse.json(toEquipmentDTO(created, viewer.role), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
