import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api/respond";
import { resolveScope } from "@/lib/auth/scope";
import { requirePermission, requireViewer } from "@/lib/auth/session";
import { countAudit, listAudit } from "@/lib/db/repositories/audit";
import { toAuditEntryDTO } from "@/lib/dto/audit";

const querySchema = z.strictObject({
  action: z
    .enum([
      "CREATE", "UPDATE", "DELETE", "RESTORE",
      "LOGIN_SUCCESS", "LOGIN_FAILURE", "PERMISSION_DENIED",
    ])
    .optional(),
  resource: z.enum(["Personnel", "Equipment", "MaintenanceLog"]).optional(),
  q: z.string().trim().max(120).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireViewer();
    // Only a Commander has audit:read. The nav hides the link for everyone
    // else, but that is presentation — this is the check that matters.
    requirePermission(viewer, "audit", "read");
    const scope = resolveScope(viewer);

    const query = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const [rows, total] = await Promise.all([
      listAudit(scope, query),
      countAudit(scope, query),
    ]);

    return NextResponse.json({
      entries: rows.map((row) => toAuditEntryDTO(row, viewer.role)),
      total,
      take: query.take,
      skip: query.skip,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
