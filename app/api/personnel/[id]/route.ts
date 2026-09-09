import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { canWriteField } from "@/lib/auth/policy";
import { resolveScope } from "@/lib/auth/scope";
import { requirePermission, requireViewer } from "@/lib/auth/session";
import {
  getPersonnel,
  softDeletePersonnel,
  updatePersonnel,
} from "@/lib/db/repositories/personnel";
import { toPersonnelDTO } from "@/lib/dto/personnel";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { personnelPatchSchema } from "@/lib/validation/personnel";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Context) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "personnel", "read");
    const scope = resolveScope(viewer);

    const { id } = await ctx.params;
    const row = await getPersonnel(scope, id);
    // Null covers both "does not exist" and "exists in another unit". Keeping
    // them indistinguishable is the point — a 403 here would confirm the
    // record to someone who may not see it.
    if (!row) throw new NotFoundError("Personnel record not found.");

    return NextResponse.json(toPersonnelDTO(row, viewer.role));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const viewer = await requireViewer();
    const scope = resolveScope(viewer);
    const { id } = await ctx.params;

    // Strict schema: an unrecognised key is a 400 rather than a silent drop.
    // A dropped field looks exactly like a successful save that did nothing.
    const patch = personnelPatchSchema.parse(await request.json());

    /**
     * Field-level authorization, checked BEFORE anything is written.
     *
     * The refusal names the offending field, and the whole patch is rejected —
     * there is no state in which half of it landed. This is where the design's
     * sharpest rule bites: a Commander has full update rights on `personnel`
     * and still gets 403 here for `medicalNotes`, because rank and permission
     * are different axes.
     */
    for (const field of Object.keys(patch)) {
      if (!canWriteField(viewer.role, field)) {
        throw new ForbiddenError(
          `Role ${viewer.role} may not modify ${field}.`,
          field,
        );
      }
    }

    const updated = await updatePersonnel(scope, id, patch, {
      headers: request.headers,
    });

    return NextResponse.json(toPersonnelDTO(updated, viewer.role));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Context) {
  try {
    const viewer = await requireViewer();
    requirePermission(viewer, "personnel", "delete");
    const scope = resolveScope(viewer);

    const { id } = await ctx.params;
    // Soft delete. The row survives so the audit entries referencing it keep
    // meaning something and issued equipment can still be traced.
    await softDeletePersonnel(scope, id, { headers: request.headers });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
