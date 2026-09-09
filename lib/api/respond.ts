import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors";

/**
 * One place that turns a thrown error into a response.
 *
 * Route handlers throw and let this decide the status, rather than each one
 * assembling its own. The value is consistency in what is NOT said: an
 * unexpected error returns a flat 500 with no message, because a stack trace or
 * a Prisma error string in a response body describes the schema to whoever
 * asked.
 *
 * A 404 for an out-of-scope record is deliberate and comes from
 * `NotFoundError` being what the repository throws. Answering 403 there would
 * confirm the record exists to someone who cannot see it, turning the endpoint
 * into an oracle for enumerating the roster.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { error: error.message, field: error.field },
      { status: 403 },
    );
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // Logged server-side, never returned. The client gets nothing it could use to
  // map the schema.
  console.error("[api] unhandled error", error);
  return NextResponse.json({ error: "Internal error." }, { status: 500 });
}
