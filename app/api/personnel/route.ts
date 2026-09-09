import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { requirePermission, requireViewer } from "@/lib/auth/session";
import { resolveScope } from "@/lib/auth/scope";
import {
  countPersonnel,
  createPersonnel,
  listPersonnel,
} from "@/lib/db/repositories/personnel";
import { toPersonnelDTO } from "@/lib/dto/personnel";
import { categoryOf } from "@/lib/ranks";
import {
  personnelCreateSchema,
  personnelQuerySchema,
} from "@/lib/validation/personnel";

/**
 * The four checks, in the same order in every handler:
 *
 *   requireViewer()      live, non-revoked identity      -> 401
 *   requirePermission()  may this role do this at all    -> 403
 *   scope + repository   may they do it to these rows    -> filtered / 404
 *   toPersonnelDTO()     which fields may they see       -> masked
 *
 * The response is built from DTOs, never from Prisma rows. Returning a row
 * directly would ship the unmasked service number and phone number in the JSON
 * body no matter what the UI later chose to render.
 */

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "personnel", "read");
    const scope = resolveScope(viewer);

    const query = personnelQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const [rows, total] = await Promise.all([
      listPersonnel(scope, query),
      countPersonnel(scope, query),
    ]);

    return NextResponse.json({
      personnel: rows.map((row) => toPersonnelDTO(row, viewer.role)),
      total,
      take: query.take,
      skip: query.skip,
      // Useful to the UI and harmless to disclose: it is the viewer's own scope,
      // which they already know.
      scope: { unitId: scope.unitId, ownUnitOnly: scope.ownUnitOnly },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "personnel", "create");
    const scope = resolveScope(viewer);

    const input = personnelCreateSchema.parse(await request.json());

    const created = await createPersonnel(
      scope,
      {
        serviceId: input.serviceId,
        firstName: input.firstName,
        lastName: input.lastName,
        rank: input.rank,
        // Derived, never taken from the request: a client-supplied category
        // could disagree with the rank and quietly corrupt every rollup.
        rankCategory: categoryOf(input.rank),
        readiness: input.readiness,
        dateOfBirth: input.dateOfBirth,
        enlistedAt: input.enlistedAt,
        phone: input.phone ?? null,
        email: input.email ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        unit: { connect: { id: input.unitId } },
      },
      { headers: request.headers },
    );

    return NextResponse.json(toPersonnelDTO(created, viewer.role), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
